/**
 * Address Lookup Lambda for Vapi Voice Orders
 * 
 * Handles phonetic/fuzzy matching of street names to reduce misheard addresses.
 * Zero external dependencies - Double Metaphone implemented inline for cost efficiency.
 * 
 * VAPI INTEGRATION:
 * - Always returns HTTP 200 (Vapi ignores any other status code)
 * - Wraps responses in { results: [{ toolCallId, result|error }] }
 * - Extracts toolCallId from multiple Vapi request formats
 */

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const ddb = new DynamoDBClient({ region: "us-east-2" });
const STREETS_TABLE = process.env.STREETS_TABLE || "StreetsByZip";

// ============================================================================
// VAPI RESPONSE HELPERS
// Vapi expects HTTP 200 with { results: [...] } - any other status is IGNORED
// ============================================================================

/**
 * Remove line breaks from strings (Vapi parsing requirement)
 */
function toSingleLine(s) {
  return String(s ?? "").replace(/\r?\n/g, " ").trim();
}

/**
 * Extract toolCallId from lookup_address tool call in request body
 * Handles multiple Vapi request formats
 */
function extractToolCallId(body) {
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;

    // Direct toolCallId in body (some Vapi configurations)
    if (parsed?.toolCallId) return parsed.toolCallId;

    // Check wrapped tool-call formats
    const lists = [
      parsed?.message?.toolCalls,
      parsed?.message?.toolCallList,
      parsed?.message?.toolWithToolCallList,
    ].filter(Array.isArray);

    for (const list of lists) {
      const tc = list.find((t) => (t?.function?.name || t?.name) === "lookup_address");
      if (tc?.id) return tc.id;
    }

    return null;
  } catch (e) {
    console.error('[Address Lookup] Error extracting toolCallId:', e.message);
    return null;
  }
}

/**
 * Extract tool arguments from various Vapi request formats
 * Returns { args, restaurantId } where args contains the tool parameters
 */
function extractToolArgs(body) {
  const parsed = typeof body === "string" ? JSON.parse(body) : body;
  
  let args = parsed;
  let restaurantId = null;
  
  // Check wrapped tool-call formats
  const lists = [
    parsed?.message?.toolCalls,
    parsed?.message?.toolCallList,
    parsed?.message?.toolWithToolCallList,
  ].filter(Array.isArray);

  for (const list of lists) {
    const tc = list.find((t) => (t?.function?.name || t?.name) === "lookup_address");
    if (!tc) continue;
    const rawArgs =
      tc?.function?.arguments ??
      tc?.function?.parameters?.arguments ??
      tc?.arguments;
    if (rawArgs == null) continue;
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    break;
  }

  // Extract restaurantId from various locations
  if (args?.restaurantId) {
    restaurantId = String(args.restaurantId);
  }
  if (!restaurantId && parsed?.call?.metadata?.restaurantId) {
    restaurantId = String(parsed.call.metadata.restaurantId);
  }
  if (!restaurantId && parsed?.assistant?.metadata?.restaurantId) {
    restaurantId = String(parsed.assistant.metadata.restaurantId);
  }
  if (!restaurantId && parsed?.assistantId) {
    restaurantId = String(parsed.assistantId);
  }

  return { args, restaurantId };
}

/**
 * Build a Vapi-compatible tool response
 * CRITICAL: Always returns HTTP 200 - Vapi ignores any other status code
 */
function vapiToolResponse({ toolCallId, result, error }) {
  const entry = {};
  if (toolCallId) entry.toolCallId = toolCallId;

  if (error) {
    entry.error = toSingleLine(typeof error === 'string' ? error : error.message || String(error));
  } else {
    // Result should be the full result object
    entry.result = result;
  }

  return {
    statusCode: 200, // IMPORTANT: always 200 or Vapi ignores the response
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify({ results: [entry] }),
  };
}

function isVapiToolRequest(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.toolCallId) return true;
  if (body?.message?.toolCalls || body?.message?.toolCallList || body?.message?.toolWithToolCallList) return true;
  return false;
}

function apiJsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// ============================================================================
// IN-MEMORY CACHE (reduces DynamoDB reads for warm Lambda containers)
// ============================================================================

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCacheKey(restaurantId, zipCode) {
  return `${restaurantId}#${zipCode}`;
}

function getCachedStreets(restaurantId, zipCode) {
  const key = getCacheKey(restaurantId, zipCode);
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Address Lookup] Cache HIT for ${key}`);
    return cached.streets;
  }
  
  if (cached) {
    console.log(`[Address Lookup] Cache EXPIRED for ${key}`);
    cache.delete(key);
  }
  
  return null;
}

function setCachedStreets(restaurantId, zipCode, streets) {
  const key = getCacheKey(restaurantId, zipCode);
  cache.set(key, {
    streets,
    timestamp: Date.now()
  });
  console.log(`[Address Lookup] Cache SET for ${key} (${streets.length} streets)`);
}

// ============================================================================
// DOUBLE METAPHONE IMPLEMENTATION (inline to avoid npm dependency)
// Converts words to phonetic codes - "Golf" and "Gulf" both → "KLF"
// ============================================================================

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

function isVowel(char) {
  return VOWELS.has(char);
}

function stringAt(str, start, length, list) {
  if (start < 0 || start >= str.length) return false;
  const substr = str.substring(start, start + length);
  return list.includes(substr);
}

function doubleMetaphone(word) {
  if (!word || typeof word !== 'string') return ['', ''];
  
  // Normalize: uppercase, remove non-alpha
  let str = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!str) return ['', ''];
  
  let primary = '';
  let secondary = '';
  let current = 0;
  const length = str.length;
  const last = length - 1;
  
  // Pad for easier boundary checks
  str = '  ' + str + '     ';
  current += 2;
  const original = str;
  
  // Skip initial silent letters
  if (stringAt(original, current, 2, ['GN', 'KN', 'PN', 'WR', 'PS'])) {
    current++;
  }
  
  // Initial X → S
  if (original[current] === 'X') {
    primary += 'S';
    secondary += 'S';
    current++;
  }
  
  while (primary.length < 4 || secondary.length < 4) {
    if (current >= length + 2) break;
    
    const char = original[current];
    
    switch (char) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
      case 'Y':
        if (current === 2) {
          primary += 'A';
          secondary += 'A';
        }
        current++;
        break;
        
      case 'B':
        primary += 'P';
        secondary += 'P';
        current += (original[current + 1] === 'B') ? 2 : 1;
        break;
        
      case 'C':
        // Various C rules
        if (stringAt(original, current, 2, ['CH'])) {
          primary += 'X';
          secondary += 'X';
          current += 2;
        } else if (stringAt(original, current, 2, ['CI', 'CE', 'CY'])) {
          primary += 'S';
          secondary += 'S';
          current += 2;
        } else if (stringAt(original, current, 2, ['CK', 'CQ'])) {
          primary += 'K';
          secondary += 'K';
          current += 2;
        } else {
          primary += 'K';
          secondary += 'K';
          current++;
        }
        break;
        
      case 'D':
        if (stringAt(original, current, 2, ['DG'])) {
          if (stringAt(original, current + 2, 1, ['I', 'E', 'Y'])) {
            primary += 'J';
            secondary += 'J';
            current += 3;
          } else {
            primary += 'TK';
            secondary += 'TK';
            current += 2;
          }
        } else {
          primary += 'T';
          secondary += 'T';
          current += stringAt(original, current, 2, ['DT', 'DD']) ? 2 : 1;
        }
        break;
        
      case 'F':
        primary += 'F';
        secondary += 'F';
        current += (original[current + 1] === 'F') ? 2 : 1;
        break;
        
      case 'G':
        if (original[current + 1] === 'H') {
          if (current > 2 && !isVowel(original[current - 1])) {
            current += 2;
          } else if (current === 2) {
            primary += 'K';
            secondary += 'K';
            current += 2;
          } else {
            current += 2;
          }
        } else if (original[current + 1] === 'N') {
          primary += 'KN';
          secondary += 'N';
          current += 2;
        } else if (stringAt(original, current + 1, 1, ['I', 'E', 'Y'])) {
          primary += 'J';
          secondary += 'K';
          current += 2;
        } else {
          primary += 'K';
          secondary += 'K';
          current += (original[current + 1] === 'G') ? 2 : 1;
        }
        break;
        
      case 'H':
        // H is silent if between vowels or after certain consonants
        if ((current === 2 || isVowel(original[current - 1])) && isVowel(original[current + 1])) {
          primary += 'H';
          secondary += 'H';
          current += 2;
        } else {
          current++;
        }
        break;
        
      case 'J':
        primary += 'J';
        secondary += 'J';
        current += (original[current + 1] === 'J') ? 2 : 1;
        break;
        
      case 'K':
        primary += 'K';
        secondary += 'K';
        current += (original[current + 1] === 'K') ? 2 : 1;
        break;
        
      case 'L':
        primary += 'L';
        secondary += 'L';
        current += (original[current + 1] === 'L') ? 2 : 1;
        break;
        
      case 'M':
        primary += 'M';
        secondary += 'M';
        current += (original[current + 1] === 'M') ? 2 : 1;
        break;
        
      case 'N':
        primary += 'N';
        secondary += 'N';
        current += (original[current + 1] === 'N') ? 2 : 1;
        break;
        
      case 'P':
        if (original[current + 1] === 'H') {
          primary += 'F';
          secondary += 'F';
          current += 2;
        } else {
          primary += 'P';
          secondary += 'P';
          current += stringAt(original, current, 2, ['PP', 'PB']) ? 2 : 1;
        }
        break;
        
      case 'Q':
        primary += 'K';
        secondary += 'K';
        current += (original[current + 1] === 'Q') ? 2 : 1;
        break;
        
      case 'R':
        primary += 'R';
        secondary += 'R';
        current += (original[current + 1] === 'R') ? 2 : 1;
        break;
        
      case 'S':
        if (stringAt(original, current, 2, ['SH'])) {
          primary += 'X';
          secondary += 'X';
          current += 2;
        } else if (stringAt(original, current, 3, ['SIO', 'SIA'])) {
          primary += 'X';
          secondary += 'S';
          current += 3;
        } else {
          primary += 'S';
          secondary += 'S';
          current += (original[current + 1] === 'S') ? 2 : 1;
        }
        break;
        
      case 'T':
        if (stringAt(original, current, 4, ['TION'])) {
          primary += 'XN';
          secondary += 'XN';
          current += 4;
        } else if (stringAt(original, current, 2, ['TH'])) {
          primary += '0';  // Using 0 for TH sound
          secondary += 'T';
          current += 2;
        } else {
          primary += 'T';
          secondary += 'T';
          current += stringAt(original, current, 2, ['TT', 'TD']) ? 2 : 1;
        }
        break;
        
      case 'V':
        primary += 'F';
        secondary += 'F';
        current += (original[current + 1] === 'V') ? 2 : 1;
        break;
        
      case 'W':
        if (original[current + 1] === 'R') {
          primary += 'R';
          secondary += 'R';
          current += 2;
        } else if (current === 2 && isVowel(original[current + 1])) {
          primary += 'A';
          secondary += 'F';
          current++;
        } else if (isVowel(original[current + 1])) {
          primary += 'A';
          secondary += 'A';
          current++;
        } else {
          current++;
        }
        break;
        
      case 'X':
        primary += 'KS';
        secondary += 'KS';
        current += (original[current + 1] === 'X') ? 2 : 1;
        break;
        
      case 'Z':
        primary += 'S';
        secondary += 'S';
        current += (original[current + 1] === 'Z') ? 2 : 1;
        break;
        
      default:
        current++;
    }
  }
  
  return [primary.substring(0, 4), secondary.substring(0, 4)];
}

// ============================================================================
// LEVENSHTEIN DISTANCE (for typo/mishearing tolerance)
// ============================================================================

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// ============================================================================
// STREET NAME NORMALIZATION
// ============================================================================

const STREET_SUFFIXES = {
  'STREET': 'ST', 'ST': 'ST',
  'ROAD': 'RD', 'RD': 'RD',
  'AVENUE': 'AVE', 'AVE': 'AVE', 'AV': 'AVE',
  'DRIVE': 'DR', 'DR': 'DR',
  'LANE': 'LN', 'LN': 'LN',
  'COURT': 'CT', 'CT': 'CT',
  'CIRCLE': 'CIR', 'CIR': 'CIR',
  'BOULEVARD': 'BLVD', 'BLVD': 'BLVD',
  'PLACE': 'PL', 'PL': 'PL',
  'TERRACE': 'TER', 'TER': 'TER',
  'WAY': 'WAY',
  'TRAIL': 'TRL', 'TRL': 'TRL',
  'PARKWAY': 'PKWY', 'PKWY': 'PKWY',
  'HIGHWAY': 'HWY', 'HWY': 'HWY',
};

const DIRECTIONALS = {
  'NORTH': 'N', 'N': 'N',
  'SOUTH': 'S', 'S': 'S',
  'EAST': 'E', 'E': 'E',
  'WEST': 'W', 'W': 'W',
  'NORTHEAST': 'NE', 'NE': 'NE',
  'NORTHWEST': 'NW', 'NW': 'NW',
  'SOUTHEAST': 'SE', 'SE': 'SE',
  'SOUTHWEST': 'SW', 'SW': 'SW',
};

function normalizeStreetName(street) {
  if (!street) return '';
  
  let normalized = street.toUpperCase().trim();
  
  // Split into words
  const words = normalized.split(/\s+/);
  const result = [];
  
  for (const rawWord of words) {
    // Strip surrounding punctuation (helps with transcripts like "Lane," or "Rd.")
    const word = rawWord.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');
    if (!word) continue;

    // Normalize suffix
    if (STREET_SUFFIXES[word]) {
      result.push(STREET_SUFFIXES[word]);
    }
    // Normalize directional
    else if (DIRECTIONALS[word]) {
      result.push(DIRECTIONALS[word]);
    }
    // Keep as-is
    else {
      result.push(word);
    }
  }
  
  return result.join(' ');
}

function extractStreetNameOnly(street) {
  // Remove suffix and directionals for phonetic matching
  const normalized = normalizeStreetName(street);
  const words = normalized.split(/\s+/);
  
  return words.filter(w => 
    !STREET_SUFFIXES[w] && 
    !DIRECTIONALS[w] &&
    !/^\d+$/.test(w) // Remove numbers
  ).join(' ');
}

// ============================================================================
// DISPLAY HELPERS (voice-friendly output)
// ============================================================================

const SUFFIX_DISPLAY = {
  ST: 'Street',
  RD: 'Road',
  AVE: 'Avenue',
  DR: 'Drive',
  LN: 'Lane',
  CT: 'Court',
  CIR: 'Circle',
  BLVD: 'Boulevard',
  PL: 'Place',
  TER: 'Terrace',
  WAY: 'Way',
  TRL: 'Trail',
  PKWY: 'Parkway',
  HWY: 'Highway',
};

function getNormalizedStreetSuffix(street) {
  const normalized = normalizeStreetName(street);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const last = words[words.length - 1];
  // STREET_SUFFIXES maps full/abbr -> canonical abbr
  return STREET_SUFFIXES[last] || null;
}

function expandStreetNameForSpeech(street) {
  if (!street) return '';
  const parts = String(street).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  const expanded = SUFFIX_DISPLAY[String(last).toUpperCase()];
  if (expanded) parts[parts.length - 1] = expanded;
  return parts.join(' ');
}

// ============================================================================
// PHONETIC ALPHABET PARSER (for spelled street names)
// ============================================================================

const PHONETIC_ALPHABET = {
  'ALPHA': 'A', 'ABLE': 'A',
  'BRAVO': 'B', 'BAKER': 'B', 'BOY': 'B',
  'CHARLIE': 'C', 'CHARLES': 'C',
  'DELTA': 'D', 'DOG': 'D', 'DAVID': 'D',
  'ECHO': 'E', 'EASY': 'E', 'EDWARD': 'E',
  'FOXTROT': 'F', 'FOX': 'F', 'FRANK': 'F',
  'GOLF': 'G', 'GEORGE': 'G',
  'HOTEL': 'H', 'HENRY': 'H', 'HOW': 'H',
  'INDIA': 'I', 'IDA': 'I', 'ITEM': 'I',
  'JULIET': 'J', 'JOHN': 'J', 'JIG': 'J',
  'KILO': 'K', 'KING': 'K',
  'LIMA': 'L', 'LOVE': 'L', 'LINCOLN': 'L',
  'MIKE': 'M', 'MARY': 'M',
  'NOVEMBER': 'N', 'NANCY': 'N', 'NAN': 'N',
  'OSCAR': 'O', 'OBOE': 'O', 'OCEAN': 'O',
  'PAPA': 'P', 'PETER': 'P',
  'QUEBEC': 'Q', 'QUEEN': 'Q',
  'ROMEO': 'R', 'ROGER': 'R', 'ROBERT': 'R',
  'SIERRA': 'S', 'SUGAR': 'S', 'SAM': 'S',
  'TANGO': 'T', 'TOM': 'T', 'THOMAS': 'T',
  'UNIFORM': 'U', 'UNCLE': 'U',
  'VICTOR': 'V', 'VERY': 'V',
  'WHISKEY': 'W', 'WILLIAM': 'W',
  'XRAY': 'X', 'X-RAY': 'X',
  'YANKEE': 'Y', 'YELLOW': 'Y', 'YOUNG': 'Y',
  'ZULU': 'Z', 'ZEBRA': 'Z',
};

function parseSpelledWord(input) {
  if (!input) return '';
  
  const normalized = input.toUpperCase();
  
  // Handle "G as in George, O, L, F" or "G O L F" or "GOLF"
  const words = normalized
    .replace(/\s+AS\s+IN\s+/g, ' ')
    .replace(/[,.-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  
  const letters = [];
  for (const word of words) {
    if (word.length === 1 && /[A-Z]/.test(word)) {
      // Single letter
      letters.push(word);
    } else if (PHONETIC_ALPHABET[word]) {
      // Phonetic word
      letters.push(PHONETIC_ALPHABET[word]);
    }
    // Skip other words (like "as", "in", etc.)
  }
  
  return letters.join('');
}

// ============================================================================
// STREET MATCHING ENGINE
// ============================================================================

function scoreMatch(heard, candidate) {
  const heardName = extractStreetNameOnly(heard);
  const candidateName = extractStreetNameOnly(candidate.streetName);
  
  if (!heardName || !candidateName) return 0;
  
  // Get phonetic codes
  const [heardPrimary, heardAlt] = doubleMetaphone(heardName);
  const candidatePrimary = candidate.metaphonePrimary || doubleMetaphone(candidateName)[0];
  const candidateAlt = candidate.metaphoneAlt || doubleMetaphone(candidateName)[1];
  
  let score = 0;
  
  // Phonetic match (highest weight)
  if (heardPrimary === candidatePrimary) score += 50;
  else if (heardPrimary === candidateAlt || heardAlt === candidatePrimary) score += 40;
  else if (heardAlt === candidateAlt) score += 30;
  
  // Edit distance (for near-misses)
  const distance = levenshtein(
    heardName.toLowerCase(),
    candidateName.toLowerCase()
  );
  const maxLen = Math.max(heardName.length, candidateName.length);
  const similarity = 1 - (distance / maxLen);
  score += Math.round(similarity * 40);
  
  // Exact match bonus
  if (heardName.toLowerCase() === candidateName.toLowerCase()) {
    score += 10;
  }
  
  return score;
}

async function findStreetsInZip(restaurantId, zipCode) {
  // Check cache first
  const cached = getCachedStreets(restaurantId, zipCode);
  if (cached !== null) {
    return cached;
  }
  
  try {
    const pk = `RESTAURANT#${restaurantId}#ZIP#${zipCode}`;
    
    const result = await ddb.send(new QueryCommand({
      TableName: STREETS_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: pk }
      }
    }));
    
    const streets = (result.Items || []).map(item => unmarshall(item));
    
    // Cache the result
    setCachedStreets(restaurantId, zipCode, streets);
    
    return streets;
  } catch (error) {
    console.error('[Address Lookup] DynamoDB error:', error.message);
    return [];
  }
}

