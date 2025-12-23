/**
 * Seed Streets by ZIP for Address Lookup
 * 
 * Usage:
 *   node scripts/seed-streets.mjs --create-table     # Create the DynamoDB table
 *   node scripts/seed-streets.mjs --seed             # Seed with sample data
 *   node scripts/seed-streets.mjs --add-zip 33139    # Add streets for a specific ZIP
 *   node scripts/seed-streets.mjs --import streets.csv  # Import from CSV
 * 
 * CSV format: zipCode,streetName
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  BatchWriteItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { readFileSync } from 'fs';

const REGION = process.env.AWS_REGION || "us-east-2";
const TABLE_NAME = process.env.STREETS_TABLE || "StreetsByZip";

const ddb = new DynamoDBClient({ region: REGION });

// ============================================================================
// DOUBLE METAPHONE (same as in lookupAddress Lambda)
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

// Extract just the meaningful street name (no suffix/directional)
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
// TABLE OPERATIONS
// ============================================================================

async function createTable() {
  console.log(`Creating table: ${TABLE_NAME}`);
  
  try {
    // Check if table exists
    try {
      await ddb.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      console.log('Table already exists!');
      return;
    } catch (e) {
      if (e.name !== 'ResourceNotFoundException') throw e;
    }
    
    await ddb.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },  // ZIP#12345
        { AttributeName: 'SK', KeyType: 'RANGE' }  // STREET#main-street
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST'  // On-demand for cost efficiency
    }));
    
    console.log('Table created successfully!');
    console.log('Waiting for table to be active...');
    
    // Wait for table to be active
    let active = false;
    while (!active) {
      await new Promise(r => setTimeout(r, 2000));
      const desc = await ddb.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      if (desc.Table.TableStatus === 'ACTIVE') active = true;
    }
    
    console.log('Table is active!');
  } catch (error) {
    console.error('Error creating table:', error.message);
    process.exit(1);
  }
}

async function seedStreets(restaurantId, zipCode, streets) {
  console.log(`Seeding ${streets.length} streets for restaurant ${restaurantId}, ZIP ${zipCode}...`);
  
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
      core,  // Stored for debugging
      createdAt: new Date().toISOString()
    };
  });
  
  // Batch write in chunks of 25
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    
    await ddb.send(new BatchWriteItemCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map(item => ({
          PutRequest: { Item: marshall(item) }
        }))
      }
    }));
    
    console.log(`  Written ${Math.min(i + 25, items.length)}/${items.length}`);
  }
  
  console.log(`Done seeding restaurant ${restaurantId}, ZIP ${zipCode}`);
}

async function importFromCSV(filepath, defaultRestaurantId = null) {
  console.log(`Importing from ${filepath}...`);
  
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  
  // Group by restaurantId and ZIP
  // CSV format: restaurantId,zipCode,streetName (new format)
  // OR: zipCode,streetName (old format - requires defaultRestaurantId)
  const byRestaurantAndZip = {};
  
  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim());
    
    let restaurantId, zipCode, streetName;
    
    if (parts.length === 3) {
      // New format: restaurantId,zipCode,streetName
      [restaurantId, zipCode, streetName] = parts;
    } else if (parts.length === 2) {
      // Old format: zipCode,streetName (backward compatibility)
      if (!defaultRestaurantId) {
        console.warn(`Skipping line "${line}": old format requires --restaurant-id`);
        continue;
      }
      [zipCode, streetName] = parts;
      restaurantId = defaultRestaurantId;
    } else {
      console.warn(`Skipping invalid line: "${line}"`);
      continue;
    }
    
    if (!restaurantId || !zipCode || !streetName) continue;
    
    const key = `${restaurantId}#${zipCode}`;
    if (!byRestaurantAndZip[key]) {
      byRestaurantAndZip[key] = { restaurantId, zipCode, streets: [] };
    }
    byRestaurantAndZip[key].streets.push(streetName);
  }
  
  for (const { restaurantId, zipCode, streets } of Object.values(byRestaurantAndZip)) {
    await seedStreets(restaurantId, zipCode, streets);
  }
  
  console.log('Import complete!');
}

// ============================================================================
// SAMPLE DATA (common street names for testing)
// ============================================================================

const SAMPLE_STREETS = {
  // Example: Miami Beach area
  '33139': [
    'Main Street', 'Ocean Drive', 'Collins Avenue', 'Washington Avenue',
    'Lincoln Road', 'Alton Road', 'Meridian Avenue', 'Jefferson Avenue',
    'Michigan Avenue', 'Pennsylvania Avenue', 'Euclid Avenue', 'Lenox Avenue',
    'Golf Road', 'Gulf Drive', 'Palm Avenue', 'Pine Tree Drive',
    'Indian Creek Drive', 'Sunset Drive', 'Bay Road', 'Harbor Drive'
  ],
  // Example: Generic test ZIP
  '12345': [
    'Main Street', 'Oak Avenue', 'Elm Street', 'Maple Drive',
    'Pine Road', 'Cedar Lane', 'Birch Court', 'Willow Way',
    'Golf Road', 'Gulf Road', 'Goff Street',  // Similar sounding!
    'Park Avenue', 'Lake Drive', 'River Road', 'Hill Street',
    'Valley Drive', 'Mountain Road', 'Spring Street', 'Summer Lane'
  ]
};

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Seed Streets by ZIP for Address Lookup

Usage:
  node scripts/seed-streets.mjs --create-table                    Create the DynamoDB table
  node scripts/seed-streets.mjs --seed --restaurant-id ID         Seed with sample data for restaurant
  node scripts/seed-streets.mjs --add-zip 33139 --restaurant-id ID  Add streets for a specific ZIP
  node scripts/seed-streets.mjs --import file.csv --restaurant-id ID  Import from CSV file
  
CSV format (new): restaurantId,zipCode,streetName (one per line, no header)
CSV format (old): zipCode,streetName (requires --restaurant-id flag)

Environment:
  AWS_REGION       AWS region (default: us-east-2)
  STREETS_TABLE    Table name (default: StreetsByZip)
`);
    return;
  }
  
  if (args.includes('--create-table')) {
    await createTable();
  }
  
  // Get restaurantId from args
  const restaurantIdIdx = args.indexOf('--restaurant-id');
  const restaurantId = restaurantIdIdx !== -1 && restaurantIdIdx + 1 < args.length 
    ? args[restaurantIdIdx + 1] 
    : null;
  
  if (args.includes('--seed')) {
    if (!restaurantId) {
      console.error('Error: --seed requires --restaurant-id');
      process.exit(1);
    }
    for (const [zip, streets] of Object.entries(SAMPLE_STREETS)) {
      await seedStreets(restaurantId, zip, streets);
    }
  }
  
  const addZipIdx = args.indexOf('--add-zip');
  if (addZipIdx !== -1 && args[addZipIdx + 1]) {
    if (!restaurantId) {
      console.error('Error: --add-zip requires --restaurant-id');
      process.exit(1);
    }
    const zip = args[addZipIdx + 1];
    if (SAMPLE_STREETS[zip]) {
      await seedStreets(restaurantId, zip, SAMPLE_STREETS[zip]);
    } else {
      console.log(`No sample data for ZIP ${zip}. Add it to SAMPLE_STREETS or use --import`);
    }
  }
  
  const importIdx = args.indexOf('--import');
  if (importIdx !== -1 && args[importIdx + 1]) {
    await importFromCSV(args[importIdx + 1], restaurantId);
  }
}

main().catch(console.error);

