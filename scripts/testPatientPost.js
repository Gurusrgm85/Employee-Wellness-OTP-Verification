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
const accessToken = env.ZOHO_ACCESS_TOKEN || env.VITE_ZOHO_ACCESS_TOKEN;

const options = {
  hostname: 'www.zohoapis.in',
  port: 443,
  path: '/crm/v2/Patient',
  method: 'POST',
  headers: {
    'Authorization': `Zoho-oauthtoken ${accessToken}`,
    'Content-Type': 'application/json',
  },
};

const payload = {
  data: [
    {
      First_Name: "Emily",
      Date_of_Birth: "1995-08-15",
      Gender: "Female",
      Email: "emily.turner@example.com",
      Postal_Code: "600028",
      Address_Line_1: "42 Marina Bay View, Anna Nagar, Chennai",
      Mobile: "+91 9876543210"
    }
  ]
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.write(JSON.stringify(payload));
req.end();
