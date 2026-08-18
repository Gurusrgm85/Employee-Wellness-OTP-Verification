/**
 * Zoho CRM Service for Patient Module Integration & Deluge Functions
 * Supports token auto-refresh, v7 Deluge execution, and REST API fallback.
 */

const STORAGE_KEY = 'zoho_crm_token_info_v5';

// Environment Configuration
const CATALYST_FUNCTION_URL = 'https://project-rainfall-60072062952.development.catalystserverless.in/server/otp_backend';

const CONFIG = {
  clientId: import.meta.env.CLIENT_ID || import.meta.env.VITE_CLIENT_ID || '',
  clientSecret: import.meta.env.CLIENT_SECRET || import.meta.env.VITE_CLIENT_SECRET || '',
  refreshToken: import.meta.env.REFRESH_TOKEN || import.meta.env.VITE_REFRESH_TOKEN || '',
  accountsUrl: import.meta.env.ACCOUNTS_URL || import.meta.env.VITE_ACCOUNTS_URL || 'https://accounts.zoho.in',
  apiDomain: import.meta.env.API_DOMAIN || import.meta.env.VITE_API_DOMAIN || 'https://www.zohoapis.in',
  initialAccessToken: import.meta.env.ACCESS_TOKEN || import.meta.env.VITE_ACCESS_TOKEN || '',
  backendUrl: import.meta.env.VITE_BACKEND_URL || CATALYST_FUNCTION_URL,
};

// In-memory active token cache
let memoryAccessToken = CONFIG.initialAccessToken || '';

// Initialize Zoho Embedded App SDK if available in window
if (typeof window !== 'undefined' && window.ZOHO && window.ZOHO.embeddedApp) {
  try {
    window.ZOHO.embeddedApp.init();
  } catch (e) {
    console.log('ZOHO Embedded App SDK init note:', e);
  }
}

/**
 * Normalize any date format (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD) to ISO YYYY-MM-DD
 */
export function normalizeDateToISO(dateStr) {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return trimmed;
}

/**
 * Returns active access token, checking cache or auto-refreshing if expired
 */
export async function getValidAccessToken(forceRefresh = false) {
  if (!forceRefresh && memoryAccessToken) {
    return memoryAccessToken;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!forceRefresh && saved) {
      const parsed = JSON.parse(saved);
      if (parsed.access_token && parsed.expires_at && Date.now() < parsed.expires_at - 60000) {
        memoryAccessToken = parsed.access_token;
        return parsed.access_token;
      }
    }
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }

  return await refreshAccessToken();
}

/**
 * Auto-refreshes Zoho access token using refresh_token
 */
export async function refreshAccessToken() {
  console.log('🔄 Auto-refreshing Zoho Access Token...');

  // 1. Try internal Vite server auto-refresh plugin (also persists to .env)
  try {
    const serverRes = await fetch('/api/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const serverData = await serverRes.json();
    if (serverData.access_token) {
      memoryAccessToken = serverData.access_token;
      const expiresAt = Date.now() + (serverData.expires_in ? serverData.expires_in * 1000 : 3600 * 1000);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...serverData, expires_at: expiresAt }));
      } catch (e) {}

      console.log('✅ Access Token auto-generated & saved successfully!');
      return serverData.access_token;
    }
  } catch (serverErr) {
    console.warn('Vite auto-refresh gateway notice:', serverErr);
  }

  // 2. Direct browser fallback via proxy
  const refreshToken = CONFIG.refreshToken;
  const clientId = CONFIG.clientId;
  const clientSecret = CONFIG.clientSecret;

  if (refreshToken) {
    try {
      const endpoint = import.meta.env.DEV
        ? '/zoho-oauth/oauth/v2/token'
        : `${CONFIG.accountsUrl.replace(/\/$/, '')}/oauth/v2/token`;

      const params = new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      if (clientId) params.append('client_id', clientId);
      if (clientSecret) params.append('client_secret', clientSecret);

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = await response.json();
      if (data.access_token) {
        memoryAccessToken = data.access_token;
        const expiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, expires_at: expiresAt }));
        } catch (e) {}
        return data.access_token;
      }
    } catch (directErr) {
      console.warn('Direct refresh notice:', directErr);
    }
  }

  return memoryAccessToken || CONFIG.initialAccessToken;
}

/**
 * Executes a Deluge Custom Function (e.g. 'otp1') from the web app with 401 Auto-Retry
 * @param {string} functionName - Function API name in Zoho CRM (default 'otp1')
 * @param {object} argsObj - Arguments to pass to the function (e.g. { phone, email, name })
 */
