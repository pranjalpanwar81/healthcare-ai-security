import React, { useEffect, useState } from 'react';
import { Plus, Search, User, Mail, Phone, Calendar, MapPin, Shield, X, Download, FileText, Activity, Heart, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import { api } from '../api';

function PatientManagement({ user, token }) {
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [pageError, setPageError] = useState('');
  const [savingRecord, setSavingRecord] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newPatient, setNewPatient] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    bloodType: '',
    allergies: '',
    emergencyContact: '',
    insuranceProvider: '',
    insuranceNumber: '',
    medicalRecords: []
  });

  const [newMedicalRecord, setNewMedicalRecord] = useState({
    date: '',
    type: '',
    doctor: '',
    hospital: '',
    diagnosis: '',
    prescription: '',
    notes: ''
  });

  useEffect(() => {
    let active = true;
    setLoadingPatients(true);
    api.getPatients(token).then(async ({ patients: apiPatients = [] }) => {
      const populated = await Promise.all(apiPatients.map(async patient => {
        try {
          const data = await api.getPatientRecords(token, patient.id);
          return {
            ...patient,
            phone: patient.phone || '—',
            dateOfBirth: patient.dateOfBirth || '',
            address: patient.address || '—',
            bloodType: patient.bloodType || '',
            allergies: patient.allergies || '',
            createdAt: patient.createdAt || new Date().toISOString(),
            medicalRecords: data.records || []
          };
        } catch {
          return { ...patient, phone: patient.phone || '—', dateOfBirth: patient.dateOfBirth || '', address: patient.address || '—', bloodType: patient.bloodType || '', allergies: patient.allergies || '', createdAt: patient.createdAt || new Date().toISOString(), medicalRecords: [] };
        }
      }));
      if (active) setPatients(populated);
    }).catch(error => {
      if (active) setPageError(error.message || 'Unable to load patient records. Check that the backend is running and sign in again.');
    }).finally(() => active && setLoadingPatients(false));
    return () => { active = false; };
  }, [token]);

  const handleAddPatient = async (e) => {
    e.preventDefault();
    setSavingPatient(true);
    setPageError('');
    const hasInitialRecord = Boolean(newMedicalRecord.date || newMedicalRecord.type || newMedicalRecord.diagnosis);
    try {
      const response = await api.addPatient(token, {
        ...newPatient,
        initialRecord: hasInitialRecord ? {
          ...newMedicalRecord,
          doctor: newMedicalRecord.doctor || `Dr. ${user?.displayName || user?.email || 'HealthGuard Doctor'}`,
          hospital: newMedicalRecord.hospital || 'HealthGuard Clinic'
        } : null
      });
      const patient = {
        ...response.patient,
        phone: response.patient.phone || '—',
        dateOfBirth: response.patient.dateOfBirth || '',
        address: response.patient.address || '—',
        medicalRecords: response.records || []
      };
      setPatients(current => {
        const exists = current.some(existing => existing.id === patient.id);
        return exists ? current.map(existing => existing.id === patient.id ? { ...existing, ...patient } : existing) : [...current, patient];
      });
      setNewPatient({ name: '', email: '', phone: '', dateOfBirth: '', address: '', bloodType: '', allergies: '', emergencyContact: '', insuranceProvider: '', insuranceNumber: '', medicalRecords: [] });
      setNewMedicalRecord({ date: '', type: '', doctor: '', hospital: '', diagnosis: '', prescription: '', notes: '' });
      setShowAddForm(false);
    } catch (error) {
      setPageError(error.message || 'Unable to create the patient profile.');
    } finally {
      setSavingPatient(false);
    }
  };

  const handleAddMedicalRecord = async (patientId) => {
    if (!newMedicalRecord.date || !newMedicalRecord.type || !newMedicalRecord.diagnosis.trim()) {
      setPageError('Enter a date, record type, and diagnosis before saving.');
      return;
    }
    setSavingRecord(true);
    setPageError('');
    try {
      await api.addPatientRecord(token, patientId, {
        ...newMedicalRecord,
        doctor: newMedicalRecord.doctor || `Dr. ${user?.displayName || user?.email || 'HealthGuard Doctor'}`,
        hospital: newMedicalRecord.hospital || 'HealthGuard Clinic'
      });
      const { records = [] } = await api.getPatientRecords(token, patientId);
      const updatePatient = patient => patient.id === patientId ? { ...patient, medicalRecords: records } : patient;
      setPatients(current => current.map(updatePatient));
      setSelectedPatient(current => current ? updatePatient(current) : current);
      setNewMedicalRecord({ date: '', type: '', doctor: '', hospital: '', diagnosis: '', prescription: '', notes: '' });
    } catch (error) {
      setPageError(error.message || 'Unable to save this patient record.');
    } finally {
      setSavingRecord(false);
    }
  };

  const generatePatientPDF = (patient) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text('HealthGuard AI', 20, 20);
    doc.setFontSize(12);
    doc.text('Patient Medical Record', 20, 30);
    
    // Patient Information Section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text('Patient Information', 20, 55);
    
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    let yPos = 65;
    
    const patientInfo = [
      `Name: ${patient.name}`,
      `Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}`,
      `Email: ${patient.email}`,
      `Phone: ${patient.phone}`,
      `Address: ${patient.address}`,
      `Blood Type: ${patient.bloodType || 'Not specified'}`,
      `Allergies: ${patient.allergies || 'None known'}`,
      `Emergency Contact: ${patient.emergencyContact || 'Not specified'}`,
      `Insurance: ${patient.insuranceProvider || 'Not specified'} (${patient.insuranceNumber || 'N/A'})`
    ];
    
    patientInfo.forEach(info => {
      doc.text(info, 20, yPos);
      yPos += 8;
    });
    
    // Medical Records Section
    yPos += 10;
    doc.setTextColor(37, 99, 235);
    doc.setFontSize(16);
    doc.text('Medical Records', 20, yPos);
    yPos += 10;
    
    if (patient.medicalRecords && patient.medicalRecords.length > 0) {
      patient.medicalRecords.forEach((record, index) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text(`Record #${index + 1} - ${record.type}`, 20, yPos);
        yPos += 7;
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.text(`Date: ${new Date(record.date).toLocaleDateString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Doctor: ${record.doctor}`, 25, yPos);
        yPos += 6;
        if (record.hospital) {
          doc.text(`Hospital: ${record.hospital}`, 25, yPos);
          yPos += 6;
        }
        doc.text(`Diagnosis: ${record.diagnosis}`, 25, yPos);
        yPos += 6;
        if (record.prescription) {
          doc.text(`Prescription: ${record.prescription}`, 25, yPos);
          yPos += 6;
        }
        doc.text(`Notes: ${record.notes}`, 25, yPos);
        yPos += 6;
        
        if (record.vitals) {
          doc.setFontSize(9);
          doc.setTextColor(37, 99, 235);
          doc.text('Vitals:', 25, yPos);
          yPos += 5;
          doc.setTextColor(60, 60, 60);
          Object.entries(record.vitals).forEach(([key, value]) => {
            doc.text(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`, 30, yPos);
            yPos += 4;
          });
        }
        
        if (record.labResults) {
          doc.setFontSize(9);
          doc.setTextColor(37, 99, 235);
          doc.text('Lab Results:', 25, yPos);
          yPos += 5;
          doc.setTextColor(60, 60, 60);
          Object.entries(record.labResults).forEach(([key, value]) => {
            doc.text(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`, 30, yPos);
            yPos += 4;
          });
        }
        
        yPos += 10;
      });
    } else {
      doc.setTextColor(128, 128, 128);
      doc.setFontSize(10);
      doc.text('No medical records available', 20, yPos);
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Generated by HealthGuard AI | Page ${i} of ${pageCount} | ${new Date().toLocaleString()}`,
        105,
        290,
        { align: 'center' }
      );
    }
    
    // Save the PDF
    doc.save(`${patient.name.replace(/\s+/g, '_')}_Medical_Records.pdf`);
  };

  const handleDeletePatient = (id) => {
    setPatients(patients.filter(p => p.id !== id));
    if (selectedPatient?.id === id) {
      setSelectedPatient(null);
    }
  };

  const filteredPatients = patients.filter(patient =>
    (patient.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (patient.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (patient.phone || '').includes(searchTerm)
  );

  return (
    <div className="patient-management">
      <div className="page-header">
        <div>
          <h1>Patient Records Management</h1>
          <p>View patient profiles and securely manage their medical records</p>
        </div>
        <div className="header-buttons">
          <button 
            className="btn btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="btn-icon" />
            Add New Patient
          </button>
        </div>
      </div>

      {pageError && <div className="records-error" role="alert">{pageError}</div>}
      {loadingPatients && <div className="dashboard-loading"><div className="loading-spinner" /><p>Loading patient records…</p></div>}

      {/* Add Patient Form Modal */}
      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Add New Patient</h2>
              <button 
                className="btn-icon-only"
                onClick={() => setShowAddForm(false)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={handleAddPatient} className="patient-form">
              <div className="form-group">
                <label>
                  <User className="input-icon" />
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({...newPatient, name: e.target.value})}
                  placeholder="Enter patient's full name"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>
                    <Mail className="input-icon" />
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={newPatient.email}
                    onChange={(e) => setNewPatient({...newPatient, email: e.target.value})}
                    placeholder="patient@email.com"
                  />
                </div>

                <div className="form-group">
                  <label>
                    <Phone className="input-icon" />
                    Phone
                  </label>
                  <input
                    type="tel"
                    required
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({...newPatient, phone: e.target.value})}
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>
                    <Calendar className="input-icon" />
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    required
                    value={newPatient.dateOfBirth}
                    onChange={(e) => setNewPatient({...newPatient, dateOfBirth: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>
                    <MapPin className="input-icon" />
                    Address
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatient.address}
                    onChange={(e) => setNewPatient({...newPatient, address: e.target.value})}
                    placeholder="Full address"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>
                    <Activity className="input-icon" />
                    Blood Type
                  </label>
                  <select
                    value={newPatient.bloodType}
                    onChange={(e) => setNewPatient({...newPatient, bloodType: e.target.value})}
                  >
                    <option value="">Select blood type</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>
                    <AlertCircle className="input-icon" />
                    Allergies
                  </label>
                  <input
                    type="text"
                    value={newPatient.allergies}
                    onChange={(e) => setNewPatient({...newPatient, allergies: e.target.value})}
                    placeholder="Known allergies (if any)"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>
                    <Phone className="input-icon" />
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    value={newPatient.emergencyContact}
                    onChange={(e) => setNewPatient({...newPatient, emergencyContact: e.target.value})}
                    placeholder="Name - Phone number"
                  />
                </div>

                <div className="form-group">
                  <label>
                    <Shield className="input-icon" />
                    Insurance Provider
                  </label>
                  <input
                    type="text"
                    value={newPatient.insuranceProvider}
                    onChange={(e) => setNewPatient({...newPatient, insuranceProvider: e.target.value})}
                    placeholder="Insurance company name"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>
                  <FileText className="input-icon" />
                  Insurance Number
                </label>
                <input
                  type="text"
                  value={newPatient.insuranceNumber}
                  onChange={(e) => setNewPatient({...newPatient, insuranceNumber: e.target.value})}
                  placeholder="Insurance policy number"
                />
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingPatient}>
                  <Shield className="btn-icon" />
                  {savingPatient ? 'Saving Patient…' : 'Add Patient'}
                </button>
              </div>

              {/* Initial Medical Record */}
              <div className="medical-record-section">
                <h3>Add Initial Medical Record (Optional)</h3>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={newMedicalRecord.date}
                    onChange={(e) => setNewMedicalRecord({...newMedicalRecord, date: e.target.value})}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={newMedicalRecord.type}
                      onChange={(e) => setNewMedicalRecord({...newMedicalRecord, type: e.target.value})}
                    >
                      <option value="">Select type</option>
                      <option value="Check-up">Check-up</option>
                      <option value="Lab Test">Lab Test</option>
                      <option value="Emergency">Emergency</option>
                      <option value="Surgery">Surgery</option>
                      <option value="Consultation">Consultation</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Doctor</label>
                    <input
                      type="text"
                      value={newMedicalRecord.doctor}
                      onChange={(e) => setNewMedicalRecord({...newMedicalRecord, doctor: e.target.value})}
                      placeholder="Dr. Name"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Hospital/Clinic</label>
                  <input
                    type="text"
                    value={newMedicalRecord.hospital || ''}
                    onChange={(e) => setNewMedicalRecord({...newMedicalRecord, hospital: e.target.value})}
                    placeholder="Hospital or clinic name"
                  />
                </div>
                <div className="form-group">
                  <label>Diagnosis</label>
                  <input
                    type="text"
                    value={newMedicalRecord.diagnosis}
                    onChange={(e) => setNewMedicalRecord({...newMedicalRecord, diagnosis: e.target.value})}
                    placeholder="Diagnosis details"
                  />
                </div>
                <div className="form-group">
                  <label>Prescription</label>
                  <input
                    type="text"
                    value={newMedicalRecord.prescription}
                    onChange={(e) => setNewMedicalRecord({...newMedicalRecord, prescription: e.target.value})}
                    placeholder="Prescription details"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={newMedicalRecord.notes}
                    onChange={(e) => setNewMedicalRecord({...newMedicalRecord, notes: e.target.value})}
                    placeholder="Additional notes"
                    rows="3"
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="search-bar">
        <Search className="search-icon" />
        <input
          type="text"
          placeholder="Search patients by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Patient Grid */}
      {!loadingPatients && <div className="patient-grid">
        {filteredPatients.length === 0 ? (
          <div className="empty-state">
            <Shield className="empty-icon" />
            <h3>No patients found</h3>
            <p>Add your first patient to get started with secure health records</p>
          </div>
        ) : (
          filteredPatients.map(patient => (
            <div key={patient.id} className="patient-card">
              <div className="patient-header">
                <div className="patient-avatar">
                  <User />
                </div>
                <div className="patient-info">
                  <h3>{patient.name}</h3>
                  <p>{patient.email}</p>
                </div>
                <button 
                  className="btn-icon-only delete-btn"
                  onClick={() => handleDeletePatient(patient.id)}
                >
                  <X />
                </button>
              </div>

              <div className="patient-details">
                <div className="detail-item">
                  <Phone className="detail-icon" />
                  <span>{patient.phone}</span>
                </div>
                <div className="detail-item">
                  <Calendar className="detail-icon" />
                        <span>{patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'Date of birth not provided'}</span>
                </div>
                <div className="detail-item">
                  <Activity className="detail-icon" />
                  <span>Blood Type: {patient.bloodType || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <AlertCircle className="detail-icon" />
                  <span>Allergies: {patient.allergies || 'None'}</span>
                </div>
              </div>

              <div className="patient-card-actions">
                <button className="btn btn-sm btn-outline" onClick={() => setSelectedPatient(patient)}>
                  <FileText className="btn-icon" /> View Records
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => generatePatientPDF(patient)}>
                  <Download className="btn-icon" /> Download PDF
                </button>
              </div>
            </div>
          ))
        )}
      </div>}

      {/* Patient Detail Modal */}
      {selectedPatient && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h2>Patient Details</h2>
              <button 
                className="btn-icon-only"
                onClick={() => setSelectedPatient(null)}
              >
                <X />
              </button>
            </div>
            <div className="patient-detail-content">
              <div className="detail-section">
                <h3>Personal Information</h3>
                <div className="detail-grid">
                  <div className="detail-field">
                    <label>Name</label>
                    <p>{selectedPatient.name}</p>
                  </div>
                  <div className="detail-field">
                    <label>Email</label>
                    <p>{selectedPatient.email}</p>
                  </div>
                  <div className="detail-field">
                    <label>Phone</label>
                    <p>{selectedPatient.phone}</p>
                  </div>
                  <div className="detail-field">
                    <label>Date of Birth</label>
                    <p>{new Date(selectedPatient.dateOfBirth).toLocaleDateString()}</p>
                  </div>
                  <div className="detail-field">
                    <label>Blood Type</label>
                    <p>{selectedPatient.bloodType || 'Not specified'}</p>
                  </div>
                  <div className="detail-field">
                    <label>Allergies</label>
                    <p>{selectedPatient.allergies || 'None known'}</p>
                  </div>
                  <div className="detail-field full-width">
                    <label>Address</label>
                    <p>{selectedPatient.address}</p>
                  </div>
                  <div className="detail-field full-width">
                    <label>Emergency Contact</label>
                    <p>{selectedPatient.emergencyContact || 'Not specified'}</p>
                  </div>
                  <div className="detail-field">
                    <label>Insurance Provider</label>
                    <p>{selectedPatient.insuranceProvider || 'Not specified'}</p>
                  </div>
                  <div className="detail-field">
                    <label>Insurance Number</label>
                    <p>{selectedPatient.insuranceNumber || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Security Information</h3>
                <div className="detail-grid">
                  <div className="detail-field">
                    <label>Record Created</label>
                    <p>{new Date(selectedPatient.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="detail-field">
                    <label>Encryption Level</label>
                    <p>AES-256</p>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Medical Records</h3>
                {pageError && <div className="records-error" role="alert">{pageError}</div>}
                {selectedPatient.medicalRecords && selectedPatient.medicalRecords.length > 0 ? (
                  <div className="medical-records-list">
                    {selectedPatient.medicalRecords.map((record, index) => (
                      <div key={record.id || index} className="medical-record-card">
                        <div className="record-header">
                          <span className="record-type">{record.type}</span>
                          <span className="record-date">{new Date(record.date).toLocaleDateString()}</span>
                        </div>
                        <div className="record-details">
                          <p><strong>Doctor:</strong> {record.doctor}</p>
                          <p><strong>Diagnosis:</strong> {record.diagnosis}</p>
                          {record.prescription && <p><strong>Prescription:</strong> {record.prescription}</p>}
                          {record.notes && <p><strong>Notes:</strong> {record.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-records">No medical records available</p>
                )}

                {/* Add New Medical Record Form */}
                <div className="add-record-form">
                  <h4>Add New Medical Record</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Date</label>
                      <input
                        type="date"
                        value={newMedicalRecord.date}
                        onChange={(e) => setNewMedicalRecord({...newMedicalRecord, date: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Type</label>
                      <select
                        value={newMedicalRecord.type}
                        onChange={(e) => setNewMedicalRecord({...newMedicalRecord, type: e.target.value})}
                      >
                        <option value="">Select type</option>
                        <option value="Check-up">Check-up</option>
                        <option value="Lab Test">Lab Test</option>
                        <option value="Emergency">Emergency</option>
                        <option value="Surgery">Surgery</option>
                        <option value="Consultation">Consultation</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Doctor</label>
                    <input
                      type="text"
                      value={newMedicalRecord.doctor}
                      onChange={(e) => setNewMedicalRecord({...newMedicalRecord, doctor: e.target.value})}
                      placeholder="Dr. Name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Hospital/Clinic</label>
                    <input
                      type="text"
                      value={newMedicalRecord.hospital || ''}
                      onChange={(e) => setNewMedicalRecord({...newMedicalRecord, hospital: e.target.value})}
                      placeholder="Hospital or clinic name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Diagnosis</label>
                    <input
                      type="text"
                      value={newMedicalRecord.diagnosis}
                      onChange={(e) => setNewMedicalRecord({...newMedicalRecord, diagnosis: e.target.value})}
                      placeholder="Diagnosis details"
                    />
                  </div>
                  <div className="form-group">
                    <label>Prescription</label>
                    <input
                      type="text"
                      value={newMedicalRecord.prescription}
                      onChange={(e) => setNewMedicalRecord({...newMedicalRecord, prescription: e.target.value})}
                      placeholder="Prescription details"
                    />
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      value={newMedicalRecord.notes}
                      onChange={(e) => setNewMedicalRecord({...newMedicalRecord, notes: e.target.value})}
                      placeholder="Additional notes"
                      rows="3"
                    />
                  </div>
                  <button 
                    className="btn btn-primary"
                    disabled={savingRecord}
                    onClick={() => handleAddMedicalRecord(selectedPatient.id)}
                  >
                    <Plus className="btn-icon" />
                    {savingRecord ? 'Saving Record…' : 'Add Medical Record'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default PatientManagement;
