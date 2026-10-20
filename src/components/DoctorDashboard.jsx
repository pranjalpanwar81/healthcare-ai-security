import React, { useEffect, useState } from 'react';
import { Activity, Users, Shield, AlertTriangle, TrendingUp, Clock, CheckCircle, FileText, Plus, X, Download, Trash2 } from 'lucide-react';
import { api } from '../api';
import { downloadRecordsPdf } from '../recordPdf';
import AIDashboard from './AIDashboard';

function DoctorDashboard({ user, token }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingPatientId, setDeletingPatientId] = useState(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: 'Consultation', diagnosis: '', prescription: '', notes: '' });

  useEffect(() => {
    let active = true;
    api.getDoctorOverview(token).then(data => {
      if (active) {
        setPatients(data.patients || []);
        setOverview(data);
      }
    }).catch(err => active && setError(err.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const viewRecords = async (patient) => {
    setSelectedPatient(patient);
    setRecords([]);
    setError('');
    try {
      const data = await api.getPatientRecords(token, patient.id);
      setRecords(data.records || []);
    } catch (err) { setError(err.message); }
  };

  const addRecord = async (event) => {
    event.preventDefault();
    if (!selectedPatient) return;
    setSaving(true);
    setError('');
    try {
      await api.addPatientRecord(token, selectedPatient.id, { ...form, doctor: `Dr. ${user.displayName || user.email}`, hospital: 'HealthGuard Clinic' });
      await viewRecords(selectedPatient);
      setShowForm(false);
      setForm({ date: new Date().toISOString().slice(0, 10), type: 'Consultation', diagnosis: '', prescription: '', notes: '' });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const deletePatient = async (patient) => {
    const recordCount = patient.records?.length || 0;
    const confirmed = window.confirm(
      `Permanently delete ${patient.name || patient.email} and all ${recordCount} associated medical record${recordCount === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingPatientId(patient.id);
    setError('');
    try {
      await api.deletePatient(token, patient.id);
      setPatients(current => current.filter(item => item.id !== patient.id));
      setOverview(current => current ? {
        ...current,
        totalRecords: Math.max(0, (current.totalRecords || 0) - recordCount)
      } : current);
      if (selectedPatient?.id === patient.id) {
        setSelectedPatient(null);
        setRecords([]);
        setShowForm(false);
      }
    } catch (err) {
      setError(err.message || 'Unable to delete this patient.');
    } finally {
      setDeletingPatientId(null);
    }
  };

  if (loading) return <div className="dashboard-loading"><div className="loading-spinner" /><p>Loading patients...</p></div>;

  return <div className="doctor-dashboard">
    <div className="dashboard-header"><div><h1>Doctor Dashboard</h1><p>Welcome, Dr. {user.displayName || user.email}</p></div><div className="network-status"><Shield className="status-icon" /><span>Secure demo access</span></div></div>
    {error && <div className="records-error" role="alert">{error}</div>}
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-icon users"><Users /></div><div className="stat-content"><h3>{patients.length}</h3><p>Patients</p></div></div>
      <div className="stat-card"><div className="stat-icon activity"><Activity /></div><div className="stat-content"><h3>{overview?.totalRecords ?? patients.reduce((n, p) => n + (p.records?.length || 0), 0)}</h3><p>Medical Records</p></div></div>
      <div className="stat-card"><div className="stat-icon alert"><CheckCircle /></div><div className="stat-content"><h3>{overview?.demo ? 'Demo' : 'Ready'}</h3><p>Records service</p></div></div>
      <div className="stat-card"><div className="stat-icon clock"><Clock /></div><div className="stat-content"><h3>Live</h3><p>Local demo data</p></div></div>
    </div>
    <div className="dashboard-content">
      <section className="dashboard-section"><div className="section-header"><h2>Patients</h2><TrendingUp className="section-icon" /></div>
        {patients.length ? <div className="patient-list">{patients.map(patient => <div key={patient.id} className="patient-item"><div className="patient-info"><div className="patient-avatar"><Users className="avatar-icon" /></div><div><h4>{patient.name || 'Patient'}</h4><p>{patient.email}</p><p>{patient.records?.length || 0} medical record{patient.records?.length === 1 ? '' : 's'}</p></div></div><div className="patient-meta"><button className="btn btn-sm btn-primary" onClick={() => viewRecords(patient)}>View Records</button><button className="btn btn-sm btn-danger-outline" onClick={() => deletePatient(patient)} disabled={deletingPatientId === patient.id}>{deletingPatientId === patient.id ? 'Deleting…' : <><Trash2 size={16} /> Delete</>}</button></div></div>)}</div> : <p className="empty-records">No patient accounts found yet. Register a patient account to get started.</p>}
      </section>
      <section className="dashboard-section"><div className="section-header"><h2>{selectedPatient ? `${selectedPatient.name || 'Patient'}’s Records` : 'Medical Records'}</h2><FileText className="section-icon" />{selectedPatient && <button className="btn btn-sm btn-outline" onClick={() => { setSelectedPatient(null); setRecords([]); }}>Close</button>}</div>
        {selectedPatient ? <><div className="record-toolbar"><span>{records.length} record{records.length === 1 ? '' : 's'}</span><div className="record-toolbar-actions"><button className="btn btn-sm btn-outline" disabled={!records.length} onClick={() => downloadRecordsPdf({ patientName: selectedPatient.name, patientEmail: selectedPatient.email, records, demo: overview?.demo })}><Download size={16} /> Download PDF</button><button className="btn btn-sm btn-primary" onClick={() => setShowForm(v => !v)}><Plus size={16} /> Add Record</button></div></div>
          {showForm && <form className="record-form" onSubmit={addRecord}><div className="record-form-grid"><label>Date<input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label><label>Type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>Consultation</option><option>Check-up</option><option>Lab Test</option><option>Follow-up</option><option>Emergency</option></select></label><label>Diagnosis<input required value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} /></label><label>Prescription<input value={form.prescription} onChange={e => setForm({ ...form, prescription: e.target.value })} /></label><label className="record-notes">Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows="3" /></label></div><div className="record-form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Record'}</button><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button></div></form>}
          {records.length ? records.map(record => <article key={record.id} className="record-card"><div className="record-header"><strong>{record.type || 'Medical record'}</strong><span className="record-date">{record.date ? new Date(`${record.date}T00:00:00`).toLocaleDateString() : 'Date not provided'}</span></div><p><strong>Diagnosis:</strong> {record.diagnosis || '—'}</p>{record.prescription && <p><strong>Prescription:</strong> {record.prescription}</p>}{record.notes && <p><strong>Notes:</strong> {record.notes}</p>}<small>{record.doctor || 'HealthGuard Clinic'}</small></article>) : <p className="empty-records">No records yet. Use “Add Record” to create the first one.</p>}
        </> : <p className="empty-records">Select a patient to view their records and add a visit.</p>}
      </section>
    </div>
    {selectedPatient && <AIDashboard token={token} patientId={selectedPatient.id} userRole="doctor" />}
    <div className="security-notice"><AlertTriangle className="notice-icon" /><div><h3>Demo patient data</h3><p>Names and medical entries in this local demo are fictional and intended for testing only.</p></div></div>
  </div>;
}

export default DoctorDashboard;