export async function executeDelugeFunction(functionName = 'otp1', argsObj = {}, isRetry = false) {
  // 1. If Catalyst Backend function is configured, use it for secure execution & auto-refresh
  if (CONFIG.backendUrl) {
    try {
      const backendEndpoint = `${CONFIG.backendUrl.replace(/\/$/, '')}/zoho/execute-function`;
      console.log(`⚡ [Catalyst Function] Executing Deluge [${functionName}] via backend:`, backendEndpoint);

      const res = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ functionName, args: argsObj }),
      });

      const result = await res.json();
      if (!res.ok || result.status === 'error') {
        throw new Error(result.message || `Backend function execution failed with status ${res.status}`);
      }
      return result;
    } catch (backendErr) {
      console.warn('Catalyst backend execution failed, falling back to direct API:', backendErr);
      if (!import.meta.env.DEV) {
        throw backendErr;
      }
    }
  }

  // 2. Direct browser fallback via proxy
  const accessToken = await getValidAccessToken(isRetry);
  const encodedArgs = encodeURIComponent(JSON.stringify(argsObj));

  const endpoint = import.meta.env.DEV
    ? `/zoho-api/crm/v7/functions/${functionName}/actions/execute?auth_type=oauth&arguments=${encodedArgs}`
    : `${CONFIG.apiDomain.replace(/\/$/, '')}/crm/v7/functions/${functionName}/actions/execute?auth_type=oauth&arguments=${encodedArgs}`;

  console.log(`⚡ Executing Deluge function [${functionName}] with args:`, argsObj);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const result = await response.json();
  console.log(`📥 Deluge response for [${functionName}]:`, result);

  // Auto-retry on 401 token expiry
  if ((response.status === 401 || result.code === 'INVALID_TOKEN') && !isRetry) {
    console.log('🔄 Token expired during function execution. Retrying with fresh token...');
    await refreshAccessToken();
    return await executeDelugeFunction(functionName, argsObj, true);
  }

  if (!response.ok || result.status === 'error') {
    throw new Error(result.message || `Failed to execute Deluge function ${functionName}`);
  }

  return result;
}

/**
 * Creates a record in the 'Patient' module in Zoho CRM with 401 Auto-Retry
 */
export async function createPatientRecord(formData, isRetry = false) {
  const isoDate = normalizeDateToISO(formData.dob);

  // Clean mobile number: remove +91, spaces, special chars and keep exact 10 digits
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
    Date_of_Birth: isoDate || null,
    Gender: formData.gender || '',
    Email: formData.email || '',
    Postal_Code: formData.postalCode || '',
    Address_Line_1: formData.address || '',
    Mobile_No: cleanMobile,
  };

  // 1. Check if ZRC / Zoho Embedded App SDK is active
  if (typeof window !== 'undefined' && window.ZOHO && window.ZOHO.CRM && window.ZOHO.CRM.API) {
    try {
      console.log('🚀 Using ZRC (Zoho CRM JS SDK) insertRecord method...');
      const zrcResult = await window.ZOHO.CRM.API.insertRecord({
        Entity: 'Patient',
        APIData: patientRecord,
        Trigger: ['workflow'],
      });

      if (zrcResult && zrcResult.data && zrcResult.data[0]?.code === 'SUCCESS') {
        console.log('✅ ZRC Record created successfully:', zrcResult);
        return zrcResult;
      }
    } catch (zrcErr) {
      console.warn('ZRC SDK insertRecord failed, falling back to REST API:', zrcErr);
    }
  }

  // 2. If Catalyst Backend function is configured, use it for secure record creation & auto-refresh
  if (CONFIG.backendUrl) {
    try {
      const backendEndpoint = `${CONFIG.backendUrl.replace(/\/$/, '')}/zoho/create-patient`;
      console.log(`📤 [Catalyst Function] Creating Patient Record via backend:`, backendEndpoint);

      const res = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || `Backend patient creation failed with status ${res.status}`);
      }
      return result;
    } catch (backendErr) {
      console.warn('Catalyst backend patient creation failed, falling back to direct REST API:', backendErr);
      if (!import.meta.env.DEV) {
        throw backendErr;
      }
    }
  }

  // 3. REST API Method via configured proxy
  const accessToken = await getValidAccessToken(isRetry);
  const payload = {
    data: [patientRecord],
  };

  const endpoint = import.meta.env.DEV
    ? '/zoho-api/crm/v2/Patient'
    : `${CONFIG.apiDomain.replace(/\/$/, '')}/crm/v2/Patient`;

  console.log('📤 Submitting Patient via REST API:', JSON.stringify(payload, null, 2));

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  console.log('📥 Zoho CRM Response:', response.status, result);

  // Auto-retry on 401 token expiry
  if ((response.status === 401 || result.code === 'INVALID_TOKEN') && !isRetry) {
    console.log('🔄 Token expired during record creation. Retrying with fresh token...');
    await refreshAccessToken();
    return await createPatientRecord(formData, true);
  }

  if (!response.ok) {
    const errorDetails = result.message || JSON.stringify(result);
    throw new Error(`Zoho CRM Error (${response.status}): ${errorDetails}`);
  }

  if (result.data && result.data.length > 0) {
    const recordStatus = result.data[0];
    if (recordStatus.status === 'error') {
      const fieldError = recordStatus.details ? JSON.stringify(recordStatus.details) : '';
      throw new Error(`Zoho Record Error: ${recordStatus.message} ${fieldError}`);
    }
  }

  return result;
}
