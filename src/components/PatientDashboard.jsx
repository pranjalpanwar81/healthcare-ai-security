import React, { useEffect, useState } from 'react';
import { Shield, FileText, Calendar, Heart, Activity, MapPin, CheckCircle, User, AlertCircle, Download, MapPinned } from 'lucide-react';
import { api } from '../api';
import { downloadRecordsPdf } from '../recordPdf';
import AIDashboard from './AIDashboard';

const formatLabel = (value) => value.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase());
const formatDate = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString() : 'Not provided';

function PatientDashboard({ user, token }) {
  const [patientData, setPatientData] = useState(null);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    setLoading(true);
    setError('');
    setPatientData(null);
    setMedicalRecords([]);

    const refreshRecords = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const data = await api.getMyRecords(token);
        if (!active) return;
        const signedInPatientId = user.id || user.uid;
        if (!signedInPatientId || String(data.patientId) !== String(signedInPatientId)) {
          throw new Error('Your account could not be matched to these records. Please sign out and sign in again with your patient account.');
        }
        setPatientData({ ...(data.patient || {}), name: data.patient?.name || data.patientName || user.displayName || 'Patient', email: data.patient?.email || user.email });
        setMedicalRecords(data.records || []);
        setError('');
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        requestInFlight = false;
        if (active) setLoading(false);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshRecords();
    };

    refreshRecords();
    const pollId = window.setInterval(refreshRecords, 5000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(pollId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [token, user.id, user.uid, user.email, user.displayName]);

  if (loading) return <div className="dashboard-loading"><div className="loading-spinner" /><p>Loading your health records...</p></div>;

  const profileFields = [
    ['Blood Type', patientData?.bloodType],
    ['Allergies', patientData?.allergies],
    ['Phone', patientData?.phone],
    ['Date of Birth', patientData?.dateOfBirth ? formatDate(patientData.dateOfBirth) : ''],
    ['Address', patientData?.address],
    ['Emergency Contact', patientData?.emergencyContact],
    ['Insurance Provider', patientData?.insuranceProvider],
    ['Insurance Number', patientData?.insuranceNumber],
    ['Email', patientData?.email]
  ].filter(([, value]) => value);

  return <div className="patient-dashboard">
    <div className="dashboard-header">
      <div><h1>Patient Dashboard</h1><p>Welcome, {patientData?.name || user.displayName || user.email}</p></div>
      <div className="location-status"><MapPin className="status-icon" /><span>Secure account access</span></div>
    </div>
    {error && <div className="records-error" role="alert">{error}</div>}

    <section className="patient-info-card">
      <div className="info-header"><Shield className="info-icon" /><h2>Your Health Information</h2></div>
      {profileFields.length ? <div className="info-grid">{profileFields.map(([label, value]) => <div className="info-item" key={label}><label>{label}</label><p>{value}</p></div>)}</div> : <p className="empty-records">Your profile details have not been added yet.</p>}
    </section>

    <section className="medical-records-section">
      <div className="section-header"><h2>Your Medical Records</h2><FileText className="section-icon" /><button className="btn btn-sm btn-outline" disabled={!medicalRecords.length} onClick={() => downloadRecordsPdf({ patientName: patientData?.name || user.displayName || 'Patient', patientEmail: patientData?.email || user.email, patient: patientData, records: medicalRecords })}><Download className="btn-icon" />Download PDF</button></div>
      <p className="patient-record-scope">Showing records for <strong>{patientData?.email || user.email}</strong> only.</p>
      {medicalRecords.length ? <div className="records-list">{medicalRecords.map((record, index) => {
        const additionalFields = Object.entries(record).filter(([key, value]) => !['id', 'date', 'type', 'doctor', 'hospital', 'diagnosis', 'prescription', 'notes', 'vitals', 'labResults', 'demo', 'addedBy', 'addedAt'].includes(key) && value !== null && value !== undefined && value !== '');
        return <article key={record.id || index} className="record-card">
          <div className="record-header"><div className="record-type"><Calendar className="type-icon" /><span>{record.type || 'Medical visit'}</span></div><span className="record-date">{formatDate(record.date)}</span></div>
          <div className="record-details">
            {record.doctor && <div className="detail-row"><User className="detail-icon" /><span><strong>Doctor:</strong> {record.doctor}</span></div>}
            {record.hospital && <div className="detail-row"><MapPinned className="detail-icon" /><span><strong>Clinic:</strong> {record.hospital}</span></div>}
            {record.diagnosis && <div className="detail-row"><Heart className="detail-icon" /><span><strong>Diagnosis:</strong> {record.diagnosis}</span></div>}
            {record.prescription && <div className="detail-row"><FileText className="detail-icon" /><span><strong>Prescription:</strong> {record.prescription}</span></div>}
            {record.notes && <div className="detail-row"><Activity className="detail-icon" /><span><strong>Notes:</strong> {record.notes}</span></div>}
            {record.vitals && <div className="record-data-group"><h4>Vitals</h4><div className="record-data-grid">{Object.entries(record.vitals).map(([key, value]) => <div key={key}><label>{formatLabel(key)}</label><span>{value}</span></div>)}</div></div>}
            {record.labResults && <div className="record-data-group"><h4>Lab Results</h4><div className="record-data-grid">{Object.entries(record.labResults).map(([key, value]) => <div key={key}><label>{formatLabel(key)}</label><span>{value}</span></div>)}</div></div>}
            {additionalFields.map(([key, value]) => <div className="detail-row" key={key}><FileText className="detail-icon" /><span><strong>{formatLabel(key)}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}</span></div>)}
          </div>
          {record.demo && <span className="demo-record-label">Fictional demo record</span>}
        </article>;
      })}</div> : <div className="empty-records"><FileText /><h3>No medical records yet</h3><p>Records added by your doctor will appear here.</p></div>}
    </section>

    <AIDashboard token={token} patientId={user.id || user.uid} userRole="patient" />

    <div className="security-notice"><CheckCircle className="notice-icon" /><div><h3>Your records are private</h3><p>This page displays records linked to your signed-in patient account. Ask your doctor to update your profile if information is missing.</p></div></div>
    <div className="quick-actions"><h3>Quick Actions</h3><div className="action-buttons"><button className="btn btn-primary" onClick={() => window.print()}><Calendar className="btn-icon" />Print Records</button><button className="btn btn-secondary" onClick={() => window.location.reload()}><Shield className="btn-icon" />Refresh Records</button><span className="btn btn-secondary" aria-label="For emergencies, contact your local emergency service"><AlertCircle className="btn-icon" />Emergency Help</span></div></div>
  </div>;
}

export default PatientDashboard;
