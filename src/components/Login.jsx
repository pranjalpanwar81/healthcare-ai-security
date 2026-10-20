import React, { useEffect, useState } from 'react';
import { auth, googleProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from '../firebaseConfig';
import { LogIn, Mail, Shield, AlertCircle, User, Wifi } from 'lucide-react';
import { api } from '../api';

function Login({ onLogin }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('doctor'); // 'doctor' or 'patient'
  const [showCustomLogin, setShowCustomLogin] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    ssid: ''
  });
  const [networkValid, setNetworkValid] = useState(null);

  const googleErrorMessage = (authError) => {
    const host = window.location.hostname;
    switch (authError?.code) {
      case 'auth/unauthorized-domain':
        return `Google sign-in is not authorized for ${host}. In Firebase Console, go to Authentication → Settings → Authorized domains and add ${host}.`;
      case 'auth/operation-not-allowed':
        return 'Google sign-in is disabled for this Firebase project. Enable the Google provider in Firebase Console → Authentication → Sign-in method.';
      case 'auth/popup-closed-by-user':
        return 'The Google sign-in window was closed before sign-in completed. Please try again.';
      case 'auth/network-request-failed':
        return 'Google sign-in could not reach Firebase. Check the device internet connection and try again.';
      default:
        return `Google sign-in failed${authError?.code ? ` (${authError.code})` : ''}. Check Firebase Authentication settings and try again.`;
    }
  };

  const finishGoogleSignIn = async (user, selectedRole) => {
    if (!user?.email) throw new Error('Google did not provide an email address for this account.');

    if (selectedRole === 'doctor' && !import.meta.env.DEV) {
      const ssid = formData.ssid || 'Hospital-WiFi';
      const validation = await api.validateNetwork(ssid, null);
      if (!validation.networkValid || !validation.ssidValid) {
        throw new Error('Network access denied. Doctors must connect to hospital Wi-Fi.');
      }
    }

    const session = await api.createDemoSession(user.email, user.displayName, selectedRole);
    onLogin({
      uid: user.uid,
      id: session.user.id,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: session.user.role,
      token: session.token
    });
  };

  useEffect(() => {
    let active = true;
    getRedirectResult(auth).then(async (result) => {
      if (!result?.user) return;
      const redirectRole = sessionStorage.getItem('healthguard-google-role') || 'patient';
      sessionStorage.removeItem('healthguard-google-role');
      if (active) setLoading(true);
      try {
        await finishGoogleSignIn(result.user, redirectRole);
      } catch (authError) {
        if (active) setError(authError.message || googleErrorMessage(authError));
      } finally {
        if (active) setLoading(false);
      }
    }).catch((authError) => {
      if (active) setError(googleErrorMessage(authError));
    });
    return () => { active = false; };
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      await finishGoogleSignIn(result.user, role);
    } catch (authError) {
      if (authError?.code === 'auth/popup-blocked') {
        try {
          sessionStorage.setItem('healthguard-google-role', role);
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          setError(googleErrorMessage(redirectError));
        }
      } else {
        setError(authError.message && !authError.code ? authError.message : googleErrorMessage(authError));
      }
      console.error('Google sign-in error:', authError?.code || authError?.name || 'UnknownError');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let ssid = null;
      const userLocation = null;

      // Role-specific validation
      if (role === 'doctor') {
        ssid = formData.ssid || (import.meta.env.DEV ? 'Hospital-WiFi' : null);
        if (!ssid && !import.meta.env.DEV) {
          setError('Wi-Fi SSID is required for doctor access');
          setLoading(false);
          return;
        }
      }

      const response = await api.login(formData.email, formData.password, role, ssid, userLocation);

      if (response.error) {
        setError(response.message || response.error);
        setLoading(false);
        return;
      }

      onLogin({
        uid: response.user.id,
        email: response.user.email,
        displayName: response.user.name,
        role: response.user.role,
        token: response.token
      });
    } catch (err) {
      setError('Login failed. Please check your credentials and network.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let ssid = null;
      const userLocation = null;

      if (role === 'doctor') {
        ssid = formData.ssid || (import.meta.env.DEV ? 'Hospital-WiFi' : null);
        if (!ssid && !import.meta.env.DEV) {
          setError('Wi-Fi SSID is required for doctor registration');
          setLoading(false);
          return;
        }
      }

      const response = await api.register({
        email: formData.email,
        password: formData.password,
        role: role,
        name: formData.name,
        ssid: ssid,
        location: userLocation
      });

      if (response.error) {
        setError(response.message || response.error);
        setLoading(false);
        return;
      }

      // Auto-login after registration
      const loginResponse = await api.login(formData.email, formData.password, role, ssid, userLocation);
      onLogin({
        uid: loginResponse.user.id,
        email: loginResponse.user.email,
        displayName: loginResponse.user.name,
        role: loginResponse.user.role,
        token: loginResponse.token
      });
    } catch (err) {
      setError('Registration failed. Please try again.');
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Shield className="logo-icon" />
          </div>
          <h1>Welcome to HealthGuard AI</h1>
          <p>Secure Healthcare Records with Network-Based Access Control</p>
        </div>

        <div className="login-body">
          {/* Role Selection */}
          <div className="role-selection">
            <button
              className={`role-btn ${role === 'doctor' ? 'active' : ''}`}
              onClick={() => setRole('doctor')}
            >
              <User className="role-icon" />
              <div>
                <span>Doctor</span>
                <small>Requires hospital network</small>
              </div>
            </button>
            <button
              className={`role-btn ${role === 'patient' ? 'active' : ''}`}
              onClick={() => setRole('patient')}
            >
              <User className="role-icon" />
              <div>
                <span>Patient</span>
                <small>Can access records remotely</small>
              </div>
            </button>
          </div>

          {/* Network Requirements Info */}
          <div className="network-requirements">
            {role === 'doctor' ? (
              <div className="requirement">
                <Wifi className="req-icon" />
                <span>Must connect to hospital Wi-Fi (Hospital-WiFi, HealthGuard-Network)</span>
              </div>
            ) : (
              <div className="requirement">
                <Shield className="req-icon" />
                <span>Sign in securely from any location to view your own records</span>
              </div>
            )}
          </div>

          {/* Custom Login Form */}
          {showCustomLogin ? (
            <form onSubmit={showCustomLogin === 'register' ? handleRegister : handleCustomLogin} className="custom-login-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Full name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="email@example.com"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder="Password"
                />
              </div>
              {role === 'doctor' && (
                <div className="form-group">
                  <label>Wi-Fi SSID</label>
                  <input
                    type="text"
                    required
                    value={formData.ssid}
                    onChange={(e) => setFormData({...formData, ssid: e.target.value})}
                    placeholder="Hospital-WiFi"
                  />
                  <small>Enter the Wi-Fi network name you're connected to</small>
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Processing...' : showCustomLogin === 'register' ? 'Register' : 'Login'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCustomLogin(false)}
              >
                Back
              </button>
            </form>
          ) : (
            <>
              <div className="feature-highlights">
                <div className="highlight">
                  <Shield className="highlight-icon" />
                  <span>Network-Based Security</span>
                </div>
                <div className="highlight">
                  <Mail className="highlight-icon" />
                  <span>Private Record Access</span>
                </div>
                <div className="highlight">
                  <AlertCircle className="highlight-icon" />
                  <span>Explainable AI</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-google"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {loading ? 'Signing in...' : 'Sign in with Google'}
              </button>

              <div className="divider">
                <span>or</span>
              </div>

              <div className="custom-auth-buttons">
                <button
                  className="btn btn-outline"
                  onClick={() => setShowCustomLogin('login')}
                >
                  <LogIn className="btn-icon" />
                  Login with Email
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => setShowCustomLogin('register')}
                >
                  <User className="btn-icon" />
                  Register New Account
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="error-message">
              <AlertCircle className="error-icon" />
              {error}
            </div>
          )}

          <div className="login-footer">
            <p>By signing in, you agree to our Terms of Service and Privacy Policy</p>
            <p>Your data is secured with enterprise-grade encryption and network-based access control</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
