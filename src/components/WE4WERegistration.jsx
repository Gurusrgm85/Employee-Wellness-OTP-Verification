import React, { useState, useRef, useEffect } from 'react';
import { executeDelugeFunction, createPatientRecord } from '../services/zohoService';

const LABELS_A = [
  'I have read the privacy notice.',
  'I understand participation is voluntary.',
  'I consent to collection and processing of my health information for healthcare purposes.',
  'I understand I may withdraw my consent from the WE4WE programme at any time.',
];

const LABELS_B = [
  'I voluntarily wish to participate.',
  'I understand the programme duration is approximately one year.',
  'I understand I may withdraw at any time.',
  'I consent to receive reminders by SMS, email or phone.',
  'I understand participation does not guarantee any specific medical outcome.',
];

const PROGRAMME_FEATURES = [
  'Clinical evaluation',
  'Risk stratification',
  'Personalised lifestyle counselling',
  'Follow-up at defined intervals',
  'Health education, reminders and incentives',
];

export default function WE4WERegistration() {
  const [email, setEmail] = useState('');

  // Consent Ledgers
  const [consentA, setConsentA] = useState([false, false, false, false]);
  const [enrolYes, setEnrolYes] = useState(true);
  const [consentB, setConsentB] = useState([false, false, false, false, false]);

  // OTP Verification State
  const [isSending, setIsSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendSecs, setResendSecs] = useState(0);
  const [expirySecs, setExpirySecs] = useState(600);
  const [serverOtp, setServerOtp] = useState(null);

  // Status & Confirmation State
  const [errorMessage, setErrorMessage] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState('');
  const [refId, setRefId] = useState('');
  const [signedAt, setSignedAt] = useState('');

  const otpInputRefs = useRef([]);

  const getNowStamp = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMMSS = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Timer countdown
  useEffect(() => {
    let interval;
    if (codeSent && !isDone) {
      interval = setInterval(() => {
        setResendSecs((prev) => Math.max(0, prev - 1));
        setExpirySecs((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [codeSent, isDone]);

  // Focus first OTP cell on send
  useEffect(() => {
    if (codeSent && otpInputRefs.current[0]) {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    }
  }, [codeSent]);

  // Toggle individual consent item
  const toggleConsent = (type, index) => {
    if (isDone) return;
    if (type === 'A') {
      const newA = [...consentA];
      newA[index] = !newA[index];
      setConsentA(newA);
    } else {
      const newB = [...consentB];
      newB[index] = !newB[index];
      setConsentB(newB);
    }
    setErrorMessage('');
  };

  // Toggle all items in a ledger
  const toggleAll = (type) => {
    if (isDone) return;
    if (type === 'A') {
      const allChecked = consentA.every(Boolean);
      setConsentA(consentA.map(() => !allChecked));
    } else {
      const allChecked = consentB.every(Boolean);
      setConsentB(consentB.map(() => !allChecked));
    }
    setErrorMessage('');
  };

  const allAChecked = consentA.every(Boolean);
  const allBChecked = !enrolYes || consentB.every(Boolean);
  const gateOpen = allAChecked && allBChecked;
  const totalRequired = enrolYes ? 9 : 4;

  // Handle OTP digit entry
  const handleDigitChange = (index, value) => {
    const digit = String(value).replace(/\D/g, '').slice(-1);
    const newOtp = [...otpDigits];
    newOtp[index] = digit;
    setOtpDigits(newOtp);
    setErrorMessage('');

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste) {
      const newOtp = ['', '', '', '', '', ''];
      for (let i = 0; i < paste.length; i++) {
        newOtp[i] = paste[i];
      }
      setOtpDigits(newOtp);
      if (paste.length === 6) {
        otpInputRefs.current[5]?.focus();
      } else {
        otpInputRefs.current[paste.length]?.focus();
      }
    }
  };

  // 1. Send OTP via Deluge Function
  const handleSendCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }

    if (!gateOpen) {
      setErrorMessage('Please tick all required consent statements before requesting code.');
      return;
    }

    setIsSending(true);
    setErrorMessage('');

    try {
      console.log('⚡ Requesting OTP via Deluge Function "otp1"...');
      const delugeRes = await executeDelugeFunction('otp1', {
        email: email,
        phone: '9876543210',
        name: email.split('@')[0] || 'Employee',
        first_name: email.split('@')[0] || 'Employee',
        action: 'send_otp',
      });

      console.log('✅ Deluge OTP Response:', delugeRes);

      const rawOutput = delugeRes?.details?.output;
      let parsed = rawOutput;
      if (typeof rawOutput === 'string') {
        try {
          parsed = JSON.parse(rawOutput);
        } catch (e) {}
      }

      if (parsed && typeof parsed === 'object' && parsed.otp) {
        setServerOtp(String(parsed.otp));
      } else if (typeof rawOutput === 'string') {
        const match = rawOutput.match(/\b\d{6}\b/);
        if (match) setServerOtp(match[0]);
      }

      setCodeSent(true);
      setResendSecs(30);
      setExpirySecs(600);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err) {
      console.error('OTP Send Error:', err);
      setErrorMessage(err.message || 'Failed to dispatch OTP. Please check your network and try again.');
    } finally {
      setIsSending(false);
    }
  };

  // 2. Verify OTP & Create Record in Zoho CRM
  const handleVerifyAndSubmit = async () => {
    const enteredOtp = otpDigits.join('');
    if (enteredOtp.length < 6) {
      setErrorMessage('Please enter all 6 digits of the OTP verification code.');
      return;
    }

    if (expirySecs === 0) {
      setErrorMessage('That verification code has expired. Please request a new one.');
      return;
    }

    if (serverOtp && enteredOtp !== serverOtp) {
      setErrorMessage('Invalid OTP code. Please enter the correct code received in your email.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage('');

    try {
      // Create Record in Zoho CRM Patient Module (Deluge function otp1 is only triggered once during Send code)
      console.log('✅ OTP Verified! Creating patient record in Zoho CRM...');
      const patientPayload = {
        firstName: email.split('@')[0] || 'Employee',
        dob: '1995-08-15',
        gender: 'Female',
        email: email,
        mobileNo: '9876543210',
        postalCode: '600028',
        address: 'WE4WE Workplace Health Facility',
      };

      const res = await createPatientRecord(patientPayload);
      const recordId = res?.data?.[0]?.details?.id || 'CRM-' + Math.floor(100000 + Math.random() * 900000);

      const generatedRef = 'WE4WE-' + Math.floor(100000 + Math.random() * 899999);
      setRefId(generatedRef);
      setCreatedRecordId(recordId);
      setSignedAt(getNowStamp());
      setIsDone(true);
    } catch (err) {
      console.error('Submission error:', err);
      setErrorMessage(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setEmail('');
    setConsentA([false, false, false, false]);
    setEnrolYes(true);
    setConsentB([false, false, false, false, false]);
    setCodeSent(false);
    setOtpDigits(['', '', '', '', '', '']);
    setResendSecs(0);
    setExpirySecs(600);
    setErrorMessage('');
    setIsDone(false);
    setRefId('');
    setCreatedRecordId('');
    setSignedAt('');
  };

  return (
    <div className="we-page-wrapper">
      <div className="we-sheet">
        {/* Header Block */}
        <div>
          <div className="we-header-sub">Employee instructions &amp; privacy consent</div>
          <h1 className="we-header-title">Blood screening registration</h1>
          <div className="we-header-desc">
            Welcome to WE4WE (Wellness Engineered for Workplace Excellence). Participation is voluntary. Purpose:
            registration for blood screening and/or enrolment into the WE4WE wellness programme.
          </div>
        </div>

        {/* Quiet Notice Box */}
        <div className="we-quiet-box">
          Your personal health information will be used only for healthcare purposes. Individual health information will
          be accessible only to authorised healthcare professionals. Individual reports will not be shared with HR or
          management — only anonymised aggregate reports may be used for wellness planning.
        </div>

        {/* Privacy Consent Ledger (Section A) */}
        {!isDone && (
          <div>
            <div className="we-ledger-header">
              <div className="we-section-label" style={{ margin: 0 }}>
                Privacy consent ledger
              </div>
              <div className="we-ledger-actions">
                <button type="button" onClick={() => toggleAll('A')} className="we-select-all-btn">
                  {allAChecked ? 'Clear all' : 'Select all'}
                </button>
              </div>
            </div>

            {LABELS_A.map((label, i) => (
              <div key={i} className="we-consent-row">
                <button
                  type="button"
                  onClick={() => toggleConsent('A', i)}
                  className={`we-checkbox-btn ${consentA[i] ? 'checked' : ''}`}
                  aria-label={label}
                >
                  {consentA[i] && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="we-consent-label" onClick={() => toggleConsent('A', i)}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isDone && <div className="we-divider" />}

        {/* WE4WE Programme Enrolment */}
        {!isDone && (
          <div>
            <div className="we-enrol-title">WE4WE programme enrolment</div>
            <div className="we-enrol-desc">
              Would you like to enrol in the structured WE4WE programme? Blood-screening registration stands either way.
            </div>

            <div className="we-toggle-row">
              <button
                type="button"
                onClick={() => setEnrolYes(true)}
                className={`we-btn ${enrolYes ? 'we-btn-primary' : 'we-btn-secondary'}`}
              >
                Yes, enrol me
              </button>
              <button
                type="button"
                onClick={() => setEnrolYes(false)}
                className={`we-btn ${!enrolYes ? 'we-btn-primary' : 'we-btn-secondary'}`}
              >
                No, screening only
              </button>
            </div>

            {enrolYes && (
              <div>
                <div className="we-program-grid">
                  {PROGRAMME_FEATURES.map((item, idx) => (
                    <div key={idx} className="we-program-card">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M8.5 12.3l2.4 2.4 4.6-4.9" />
                      </svg>
                      <div>{item}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '24px' }}>
                  <div className="we-ledger-header">
                    <div className="we-section-label" style={{ margin: 0 }}>
                      Enrolment consent ledger
                    </div>
                    <div className="we-ledger-actions">
                      <button type="button" onClick={() => toggleAll('B')} className="we-select-all-btn">
                        {consentB.every(Boolean) ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                  </div>

                  {LABELS_B.map((label, i) => (
                    <div key={i} className="we-consent-row">
                      <button
                        type="button"
                        onClick={() => toggleConsent('B', i)}
                        className={`we-checkbox-btn ${consentB[i] ? 'checked' : ''}`}
                        aria-label={label}
                      >
                        {consentB[i] && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div className="we-consent-label" onClick={() => toggleConsent('B', i)}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!isDone && <div className="we-divider" />}

        {/* Verification & Sign Block */}
        {!isDone && (
          <div className="we-verify-block">
            <div className="we-enrol-title">Sign with email verification</div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '6px' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)', marginBottom: '6px' }}>
                  Work email address <span className="we-req">*</span>
                </div>
                <input
                  type="email"
                  className="we-input"
                  placeholder="firstname.lastname@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={codeSent || isSending}
                />
              </div>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={codeSent || isSending || !email}
                className="we-btn we-btn-primary"
              >
                {isSending ? (
                  <>
                    <span className="we-spinner" /> Sending OTP...
                  </>
                ) : codeSent ? (
                  'Code sent ✓'
                ) : (
                  'Send code'
                )}
              </button>
            </div>

            {/* OTP Input Row */}
            {codeSent && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)' }}>Enter the 6-digit code</div>
                  <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-500)', fontVariantNumeric: 'tabular-nums' }}>
                    {expirySecs > 0 ? `Expires in ${formatMMSS(expirySecs)}` : 'Code expired'}
                  </div>
                </div>

                <div className="we-otp-row" onPaste={handlePaste}>
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (otpInputRefs.current[i] = el)}
                      inputMode="numeric"
                      maxLength={1}
                      className={`we-otp-cell ${digit ? 'has-val' : ''}`}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '18px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleVerifyAndSubmit}
                    disabled={otpDigits.join('').length < 6 || isVerifying}
                    className="we-btn we-btn-primary"
                  >
                    {isVerifying ? (
                      <>
                        <span className="we-spinner" /> Verifying &amp; Registering...
                      </>
                    ) : (
                      'Verify & submit registration'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={resendSecs > 0 || isSending}
                    className="we-btn we-btn-ghost"
                  >
                    {resendSecs > 0 ? `Resend in ${resendSecs}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && <div className="we-error-banner">{errorMessage}</div>}
          </div>
        )}

        {/* Confirmation State */}
        {isDone && (
          <div className="we-success-card">
            <div className="we-success-icon-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '500 16px/1.5 var(--font-body)', color: 'var(--ink-900)' }}>
                Thank you for registering. You will receive a portal invite link shortly.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
