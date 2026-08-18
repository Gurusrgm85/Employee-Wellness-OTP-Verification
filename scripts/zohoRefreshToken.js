/**
 * Standalone Node.js Zoho Token Auto-Generation & Refresh Script
 * Usage: node scripts/zohoRefreshToken.js
 */

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

export async function refreshZohoAccessToken() {
  const env = loadEnv();
  const refreshToken = env.REFRESH_TOKEN || env.VITE_REFRESH_TOKEN || env.ZOHO_REFRESH_TOKEN;
  const clientId = env.CLIENT_ID || env.VITE_CLIENT_ID || env.ZOHO_CLIENT_ID;
  const clientSecret = env.CLIENT_SECRET || env.VITE_CLIENT_SECRET || env.ZOHO_CLIENT_SECRET;
  const accountsUrl = env.ACCOUNTS_URL || env.VITE_ACCOUNTS_URL || env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';

  if (!refreshToken) {
    throw new Error('Missing REFRESH_TOKEN in .env file!');
  }

  const postData = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  if (clientId) postData.append('client_id', clientId);
  if (clientSecret) postData.append('client_secret', clientSecret);

  const parsedUrl = new URL(`${accountsUrl}/oauth/v2/token?${postData.toString()}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Zoho Error: ${parsed.error}`));
          } else {
            console.log('✅ Fresh Zoho Access Token Generated:');
            console.log(parsed);

            // Update .env file with new access token
            if (fs.existsSync(envPath) && parsed.access_token) {
              let envContent = fs.readFileSync(envPath, 'utf-8');
              envContent = envContent.replace(
                /^ACCESS_TOKEN=.*/gm,
                `ACCESS_TOKEN=${parsed.access_token}`
              );
              envContent = envContent.replace(
                /^VITE_ACCESS_TOKEN=.*/gm,
                `VITE_ACCESS_TOKEN=${parsed.access_token}`
              );
              fs.writeFileSync(envPath, envContent, 'utf-8');
              console.log('📝 .env file updated automatically with latest access token.');
            }

            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

// Auto-run if executed directly via node
if (process.argv[1] === __filename) {
  refreshZohoAccessToken().catch((err) => {
    console.error('❌ Error generating token:', err.message);
    process.exit(1);
  });
}
