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

// The Catalyst gateway answers CORS preflights itself without our headers,
// so the frontend sends JSON as text/plain (a "simple request" that needs
// no preflight). Parse those bodies here.
app.use(express.text({ type: 'text/plain' }));
app.use((req, res, next) => {
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      req.body = {};
    }
  }
  next();
});

let activeAccessToken = '';
let tokenExpiresAt = 0;

const getZohoConfig = () => ({
  clientId: process.env.CLIENT_ID || '',
  clientSecret: process.env.CLIENT_SECRET || '',
  scope: process.env.ZOHO_SCOPE || 'ZohoCRM.functions.execute.READ,ZohoCRM.functions.execute.CREATE,ZohoCRM.modules.ALL',
  soid: process.env.ZOHO_SOID || '',
  accountsUrl: (process.env.ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, ''),
  apiDomain: (process.env.API_DOMAIN || 'https://www.zohoapis.in').replace(/\/$/, ''),
});

/**
 * Fetch a fresh Zoho access token via the Client Credentials flow.
 * No refresh token involved — nothing to expire or revoke.
 */
async function refreshZohoAccessToken() {
  const config = getZohoConfig();

  if (!config.clientId || !config.clientSecret || !config.soid) {
    throw new Error('CLIENT_ID, CLIENT_SECRET and ZOHO_SOID must be configured in function env variables');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: config.scope,
    soid: config.soid,
  });

  const url = `${config.accountsUrl}/oauth/v2/token?${params.toString()}`;
  console.log('🔄 [Function] Requesting Zoho access token via client_credentials...');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = await response.json();

  if (data.access_token) {
    activeAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000);
    console.log('✅ [Function] Successfully fetched Zoho access token!');
    return data.access_token;
  } else {
    console.error('❌ [Function] Token fetch failed:', data);
    const desc = data.error_description || data.error || '';
    const normalized = desc.toLowerCase();
    if (
      normalized.includes('too many request') ||
      normalized.includes('continuously') ||
      normalized.includes('access denied')
    ) {
      throw new Error('Too many requests. Please try again after some time.');
    }
    throw new Error(desc || 'Failed to fetch Zoho access token');
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
    hasZohoCredentials: Boolean(process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.ZOHO_SOID),
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
    const msg = err.message || '';
    const normalized = msg.toLowerCase();
    const isRateLimit =
      normalized.includes('too many request') ||
      normalized.includes('continuously') ||
      normalized.includes('access denied');
    res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit ? 'Too many requests. Please try again after some time.' : (err.message || 'Deluge execution failed')
    });
  }
});

// 4. Create Health Camp Registration Record in Zoho CRM
router.post(['/zoho/create-registration', '/zoho/create-patient', '/api/zoho/create-patient'], async (req, res) => {
  const { formData } = req.body;

  if (!formData) {
    return res.status(400).json({ error: 'Missing formData payload' });
  }

  const isEnrolled = Boolean(formData.enrolYes && (formData.wellnessConsent ?? formData.we4weEnrollment ?? formData.We4We_Enrollment ?? formData.WE4WE_Enrollment ?? true));
  const isPrivacyAgreed = Boolean(formData.I_have_read_the_above_notice_and_consent_to_Sugah_and_its_lab_partners ?? formData.I_have_read_the_above_notice_and_consent_to_Sugah ?? formData.privacyConsent ?? formData.consentA?.[0] ?? true);

  const registrationRecord = {
    Name1: formData.name || formData.firstName || '',
    Employee_ID: formData.Employee_ID || formData.employeeId || '',
    Email: formData.Email || formData.email || '',
    We4We_Enrollment: isEnrolled,
    WE4WE_Enrollment: isEnrolled,
    We4we_Enrollment: isEnrolled,
    We4We_Enrolment: isEnrolled,
    WE4WE_programme_enrolment: isEnrolled,
    WE4WE_Programme_Enrolment: isEnrolled,
    I_have_read_the_above_notice_and_consent_to_Sugah_and_its_lab_partners: isPrivacyAgreed,
    I_have_read_the_above_notice_and_consent_to_Sugah_and_its_lab_partner: isPrivacyAgreed,
    I_have_read_the_above_notice_and_consent_to_Sugah_and_its_lab: isPrivacyAgreed,
    I_have_read_the_above_notice_and_consent_to_Sugah_and_its: isPrivacyAgreed,
    I_have_read_the_above_notice_and_consent_to_Sugah_and: isPrivacyAgreed,
    I_have_read_the_above_notice_and_consent_to_Sugah: isPrivacyAgreed,
    I_have_read_the_privacy_notice: isPrivacyAgreed,
    I_understand_participation_is_voluntary: Boolean(formData.consentA?.[1] ?? true),
    I_consent_to_collection_and_processing_of_my_healt: Boolean(formData.consentA?.[2] ?? true),
    I_understand_I_may_withdraw_my_consent_from_the_WE: Boolean(formData.consentA?.[3] ?? true),
  };

  if (isEnrolled) {
    registrationRecord.I_understand_the_programme_duration_is_approximate = Boolean(formData.consentB?.[1] ?? true);
    registrationRecord.I_understand_I_may_withdraw_at_any_time = Boolean(formData.consentB?.[2] ?? true);
    registrationRecord.I_consent_to_receive_reminders_by_SMS_email_or_pho = Boolean(formData.consentB?.[3] ?? true);
    registrationRecord.I_understand_participation_does_not_guarantee_any = Boolean(formData.consentB?.[4] ?? true);
  }

  const payload = { data: [registrationRecord] };

  try {
    const createCall = async (token) => {
      const config = getZohoConfig();
      const url = `${config.apiDomain}/crm/v7/Health_Camp_Registrations`;

      console.log('📤 [Function] Creating Health Camp Registration Record:', JSON.stringify(payload));

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

    const rawRecord = result.data?.data?.[0] || result.data;
    const recordId = rawRecord?.details?.id || rawRecord?.id || '';

    // Sanitize response: hide Created_By, Modified_By and user IDs, and provide a clear success message
    const sanitizedResponse = {
      code: 'SUCCESS',
      status: 'success',
      message: 'Record added successfully.',
      details: {
        id: recordId,
      },
      data: [
        {
          code: 'SUCCESS',
          status: 'success',
          message: 'Record added successfully.',
          details: {
            id: recordId,
          },
        },
      ],
    };

    res.json(sanitizedResponse);
  } catch (err) {
    console.error('Error creating registration record:', err);
    const msg = err.message || '';
    const normalized = msg.toLowerCase();
    const isRateLimit =
      normalized.includes('too many request') ||
      normalized.includes('continuously') ||
      normalized.includes('access denied');
    res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit ? 'Too many requests. Please try again after some time.' : (err.message || 'Record creation failed')
    });
  }
});

// Mount router on root and on function subpath
app.use('/', router);
app.use('/server/otp_backend', router);
app.use('/otp_backend', router);

module.exports = app;
