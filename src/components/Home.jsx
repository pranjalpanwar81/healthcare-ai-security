import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Database, Lock, Brain, AlertTriangle, CheckCircle } from 'lucide-react';

function Home({ userRole }) {
  const recordsPath = userRole === 'doctor' ? '/doctor-dashboard' : userRole === 'patient' ? '/patient-dashboard' : '/patients';
  const recordsLabel = userRole === 'doctor' ? 'Open Doctor Dashboard' : userRole === 'patient' ? 'View My Records' : 'Manage Patient Records';
  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Secure Healthcare Records with 
            <span className="gradient-text"> Explainable AI</span>
          </h1>
          <p className="hero-subtitle">
            Advanced security techniques combined with transparent AI to protect and analyze 
            electronic health records while maintaining complete auditability.
          </p>
          <div className="hero-buttons">
            <Link to={recordsPath} className="btn btn-primary">
              <Database className="btn-icon" />
              {recordsLabel}
            </Link>
            <button className="btn btn-secondary">
              <Shield className="btn-icon" />
              Learn About Security
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-card">
            <Shield className="shield-icon" />
            <div className="security-metrics">
              <div className="metric">
                <span className="metric-value">99.9%</span>
                <span className="metric-label">Security</span>
              </div>
              <div className="metric">
                <span className="metric-value">100%</span>
                <span className="metric-label">Explainable</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <h2 className="section-title">Advanced Security & AI Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Lock />
            </div>
            <h3>Multi-Layer Security</h3>
            <p>Advanced encryption, access controls, and audit trails ensuring complete data protection.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Brain />
            </div>
            <h3>Explainable AI</h3>
            <p>Transparent AI decisions with clear reasoning paths for healthcare professionals.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Database />
            </div>
            <h3>Secure Records</h3>
            <p>Patient records with individual authentication and secure storage.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <AlertTriangle />
            </div>
            <h3>Risk Detection</h3>
            <p>AI-powered anomaly detection with explainable alerts for medical data security.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <h2>Ready to Secure Your Healthcare Data?</h2>
        <p>Join the future of secure healthcare with explainable AI technology</p>
        <Link to={recordsPath} className="btn btn-primary btn-large">
          Get Started Now
        </Link>
      </section>
    </div>
  );
}

export default Home;
