/**
 * Zoho CRM Service for Patient Module Integration & Deluge Functions
 * Supports token auto-refresh, v7 Deluge execution, and REST API fallback.
 */

// Environment Configuration
const CATALYST_FUNCTION_URL = 'https://project-rainfall-60085787215.development.catalystserverless.in/server/otp_backend/';

const CONFIG = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || CATALYST_FUNCTION_URL,
};

// In-memory active token cache (runtime only, never stored in localStorage)
let memoryAccessToken = '';

// Initialize Zoho Embedded App SDK if available in window
if (typeof window !== 'undefined' && window.ZOHO && window.ZOHO.embeddedApp) {
  try {
    window.ZOHO.embeddedApp.init();
  } catch (e) {}
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
 * Returns active access token from in-memory cache or dev server auto-refresh
 */
export async function getValidAccessToken(forceRefresh = false) {
  if (!forceRefresh && memoryAccessToken) {
    return memoryAccessToken;
  }
  return await refreshAccessToken();
}

/**
 * Auto-refreshes Zoho access token via backend dev server (no secrets exposed)
 */
export async function refreshAccessToken() {
  try {
    const serverRes = await fetch('/api/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const serverData = await serverRes.json();
    if (serverData.access_token) {
      memoryAccessToken = serverData.access_token;
      return serverData.access_token;
    }
  } catch (serverErr) {}

  return memoryAccessToken;
}

/**
 * Executes a Deluge Custom Function (e.g. 'otp1') from the web app with 401 Auto-Retry
 * @param {string} functionName - Function API name in Zoho CRM (default 'otp1')
 * @param {object} argsObj - Arguments to pass to the function (e.g. { phone, email, name })
 */
export async function executeDelugeFunction(functionName = 'otp1', argsObj = {}, isRetry = false) {
  let result = null;

  // 1. If Catalyst Backend function is configured, use it for secure execution & auto-refresh
  if (CONFIG.backendUrl) {
    try {
      const backendEndpoint = `${CONFIG.backendUrl.replace(/\/$/, '')}/zoho/execute-function`;

      const res = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ functionName, args: argsObj }),
      });

      result = await res.json().catch(() => ({}));
      if (!res.ok || result.status === 'error') {
        const errorText = result.error || result.message || '';
        const normalized = typeof errorText === 'string' ? errorText.toLowerCase() : '';
        if (
          res.status === 429 ||
          normalized.includes('too many request') ||
          normalized.includes('continuously') ||
          normalized.includes('access denied') ||
          res.status === 500
        ) {
          throw new Error('Too many requests. Please try again after some time.');
        }
        throw new Error(errorText || `Backend function execution failed with status ${res.status}`);
      }
    } catch (backendErr) {
      if (!import.meta.env.DEV) {
        throw backendErr;
      }
    }
  }

  // 2. Direct browser fallback via proxy
  if (!result) {
    const accessToken = await getValidAccessToken(isRetry);
    const encodedArgs = encodeURIComponent(JSON.stringify(argsObj));

    const endpoint = import.meta.env.DEV
      ? `/zoho-api/crm/v7/functions/${functionName}/actions/execute?auth_type=oauth&arguments=${encodedArgs}`
      : `${CONFIG.apiDomain.replace(/\/$/, '')}/crm/v7/functions/${functionName}/actions/execute?auth_type=oauth&arguments=${encodedArgs}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    result = await response.json();

    // Auto-retry on 401 token expiry
    if ((response.status === 401 || result.code === 'INVALID_TOKEN') && !isRetry) {
      await refreshAccessToken();
      return await executeDelugeFunction(functionName, argsObj, true);
    }

    if (!response.ok || result.status === 'error') {
      throw new Error(result.message || `Failed to execute Deluge function ${functionName}`);
    }
  }

  // Security guard: Ensure OTP or internal userMessage is never exposed in client memory
  if (result?.details) {
    delete result.details.userMessage;
    if (typeof result.details.output === 'string') {
      try {
        const parsed = JSON.parse(result.details.output);
        if (parsed && typeof parsed === 'object' && parsed.otp) {
          delete parsed.otp;
          result.details.output = JSON.stringify(parsed);
        }
      } catch (e) {}
    } else if (result.details.output && typeof result.details.output === 'object') {
      delete result.details.output.otp;
    }
  }

  return result;
}

/**
 * Triggers sending the OTP code via Catalyst server & Zoho Deluge
 */
export async function sendOtp(email, employeeId, name) {
  const trimmedEmail = (email || '').trim();
  return await executeDelugeFunction('otp1', {
    email: trimmedEmail,
    phone: '9876543210',
    name: name || `Employee ${(employeeId || '').trim()}`,
    first_name: name || `Employee ${(employeeId || '').trim()}`,
    action: 'send_otp',
  });
}

/**
 * Verifies the OTP code server-side via Catalyst server
 */
export async function verifyOtp(email, enteredOtp) {
  const trimmedEmail = (email || '').trim();
  const trimmedOtp = (enteredOtp || '').trim();

  // Try dedicated Catalyst verify-otp endpoint
  if (CONFIG.backendUrl) {
    try {
      const backendEndpoint = `${CONFIG.backendUrl.replace(/\/$/, '')}/zoho/verify-otp`;
      const res = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ email: trimmedEmail, otp: trimmedOtp }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.verified === true || data.status === 'success')) {
        return { success: true, message: data.message || 'OTP verified successfully.' };
      }
      if (res.status === 400 || res.status === 401 || data.verified === false) {
        return {
          success: false,
          message: data.message || 'Invalid verification code. Please check your email and try again.',
        };
      }
    } catch (e) {
      // Fall through to Deluge execute-function verification
    }
  }

  // Fallback: Deluge executeDelugeFunction with action: 'verify_otp'
  try {
    const res = await executeDelugeFunction('otp1', {
      action: 'verify_otp',
      email: trimmedEmail,
      entered_otp: trimmedOtp,
      otp: trimmedOtp,
    });

    if (
      res?.verified === true ||
      res?.status === 'success' ||
      res?.details?.output?.verified === true ||
      res?.details?.output?.status === 'success'
    ) {
      return { success: true, message: 'OTP verified successfully.' };
    }

    return {
      success: false,
      message: res?.message || res?.details?.output?.message || 'Invalid verification code. Please check your email and try again.',
    };
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Verification failed. Please try again.',
    };
  }
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
      const sdkResult = await window.ZOHO.CRM.API.insertRecord({
        Entity: 'Health_Camp_Registrations',
        APIData: registrationRecord,
        Trigger: ['workflow'],
      });
      if (sdkResult && sdkResult.data && sdkResult.data[0] && sdkResult.data[0].code === 'SUCCESS') {
        return sdkResult;
      }
    } catch (sdkErr) {}
  }

  // 2. Catalyst Backend Function
  if (CONFIG.backendUrl) {
    try {
      const backendEndpoint = `${CONFIG.backendUrl.replace(/\/$/, '')}/zoho/create-registration`;

      const res = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ formData }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorText = result.error || result.message || '';
        const normalized = typeof errorText === 'string' ? errorText.toLowerCase() : '';
        if (
          res.status === 429 ||
          normalized.includes('too many request') ||
          normalized.includes('continuously') ||
          normalized.includes('access denied') ||
          res.status === 500
        ) {
          throw new Error('Too many requests. Please try again after some time.');
        }
        throw new Error(errorText || `Backend registration creation failed with status ${res.status}`);
      }
      return result;
    } catch (backendErr) {
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

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  // Auto-retry on 401 token expiry
  if ((response.status === 401 || result.code === 'INVALID_TOKEN') && !isRetry) {
    await refreshAccessToken();
    return await createHealthCampRegistration(formData, true);
  }

  if (!response.ok) {
    const errorDetails = result.message || JSON.stringify(result);
    throw new Error(`Zoho CRM Error (${response.status}): ${errorDetails}`);
  }

  const rawRecord = result?.data?.[0] || result;
  const recordId = rawRecord?.details?.id || rawRecord?.id || '';

  return {
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
}

// Alias for backwards compatibility
export const createPatientRecord = createHealthCampRegistration;
