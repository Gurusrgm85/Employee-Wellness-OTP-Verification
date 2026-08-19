import React, { useState, useRef, useEffect } from 'react';
import { executeDelugeFunction, createHealthCampRegistration } from '../services/zohoService';
import zfhLogo from '../assets/zfh-logo.png';

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
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');

  // Consent Ledgers: Section A starts unchecked (interactive), Section B starts checked (read-only)
  const [consentA, setConsentA] = useState([false, false, false, false]);
  const [enrolYes, setEnrolYes] = useState(true);
  const [consentB, setConsentB] = useState([true, true, true, true, true]);

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
  const privacyLedgerRef = useRef(null);
  const checkboxRefs = useRef([]);

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

  // Toggle individual Privacy Consent item (Section A)
  const toggleConsentA = (index) => {
    if (isDone) return;
    const newA = [...consentA];
    newA[index] = !newA[index];
    setConsentA(newA);
    setErrorMessage('');
  };

  const allAChecked = consentA.every(Boolean);
  const allBChecked = !enrolYes || consentB.every(Boolean);
  const gateOpen = allAChecked && allBChecked;

  // Auto-scroll to the first unchecked privacy consent checkbox when clicking gated fields
  const handleBlockedFieldClick = () => {
    if (!gateOpen) {
      const firstUncheckedIndex = consentA.findIndex((val) => !val);
      if (firstUncheckedIndex !== -1 && checkboxRefs.current[firstUncheckedIndex]) {
        const el = checkboxRefs.current[firstUncheckedIndex];
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('we-pulse-highlight');
        // Force reflow for animation restart
        void el.offsetWidth;
        el.classList.add('we-pulse-highlight');
        setTimeout(() => el.classList.remove('we-pulse-highlight'), 1600);
      } else if (privacyLedgerRef.current) {
        privacyLedgerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setErrorMessage('Please accept all privacy consent checkboxes above to unlock the fields.');
    }
  };

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

  // 1. Send OTP via Deluge Function (only triggered once)
  const handleSendCode = async () => {
    if (!gateOpen) {
      handleBlockedFieldClick();
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Please enter your Name.');
      return;
    }

    if (!employeeId.trim()) {
      setErrorMessage('Please enter your Employee ID.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[a-zA-Z0-9._%+-]+@zohocorp\.com$/i.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid work email ending with @zohocorp.com.');
      return;
    }

    setIsSending(true);
    setErrorMessage('');

    try {
      console.log('⚡ Requesting OTP via Deluge Function "otp1"...');
      const delugeRes = await executeDelugeFunction('otp1', {
        email: trimmedEmail,
        phone: '9876543210',
        name: name.trim() || 'Employee',
        first_name: name.trim() || 'Employee',
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

  // 2. Verify OTP & Create Record in Zoho CRM Health_Camp_Registrations Module
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
      console.log('✅ OTP Verified! Creating record in Health_Camp_Registrations module...');
      const registrationPayload = {
        name: name.trim(),
        employeeId: employeeId.trim(),
        email: email.trim(),
        enrolYes: enrolYes,
        consentA: consentA,
        consentB: consentB,
      };

      const res = await createHealthCampRegistration(registrationPayload);
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
    setName('');
    setEmployeeId('');
    setEmail('');
    setConsentA([false, false, false, false]);
    setEnrolYes(true);
    setConsentB([true, true, true, true, true]);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <h1 className="we-header-title">Health Camp Registrations and Privacy Consents</h1>
            <div className="we-header-desc">
              Welcome to WE4WE (Wellness Engineered for Workplace Excellence). Participation is voluntary. Purpose:
              registration for blood screening and/or enrolment into the WE4WE wellness programme.
            </div>
          </div>
          <div style={{ flexShrink: 0, paddingTop: '4px' }}>
            <img
              src={zfhLogo}
              alt="Powered by ZFH"
              style={{ height: '42px', width: 'auto', objectFit: 'contain', display: 'block' }}
            />
          </div>
        </div>

        {/* Quiet Notice Box */}
        <div className="we-quiet-box">
          Your personal health information will be used only for healthcare purposes. Individual health information will
          be accessible only to authorised healthcare professionals. Individual reports will not be shared with HR or
          management — only anonymised aggregate reports may be used for wellness planning.
        </div>

        {/* Privacy Consent Ledger (Section A) — Interactive, Unchecked on load */}
        {!isDone && (
          <div ref={privacyLedgerRef}>
            <div className="we-ledger-header">
              <div className="we-section-label" style={{ margin: 0 }}>
                Privacy consent ledger
              </div>
            </div>

            {LABELS_A.map((label, i) => (
              <div key={i} className="we-consent-row">
                <button
                  type="button"
                  ref={(el) => (checkboxRefs.current[i] = el)}
                  onClick={() => toggleConsentA(i)}
                  className={`we-checkbox-btn ${consentA[i] ? 'checked' : ''}`}
                  aria-label={label}
                >
                  {consentA[i] && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="we-consent-label" onClick={() => toggleConsentA(i)}>
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
                onClick={() => {
                  setEnrolYes(true);
                  setConsentB([true, true, true, true, true]);
                  setErrorMessage('');
                }}
                className={`we-btn ${enrolYes ? 'we-btn-primary' : 'we-btn-secondary'}`}
              >
                Yes, enroll me
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnrolYes(false);
                  setConsentB([false, false, false, false, false]);
                  setErrorMessage('');
                }}
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
                  </div>

                  {LABELS_B.map((label, i) => (
                    <div
                      key={i}
                      className="we-consent-row read-only"
                      title="Enrolment participation consent for WE4WE programme"
                    >
                      <div
                        className={`we-checkbox-btn ${consentB[i] ? 'checked' : ''} read-only`}
                        title="Enrolment participation consent for WE4WE programme"
                        aria-label={label}
                      >
                        {consentB[i] && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="we-consent-label">
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

            {/* Name & Employee ID Inputs */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '10px', maxWidth: '640px' }}>
              <div style={{ flex: '1 1 200px', maxWidth: '300px' }} onClick={!gateOpen ? handleBlockedFieldClick : undefined}>
                <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)', marginBottom: '6px' }}>
                  Name <span className="we-req">*</span>
                </div>
                <input
                  type="text"
                  className="we-input"
                  placeholder="e.g. Emily Davis"
                  value={name}
                  onChange={gateOpen ? (e) => setName(e.target.value) : undefined}
                  onClick={!gateOpen ? handleBlockedFieldClick : undefined}
                  onFocus={!gateOpen ? (e) => { e.target.blur(); handleBlockedFieldClick(); } : undefined}
                  readOnly={!gateOpen || codeSent || isSending}
                  style={!gateOpen ? { cursor: 'pointer' } : {}}
                />
              </div>

              <div style={{ flex: '1 1 200px', maxWidth: '300px' }} onClick={!gateOpen ? handleBlockedFieldClick : undefined}>
                <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)', marginBottom: '6px' }}>
                  Employee ID <span className="we-req">*</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  className="we-input"
                  placeholder="e.g. 0269"
                  value={employeeId}
                  onChange={gateOpen ? (e) => setEmployeeId(e.target.value.replace(/\D/g, '')) : undefined}
                  onClick={!gateOpen ? handleBlockedFieldClick : undefined}
                  onFocus={!gateOpen ? (e) => { e.target.blur(); handleBlockedFieldClick(); } : undefined}
                  readOnly={!gateOpen || codeSent || isSending}
                  style={!gateOpen ? { cursor: 'pointer' } : {}}
                />
              </div>
            </div>

            {/* Work Email & Send Button */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: '12px', maxWidth: '640px' }}>
              <div style={{ flex: '1 1 240px', maxWidth: '360px' }} onClick={!gateOpen ? handleBlockedFieldClick : undefined}>
                <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)', marginBottom: '6px' }}>
                  Work email address <span className="we-req">*</span>
                </div>
                <input
                  type="email"
                  className="we-input"
                  placeholder="firstname.lastname@zohocorp.com"
                  value={email}
                  onChange={gateOpen ? (e) => setEmail(e.target.value) : undefined}
                  onClick={!gateOpen ? handleBlockedFieldClick : undefined}
                  onFocus={!gateOpen ? (e) => { e.target.blur(); handleBlockedFieldClick(); } : undefined}
                  readOnly={!gateOpen || codeSent || isSending}
                  style={!gateOpen ? { cursor: 'pointer' } : {}}
                />

                {/* Live Email Preview */}
                {email && !codeSent && (
                  <div
                    onClick={() => {
                      if (gateOpen && !codeSent && !isSending) {
                        const prefix = email.split('@')[0];
                        if (prefix) setEmail(`${prefix}@zohocorp.com`);
                      }
                    }}
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      color: 'var(--brand-600)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      wordBreak: 'break-all',
                    }}
                    title="Click to apply"
                  >
                    <span>
                      {email.includes('@')
                        ? email.toLowerCase().endsWith('@zohocorp.com')
                          ? email
                          : `${email.split('@')[0]}@zohocorp.com`
                        : `${email}@zohocorp.com`}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={codeSent || isSending}
                className="we-btn we-btn-primary"
                style={{ marginTop: '22px' }}
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
                    disabled={isVerifying}
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
