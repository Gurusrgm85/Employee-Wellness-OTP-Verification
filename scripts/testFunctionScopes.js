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

function testPost(path) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'www.zohoapis.in',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.end();
  });
}

async function check() {
  console.log('Testing /crm/v3/functions/otp1/actions/execute:');
  console.log(await testPost('/crm/v3/functions/otp1/actions/execute?auth_type=oauth'));

  console.log('\nTesting /crm/v2/org:');
  console.log(await testPost('/crm/v2/org'));
}

check();
