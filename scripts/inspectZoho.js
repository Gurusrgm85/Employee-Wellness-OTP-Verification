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

function makeRequest(apiPath, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.zohoapis.in',
      port: 443,
      path: apiPath,
      method: method,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (postData) {
      const bodyStr = JSON.stringify(postData);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function test() {
  console.log('--- Testing GET /crm/v2/Patient ---');
  console.log(await makeRequest('/crm/v2/Patient'));

  console.log('\n--- Testing GET /crm/v2/Patients ---');
  console.log(await makeRequest('/crm/v2/Patients'));

  console.log('\n--- Testing POST /crm/v2/Patient ---');
  const payload1 = {
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
  console.log(await makeRequest('/crm/v2/Patient', 'POST', payload1));

  console.log('\n--- Testing POST /crm/v2/Patients ---');
  console.log(await makeRequest('/crm/v2/Patients', 'POST', payload1));

  console.log('\n--- Testing POST /crm/v3/Patient ---');
  console.log(await makeRequest('/crm/v3/Patient', 'POST', payload1));
}

test().catch(console.error);
