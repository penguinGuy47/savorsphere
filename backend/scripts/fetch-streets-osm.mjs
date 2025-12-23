/**
 * Fetch Streets from OpenStreetMap and Seed DynamoDB
 * 
 * Fetches street names within a radius of restaurant coordinates using OSM Overpass API.
 * Streets are grouped by ZIP code and tagged with restaurantId for multi-tenant support.
 * 
 * Usage:
 *   # Restaurant-centered (recommended for delivery zones)
 *   node scripts/fetch-streets-osm.mjs --restaurant-id rest-001 --lat 42.0667 --lon -87.9833 --radius 3 --save-csv
 *   node scripts/fetch-streets-osm.mjs --restaurant-id rest-001 --lat 42.0667 --lon -87.9833 --radius 3 --seed
 *   
 *   # ZIP-centered (fallback for quick testing)
 *   node scripts/fetch-streets-osm.mjs --restaurant-id rest-001 --zip 60005 --radius 3 --save-csv
 *   
 *   # Batch from config file (recommended for production)
 *   node scripts/fetch-streets-osm.mjs --config delivery-zones.json --seed
 * 
 * Config JSON format (restaurant-centered):
 *   [
 *     { 
 *       "restaurantId": "rest-001",
 *       "name": "Pizza Palace Downtown",
 *       "lat": 42.0667, 
 *       "lon": -87.9833, 
 *       "radiusMiles": 3,
 *       "zipCodes": ["60005", "60004"]  // Optional: manually specify ZIPs
 *     }
 *   ]
 */

import { writeFileSync, readFileSync, appendFileSync } from 'fs';
import {
  DynamoDBClient,
  BatchWriteItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-2";
const TABLE_NAME = process.env.STREETS_TABLE || "StreetsByZip";

const ddb = new DynamoDBClient({ region: REGION });

// Rate limiting: OSM Overpass API allows ~1 request/second
const OSM_RATE_LIMIT_MS = 1100;

// Overpass endpoints are occasionally overloaded. Allow fallback via env:
//   OVERPASS_URLS="https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter"
const OVERPASS_ENDPOINTS = String(
  process.env.OVERPASS_URLS ||
  process.env.OVERPASS_URL ||
  'https://overpass-api.de/api/interpreter'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ============================================================================
// ZIP CODE / COORDINATES LOOKUPS
// ============================================================================

async function zipToCoords(zipCode) {
  console.log(`  Looking up coordinates for ZIP ${zipCode}...`);
  
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zipCode}`);
    
    if (!response.ok) {
      throw new Error(`ZIP lookup failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.places || data.places.length === 0) {
      throw new Error(`No location found for ZIP ${zipCode}`);
    }
    
    const place = data.places[0];
    const coords = {
      zip: zipCode,
      lat: parseFloat(place.latitude),
      lon: parseFloat(place.longitude),
      city: place['place name'],
      state: place['state abbreviation'],
      stateName: place['state']
    };
    
    console.log(`  Found: ${coords.city}, ${coords.state} (${coords.lat}, ${coords.lon})`);
    return coords;
  } catch (error) {
    console.error(`  Error looking up ZIP ${zipCode}:`, error.message);
    throw error;
  }
}

// ============================================================================
// OPENSTREETMAP OVERPASS API QUERIES
// ============================================================================

/**
 * Fetch streets within a radius, grouped by postal_code from OSM
 * This uses OSM's postal_code tags on addresses to determine ZIP association
 */
