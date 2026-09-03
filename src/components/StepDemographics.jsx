import React, { useState, useRef, useEffect } from 'react';
import { createPatientRecord, sendOtp, verifyOtp } from '../services/zohoService';

export default function StepDemographics({ data = {}, onChange, onReset }) {
  const [formData, setFormData] = useState({
    firstName: data.firstName || '',
    dob: data.dob || '',
    gender: data.gender || '',
    mobileNo: data.mobileNo || '',
    postalCode: data.postalCode || '',
    email: data.email || '',
    address: data.address || '',
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const dateInputRef = useRef(null);

  // OTP Verification States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const otpInputRefs = useRef([]);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Resend OTP countdown timer
  useEffect(() => {
    let interval;
    if (showOtpModal && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showOtpModal, resendTimer]);

  // Focus first OTP input when modal opens
  useEffect(() => {
    if (showOtpModal && otpInputRefs.current[0]) {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    }
  }, [showOtpModal]);

  // Today's date as max selectable date
  const todayStr = new Date().toISOString().split('T')[0];

  const handleInputChange = (field, value) => {
    let formattedValue = value;
    if (field === 'mobileNo') {
      formattedValue = value.replace(/\D/g, '').slice(0, 10);
    }

    const updatedData = { ...formData, [field]: formattedValue };
    setFormData(updatedData);
    if (onChange) onChange(updatedData);

    if (errors[field]) {
      validateField(field, formattedValue);
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateField(field, formData[field]);
  };

  const validateField = (field, value) => {
    let errorMsg = '';
    const trimmed = typeof value === 'string' ? value.trim() : '';

    switch (field) {
      case 'firstName':
        if (!trimmed) errorMsg = 'First name is required';
        else if (trimmed.length < 2) errorMsg = 'Must be at least 2 characters';
        break;

      case 'dob':
        if (!trimmed) {
          errorMsg = 'Date of birth is required';
        } else {
          const selectedDate = new Date(trimmed);
          const minDate = new Date('1900-01-01');
          const maxDate = new Date();

          if (isNaN(selectedDate.getTime())) {
            errorMsg = 'Please select a valid date';
          } else if (selectedDate > maxDate) {
            errorMsg = 'Date of birth cannot be in the future';
          } else if (selectedDate < minDate) {
            errorMsg = 'Date of birth must be after 1900';
          }
        }
        break;

      case 'gender':
        if (!trimmed || trimmed === '-None-') {
          errorMsg = 'Please select a gender';
        }
        break;

      case 'email':
        if (!trimmed) {
          errorMsg = 'Email address is required';
        } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(trimmed)) {
          errorMsg = 'Enter a valid email address';
        }
        break;

      case 'mobileNo':
        if (!trimmed) {
          errorMsg = 'Mobile number is required';
        } else {
          const digitsOnly = trimmed.replace(/\D/g, '');
          if (digitsOnly.length !== 10) {
            errorMsg = 'Enter a valid 10-digit mobile number';
          }
        }
        break;

      case 'postalCode':
        if (!trimmed) {
          errorMsg = 'Postal code is required';
        } else if (trimmed.length < 3 || trimmed.length > 10) {
          errorMsg = 'Enter a valid postal/ZIP code';
        }
        break;

      case 'address':
        if (!trimmed) {
          errorMsg = 'Address is required';
        } else if (trimmed.length < 5) {
          errorMsg = 'Please enter a complete address (min 5 characters)';
        }
        break;

      default:
        break;
    }

    setErrors((prev) => ({
      ...prev,
      [field]: errorMsg,
    }));

    return !errorMsg;
  };

  const validateAll = () => {
    const newErrors = {};
    const fields = ['firstName', 'dob', 'gender', 'email', 'mobileNo', 'postalCode', 'address'];

    let isValid = true;
    fields.forEach((field) => {
      const val = formData[field];
      const trimmed = typeof val === 'string' ? val.trim() : '';

      if (field === 'firstName') {
        if (!trimmed) { newErrors.firstName = 'First name is required'; isValid = false; }
        else if (trimmed.length < 2) { newErrors.firstName = 'Must be at least 2 characters'; isValid = false; }
      } else if (field === 'dob') {
        if (!trimmed) {
          newErrors.dob = 'Date of birth is required';
          isValid = false;
        } else {
          const selectedDate = new Date(trimmed);
          const minDate = new Date('1900-01-01');
          const maxDate = new Date();
          if (isNaN(selectedDate.getTime())) {
            newErrors.dob = 'Please select a valid date';
            isValid = false;
          } else if (selectedDate > maxDate) {
            newErrors.dob = 'Date cannot be in the future';
            isValid = false;
          } else if (selectedDate < minDate) {
            newErrors.dob = 'Date must be after 1900';
            isValid = false;
          }
        }
      } else if (field === 'gender') {
        if (!trimmed || trimmed === '-None-') {
          newErrors.gender = 'Please select a gender';
          isValid = false;
        }
      } else if (field === 'email') {
        if (!trimmed) {
          newErrors.email = 'Email address is required';
          isValid = false;
        } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(trimmed)) {
          newErrors.email = 'Enter a valid email address';
          isValid = false;
        }
      } else if (field === 'mobileNo') {
        if (!trimmed) {
          newErrors.mobileNo = 'Mobile number is required';
          isValid = false;
        } else {
          const digitsOnly = trimmed.replace(/\D/g, '');
          if (digitsOnly.length !== 10) {
            newErrors.mobileNo = 'Enter valid 10-digit mobile number';
            isValid = false;
          }
        }
      } else if (field === 'postalCode') {
        if (!trimmed) {
          newErrors.postalCode = 'Postal code is required';
          isValid = false;
        } else if (trimmed.length < 3 || trimmed.length > 10) {
          newErrors.postalCode = 'Enter a valid postal code';
          isValid = false;
        }
      } else if (field === 'address') {
        if (!trimmed) {
          newErrors.address = 'Address is required';
          isValid = false;
        } else if (trimmed.length < 5) {
          newErrors.address = 'Please enter a complete address';
          isValid = false;
        }
      }
    });

    setErrors(newErrors);
    setTouched({
      firstName: true,
      dob: true,
      gender: true,
      email: true,
      mobileNo: true,
      postalCode: true,
      address: true,
    });

    return isValid;
  };

  /**
   * STEP 1: Submit Form -> Only triggers Deluge Function "otp1" to dispatch OTP
   * (Does NOT create the patient record yet!)
   */
  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!validateAll()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await sendOtp(formData.email, formData.firstName, formData.firstName);

      // Open OTP Verification Modal
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError('');
      setResendTimer(30);
      setShowOtpModal(true);

      setToast({
        type: 'success',
        title: 'OTP Dispatched!',
        message: `An OTP verification code was sent to ${formData.email}`,
      });
    } catch (err) {
      setErrors({ email: 'Please try after some time. If you have any queries, contact rajshree.v@zohocorp.com' });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Resend OTP via Deluge function
   */
  const handleResendOtp = async () => {
    if (resendTimer > 0 || isResending) return;

    setIsResending(true);
    setOtpError('');

    try {
      await sendOtp(formData.email, formData.firstName, formData.firstName);

      setResendTimer(30);
      setToast({
        type: 'success',
        title: 'OTP Resent!',
        message: `A fresh OTP has been sent to ${formData.email}`,
      });
    } catch (err) {
      setOtpError('Please try after some time. If you have any queries, contact rajshree.v@zohocorp.com');
    } finally {
      setIsResending(false);
    }
  };

  /**
   * Handle single OTP digit input with auto-tabbing
   */
  const handleOtpDigitChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    setOtpError('');

    // Auto-focus next input
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  /**
   * Handle Backspace and arrow navigation in OTP inputs
   */
  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  /**
   * Handle Paste of complete 6-digit code
   */
  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasteData) {
      const newDigits = ['', '', '', '', '', ''];
      for (let i = 0; i < pasteData.length; i++) {
        newDigits[i] = pasteData[i];
      }
      setOtpDigits(newDigits);
      if (pasteData.length === 6) {
        otpInputRefs.current[5]?.focus();
      } else {
        otpInputRefs.current[pasteData.length]?.focus();
      }
    }
  };

  /**
   * STEP 2: Verify OTP & ONLY THEN Create Patient Record in Zoho CRM
   */
  const handleVerifyOtpAndCreatePatient = async () => {
    const enteredOtp = otpDigits.join('');

    if (enteredOtp.length < 4) {
      setOtpError('Please enter the complete OTP code');
      return;
    }

    setIsVerifying(true);
    setOtpError('');

    try {
      const verifyRes = await verifyOtp(formData.email, enteredOtp);
      if (!verifyRes.success) {
        setOtpError(verifyRes.message || 'Invalid OTP code.');
        setIsVerifying(false);
        return;
      }

      // 1. Create Patient Record in Zoho CRM ONLY NOW
      const res = await createPatientRecord(formData);
      const recordId = res?.data?.[0]?.details?.id || null;

      // 2. Close Modal
      setShowOtpModal(false);

      // 3. Trigger floating success toast
      setToast({
        type: 'success',
        title: 'Patient Record Created!',
        message: 'OTP verified & patient successfully registered in Zoho CRM.',
        recordId: recordId,
      });

      // 4. Clear all form fields to empty
      const emptyState = {
        firstName: '',
        dob: '',
        gender: '',
        mobileNo: '',
        postalCode: '',
        email: '',
        address: '',
      };
      setFormData(emptyState);
      setErrors({});
      setTouched({});
      if (onChange) onChange(emptyState);
    } catch (err) {
      setOtpError(err.message || 'Failed to create Patient record in Zoho CRM');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResetForm = () => {
    const emptyState = {
      firstName: '',
      dob: '',
      gender: '',
      mobileNo: '',
      postalCode: '',
      email: '',
      address: '',
    };
    setFormData(emptyState);
    setErrors({});
    setTouched({});
    if (onReset) onReset();
    if (onChange) onChange(emptyState);
  };

  const handleSampleFill = () => {
    const sample = {
      firstName: 'Emily',
      dob: '1995-08-15',
      gender: 'Female',
      mobileNo: '9876543210',
      postalCode: '600028',
      email: 'emily.turner@example.com',
      address: '42 Marina Bay View, Anna Nagar, Chennai',
    };
    setFormData(sample);
    setErrors({});
    setTouched({});
    if (onChange) onChange(sample);
  };

  const openCalendar = () => {
    if (dateInputRef.current) {
      try {
        if (typeof dateInputRef.current.showPicker === 'function') {
          dateInputRef.current.showPicker();
        } else {
          dateInputRef.current.focus();
        }
      } catch (err) {
        dateInputRef.current.focus();
      }
    }
  };

  return (
    <div className="form-wrapper">
      {/* Floating Toast Notification */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`} role="alert">
          <div className="toast-icon">
            {toast.type === 'success' ? (
              <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="toast-body">
            <strong className="toast-title">{toast.title}</strong>
            <p className="toast-message">
              {toast.message}
              {toast.recordId && (
                <span className="toast-id-tag">
                  ID: <code>{toast.recordId}</code>
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
          <div className="toast-progress-bar"></div>
        </div>
      )}

      {/* Main Demographics Form */}
      <form onSubmit={handleFormSubmit} className="custom-demographics-form" noValidate>
        {/* Row 1: First Name, Date of Birth, Gender */}
        <div className="form-row-3">
          <div className="form-field">
            <label htmlFor="firstName" className="field-label">
              First Name <span className="req-star">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              className={`field-input ${touched.firstName && errors.firstName ? 'has-error' : ''}`}
              placeholder=""
              value={formData.firstName}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              onBlur={() => handleBlur('firstName')}
              autoComplete="given-name"
              disabled={isSubmitting}
            />
            {touched.firstName && errors.firstName && (
              <div className="error-message">{errors.firstName}</div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="dob" className="field-label">
              Date of Birth <span className="req-star">*</span>
            </label>
            <div className="datepicker-container" onClick={openCalendar}>
              <input
                ref={dateInputRef}
                id="dob"
                name="dob"
                type="date"
                className={`field-input date-input ${touched.dob && errors.dob ? 'has-error' : ''}`}
                value={formData.dob}
                onChange={(e) => handleInputChange('dob', e.target.value)}
                onBlur={() => handleBlur('dob')}
                max={todayStr}
                min="1900-01-01"
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="datepicker-calendar-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openCalendar();
                }}
                tabIndex={-1}
                aria-label="Open date picker"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </button>
            </div>
            {touched.dob && errors.dob && (
              <div className="error-message">{errors.dob}</div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="gender" className="field-label">
              Gender <span className="req-star">*</span>
            </label>
            <div className="select-container">
              <select
                id="gender"
                name="gender"
                className={`field-select ${touched.gender && errors.gender ? 'has-error' : ''}`}
                value={formData.gender}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                onBlur={() => handleBlur('gender')}
                disabled={isSubmitting}
              >
                <option value="">-None-</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
              <span className="select-arrow" aria-hidden="true">▼</span>
            </div>
            {touched.gender && errors.gender && (
              <div className="error-message">{errors.gender}</div>
            )}
          </div>
        </div>

        {/* Row 2: Mobile No, Postal Code, Email */}
        <div className="form-row-3">
          <div className="form-field">
            <label htmlFor="mobileNo" className="field-label">
              Mobile No <span className="req-star">*</span>
            </label>
            <input
              id="mobileNo"
              name="mobileNo"
              type="tel"
              className={`field-input ${touched.mobileNo && errors.mobileNo ? 'has-error' : ''}`}
              placeholder="e.g. 9876543210"
              value={formData.mobileNo}
              onChange={(e) => handleInputChange('mobileNo', e.target.value)}
              onBlur={() => handleBlur('mobileNo')}
              autoComplete="tel"
              maxLength={10}
              disabled={isSubmitting}
            />
            {touched.mobileNo && errors.mobileNo && (
              <div className="error-message">{errors.mobileNo}</div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="postalCode" className="field-label">
              Postal Code <span className="req-star">*</span>
            </label>
            <input
              id="postalCode"
              name="postalCode"
              type="text"
              className={`field-input ${touched.postalCode && errors.postalCode ? 'has-error' : ''}`}
              placeholder=""
              value={formData.postalCode}
              onChange={(e) => handleInputChange('postalCode', e.target.value)}
              onBlur={() => handleBlur('postalCode')}
              autoComplete="postal-code"
              disabled={isSubmitting}
            />
            {touched.postalCode && errors.postalCode && (
              <div className="error-message">{errors.postalCode}</div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="email" className="field-label">
              Email <span className="req-star">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className={`field-input ${touched.email && errors.email ? 'has-error' : ''}`}
              placeholder="name@example.com"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              autoComplete="email"
              disabled={isSubmitting}
            />
            {touched.email && errors.email && (
              <div className="error-message">{errors.email}</div>
            )}
          </div>
        </div>

        {/* Row 3: Address */}
        <div className="form-row-1">
          <div className="form-field full-width">
            <div className="label-row">
              <label htmlFor="address" className="field-label">
                Address <span className="req-star">*</span>
              </label>
              <span className="char-count">
                {formData.address ? `${formData.address.length} chars` : ''}
              </span>
            </div>
            <textarea
              id="address"
              name="address"
              rows="3"
              className={`field-textarea ${touched.address && errors.address ? 'has-error' : ''}`}
              placeholder=""
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              onBlur={() => handleBlur('address')}
              autoComplete="street-address"
              disabled={isSubmitting}
            ></textarea>
            {touched.address && errors.address && (
              <div className="error-message">{errors.address}</div>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <div className="left-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleSampleFill}
              disabled={isSubmitting}
            >
              Fill Sample Data
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleResetForm}
              disabled={isSubmitting}
            >
              Reset
            </button>
          </div>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="btn-spinner-content">
                <span className="spinner"></span> Sending OTP to Email...
              </span>
            ) : (
              'Submit & Verify Email'
            )}
          </button>
        </div>
      </form>

      {/* OTP Verification Modal Overlay */}
      {showOtpModal && (
        <div className="otp-modal-overlay">
          <div className="otp-modal-card animate-scale-up" role="dialog" aria-modal="true">
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowOtpModal(false)}
              aria-label="Close modal"
              disabled={isVerifying}
            >
              ✕
            </button>

            <div className="otp-icon-header">
              <div className="otp-icon-bubble">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <circle cx="12" cy="11" r="3"></circle>
                  <path d="M12 14v3"></path>
                </svg>
              </div>
              <h2 className="otp-modal-title">Verify Your Email</h2>
              <p className="otp-modal-desc">
                We've triggered your Zoho Deluge function to send an OTP to:
                <br />
                <strong className="email-highlight">{formData.email}</strong>
              </p>
            </div>

            {/* OTP Input Boxes */}
            <div className="otp-inputs-row" onPaste={handleOtpPaste}>
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (otpInputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className={`otp-digit-input ${otpError ? 'otp-input-error' : ''}`}
                  value={digit}
                  onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  disabled={isVerifying}
                />
              ))}
            </div>

            {otpError && <div className="otp-error-text">{otpError}</div>}

            {/* Actions */}
            <div className="otp-modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-full-width"
                onClick={handleVerifyOtpAndCreatePatient}
                disabled={isVerifying || otpDigits.join('').length === 0}
              >
                {isVerifying ? (
                  <span className="btn-spinner-content">
                    <span className="spinner"></span> Verifying & Creating Patient...
                  </span>
                ) : (
                  'Verify OTP & Create Patient'
                )}
              </button>

              <div className="otp-resend-row">
                {resendTimer > 0 ? (
                  <span className="resend-countdown">
                    Resend code in <strong>{resendTimer}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="resend-btn"
                    onClick={handleResendOtp}
                    disabled={isResending || isVerifying}
                  >
                    {isResending ? 'Resending...' : 'Resend OTP via Deluge'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
