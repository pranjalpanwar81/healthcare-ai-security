import React, { useState } from 'react';
import { FileText, Download, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import FormattedAIText from './FormattedAIText';

function RecordSummarizer({ token, patientId, userRole }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audience, setAudience] = useState(userRole || 'patient');

  const generateSummary = async () => {
    setLoading(true);
    setError('');
    setSummary(null);

    try {
      const result = await api.summarizeRecords(token, {
        patientId,
        audience
      });
      setSummary(result.summary);
    } catch (err) {
      setError(err.message || 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="record-summarizer">
      <div className="section-header">
        <FileText className="section-icon" />
        <div>
          <h2>Medical Record Summary</h2>
          <p>AI-powered summary of your medical records</p>
        </div>
      </div>

      <div className="summary-controls">
        <div className="form-group">
          <label htmlFor="audience">Summary Type</label>
          <select
            id="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="patient">Patient-friendly (Simple language)</option>
            <option value="doctor">Clinical (Professional summary)</option>
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={generateSummary}
          disabled={loading}
        >
          {loading ? <Loader2 className="btn-icon spin" /> : <FileText className="btn-icon" />}
          {loading ? 'Generating...' : 'Generate Summary'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle />
          {error}
        </div>
      )}

      {summary && (
        <div className="summary-result">
          <div className="result-header">
            <h3>Summary</h3>
            <span className="audience-badge">
              {audience === 'doctor' ? 'Clinical' : 'Patient-friendly'}
            </span>
          </div>
          <div className="summary-content">
            <FormattedAIText text={summary} />
          </div>
        </div>
      )}
    </section>
  );
}

export default RecordSummarizer;
