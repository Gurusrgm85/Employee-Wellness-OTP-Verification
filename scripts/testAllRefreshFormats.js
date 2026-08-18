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

function tryRefresh(hostname, asQuery) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      refresh_token: env.REFRESH_TOKEN,
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      grant_type: 'refresh_token'
    });

    const urlPath = asQuery ? `/oauth/v2/token?${params.toString()}` : `/oauth/v2/token`;
    const postBody = asQuery ? '' : params.toString();

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (!asQuery) {
      headers['Content-Length'] = Buffer.byteLength(postBody);
    }

    const req = https.request({
      hostname: hostname,
      port: 443,
      path: urlPath,
      method: 'POST',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ host: hostname, asQuery, status: res.statusCode, data }));
    });

    if (!asQuery) req.write(postBody);
    req.end();
  });
}

async function run() {
  console.log('Testing accounts.zoho.in as Query:');
  console.log(await tryRefresh('accounts.zoho.in', true));

  console.log('\nTesting accounts.zoho.in as Body:');
  console.log(await tryRefresh('accounts.zoho.in', false));

  console.log('\nTesting accounts.zoho.com as Query:');
  console.log(await tryRefresh('accounts.zoho.com', true));
}

run();
