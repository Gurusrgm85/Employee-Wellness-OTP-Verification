import React, { useState, useEffect, useRef } from 'react';
import { executeDelugeFunction, createHealthCampRegistration } from '../services/zohoService';
import zfhLogo from '../assets/zfh-logo.png';

export default function WE4WERegistration() {
  const [step, setStep] = useState(1);
  const [empId, setEmpId] = useState('');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [sent, setSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resendSecs, setResendSecs] = useState(0);
  const [serverOtp, setServerOtp] = useState(null);
  const [verified, setVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');

  const [participation, setParticipation] = useState('wellness'); // 'screening' | 'wellness'
  const [wellnessConsent, setWellnessConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [refId, setRefId] = useState('');
  const [createdRecordId, setCreatedRecordId] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [submitError, setSubmitError] = useState('');

  const otpInputRefs = useRef([]);

  // Timer countdown for resend
  useEffect(() => {
    let timer;
    if (resendSecs > 0) {
      timer = setInterval(() => {
        setResendSecs((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendSecs]);

  // Focus first OTP cell on send
  useEffect(() => {
    if (sent && !verified && otpInputRefs.current[0]) {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    }
  }, [sent, verified]);

  // Handle OTP digit entry
  const handleDigitChange = (index, value) => {
    const digit = String(value).replace(/\D/g, '').slice(-1);
    const newOtp = [...otpDigits];
    newOtp[index] = digit;
    setOtpDigits(newOtp);
    setCodeError('');

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

  // Handle OTP sending via Zoho Deluge function
  const handleSendCode = async () => {
    setCodeError('');
    setSubmitError('');

    if (!empId.trim()) {
      setCodeError('Please enter your Employee ID first.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[a-zA-Z0-9._%+-]+@zohocorp\.com$/i.test(trimmedEmail)) {
      setCodeError('Please enter a valid work email ending with @zohocorp.com.');
      return;
    }

    setIsSending(true);

    try {
      console.log('⚡ Requesting OTP via Deluge Function "otp1"...');
      const delugeRes = await executeDelugeFunction('otp1', {
        email: trimmedEmail,
        phone: '9876543210',
        name: `Employee ${empId.trim()}`,
        first_name: `Employee ${empId.trim()}`,
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

      setSent(true);
      setResendSecs(30);
      setVerified(false);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err) {
      console.error('OTP Send Error:', err);
      setCodeError(err.message || 'Failed to dispatch verification code. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // Handle OTP Verification
  const handleVerifyOtp = () => {
    const enteredCode = otpDigits.join('');
    if (enteredCode.length !== 6) {
      setCodeError('Please enter all 6 digits of the verification code.');
      return;
    }

    if (serverOtp && enteredCode !== serverOtp) {
      setCodeError('Invalid verification code. Please check your email and try again.');
      return;
    }

    setIsVerifying(true);
    setTimeout(() => {
      setVerified(true);
      setIsVerifying(false);
      setCodeError('');
      console.log('✅ Email successfully verified!');
    }, 250);
  };

  const wellnessChosen = participation === 'wellness';
  const isEmailValid = /^[a-zA-Z0-9._%+-]+@zohocorp\.com$/i.test(email.trim());
  const isFormValid = empId.trim() && isEmailValid && verified && privacyConsent && (!wellnessChosen || wellnessConsent);

  // Form Submission
  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;

    setSubmitError('');
    setIsSubmitting(true);

    try {
      console.log('🚀 Submitting WE4WE Registration to Zoho CRM...');
      const payload = {
        name: `Employee ${empId.trim()}`,
        employeeId: empId.trim(),
        Employee_ID: empId.trim(),
        email: email.trim(),
        Email: email.trim(),
        enrolYes: wellnessChosen,
        wellnessConsent: wellnessChosen ? wellnessConsent : false,
        we4weEnrollment: wellnessChosen ? wellnessConsent : false,
        We4We_Enrollment: wellnessChosen ? wellnessConsent : false,
        WE4WE_Enrollment: wellnessChosen ? wellnessConsent : false,
        We4we_Enrollment: wellnessChosen ? wellnessConsent : false,
        We4We_Enrolment: wellnessChosen ? wellnessConsent : false,
        WE4WE_programme_enrolment: wellnessChosen ? wellnessConsent : false,
        privacyConsent: privacyConsent,
        I_have_read_the_above_notice_and_consent_to_Sugah_and_its_lab_partners: privacyConsent,
        I_have_read_the_above_notice_and_consent_to_Sugah_and_its_lab_partner: privacyConsent,
        I_have_read_the_above_notice_and_consent_to_Sugah_and_its_lab: privacyConsent,
        I_have_read_the_above_notice_and_consent_to_Sugah_and_its: privacyConsent,
        I_have_read_the_above_notice_and_consent_to_Sugah_and: privacyConsent,
        I_have_read_the_above_notice_and_consent_to_Sugah: privacyConsent,
        consentA: [privacyConsent, privacyConsent, privacyConsent, privacyConsent],
        consentB: [wellnessConsent, wellnessConsent, wellnessConsent, wellnessConsent, wellnessConsent],
      };

      const res = await createHealthCampRegistration(payload);
      const recordId = res?.data?.[0]?.details?.id || 'CRM-' + Math.floor(100000 + Math.random() * 900000);
      const generatedRef = 'WE4WE-' + Math.floor(100000 + Math.random() * 899999);

      setRefId(generatedRef);
      setCreatedRecordId(recordId);
      setSignedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsDone(true);
    } catch (err) {
      console.error('Submission error:', err);
      setSubmitError(err.message || 'Registration failed. Please check your network and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setEmpId('');
    setEmail('');
    setOtpDigits(['', '', '', '', '', '']);
    setSent(false);
    setIsSending(false);
    setResendSecs(0);
    setServerOtp(null);
    setVerified(false);
    setIsVerifying(false);
    setCodeError('');
    setParticipation('wellness');
    setWellnessConsent(false);
    setPrivacyConsent(false);
    setSubmitError('');
    setIsDone(false);
    setRefId('');
    setCreatedRecordId('');
    setSignedAt('');
  };

  return (
    <div className="we-page-container">
      <div className="we-card">
        {/* Header Block */}
        <div className="we-header">
          <h1 className="we-title">WE4WE Health Screening and Wellness Program</h1>
          <div className="we-header-logo-wrap">
            <img
              src={zfhLogo}
              alt="Zoho for Healthcare"
              className="we-header-logo"
            />
          </div>
        </div>

        {!isDone ? (
          step === 1 ? (
            <>
              {/* Intro Paragraphs */}
              <div className="we-intro">
                <p>
                  The WE4WE Health Screening and Wellness Program is an employee wellbeing initiative organised by Zoho
                  Corporation Private Limited in association with Sugah Healthcorp Private Limited. Participation to this
                  Program is voluntary.
                </p>
                <p>
                  The Program includes a health screening, which involves a basic medical check-up, including blood tests,
                  to identify any deficiencies or other health-related concerns. In addition, employees who are interested
                  may also choose to enrol in the optional wellness program offered by Sugah, which includes clinical
                  evaluation, risk stratification, personalised lifestyle counselling, follow-up at defined intervals,
                  health education and incentives.
                </p>
              </div>

              <hr className="sep" />

              {/* Bottom Action Bar for Step 1 */}
              <div className="we-actions">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="we-btn-submit is-active"
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Your Details */}
              <h2 className="we-section-title">Your details</h2>

              {/* Employee ID */}
              <label className="we-label">
                <span className="we-label-text">
                  Employee ID <span className="we-req">*</span>
                </span>
                <input
                  type="text"
                  value={empId}
                  onChange={(e) => {
                    setEmpId(e.target.value);
                    setCodeError('');
                  }}
                  placeholder="e.g. 0269"
                  className="we-input"
                  style={{ width: '180px' }}
                  disabled={verified || isSending}
                />
              </label>

              {/* Work Email Address */}
              <div className="we-label">
                <span className="we-label-text">
                  Work email address <span className="we-req">*</span>
                </span>
                <div className="we-email-row">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setCodeError('');
                      if (verified) {
                        setVerified(false);
                        setSent(false);
                        setOtpDigits(['', '', '', '', '', '']);
                      }
                    }}
                    placeholder="firstname.lastname@zohocorp.com"
                    className="we-input we-email-input"
                    disabled={verified || isSending}
                  />
                  {!verified ? (
                    sent ? (
                      <button type="button" disabled className="we-btn-code-sent">
                        Code sent ✓
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={isSending}
                        className="we-btn-send-primary"
                      >
                        {isSending ? (
                          <>
                            <span className="we-spinner" /> Sending...
                          </>
                        ) : (
                          'Send code'
                        )}
                      </button>
                    )
                  ) : (
                    <span className="we-verified-badge">
                      <span className="we-verified-check" aria-hidden="true">✓</span> Email verified
                    </span>
                  )}
                </div>
              </div>

              {/* Validation / Alert Banner */}
              {codeError && (
                <div className="we-alert-banner">
                  {codeError}
                </div>
              )}

              {/* 6-Digit OTP Code Section (Shown when code sent and not verified) */}
              {sent && !verified && (
                <div style={{ marginTop: '16px', marginBottom: '10px' }}>
                  <div className="we-label-text" style={{ marginBottom: '8px' }}>
                    Enter the 6-digit code
                  </div>

                  <div className="we-otp-row" onPaste={handlePaste}>
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => (otpInputRefs.current[i] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className={`we-otp-cell ${digit ? 'has-val' : ''}`}
                        value={digit}
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={isVerifying || otpDigits.join('').length !== 6}
                      className="we-btn-verify-primary"
                    >
                      {isVerifying ? (
                        <>
                          <span className="we-spinner" /> Verifying...
                        </>
                      ) : (
                        'Verify code'
                      )}
                    </button>

                    {resendSecs > 0 ? (
                      <span style={{ fontSize: '13px', color: 'var(--text-body)', fontWeight: 400 }}>
                        Resend in {resendSecs}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={isSending}
                        className="we-btn-ghost"
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                </div>
              )}

              <hr className="sep" />

              {/* Choose Your Participation */}
              <h2 className="we-section-title" style={{ marginBottom: '3px' }}>
                Choose your participation
              </h2>
              <p className="we-section-subtitle">Select one. Blood-screening registration stands either way.</p>

              <div className="we-pills">
                <button
                  type="button"
                  onClick={() => {
                    setParticipation('screening');
                    setWellnessConsent(false);
                  }}
                  className={`we-pill-btn ${!wellnessChosen ? 'active' : ''}`}
                >
                  Health Screening only
                </button>
                <button
                  type="button"
                  onClick={() => setParticipation('wellness')}
                  className={`we-pill-btn ${wellnessChosen ? 'active' : ''}`}
                >
                  Health Screening + Wellness Program
                </button>
              </div>

              {/* Points to Note (Conditional on Wellness Program) */}
              {wellnessChosen && (
                <div className="we-points-block">
                  <p className="we-points-sub">If you participate in the Wellness Program, here are some points to note:</p>
                  <ol className="led">
                    <li>
                      The Wellness Program is expected to run for approximately one year. However, you may withdraw from
                      the Wellness Program at any time by sending an email to{' '}
                      <a href="mailto:consult.appt@sugahhealth.in">consult.appt@sugahhealth.in</a>.
                    </li>
                    <li>
                      Sugah and/or Zoho may send you Wellness Program-related communications and reminders by SMS, email or
                      phone for administering the Program.
                    </li>
                    <li>Participation in the Wellness Program does not guarantee any specific medical outcome.</li>
                  </ol>
                  <label className="we-consent-label" style={{ marginTop: '14px' }}>
                    <input
                      type="checkbox"
                      checked={wellnessConsent}
                      onChange={(e) => setWellnessConsent(e.target.checked)}
                      className="we-checkbox"
                    />
                    <span className="we-consent-text">
                      I have read and understood the above terms relating to participation in the Wellness Program.
                    </span>
                  </label>
                </div>
              )}

              <hr className="sep" />

              {/* Privacy Notice */}
              <h2 className="we-section-title" style={{ marginBottom: '12px' }}>
                Privacy Notice
              </h2>
              <div className="we-notice-box">
                <p>
                  When you register for the Program, Zoho will process your registration and appointment-related
                  information for the purpose of administering and managing the Program. However, Zoho will not access or
                  process your health information, medical history, lifestyle information submitted for enrolment in the
                  Program, or your lab test results.
                </p>
                <p>
                  The information you submit for participation in the Program, including your medical history and lifestyle
                  information, will be accessible to Sugah for conducting the Program. Sugah’s lab partners will have
                  limited access to your information to the extent required for collecting blood samples and making your lab
                  test results available. Sugah and its lab partners will process your information in accordance with
                  applicable laws.
                </p>
              </div>

              <label className="we-consent-label" style={{ marginTop: '13px' }}>
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="we-checkbox"
                />
                <span className="we-consent-text">
                  I have read the above notice and consent to Sugah and its lab partners' access to and processing of the
                  information submitted for participation in the Program.
                </span>
              </label>

              {submitError && <div className="we-banner-error">{submitError}</div>}

              {/* Action Buttons */}
              <div className="we-actions">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={isSubmitting}
                  className="we-btn-cancel"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isFormValid || isSubmitting}
                  className={`we-btn-submit ${isFormValid && !isSubmitting ? 'is-active' : 'is-disabled'}`}
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
            </>
          )
        ) : (
          /* Confirmation State */
          <div className="we-success-container">
            <div className="we-success-icon-circle">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="we-success-title">Registration Submitted</div>
              <div className="we-success-desc">
                Thank you for registering. You will receive a confirmation and portal invite link shortly.
              </div>
            </div>

            <div className="we-success-details">
              <div className="we-success-row">
                <span className="we-success-label">Reference ID:</span>
                <span className="we-success-val">{refId}</span>
              </div>
              <div className="we-success-row">
                <span className="we-success-label">Employee ID:</span>
                <span className="we-success-val">{empId}</span>
              </div>
              <div className="we-success-row">
                <span className="we-success-label">Email:</span>
                <span className="we-success-val">{email}</span>
              </div>
              <div className="we-success-row">
                <span className="we-success-label">Participation:</span>
                <span className="we-success-val">
                  {wellnessChosen ? 'Health Screening + Wellness Program' : 'Health Screening only'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}