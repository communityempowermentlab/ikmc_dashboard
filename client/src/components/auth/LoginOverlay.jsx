import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginAsync, clearAuthError } from '../../redux/slices/authSlice';
import './LoginOverlay.css';

import { useNavigate } from 'react-router-dom';

const LoginOverlay = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);

  const [email, setEmail] = useState(() => localStorage.getItem('rememberedEmail') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('rememberedEmail'));
  const [fieldErrors, setFieldErrors] = useState({});
  const [isShaking, setIsShaking] = useState(false);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const validate = () => {
    const errors = {};
    if (!email.trim()) errors.email = 'User ID or Email is required.';
    if (!password.trim()) errors.password = 'Password is required.';
    else if (password.length < 4) errors.password = 'Password is too short.';
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      triggerShake();
      return;
    }
    try {
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      await dispatch(loginAsync({ email, password, rememberMe })).unwrap();
      navigate('/district-weekly-dashboard');
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleInputChange = (setter, field) => (e) => {
    setter(e.target.value);
    if (error) dispatch(clearAuthError());
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  return (
    <div className="login-overlay-container">
      <div className={`login-glass-card ${isShaking ? 'shake-animation' : ''}`}>
        <div className="login-header">
          {/* Use the existing logo from public/assets */}
          <img src="/cel_logo.png" alt="CEL Logo" className="login-logo" />
          <h2 className="login-title">iKMC Dashboard</h2>
        </div>

        {error && <div className="login-error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="email">User ID / Email</label>
            <input
              type="text"
              id="email"
              value={email}
              onChange={handleInputChange(setEmail, 'email')}
              placeholder="Enter your email or ID"
              className={fieldErrors.email ? 'invalid-input' : ''}
            />
            {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className={`password-input-wrapper ${fieldErrors.password ? 'invalid-input-wrapper' : ''}`}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={handleInputChange(setPassword, 'password')}
                placeholder="Enter your password"
                className={fieldErrors.password ? 'invalid-input' : ''}
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
            {fieldErrors.password && <span className="field-error-text">{fieldErrors.password}</span>}
          </div>

          <div className="form-actions">
            <label className="remember-me-container">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)} 
              />
              <span className="remember-me-text">Remember Me</span>
            </label>
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginOverlay;
