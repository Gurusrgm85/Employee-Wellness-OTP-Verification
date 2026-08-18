import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

function loadEnv() {
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...rest] = trimmed.split('=');
        if (key) {
          env[key.trim()] = rest.join('=').trim();
        }
      }
    }
  }
  return env;
}

const env = loadEnv();
const accessToken = env.ACCESS_TOKEN || env.VITE_ACCESS_TOKEN;

function executeDeluge(functionName, argsObj = {}) {
  return new Promise((resolve, reject) => {
    const encodedArgs = encodeURIComponent(JSON.stringify(argsObj));
    const path = `/crm/v2/functions/${functionName}/actions/execute?auth_type=oauth&arguments=${encodedArgs}`;

    const options = {
      hostname: 'www.zohoapis.in',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    console.log(`\n🚀 Testing Deluge Function [${functionName}]...`);
    console.log(`URL: https://www.zohoapis.in${path}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Using Access Token:', accessToken.slice(0, 15) + '...');

  const testArgs = {
    phone: "9876543210",
    mobile: "9876543210",
    email: "emily.turner@example.com",
    name: "Emily"
  };

  // Test 1: otp1
  const res1 = await executeDeluge('otp1', testArgs);
  console.log('Result for [otp1]:', JSON.stringify(res1, null, 2));

  // Test 2: otp
  const res2 = await executeDeluge('otp', testArgs);
  console.log('Result for [otp]:', JSON.stringify(res2, null, 2));

  // Test 3: send_otp
  const res3 = await executeDeluge('send_otp', testArgs);
  console.log('Result for [send_otp]:', JSON.stringify(res3, null, 2));
}

run().catch(console.error);
