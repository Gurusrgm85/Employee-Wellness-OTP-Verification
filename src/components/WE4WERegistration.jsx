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

  // Privacy & Enrolment Consents
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [enrolYes, setEnrolYes] = useState(true);
  const [enrolConsentAgreed, setEnrolConsentAgreed] = useState(true);

  // OTP Verification State
  const [isSending, setIsSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [resendSecs, setResendSecs] = useState(0);
  const [expirySecs, setExpirySecs] = useState(600);
  const [serverOtp, setServerOtp] = useState(null);

  // Section-specific Error States
  const [verifyError, setVerifyError] = useState('');
  const [privacyError, setPrivacyError] = useState('');
  const [enrolError, setEnrolError] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState('');
  const [refId, setRefId] = useState('');
  const [signedAt, setSignedAt] = useState('');

  const otpInputRefs = useRef([]);
  const privacyLedgerRef = useRef(null);
  const consentCheckboxRef = useRef(null);
  const enrolCheckboxRef = useRef(null);
  const verifyBlockRef = useRef(null);

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
    if (codeSent && !isEmailVerified && !isDone) {
      interval = setInterval(() => {
        setResendSecs((prev) => Math.max(0, prev - 1));
        setExpirySecs((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [codeSent, isEmailVerified, isDone]);

  // Focus first OTP cell on send
  useEffect(() => {
    if (codeSent && !isEmailVerified && otpInputRefs.current[0]) {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    }
  }, [codeSent, isEmailVerified]);

  const clearAllErrors = () => {
    setVerifyError('');
    setPrivacyError('');
    setEnrolError('');
    setSubmitError('');
  };

  // Auto-scroll to the privacy consent agreement checkbox
  const handleBlockedFieldClick = () => {
    if (!consentAgreed) {
      if (consentCheckboxRef.current) {
        consentCheckboxRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        consentCheckboxRef.current.classList.remove('we-pulse-highlight');
        void consentCheckboxRef.current.offsetWidth;
        consentCheckboxRef.current.classList.add('we-pulse-highlight');
        setTimeout(() => consentCheckboxRef.current?.classList.remove('we-pulse-highlight'), 1600);
      } else if (privacyLedgerRef.current) {
        privacyLedgerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setPrivacyError('Please accept the privacy consent agreement below to proceed.');
    }
  };

  // Handle OTP digit entry
  const handleDigitChange = (index, value) => {
    const digit = String(value).replace(/\D/g, '').slice(-1);
    const newOtp = [...otpDigits];
    newOtp[index] = digit;
    setOtpDigits(newOtp);
    setVerifyError('');

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
    clearAllErrors();

    if (!name.trim()) {
      setVerifyError('Please enter your Name.');
      return;
    }

    if (!employeeId.trim()) {
      setVerifyError('Please enter your Employee ID.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[a-zA-Z0-9._%+-]+@zohocorp\.com$/i.test(trimmedEmail)) {
      setVerifyError('Please enter a valid work email ending with @zohocorp.com.');
      return;
    }

    setIsSending(true);

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
      setIsEmailVerified(false);
      setResendSecs(30);
      setExpirySecs(600);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err) {
      console.error('OTP Send Error:', err);
      setVerifyError(err.message || 'Failed to dispatch OTP. Please check your network and try again.');
    } finally {
      setIsSending(false);
    }
  };

  // 2. Verify Email OTP locally/against server OTP (Does NOT create record in CRM yet)
  const handleVerifyOtp = () => {
    setVerifyError('');

    const enteredOtp = otpDigits.join('');
    if (enteredOtp.length < 6) {
      setVerifyError('Please enter all 6 digits of the OTP verification code.');
      return;
    }

    if (expirySecs === 0) {
      setVerifyError('That verification code has expired. Please request a new one.');
      return;
    }

    if (serverOtp && enteredOtp !== serverOtp) {
      setVerifyError('Invalid OTP code. Please enter the correct code received in your email.');
      return;
    }

    setIsVerifyingOtp(true);
    setTimeout(() => {
      setIsEmailVerified(true);
      setIsVerifyingOtp(false);
      setVerifyError('');
      console.log('✅ Email verified successfully!');
    }, 400);
  };

  // 3. Final Submit Button at Bottom (Creates record in Zoho CRM backend)
  const handleSubmit = async () => {
    clearAllErrors();

    if (!name.trim()) {
      setVerifyError('Please enter your Name.');
      if (verifyBlockRef.current) verifyBlockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!employeeId.trim()) {
      setVerifyError('Please enter your Employee ID.');
      if (verifyBlockRef.current) verifyBlockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[a-zA-Z0-9._%+-]+@zohocorp\.com$/i.test(trimmedEmail)) {
      setVerifyError('Please enter a valid work email ending with @zohocorp.com.');
      if (verifyBlockRef.current) verifyBlockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!isEmailVerified) {
      if (!codeSent) {
        setVerifyError('Please click "Send code" and verify your email address before submitting.');
      } else {
        setVerifyError('Please enter the 6-digit OTP and click "Verify code" to verify your email.');
      }
      if (verifyBlockRef.current) verifyBlockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!consentAgreed) {
      setPrivacyError('Please accept the privacy consent agreement below to proceed.');
      if (consentCheckboxRef.current) {
        consentCheckboxRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        consentCheckboxRef.current.classList.remove('we-pulse-highlight');
        void consentCheckboxRef.current.offsetWidth;
        consentCheckboxRef.current.classList.add('we-pulse-highlight');
        setTimeout(() => consentCheckboxRef.current?.classList.remove('we-pulse-highlight'), 1600);
      }
      return;
    }

    if (enrolYes && !enrolConsentAgreed) {
      setEnrolError('Please accept the enrolment consent agreement above before submitting.');
      if (enrolCheckboxRef.current) {
        enrolCheckboxRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        enrolCheckboxRef.current.classList.remove('we-pulse-highlight');
        void enrolCheckboxRef.current.offsetWidth;
        enrolCheckboxRef.current.classList.add('we-pulse-highlight');
        setTimeout(() => enrolCheckboxRef.current?.classList.remove('we-pulse-highlight'), 1600);
      }
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('🚀 Submitting registration to Zoho CRM Health_Camp_Registrations module...');
      const registrationPayload = {
        name: name.trim(),
        employeeId: employeeId.trim(),
        email: trimmedEmail,
        enrolYes: enrolYes,
        consentA: [consentAgreed, consentAgreed, consentAgreed, consentAgreed],
        consentB: [enrolConsentAgreed, enrolConsentAgreed, enrolConsentAgreed, enrolConsentAgreed, enrolConsentAgreed],
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
      setSubmitError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setName('');
    setEmployeeId('');
    setEmail('');
    setConsentAgreed(false);
    setEnrolYes(true);
    setEnrolConsentAgreed(true);
    setCodeSent(false);
    setIsEmailVerified(false);
    setOtpDigits(['', '', '', '', '', '']);
    setResendSecs(0);
    setExpirySecs(600);
    clearAllErrors();
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

        {/* Verification & Sign Block (At Top) */}
        {!isDone && (
          <div className="we-verify-block" ref={verifyBlockRef}>
            <div className="we-enrol-title">Sign with email verification</div>

            {/* Name & Employee ID Inputs */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '10px', maxWidth: '640px' }}>
              <div style={{ flex: '1 1 200px', maxWidth: '300px' }}>
                <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)', marginBottom: '6px' }}>
                  Name <span className="we-req">*</span>
                </div>
                <input
                  type="text"
                  className="we-input"
                  placeholder="e.g. Emily Davis"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setVerifyError('');
                  }}
                  disabled={isEmailVerified || isSending}
                />
              </div>

              <div style={{ flex: '1 1 200px', maxWidth: '300px' }}>
                <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)', marginBottom: '6px' }}>
                  Employee ID <span className="we-req">*</span>
                </div>
                <input
                  type="text"
                  className="we-input"
                  placeholder="e.g. 0269"
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    setVerifyError('');
                  }}
                  disabled={isEmailVerified || isSending}
                />
              </div>
            </div>

            {/* Work Email & Send Button */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '12px', maxWidth: '640px' }}>
              <div style={{ flex: '1 1 240px', maxWidth: '360px' }}>
                <div style={{ font: '400 12px/1.4 var(--font-body)', color: 'var(--ink-700)', marginBottom: '6px' }}>
                  Work email address <span className="we-req">*</span>
                </div>
                <input
                  type="email"
                  className="we-input"
                  placeholder="firstname.lastname@zohocorp.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setVerifyError('');
                  }}
                  disabled={isEmailVerified || isSending}
                />
              </div>
              {!isEmailVerified && (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={codeSent || isSending}
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
              )}
              {isEmailVerified && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px', color: 'var(--status-done)', fontWeight: 500, fontSize: '13px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Email verified
                </div>
              )}
            </div>

            {/* OTP Input Row */}
            {codeSent && !isEmailVerified && (
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
                    onClick={handleVerifyOtp}
                    disabled={isVerifyingOtp}
                    className="we-btn we-btn-primary"
                  >
                    {isVerifyingOtp ? (
                      <>
                        <span className="we-spinner" /> Verifying...
                      </>
                    ) : (
                      'Verify code'
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

            {/* Email / Verification Specific Error */}
            {verifyError && <div className="we-error-banner" style={{ marginTop: '12px' }}>{verifyError}</div>}
          </div>
        )}

        {!isDone && <div className="we-divider" />}

        {/* Privacy Consent Ledger (Section A) — Bullet points with single agreement checkbox */}
        {!isDone && (
          <div ref={privacyLedgerRef}>
            <div className="we-ledger-header">
              <div className="we-section-label" style={{ margin: 0 }}>
                Privacy consent ledger
              </div>
            </div>

            {/* Bulleted Points */}
            <div className="we-bullet-list">
              {LABELS_A.map((label, i) => (
                <div key={i} className="we-bullet-item">
                  <span className="we-bullet-dot" />
                  <div>{label}</div>
                </div>
              ))}
            </div>

            {/* Agreement Checkbox */}
            <div className="we-consent-row" style={{ border: 'none', padding: '6px 0 0 0' }}>
              <button
                type="button"
                ref={consentCheckboxRef}
                onClick={() => {
                  setConsentAgreed(!consentAgreed);
                  setPrivacyError('');
                }}
                className={`we-checkbox-btn ${consentAgreed ? 'checked' : ''}`}
                aria-label="I have read and agree to all the privacy and consent terms above."
              >
                {consentAgreed && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div
                className="we-consent-label"
                onClick={() => {
                  setConsentAgreed(!consentAgreed);
                  setPrivacyError('');
                }}
                style={{ fontWeight: 500, color: '#000000' }}
              >
                I have read and agree to all the privacy and consent terms above.
              </div>
            </div>

            {/* Privacy Section Specific Error */}
            {privacyError && <div className="we-error-banner" style={{ marginTop: '12px' }}>{privacyError}</div>}
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
                  setEnrolConsentAgreed(true);
                  setEnrolError('');
                }}
                className={`we-btn ${enrolYes ? 'we-btn-primary' : 'we-btn-secondary'}`}
              >
                Yes, enroll me
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnrolYes(false);
                  setEnrolConsentAgreed(false);
                  setEnrolError('');
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

                  {/* Bulleted Points for Enrolment */}
                  <div className="we-bullet-list">
                    {LABELS_B.map((label, i) => (
                      <div key={i} className="we-bullet-item">
                        <span className="we-bullet-dot" />
                        <div>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Single Agreement Checkbox for Enrolment */}
                  <div className="we-consent-row" style={{ border: 'none', padding: '6px 0 0 0' }}>
                    <button
                      type="button"
                      ref={enrolCheckboxRef}
                      onClick={() => {
                        setEnrolConsentAgreed(!enrolConsentAgreed);
                        setEnrolError('');
                      }}
                      className={`we-checkbox-btn ${enrolConsentAgreed ? 'checked' : ''}`}
                      aria-label="I have read and agree to all the enrolment consent terms above."
                    >
                      {enrolConsentAgreed && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div
                      className="we-consent-label"
                      onClick={() => {
                        setEnrolConsentAgreed(!enrolConsentAgreed);
                        setEnrolError('');
                      }}
                      style={{ fontWeight: 500, color: '#000000' }}
                    >
                      I have read and agree to all the enrolment consent terms above.
                    </div>
                  </div>

                  {/* Enrolment Section Specific Error */}
                  {enrolError && <div className="we-error-banner" style={{ marginTop: '12px' }}>{enrolError}</div>}
                </div>
              </div>
            )}

            {/* General Submission Error */}
            {submitError && <div className="we-error-banner" style={{ marginTop: '16px' }}>{submitError}</div>}

            {/* Bottom Action Bar: Cancel & Submit Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '32px' }}>
              <button
                type="button"
                onClick={handleReset}
                className="we-btn we-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="we-btn we-btn-primary"
              >
                {isSubmitting ? (
                  <>
                    <span className="we-spinner" /> Submitting...
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </div>
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