async function fetchStreetsWithZipsFromOSM(lat, lon, radiusMiles) {
  const radiusMeters = Math.round(radiusMiles * 1609.34);
  
  console.log(`  Querying OSM for streets within ${radiusMiles} miles (${radiusMeters}m) of (${lat}, ${lon})...`);
  
  // Query all named highways within radius
  const query = `
    [out:json][timeout:90];
    (
      way["highway"]["name"](around:${radiusMeters},${lat},${lon});
    );
    out tags center;
  `;
  
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SavorSphere-StreetFetcher/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`OSM API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`OSM query error: ${data.error}`);
      }
      
      // Extract unique street names
      const streets = new Set();
      const seen = new Set();
      
      for (const element of data.elements || []) {
        if (element.type === 'way' && element.tags?.name) {
          const name = element.tags.name.trim();
          
          if (name.length < 2) continue;
          
          const normalized = normalizeStreetName(name);
          
          if (!seen.has(normalized.toUpperCase())) {
            seen.add(normalized.toUpperCase());
            streets.add(normalized);
          }
        }
      }
      
      const streetArray = [...streets].sort();
      console.log(`  Found ${streetArray.length} unique streets (endpoint: ${new URL(endpoint).host})`);
      
      return streetArray;
    } catch (error) {
      lastError = error;
      console.warn(`  Overpass endpoint failed (${endpoint}): ${error.message}`);
      continue;
    }
  }
  
  console.error(`  Error fetching from OSM:`, lastError?.message || 'Unknown error');
  throw lastError || new Error('OSM fetch failed');
}

/**
 * Try to find ZIP codes within a radius using OSM postal code boundaries
 * Falls back to empty array if boundaries not available
 */
async function findZipCodesInRadius(lat, lon, radiusMiles) {
  const radiusMeters = Math.round(radiusMiles * 1609.34);
  
  console.log(`  Searching for ZIP codes within ${radiusMiles} miles...`);
  
  const query = `
    [out:json][timeout:60];
    (
      relation["boundary"="postal_code"](around:${radiusMeters},${lat},${lon});
    );
    out tags;
  `;
  
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SavorSphere-StreetFetcher/1.0'
        }
      });
      
      if (!response.ok) {
        console.log(`  OSM postal boundaries query returned ${response.status} (${new URL(endpoint).host})`);
        continue;
      }
      
      const data = await response.json();
      
      const zips = new Set();
      for (const element of data.elements || []) {
        const postalCode = element.tags?.postal_code || element.tags?.ref;
        if (postalCode && /^\d{5}$/.test(postalCode)) {
          zips.add(postalCode);
        }
      }
      
      const zipArray = [...zips].sort();
      if (zipArray.length > 0) {
        console.log(`  Found ${zipArray.length} ZIP codes: ${zipArray.join(', ')}`);
      } else {
        console.log(`  No ZIP boundaries found in OSM for this area`);
      }
      
      return zipArray;
    } catch (error) {
      console.log(`  Could not query postal boundaries (${endpoint}): ${error.message}`);
      continue;
    }
  }

  return [];
}

function normalizeStreetName(name) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\b(STREET|ST)\b/gi, 'ST')
    .replace(/\b(ROAD|RD)\b/gi, 'RD')
    .replace(/\b(AVENUE|AVE|AV)\b/gi, 'AVE')
    .replace(/\b(DRIVE|DR)\b/gi, 'DR')
    .replace(/\b(LANE|LN)\b/gi, 'LN')
    .replace(/\b(COURT|CT)\b/gi, 'CT')
    .replace(/\b(CIRCLE|CIR)\b/gi, 'CIR')
    .replace(/\b(BOULEVARD|BLVD)\b/gi, 'BLVD')
    .replace(/\b(PLACE|PL)\b/gi, 'PL')
    .replace(/\b(TERRACE|TER)\b/gi, 'TER')
    .replace(/\b(PARKWAY|PKWY)\b/gi, 'PKWY')
    .replace(/\b(HIGHWAY|HWY)\b/gi, 'HWY')
    .trim();
}

// ============================================================================
// DOUBLE METAPHONE (for seeding)
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
  
  let str = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!str) return ['', ''];
  
  let primary = '';
  let secondary = '';
  let current = 0;
  const length = str.length;
  
  str = '  ' + str + '     ';
  current += 2;
  const original = str;
  
  if (stringAt(original, current, 2, ['GN', 'KN', 'PN', 'WR', 'PS'])) {
    current++;
  }
  
  if (original[current] === 'X') {
    primary += 'S';
    secondary += 'S';
    current++;
  }
  
  while (primary.length < 4 || secondary.length < 4) {
    if (current >= length + 2) break;
    
    const char = original[current];
    
    switch (char) {
      case 'A': case 'E': case 'I': case 'O': case 'U': case 'Y':
        if (current === 2) { primary += 'A'; secondary += 'A'; }
        current++;
        break;
      case 'B':
        primary += 'P'; secondary += 'P';
        current += (original[current + 1] === 'B') ? 2 : 1;
        break;
      case 'C':
        if (stringAt(original, current, 2, ['CH'])) {
          primary += 'X'; secondary += 'X'; current += 2;
        } else if (stringAt(original, current, 2, ['CI', 'CE', 'CY'])) {
          primary += 'S'; secondary += 'S'; current += 2;
        } else if (stringAt(original, current, 2, ['CK', 'CQ'])) {
          primary += 'K'; secondary += 'K'; current += 2;
        } else {
          primary += 'K'; secondary += 'K'; current++;
        }
        break;
      case 'D':
        if (stringAt(original, current, 2, ['DG'])) {
          if (stringAt(original, current + 2, 1, ['I', 'E', 'Y'])) {
            primary += 'J'; secondary += 'J'; current += 3;
          } else {
            primary += 'TK'; secondary += 'TK'; current += 2;
          }
        } else {
          primary += 'T'; secondary += 'T';
          current += stringAt(original, current, 2, ['DT', 'DD']) ? 2 : 1;
        }
        break;
      case 'F':
        primary += 'F'; secondary += 'F';
        current += (original[current + 1] === 'F') ? 2 : 1;
        break;
      case 'G':
        if (original[current + 1] === 'H') {
          if (current > 2 && !isVowel(original[current - 1])) current += 2;
          else if (current === 2) { primary += 'K'; secondary += 'K'; current += 2; }
          else current += 2;
        } else if (original[current + 1] === 'N') {
          primary += 'KN'; secondary += 'N'; current += 2;
        } else if (stringAt(original, current + 1, 1, ['I', 'E', 'Y'])) {
          primary += 'J'; secondary += 'K'; current += 2;
        } else {
          primary += 'K'; secondary += 'K';
          current += (original[current + 1] === 'G') ? 2 : 1;
        }
        break;
      case 'H':
        if ((current === 2 || isVowel(original[current - 1])) && isVowel(original[current + 1])) {
          primary += 'H'; secondary += 'H'; current += 2;
        } else current++;
        break;
      case 'J':
        primary += 'J'; secondary += 'J';
        current += (original[current + 1] === 'J') ? 2 : 1;
        break;
      case 'K':
        primary += 'K'; secondary += 'K';
        current += (original[current + 1] === 'K') ? 2 : 1;
        break;
      case 'L':
        primary += 'L'; secondary += 'L';
        current += (original[current + 1] === 'L') ? 2 : 1;
        break;
      case 'M':
        primary += 'M'; secondary += 'M';
        current += (original[current + 1] === 'M') ? 2 : 1;
        break;
      case 'N':
        primary += 'N'; secondary += 'N';
        current += (original[current + 1] === 'N') ? 2 : 1;
        break;
      case 'P':
        if (original[current + 1] === 'H') {
          primary += 'F'; secondary += 'F'; current += 2;
        } else {
          primary += 'P'; secondary += 'P';
          current += stringAt(original, current, 2, ['PP', 'PB']) ? 2 : 1;
        }
        break;
      case 'Q':
        primary += 'K'; secondary += 'K';
        current += (original[current + 1] === 'Q') ? 2 : 1;
        break;
      case 'R':
        primary += 'R'; secondary += 'R';
        current += (original[current + 1] === 'R') ? 2 : 1;
        break;
      case 'S':
        if (stringAt(original, current, 2, ['SH'])) {
          primary += 'X'; secondary += 'X'; current += 2;
        } else if (stringAt(original, current, 3, ['SIO', 'SIA'])) {
          primary += 'X'; secondary += 'S'; current += 3;
        } else {
          primary += 'S'; secondary += 'S';
          current += (original[current + 1] === 'S') ? 2 : 1;
        }
        break;
      case 'T':
        if (stringAt(original, current, 4, ['TION'])) {
          primary += 'XN'; secondary += 'XN'; current += 4;
        } else if (stringAt(original, current, 2, ['TH'])) {
          primary += '0'; secondary += 'T'; current += 2;
        } else {
          primary += 'T'; secondary += 'T';
          current += stringAt(original, current, 2, ['TT', 'TD']) ? 2 : 1;
        }
        break;
      case 'V':
        primary += 'F'; secondary += 'F';
        current += (original[current + 1] === 'V') ? 2 : 1;
        break;
      case 'W':
        if (original[current + 1] === 'R') {
          primary += 'R'; secondary += 'R'; current += 2;
        } else if (current === 2 && isVowel(original[current + 1])) {
          primary += 'A'; secondary += 'F'; current++;
        } else if (isVowel(original[current + 1])) {
          primary += 'A'; secondary += 'A'; current++;
        } else current++;
        break;
      case 'X':
        primary += 'KS'; secondary += 'KS';
        current += (original[current + 1] === 'X') ? 2 : 1;
        break;
      case 'Z':
        primary += 'S'; secondary += 'S';
        current += (original[current + 1] === 'Z') ? 2 : 1;
        break;
      default:
        current++;
    }
  }
  
  return [primary.substring(0, 4), secondary.substring(0, 4)];
}

function extractStreetNameCore(street) {
  const suffixes = ['ST', 'STREET', 'RD', 'ROAD', 'AVE', 'AVENUE', 'DR', 'DRIVE', 
    'LN', 'LANE', 'CT', 'COURT', 'CIR', 'CIRCLE', 'BLVD', 'BOULEVARD', 
    'PL', 'PLACE', 'TER', 'TERRACE', 'WAY', 'TRL', 'TRAIL', 'PKWY', 'PARKWAY', 'HWY', 'HIGHWAY'];
  const directionals = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 
    'NORTH', 'SOUTH', 'EAST', 'WEST', 'NORTHEAST', 'NORTHWEST', 'SOUTHEAST', 'SOUTHWEST'];
  
  const words = street.toUpperCase().split(/\s+/);
  return words.filter(w => 
    !suffixes.includes(w) && 
    !directionals.includes(w) &&
    !/^\d+$/.test(w)
  ).join(' ');
}

// ============================================================================
// SEED TO DYNAMODB (per restaurant + ZIP)
// ============================================================================

async function seedStreetsToDynamoDB(restaurantId, zipCode, streets) {
  console.log(`  Seeding ${streets.length} streets to DynamoDB for restaurant ${restaurantId}, ZIP ${zipCode}...`);
  
  const items = streets.map(streetName => {
    const core = extractStreetNameCore(streetName);
    const [metaphonePrimary, metaphoneAlt] = doubleMetaphone(core);
    const sk = streetName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    return {
      PK: `RESTAURANT#${restaurantId}#ZIP#${zipCode}`,
      SK: `STREET#${sk}`,
      restaurantId,
      zipCode,
      streetName,
      metaphonePrimary,
      metaphoneAlt,
      core,
      createdAt: new Date().toISOString()
    };
  });
  
  // Batch write in chunks of 25
  let written = 0;
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    
    try {
      await ddb.send(new BatchWriteItemCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map(item => ({
            PutRequest: { Item: marshall(item) }
          }))
        }
      }));
      
      written += batch.length;
      console.log(`    Written ${written}/${items.length} streets`);
    } catch (error) {
      console.error(`    Error writing batch:`, error.message);
      throw error;
    }
  }
  
  console.log(`  ✓ Successfully seeded ${written} streets for restaurant ${restaurantId}, ZIP ${zipCode}`);
}

