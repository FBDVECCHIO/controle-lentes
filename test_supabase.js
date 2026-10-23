const https = require('https');

const SUPABASE_URL = "https://mngwfearwjkpisararbe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3dmZWFyd2prcGlzYXJhcmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTc5MzksImV4cCI6MjA5NjE3MzkzOX0.vk9Ol41NU2RI72-ZZKIcm7hzccYBjzPPptb6rZv_mKs";

function request(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const options = {
      method: method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data
        });
      });
    });
    
    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function run() {
  console.log("Checking config_settings...");
  const resConfigs = await request('/config_settings');
  console.log('config_settings status:', resConfigs.status);
  try {
    const configs = JSON.parse(resConfigs.data);
    console.log('config_settings items count:', configs.length);
    configs.forEach(c => console.log(`  Key: ${c.key}, Value: ${c.value}`));
  } catch(e) {
    console.log('Failed to parse config_settings data:', resConfigs.data.substring(0, 200));
  }

  console.log("\nChecking vendas (limit 2)...");
  const resVendas = await request('/vendas?limit=2');
  console.log('vendas status:', resVendas.status);
  try {
    const vendas = JSON.parse(resVendas.data);
    console.log('vendas items:', JSON.stringify(vendas, null, 2));
  } catch(e) {
    console.log('Failed to parse vendas data:', resVendas.data.substring(0, 200));
  }
}

run().catch(err => console.error(err));
