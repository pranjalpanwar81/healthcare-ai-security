import React, { useState } from 'react';
import { Brain, Activity, Pill, MessageSquare, FileText, TrendingUp, ChevronRight, ChevronDown } from 'lucide-react';
import SymptomAnalyzer from './SymptomAnalyzer';
import DrugInteractionChecker from './DrugInteractionChecker';
import MedicalChatbot from './MedicalChatbot';
import RecordSummarizer from './RecordSummarizer';

function AIDashboard({ token, patientId, userRole }) {
  const [activeSection, setActiveSection] = useState('chatbot');
  const [expanded, setExpanded] = useState(true);

  const sections = [
    { id: 'chatbot', name: 'Medical Chatbot', icon: MessageSquare, description: 'Ask health questions' },
    { id: 'symptoms', name: 'Symptom Analyzer', icon: Activity, description: 'Analyze your symptoms' },
    { id: 'interactions', name: 'Drug Interactions', icon: Pill, description: 'Check medication safety' },
    { id: 'summary', name: 'Record Summary', icon: FileText, description: 'Summarize medical records' },
  ];

  // Doctor-only sections
  if (userRole === 'doctor') {
    sections.push(
      { id: 'treatments', name: 'Treatment Suggestions', icon: TrendingUp, description: 'AI treatment options' }
    );
  }

  return (
    <div className="ai-dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          <Brain className="dashboard-icon" />
          <div>
            <h2>AI-Powered Health Tools</h2>
            <p>Local machine learning and AI-assisted health tools</p>
          </div>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="btn-icon" /> : <ChevronRight className="btn-icon" />}
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <>
          <div className="ai-navigation">
            {sections.map(section => (
              <button
                key={section.id}
                className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon className="nav-icon" />
                <div className="nav-content">
                  <span className="nav-title">{section.name}</span>
                  <span className="nav-description">{section.description}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="ai-content">
            {activeSection === 'chatbot' && (
              <MedicalChatbot token={token} patientId={patientId} />
            )}
            {activeSection === 'symptoms' && (
              <SymptomAnalyzer token={token} />
            )}
            {activeSection === 'interactions' && (
              <DrugInteractionChecker token={token} />
            )}
            {activeSection === 'summary' && (
              <RecordSummarizer token={token} patientId={patientId} userRole={userRole} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AIDashboard;