// ============================================================================
// MAIN PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process a restaurant's delivery zone
 * Fetches streets from restaurant location, groups by ZIP codes
 */
async function processRestaurantZone(config, options = {}) {
  const { restaurantId, name, lat, lon, radiusMiles, zipCodes } = config;
  
  console.log(`\nProcessing restaurant: ${name || restaurantId}`);
  console.log(`  Location: (${lat}, ${lon})`);
  console.log(`  Radius: ${radiusMiles} miles`);
  
  try {
    // Step 1: Fetch all streets within radius
    const streets = await fetchStreetsWithZipsFromOSM(lat, lon, radiusMiles);
    
    if (streets.length === 0) {
      console.log(`  ⚠ No streets found for ${restaurantId}`);
      return { restaurantId, streets: [], zipCodes: [] };
    }
    
    // Step 2: Determine ZIP codes to use
    let zipsToUse = zipCodes || [];
    
    // If no ZIPs provided, try to find them from OSM or fall back to a placeholder
    if (zipsToUse.length === 0) {
      await new Promise(r => setTimeout(r, OSM_RATE_LIMIT_MS)); // Rate limit
      const foundZips = await findZipCodesInRadius(lat, lon, radiusMiles);
      
      if (foundZips.length > 0) {
        zipsToUse = foundZips;
      } else {
        // Fallback: use a single "ALL" pseudo-ZIP if no boundaries found
        // In practice, you should provide zipCodes in the config
        console.log(`  ⚠ No ZIP boundaries found. Using "ALL" as placeholder.`);
        console.log(`    Recommendation: Add zipCodes array to config for proper ZIP filtering.`);
        zipsToUse = ['ALL'];
      }
    }
    
    console.log(`  ZIP codes: ${zipsToUse.join(', ')}`);
    
    // Step 3: Save to CSV or seed DynamoDB
    const allResults = [];
    
    for (const zipCode of zipsToUse) {
      // For CSV, output restaurantId,zipCode,streetName
      if (options.saveCsv) {
        const csvLines = streets.map(s => `${restaurantId},${zipCode},${s}`);
        const filename = options.csvFile || 'streets.csv';
        
        if (options.append || allResults.length > 0) {
          appendFileSync(filename, '\n' + csvLines.join('\n'));
        } else {
          writeFileSync(filename, csvLines.join('\n'));
        }
        console.log(`  ✓ Saved ${streets.length} streets for ZIP ${zipCode} to ${filename}`);
      }
      
      if (options.seed) {
        await seedStreetsToDynamoDB(restaurantId, zipCode, streets);
      }
      
      allResults.push({ zipCode, streetCount: streets.length });
    }
    
    return { 
      restaurantId, 
      streets, 
      zipCodes: zipsToUse,
      totalStreets: streets.length * zipsToUse.length
    };
  } catch (error) {
    console.error(`  ✗ Error processing ${restaurantId}:`, error.message);
    return { restaurantId, error: error.message };
  }
}

