'use strict';

const express = require('express');
const cors = require('cors');

const app = express();

// Handle CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Zoho-oauthtoken');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let activeAccessToken = process.env.ACCESS_TOKEN || '';
let tokenExpiresAt = 0;

const getZohoConfig = () => ({
  clientId: process.env.CLIENT_ID || '',
  clientSecret: process.env.CLIENT_SECRET || '',
  refreshToken: process.env.REFRESH_TOKEN || '',
  accountsUrl: (process.env.ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, ''),
  apiDomain: (process.env.API_DOMAIN || 'https://www.zohoapis.in').replace(/\/$/, ''),
});

/**
 * Refresh Zoho OAuth access token
 */
async function refreshZohoAccessToken() {
  const config = getZohoConfig();

  if (!config.refreshToken) {
    throw new Error('REFRESH_TOKEN is not configured in function env variables');
  }

  const params = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  });

  const url = `${config.accountsUrl}/oauth/v2/token?${params.toString()}`;
  console.log('🔄 [Function] Requesting fresh Zoho access token...');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = await response.json();

  if (data.access_token) {
    activeAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000);
    console.log('✅ [Function] Successfully refreshed Zoho access token!');
    return data.access_token;
  } else {
    console.error('❌ [Function] Token refresh failed:', data);
    let errMsg = data.error || 'Failed to refresh Zoho access token';
    if (data.error === 'invalid_code') {
      errMsg = 'Zoho REFRESH_TOKEN is expired or invalid (invalid_code).';
    }
    throw new Error(errMsg);
  }
}

/**
 * Get currently valid access token
 */
async function getValidAccessToken(force = false) {
  if (!force && activeAccessToken) {
    if (tokenExpiresAt > 0 && Date.now() < tokenExpiresAt - 60000) {
      return activeAccessToken;
    }
  }
  return await refreshZohoAccessToken();
}

// Router to handle paths
const router = express.Router();

// 1. Health Check
router.get(['/', '/health', '/api/health'], (req, res) => {
  res.json({
    status: 'online',
    service: 'Catalyst Advanced I/O Function (otp_backend)',
    timestamp: new Date().toISOString(),
    hasZohoCredentials: Boolean(process.env.CLIENT_ID && process.env.REFRESH_TOKEN),
  });
});

// 2. Token Refresh Endpoint
router.post(['/refresh-token', '/api/refresh-token'], async (req, res) => {
  try {
    const token = await refreshZohoAccessToken();
    res.json({ access_token: token, expires_in: 3600, status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Token refresh failed' });
  }
});

// 3. Execute Deluge Function Endpoint
router.post(['/zoho/execute-function', '/api/zoho/execute-function'], async (req, res) => {
  const { functionName = 'otp1', args = {} } = req.body;

  try {
    const executeCall = async (token) => {
      const config = getZohoConfig();
      const encodedArgs = encodeURIComponent(JSON.stringify(args));
      const url = `${config.apiDomain}/crm/v7/functions/${functionName}/actions/execute?auth_type=oauth&arguments=${encodedArgs}`;

      console.log(`⚡ [Function] Executing Deluge [${functionName}] with args:`, args);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      return { status: response.status, data };
    };

    let token = await getValidAccessToken();
    let result = await executeCall(token);

    if (result.status === 401 || result.data?.code === 'INVALID_TOKEN') {
      console.log('🔄 Token expired, retrying with fresh token...');
      token = await getValidAccessToken(true);
      result = await executeCall(token);
    }

    if (result.status >= 400) {
      return res.status(result.status).json(result.data);
    }

    res.json(result.data);
  } catch (err) {
    console.error('Error executing Deluge function:', err);
    res.status(500).json({ error: err.message || 'Deluge execution failed' });
  }
});

// 4. Create Patient Record in Zoho CRM
router.post(['/zoho/create-patient', '/api/zoho/create-patient'], async (req, res) => {
  const { formData } = req.body;

  if (!formData) {
    return res.status(400).json({ error: 'Missing formData payload' });
  }

  let cleanMobile = (formData.mobileNo || '').replace(/\D/g, '');
  if (cleanMobile.length > 10) {
    if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
      cleanMobile = cleanMobile.slice(2);
    } else {
      cleanMobile = cleanMobile.slice(-10);
    }
  }

  const patientRecord = {
    First_Name: formData.firstName || '',
    Date_of_Birth: formData.dob || null,
    Gender: formData.gender || '',
    Email: formData.email || '',
    Postal_Code: formData.postalCode || '',
    Address_Line_1: formData.address || '',
    Mobile_No: cleanMobile,
  };

  const payload = { data: [patientRecord] };

  try {
    const createCall = async (token) => {
      const config = getZohoConfig();
      const url = `${config.apiDomain}/crm/v2/Patient`;

      console.log('📤 [Function] Creating Patient Record:', payload);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      return { status: response.status, data };
    };

    let token = await getValidAccessToken();
    let result = await createCall(token);

    if (result.status === 401 || result.data?.code === 'INVALID_TOKEN') {
      console.log('🔄 Token expired, retrying with fresh token...');
      token = await getValidAccessToken(true);
      result = await createCall(token);
    }

    if (result.status >= 400) {
      return res.status(result.status).json(result.data);
    }

    res.json(result.data);
  } catch (err) {
    console.error('Error creating patient record:', err);
    res.status(500).json({ error: err.message || 'Record creation failed' });
  }
});

// Mount router on root and on function subpath
app.use('/', router);
app.use('/server/otp_backend', router);
app.use('/otp_backend', router);

module.exports = app;
