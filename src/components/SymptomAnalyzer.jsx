import React, { useState } from 'react';
import { Activity, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { api } from '../api';
import FormattedAIText from './FormattedAIText';

function SymptomAnalyzer({ token }) {
  const [symptoms, setSymptoms] = useState('');
  const [patientContext, setPatientContext] = useState({ age: '', gender: '' });
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const urgencyColors = {
    LOW: 'bg-green-100 text-green-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    HIGH: 'bg-orange-100 text-orange-800',
    EMERGENCY: 'bg-red-100 text-red-800'
  };

  const analyzeSymptoms = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setAnalysis(null);

    try {
      const result = await api.analyzeSymptoms(token, {
        symptoms: symptoms.split(',').map(s => s.trim()).filter(Boolean),
        patientContext: Object.fromEntries(
          Object.entries(patientContext).filter(([_, v]) => v.trim())
        )
      });
      let payload = result?.analysis;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          throw new Error('The AI returned an unreadable result. Please try again.');
        }
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('The AI returned an incomplete result. Please try again.');
      }

      const toList = value => {
        if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
        if (typeof value === 'string' && value.trim()) return value.split(/\n+/).map(item => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
        return [];
      };
      const possibleConditions = toList(payload.possibleConditions);
      const recommendedActions = toList(payload.recommendedActions);
      if (!possibleConditions.length && !recommendedActions.length) {
        throw new Error('The AI returned an incomplete result. Please try again.');
      }

      const urgencyLevel = String(payload.urgencyLevel || '').toUpperCase();
      setAnalysis({
        possibleConditions,
        recommendedActions,
        urgencyLevel: Object.prototype.hasOwnProperty.call(urgencyColors, urgencyLevel) ? urgencyLevel : 'MEDIUM',
        disclaimer: typeof payload.disclaimer === 'string' && payload.disclaimer.trim()
          ? payload.disclaimer
          : 'This information is not a diagnosis. Please discuss your symptoms with a healthcare professional.'
      });
    } catch (err) {
      setError(err.message || 'Failed to analyze symptoms');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="symptom-analyzer">
      <div className="section-header">
        <Activity className="section-icon" />
        <div>
          <h2>Symptom Analyzer</h2>
          <p>Local ML prediction for educational use</p>
        </div>
      </div>

      <form onSubmit={analyzeSymptoms} className="ai-form">
        <div className="form-group">
          <label htmlFor="symptoms">
            Describe your symptoms <span className="required">*</span>
          </label>
          <textarea
            id="symptoms"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g., headache, fever, fatigue, sore throat"
            rows={3}
            required
          />
          <small className="form-hint">Separate multiple symptoms with commas. Recognized symptoms: fever, headache, fatigue, body ache, sore throat, chills, dizziness, blurred vision, increased thirst, frequent urination, localized pain, high fever, and severe fatigue.</small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="age">Age (optional)</label>
            <input
              id="age"
              type="number"
              value={patientContext.age}
              onChange={(e) => setPatientContext({ ...patientContext, age: e.target.value })}
              placeholder="e.g., 35"
            />
          </div>

          <div className="form-group">
            <label htmlFor="gender">Gender (optional)</label>
            <select
              id="gender"
              value={patientContext.gender}
              onChange={(e) => setPatientContext({ ...patientContext, gender: e.target.value })}
            >
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <Loader2 className="btn-icon spin" /> : <Send className="btn-icon" />}
          {loading ? 'Analyzing...' : 'Analyze Symptoms'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle />
          {error}
        </div>
      )}

      {analysis && (
        <div className="analysis-result">
          <div className="result-header">
            <h3>Analysis Results</h3>
            <span className={`urgency-badge ${urgencyColors[analysis.urgencyLevel]}`}>
              {analysis.urgencyLevel} URGENCY
            </span>
          </div>

          <div className="result-section">
            <h4>Possible Conditions</h4>
            <ul>
              {analysis.possibleConditions.map((condition, idx) => (
                <li key={idx}><FormattedAIText text={condition} /></li>
              ))}
            </ul>
          </div>

          <div className="result-section">
            <h4>Recommended Actions</h4>
            <ul>
              {analysis.recommendedActions.map((action, idx) => (
                <li key={idx}><FormattedAIText text={action} /></li>
              ))}
            </ul>
          </div>

          <div className="result-disclaimer">
            <AlertTriangle className="warning-icon" />
            <FormattedAIText text={analysis.disclaimer} />
          </div>
        </div>
      )}
    </section>
  );
}

export default SymptomAnalyzer;
