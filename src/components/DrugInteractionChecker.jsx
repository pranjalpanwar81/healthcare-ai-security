import React, { useState } from 'react';
import { Pill, AlertTriangle, Shield, Send, Loader2 } from 'lucide-react';
import { api } from '../api';
import FormattedAIText from './FormattedAIText';

function DrugInteractionChecker({ token }) {
  const [medications, setMedications] = useState('');
  const [interactions, setInteractions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const severityColors = {
    MINIMAL: 'bg-green-100 text-green-800',
    MODERATE: 'bg-yellow-100 text-yellow-800',
    SEVERE: 'bg-red-100 text-red-800',
    UNKNOWN: 'bg-gray-100 text-gray-800'
  };

  const checkInteractions = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInteractions(null);

    try {
      const result = await api.checkDrugInteractions(token, {
        medications: medications.split(',').map(m => m.trim()).filter(Boolean)
      });
      setInteractions(result.interactions);
    } catch (err) {
      setError(err.message || 'Failed to check drug interactions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="drug-interaction-checker">
      <div className="section-header">
        <Pill className="section-icon" />
        <div>
          <h2>Drug Interaction Checker</h2>
          <p>Check for potential interactions between medications</p>
        </div>
      </div>

      <form onSubmit={checkInteractions} className="ai-form">
        <div className="form-group">
          <label htmlFor="medications">
            Enter medications <span className="required">*</span>
          </label>
          <textarea
            id="medications"
            value={medications}
            onChange={(e) => setMedications(e.target.value)}
            placeholder="e.g., aspirin, ibuprofen, lisinopril, metformin"
            rows={3}
            required
          />
          <small className="form-hint">Separate multiple medications with commas</small>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <Loader2 className="btn-icon spin" /> : <Send className="btn-icon" />}
          {loading ? 'Checking...' : 'Check Interactions'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle />
          {error}
        </div>
      )}

      {interactions && (
        <div className="interaction-result">
          <div className="result-header">
            <h3>Interaction Results</h3>
            <span className={`severity-badge ${severityColors[interactions.severityLevel]}`}>
              {interactions.severityLevel} SEVERITY
            </span>
          </div>

          <div className="result-section">
            <h4>Interactions Found</h4>
            {interactions.interactions.length > 0 ? (
              <ul>
                {interactions.interactions.map((interaction, idx) => (
                <li key={idx}><FormattedAIText text={interaction} /></li>
                ))}
              </ul>
            ) : (
              <p className="no-interactions">No significant interactions detected</p>
            )}
          </div>

          <div className="result-section">
            <h4>Recommendations</h4>
            <ul>
              {interactions.recommendations.map((rec, idx) => (
              <li key={idx}><FormattedAIText text={rec} /></li>
              ))}
            </ul>
          </div>

          <div className="result-disclaimer">
            <Shield className="shield-icon" />
            <FormattedAIText text={interactions.disclaimer} />
          </div>
        </div>
      )}
    </section>
  );
}

export default DrugInteractionChecker;
