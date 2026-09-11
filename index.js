const https = require('https');
const fs = require('fs');
const path = require('path');

const ROLIMONS_URL = 'https://rolimons.com/api/catalogs/standard/recent';
const SEEN_FILE = path.join(__dirname, 'seen.js');
const MIN_QUANTITY = 20;

/**
 * Fetch data from Rolimon's API with cache-busting timestamp
 */
async function fetchRolimonData() {
  return new Promise((resolve, reject) => {
    const url = `${ROLIMONS_URL}?t=${Date.now()}`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Failed to parse API response: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Read the seen.js file or return empty object if it doesn't exist
 */
function readSeenFile() {
  if (!fs.existsSync(SEEN_FILE)) {
    return {};
  }
  
  try {
    const content = fs.readFileSync(SEEN_FILE, 'utf-8');
    // Extract the object from module.exports = {...}
    const match = content.match(/module\.exports\s*=\s*({[\s\S]*});/);
    if (match) {
      return eval('(' + match[1] + ')');
    }
    return {};
  } catch (err) {
    console.error(`Error reading seen.js: ${err.message}`);
    return {};
  }
}

/**
 * Write the updated seen.js file
 */
function writeSeenFile(data) {
  const content = `module.exports = ${JSON.stringify(data, null, 2)};`;
  fs.writeFileSync(SEEN_FILE, content, 'utf-8');
}

/**
 * Main tracker function
 */
async function trackUGCDrops() {
  try {
    console.log('[INFO] Starting UGC drop tracker...');
    
    // Fetch data from Rolimon's API
    const apiData = await fetchRolimonData();
    
    if (!apiData.items || !Array.isArray(apiData.items)) {
      console.log('[WARN] No items array found in API response');
      return;
    }
    
    console.log(`[INFO] Fetched ${apiData.items.length} items from Rolimon's API`);
    
    // Read existing seen items
    const seen = readSeenFile();
    let newItemsFound = false;
    
    // Process each item
    for (const item of apiData.items) {
      const itemId = item.item_id;
      const itemName = item.item_name;
      const totalQuantity = item.total_quantity;
      
      // Skip if quantity is below threshold
      if (totalQuantity < MIN_QUANTITY) {
        continue;
      }
      
      // Check if item is new or if stock has changed
      const itemKey = String(itemId);
      const isNew = !seen[itemKey];
      const hasChangedStock = seen[itemKey] && seen[itemKey].quantity !== totalQuantity;
      
      if (isNew || hasChangedStock) {
        const timestamp = new Date().toISOString();
        const action = isNew ? 'NEW' : 'STOCK_CHANGE';
        
        console.log(
          `[${action}] Item ID: ${itemId}, Name: ${itemName}, Quantity: ${totalQuantity}, Time: ${timestamp}`
        );
        
        // Update seen object
        seen[itemKey] = {
          item_id: itemId,
          item_name: itemName,
          quantity: totalQuantity,
          last_seen: timestamp,
          first_seen: seen[itemKey]?.first_seen || timestamp
        };
        
        newItemsFound = true;
      }
    }
    
    // Write updated seen.js if changes were made
    if (newItemsFound) {
      console.log('[INFO] Changes detected. Updating seen.js...');
      writeSeenFile(seen);
      console.log('[SUCCESS] seen.js updated successfully');
    } else {
      console.log('[INFO] No new items or stock changes detected');
    }
    
  } catch (err) {
    console.error(`[ERROR] Tracker failed: ${err.message}`);
    process.exit(1);
  }
}

// Run the tracker
trackUGCDrops();