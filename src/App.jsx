import React, { useState } from 'react';
import StepDemographics from './components/StepDemographics';
import './App.css';

export default function App() {
  const [formData, setFormData] = useState({
    firstName: '',
    dob: '',
    gender: '',
    mobileNo: '',
    postalCode: '',
    email: '',
    address: '',
  });

  const handleFormChange = (updatedFields) => {
    setFormData(updatedFields);
  };

  const handleFormSubmit = (submittedData) => {
    console.log('Submitted Demographics Data:', submittedData);
  };

  return (
    <div className="app-container">
      <header className="page-header">
        <div className="page-badge">
          <span>●</span> Patient Registration Form
        </div>
        <h1 className="page-title">Personal & Contact Details</h1>
        <p className="page-subtitle">
          Please fill in the required fields marked with an asterisk (<span style={{ color: '#ef4444' }}>*</span>)
        </p>
      </header>

      <main className="form-card">
        <StepDemographics
          data={formData}
          onChange={handleFormChange}
          onSubmit={handleFormSubmit}
        />
      </main>
    </div>
  );
}
