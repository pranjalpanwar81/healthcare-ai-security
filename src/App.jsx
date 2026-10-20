import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { auth, signOut } from './firebaseConfig';
import { api } from './api';
import Home from './components/Home';
import PatientManagement from './components/PatientManagement';
import Login from './components/Login';
import DoctorDashboard from './components/DoctorDashboard';
import PatientDashboard from './components/PatientDashboard';
import { User, LogOut, Shield, Activity } from 'lucide-react';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        const storedUser = localStorage.getItem('appUser');
        // Only restore a role from the app session created by the login flow.
        // Do not silently turn a new Google auth event into a doctor session.
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            if (parsedUser.role && parsedUser.token && localStorage.getItem('authToken')) {
              setUser({ ...currentUser, ...parsedUser });
              setUserRole(parsedUser.role);
            } else {
              setUser(null);
              setUserRole(null);
            }
          } catch {
            localStorage.removeItem('appUser');
            localStorage.removeItem('userRole');
            localStorage.removeItem('authToken');
            setUser(null);
            setUserRole(null);
          }
        } else {
          setUser(null);
          setUserRole(null);
        }
      } else {
        // Custom backend accounts do not create a Firebase session; restore their app session here.
        const storedUser = localStorage.getItem('appUser');
        const storedRole = localStorage.getItem('userRole');
        if (storedUser && storedRole) {
          try {
            setUser(JSON.parse(storedUser));
            setUserRole(storedRole);
          } catch {
            localStorage.removeItem('appUser');
            localStorage.removeItem('userRole');
            localStorage.removeItem('authToken');
            setUser(null);
            setUserRole(null);
          }
        } else {
          setUser(null);
          setUserRole(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('appUser', JSON.stringify(userData));
    if (userData.role) {
      setUserRole(userData.role);
      localStorage.setItem('userRole', userData.role);
    }
    if (userData.token) {
      localStorage.setItem('authToken', userData.token);
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        await api.logout(token);
      } catch (error) {
        // An expired token can no longer be revoked server-side; still clear the local session.
        console.warn('Server logout skipped:', error.message);
      }
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.warn('Firebase sign-out skipped:', error.message);
    }

    setUser(null);
    setUserRole(null);
    localStorage.removeItem('userRole');
    localStorage.removeItem('authToken');
    localStorage.removeItem('appUser');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading HealthGuard AI...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <div className="nav-container">
            <div className="nav-brand">
              <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              <span>HealthGuard AI</span>
              {userRole && (
                <span className={`role-badge role-${userRole}`}>
                  {userRole === 'doctor' ? 'Doctor' : 'Patient'}
                </span>
              )}
            </div>
            <div className="nav-links">
              <Link to="/" className="nav-link">Home</Link>
              {userRole === 'doctor' && (
                <Link to="/doctor-dashboard" className="nav-link">
                  <Activity className="nav-icon" />
                  Doctor Dashboard
                </Link>
              )}
              {userRole === 'patient' && (
                <Link to="/patient-dashboard" className="nav-link">
                  <Shield className="nav-icon" />
                  My Records
                </Link>
              )}
              {userRole === 'doctor' && (
                <Link to="/patients" className="nav-link">Patient Records</Link>
              )}
            </div>
            <div className="user-menu">
              <div className="user-info">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="user-avatar" />
                ) : (
                  <User className="user-icon" />
                )}
                <span className="user-name">{user.displayName || user.email}</span>
              </div>
              <button className="btn btn-logout" onClick={handleLogout}>
                <LogOut className="btn-icon" />
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home userRole={userRole} />} />
            {userRole === 'doctor' && (
              <>
                <Route path="/doctor-dashboard" element={<DoctorDashboard user={user} token={localStorage.getItem('authToken')} />} />
                <Route path="/patients" element={<PatientManagement user={user} token={localStorage.getItem('authToken')} />} />
              </>
            )}
            {userRole === 'patient' && (
              <>
                <Route path="/patient" element={<PatientDashboard user={user} token={localStorage.getItem('authToken')} />} />
                <Route path="/patient-dashboard" element={<PatientDashboard user={user} token={localStorage.getItem('authToken')} />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        <footer className="footer">
          <p>&copy; 2024 HealthGuard AI - Secure Healthcare with Explainable AI</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