function findBestMatches(heardStreet, streets, limit = 3) {
  if (!streets.length) return [];
  
  // If the caller included a suffix ("Lane", "Road", etc), prefer candidates with the same suffix.
  // This prevents ties like "Grouse LN" vs "Grouse CT" when the caller clearly said "Lane".
  const heardSuffix = getNormalizedStreetSuffix(heardStreet);
  let candidatePool = streets;
  if (heardSuffix) {
    const suffixMatches = streets.filter(s => getNormalizedStreetSuffix(s.streetName) === heardSuffix);
    if (suffixMatches.length > 0) {
      candidatePool = suffixMatches;
    }
  }

  const scored = candidatePool.map(street => ({
    ...street,
    score: scoreMatch(heardStreet, street)
  }));
  
  return scored
    .filter(s => s.score > 30) // Minimum threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================================================
// LAMBDA HANDLER
// ============================================================================

export const handler = async (event) => {
  console.log('[Address Lookup] Incoming request');
  
  // Extract toolCallId early - needed for all responses
  let toolCallId = null;
  let body = {};
  let vapiMode = false;
  
  try {
    // Parse request body
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body);
    } else {
      body = event.body || {};
    }
    vapiMode = isVapiToolRequest(body);
    
    // Extract toolCallId for Vapi response matching (must be done early)
    toolCallId = extractToolCallId(body);
    console.log('[Address Lookup] toolCallId:', toolCallId || '(none)');
    
    // Extract tool arguments and restaurantId from various Vapi formats
    const { args, restaurantId: extractedRestaurantId } = extractToolArgs(body);
    const restaurantId =
      extractedRestaurantId ||
      process.env.DEFAULT_RESTAURANT_ID ||
      process.env.RESTAURANT_ID ||
      null;
    if (!extractedRestaurantId && restaurantId) {
      console.warn('[Address Lookup] restaurantId missing in request; using DEFAULT_RESTAURANT_ID fallback');
    }
    
    const {
      zipCode,
      streetNumber,
      streetName,
      spelledStreetName,
      attempt = 1
    } = args;
    
    console.log('[Address Lookup] Request params:', {
      restaurantId,
      zipCode,
      streetNumber,
      streetName: streetName ? `"${streetName}"` : undefined,
      spelledStreetName: spelledStreetName ? `"${spelledStreetName}"` : undefined,
      attempt
    });
    
    // Validate required fields
    if (!restaurantId) {
      const err = 'restaurantId is required';
      return vapiMode ? vapiToolResponse({ toolCallId, error: err }) : apiJsonResponse(400, { result: 'error', message: err });
    }
    
    if (!zipCode) {
      const err = 'ZIP code is required';
      return vapiMode ? vapiToolResponse({ toolCallId, error: err }) : apiJsonResponse(400, { result: 'error', message: err });
    }
    
    // Determine search term
    let searchTerm = streetName;
    
    // If spelled name provided, try to parse it
    if (spelledStreetName) {
      const parsed = parseSpelledWord(spelledStreetName);
      console.log('[Address Lookup] Parsed spelled name:', spelledStreetName, '→', parsed || '(empty)');
      
      // FALLBACK: If parsing returns empty (e.g., "Grouse" isn't letter-by-letter),
      // treat the spelledStreetName as a regular street name instead of failing
      if (parsed) {
        searchTerm = parsed;
      } else {
        // Use spelledStreetName directly as street name (fallback for non-spelled input)
        searchTerm = spelledStreetName;
        console.log('[Address Lookup] Falling back to using spelledStreetName as street name:', spelledStreetName);
      }
    }
    
    if (!searchTerm) {
      const err = 'Street name is required';
      return vapiMode ? vapiToolResponse({ toolCallId, error: err }) : apiJsonResponse(400, { result: 'error', message: err });
    }
    
    // Query streets in ZIP for this restaurant
    const streets = await findStreetsInZip(restaurantId, zipCode);
    console.log('[Address Lookup] Streets in ZIP:', streets.length);
    
    if (streets.length === 0) {
      // No streets loaded for this ZIP - might need to seed data
      console.warn('[Address Lookup] No streets found for restaurant:', restaurantId, 'ZIP:', zipCode);
      const payload = {
        result: 'zip_not_covered',
        restaurantId,
        zipCode,
        message: `We don't have delivery coverage data for ZIP code ${zipCode}. Please verify the ZIP code.`,
        suggestAction: 'verify_zip'
      };
      return vapiMode ? vapiToolResponse({ toolCallId, result: payload }) : apiJsonResponse(200, payload);
    }
    
    // Find matches
    const matches = findBestMatches(searchTerm, streets);
    console.log('[Address Lookup] Matches found:', matches.length);
    
    if (matches.length === 0) {
      // No matches - decide next action based on attempt
      if (attempt === 1) {
        const payload = {
          result: 'not_found',
          suggestAction: 'request_spelling',
          prompt: `I couldn't find "${searchTerm}" in ZIP code ${zipCode}. Could you spell just the street name for me?`
        };
        return vapiMode ? vapiToolResponse({ toolCallId, result: payload }) : apiJsonResponse(200, payload);
      } else {
        const payload = {
          result: 'not_found',
          suggestAction: 'human_handoff',
          prompt: `I'm having trouble finding that address. Let me have someone call you right back to confirm. What's the best number to reach you?`
        };
        return vapiMode ? vapiToolResponse({ toolCallId, result: payload }) : apiJsonResponse(200, payload);
      }
    }
    
    // Single high-confidence match
    if (matches.length === 1 && matches[0].score >= 70) {
      const match = matches[0];
      const displayStreetName = expandStreetNameForSpeech(match.streetName);
      const formattedAddress = streetNumber
        ? `${streetNumber} ${displayStreetName}`
        : displayStreetName;
      
      const payload = {
        result: 'found',
        confidence: 'high',
        streetName: displayStreetName,
        formattedAddress,
        zipCode,
        confirmPrompt: `I have ${formattedAddress} in ZIP code ${zipCode}. Is that correct?`
      };
      return vapiMode ? vapiToolResponse({ toolCallId, result: payload }) : apiJsonResponse(200, payload);
    }
    
    // Multiple matches or low confidence - ask for clarification
    if (matches.length <= 3) {
      const options = matches.map(m => expandStreetNameForSpeech(m.streetName));
      const payload = {
        result: 'ambiguous',
        candidates: options,
        scores: matches.map(m => ({ street: expandStreetNameForSpeech(m.streetName), score: m.score })),
        clarifyPrompt: `I heard something like "${searchTerm}". Did you mean ${options.slice(0, -1).join(', ')}${options.length > 1 ? ' or ' + options[options.length - 1] : options[0]}?`
      };
      return vapiMode ? vapiToolResponse({ toolCallId, result: payload }) : apiJsonResponse(200, payload);
    }
    
    // Too many matches - need more info
    {
      const payload = {
        result: 'too_many_matches',
        suggestAction: 'request_spelling',
        prompt: `There are several streets that sound similar in that ZIP code. Could you spell just the street name for me?`
      };
      return vapiMode ? vapiToolResponse({ toolCallId, result: payload }) : apiJsonResponse(200, payload);
    }
    
  } catch (error) {
    console.error('[Address Lookup] Error:', error);
    const err = error.message || 'Internal server error';
    return vapiMode ? vapiToolResponse({ toolCallId, error: err }) : apiJsonResponse(500, { result: 'error', message: err });
  }
};

