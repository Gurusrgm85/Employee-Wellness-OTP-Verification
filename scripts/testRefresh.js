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

const postData = new URLSearchParams({
  refresh_token: env.REFRESH_TOKEN,
  client_id: env.CLIENT_ID,
  client_secret: env.CLIENT_SECRET,
  grant_type: 'refresh_token'
}).toString();

console.log('Sending refresh request with postData:', postData);

const req = https.request({
  hostname: 'accounts.zoho.in',
  port: 443,
  path: '/oauth/v2/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Refresh Status:', res.statusCode);
    console.log('New Token Response:', data);
  });
});

req.write(postData);
req.end();