/**
 * Process a single ZIP code (fallback mode)
 */
async function processZipFallback(restaurantId, zipCode, radiusMiles, options = {}) {
  console.log(`\nProcessing ZIP ${zipCode} for restaurant ${restaurantId} (${radiusMiles} mile radius)...`);
  
  try {
    const coords = await zipToCoords(zipCode);
    
    await new Promise(r => setTimeout(r, OSM_RATE_LIMIT_MS));
    
    const streets = await fetchStreetsWithZipsFromOSM(coords.lat, coords.lon, radiusMiles);
    
    if (streets.length === 0) {
      console.log(`  ⚠ No streets found for ZIP ${zipCode}`);
      return { restaurantId, zipCode, streets: [], coords };
    }
    
    if (options.saveCsv) {
      const csvLines = streets.map(s => `${restaurantId},${zipCode},${s}`);
      const filename = options.csvFile || 'streets.csv';
      
      if (options.append) {
        appendFileSync(filename, '\n' + csvLines.join('\n'));
      } else {
        writeFileSync(filename, csvLines.join('\n'));
      }
      console.log(`  ✓ Saved ${streets.length} streets to ${filename}`);
    }
    
    if (options.seed) {
      await seedStreetsToDynamoDB(restaurantId, zipCode, streets);
    }
    
    return { restaurantId, zipCode, streets, coords };
  } catch (error) {
    console.error(`  ✗ Error processing ZIP ${zipCode}:`, error.message);
    return { restaurantId, zipCode, error: error.message };
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Fetch Streets from OpenStreetMap for Delivery Zone Address Lookup

Usage:
  # Restaurant-centered (recommended)
  node scripts/fetch-streets-osm.mjs --restaurant-id rest-001 --lat 42.0667 --lon -87.9833 --radius 3 --zip 60005 --save-csv
  node scripts/fetch-streets-osm.mjs --restaurant-id rest-001 --lat 42.0667 --lon -87.9833 --radius 3 --zip 60005 --seed
  
  # ZIP-centered fallback
  node scripts/fetch-streets-osm.mjs --restaurant-id rest-001 --zip 60005 --radius 3 --save-csv
  
  # Batch from config file (production)
  node scripts/fetch-streets-osm.mjs --config delivery-zones.json --seed

Options:
  --restaurant-id ID   Restaurant identifier (required)
  --lat LAT            Restaurant latitude
  --lon LON            Restaurant longitude  
  --zip CODE           ZIP code(s), comma-separated. Used with --lat/--lon for grouping,
                       or alone for ZIP-centered mode
  --radius MILES       Radius in miles (default: 3)
  --save-csv           Save results to streets.csv
  --csv-file FILE      Custom CSV filename (default: streets.csv)
  --seed               Directly seed DynamoDB (requires AWS credentials)
  --config FILE        JSON config file (see below)

Config JSON format:
  [
    {
      "restaurantId": "rest-001",
      "name": "Pizza Palace Downtown",
      "lat": 42.0667,
      "lon": -87.9833,
      "radiusMiles": 3,
      "zipCodes": ["60005", "60004", "60006"]
    }
  ]

CSV output format: restaurantId,zipCode,streetName

Environment:
  AWS_REGION          AWS region (default: us-east-2)
  STREETS_TABLE       DynamoDB table name (default: StreetsByZip)
`);
    return;
  }
  
  // Parse arguments
  function getArg(key) {
    const equalsFormat = args.find(a => a.startsWith(`${key}=`));
    if (equalsFormat) return equalsFormat.split('=')[1];
    
    const index = args.indexOf(key);
    if (index !== -1 && index + 1 < args.length) {
      return args[index + 1];
    }
    return undefined;
  }
  
  const configArg = getArg('--config');
  const restaurantIdArg = getArg('--restaurant-id');
  const latArg = getArg('--lat');
  const lonArg = getArg('--lon');
  const zipArg = getArg('--zip');
  const radiusArg = getArg('--radius');
  const csvFileArg = getArg('--csv-file');
  
  const radiusMiles = radiusArg ? parseFloat(radiusArg) : 3;
  const saveCsv = args.includes('--save-csv');
  const seed = args.includes('--seed');
  const csvFile = csvFileArg || 'streets.csv';
  
  const results = [];
  
  // Mode 1: Config file
  if (configArg) {
    const config = JSON.parse(readFileSync(configArg, 'utf-8'));
    
    console.log(`\nLoaded ${config.length} restaurant(s) from config`);
    console.log(`Save CSV: ${saveCsv ? csvFile : 'no'}`);
    console.log(`Seed DynamoDB: ${seed ? 'yes' : 'no'}`);
    
    for (let i = 0; i < config.length; i++) {
      const zone = config[i];
      
      const result = await processRestaurantZone({
        restaurantId: zone.restaurantId,
        name: zone.name,
        lat: zone.lat,
        lon: zone.lon,
        radiusMiles: zone.radiusMiles || radiusMiles,
        zipCodes: zone.zipCodes
      }, {
        saveCsv: saveCsv && i === 0,
        append: saveCsv && i > 0,
        csvFile,
        seed
      });
      
      results.push(result);
      
      // Rate limit between restaurants
      if (i < config.length - 1) {
        await new Promise(r => setTimeout(r, OSM_RATE_LIMIT_MS));
      }
    }
  }
  // Mode 2: Restaurant-centered via CLI
  else if (restaurantIdArg && latArg && lonArg) {
    const lat = parseFloat(latArg);
    const lon = parseFloat(lonArg);
    const zipCodes = zipArg ? zipArg.split(',').map(z => z.trim()) : undefined;
    
    console.log(`\nRestaurant-centered mode`);
    console.log(`Restaurant ID: ${restaurantIdArg}`);
    console.log(`Save CSV: ${saveCsv ? csvFile : 'no'}`);
    console.log(`Seed DynamoDB: ${seed ? 'yes' : 'no'}`);
    
    const result = await processRestaurantZone({
      restaurantId: restaurantIdArg,
      lat,
      lon,
      radiusMiles,
      zipCodes
    }, { saveCsv, csvFile, seed });
    
    results.push(result);
  }
  // Mode 3: ZIP-centered fallback
  else if (restaurantIdArg && zipArg) {
    const zipList = zipArg.split(',').map(z => z.trim());
    
    console.log(`\nZIP-centered fallback mode`);
    console.log(`Restaurant ID: ${restaurantIdArg}`);
    console.log(`Radius: ${radiusMiles} miles`);
    console.log(`Save CSV: ${saveCsv ? csvFile : 'no'}`);
    console.log(`Seed DynamoDB: ${seed ? 'yes' : 'no'}`);
    
    for (let i = 0; i < zipList.length; i++) {
      const result = await processZipFallback(
        restaurantIdArg,
        zipList[i],
        radiusMiles,
        {
          saveCsv: saveCsv && i === 0,
          append: saveCsv && i > 0,
          csvFile,
          seed
        }
      );
      
      results.push(result);
      
      if (i < zipList.length - 1) {
        await new Promise(r => setTimeout(r, OSM_RATE_LIMIT_MS));
      }
    }
  }
  else {
    console.error('Error: Must provide either:');
    console.error('  --config FILE');
    console.error('  --restaurant-id + --lat + --lon [+ --zip]');
    console.error('  --restaurant-id + --zip');
    process.exit(1);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  
  let totalStreets = 0;
  for (const result of results) {
    if (result.error) {
      console.log(`  ✗ ${result.restaurantId}: ${result.error}`);
    } else if (result.totalStreets !== undefined) {
      console.log(`  ✓ ${result.restaurantId}: ${result.streets.length} streets × ${result.zipCodes.length} ZIPs = ${result.totalStreets} records`);
      totalStreets += result.totalStreets;
    } else {
      console.log(`  ✓ ${result.restaurantId} / ZIP ${result.zipCode}: ${result.streets.length} streets`);
      totalStreets += result.streets.length;
    }
  }
  
  console.log(`\nTotal records: ${totalStreets}`);
  
  if (saveCsv && !seed) {
    console.log(`\nTo seed DynamoDB, run:`);
    console.log(`  node scripts/seed-streets.mjs --import ${csvFile}`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
