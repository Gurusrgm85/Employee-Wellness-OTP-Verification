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
        headers: { 'Content-Type': 'text/plain' },
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
 * Creates a record in the 'Health_Camp_Registrations' module in Zoho CRM with 401 Auto-Retry
 */
export async function createHealthCampRegistration(formData, isRetry = false) {
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

  // 1. Check if ZRC / Zoho Embedded App SDK is active
  if (typeof window !== 'undefined' && window.ZOHO && window.ZOHO.CRM && window.ZOHO.CRM.API) {
    try {
      console.log('🚀 Using ZRC (Zoho CRM JS SDK) insertRecord method...');
      const sdkResult = await window.ZOHO.CRM.API.insertRecord({
        Entity: 'Health_Camp_Registrations',
        APIData: registrationRecord,
        Trigger: ['workflow'],
      });
      console.log('📥 ZRC insertRecord response:', sdkResult);
      if (sdkResult && sdkResult.data && sdkResult.data[0] && sdkResult.data[0].code === 'SUCCESS') {
        return sdkResult;
      }
    } catch (sdkErr) {
      console.warn('ZRC insertRecord failed, falling back to Catalyst/REST:', sdkErr);
    }
  }

  // 2. Catalyst Backend Function
  if (CONFIG.backendUrl) {
    try {
      const backendEndpoint = `${CONFIG.backendUrl.replace(/\/$/, '')}/zoho/create-registration`;
      console.log(`📤 [Catalyst Function] Creating Health Camp Registration via backend:`, backendEndpoint);

      const res = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ formData }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || `Backend registration creation failed with status ${res.status}`);
      }
      return result;
    } catch (backendErr) {
      console.warn('Catalyst backend registration creation failed, falling back to direct REST API:', backendErr);
      if (!import.meta.env.DEV) {
        throw backendErr;
      }
    }
  }

  // 3. Direct REST API via configured proxy
  const accessToken = await getValidAccessToken(isRetry);
  const payload = {
    data: [registrationRecord],
  };

  const endpoint = import.meta.env.DEV
    ? '/zoho-api/crm/v7/Health_Camp_Registrations'
    : `${CONFIG.apiDomain.replace(/\/$/, '')}/crm/v7/Health_Camp_Registrations`;

  console.log('📤 Submitting Health Camp Registration via REST API:', JSON.stringify(payload, null, 2));

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
    return await createHealthCampRegistration(formData, true);
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

// Alias for backwards compatibility
export const createPatientRecord = createHealthCampRegistration;
