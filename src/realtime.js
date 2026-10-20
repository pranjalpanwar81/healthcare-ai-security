import { db } from './firebaseConfig';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';

// Real-time listener for patient records
export const subscribeToPatientRecords = (patientId, callback) => {
  const patientRef = doc(db, 'patients', patientId);

  const unsubscribe = onSnapshot(patientRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      callback(data.records || [], null);
    } else {
      callback([], null);
    }
  }, (error) => {
    console.error('Real-time sync error:', error);
    callback(null, error);
  });

  return unsubscribe;
};

// Real-time listener for all patients (doctor view)
export const subscribeToAllPatients = (callback) => {
  const patientsQuery = query(
    collection(db, 'patients'),
    orderBy('updatedAt', 'desc')
  );

  const unsubscribe = onSnapshot(patientsQuery, (querySnapshot) => {
    const patients = [];
    querySnapshot.forEach((doc) => {
      patients.push({
        id: doc.id,
        ...doc.data()
      });
    });
    callback(patients, null);
  }, (error) => {
    console.error('Real-time sync error:', error);
    callback(null, error);
  });

  return unsubscribe;
};

// Add record to patient (triggers real-time sync)
export const addPatientRecord = async (patientId, recordData) => {
  try {
    const patientRef = doc(db, 'patients', patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      // Create new patient document
      await patientRef.set({
        records: [{
          ...recordData,
          id: `MR-${Date.now()}`,
          addedAt: serverTimestamp()
        }],
        updatedAt: serverTimestamp()
      });
    } else {
      // Append to existing records
      const patientData = patientDoc.data();
      const records = patientData.records || [];
      records.push({
        ...recordData,
        id: `MR-${Date.now()}`,
        addedAt: serverTimestamp()
      });
      await patientRef.update({
        records,
        updatedAt: serverTimestamp()
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error adding record:', error);
    return { success: false, error: error.message };
  }
};

// Update patient record (triggers real-time sync)
export const updatePatientRecord = async (patientId, recordId, updates) => {
  try {
    const patientRef = doc(db, 'patients', patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      return { success: false, error: 'Patient not found' };
    }

    const patientData = patientDoc.data();
    const records = patientData.records || [];
    const recordIndex = records.findIndex(r => r.id === recordId);

    if (recordIndex === -1) {
      return { success: false, error: 'Record not found' };
    }

    records[recordIndex] = {
      ...records[recordIndex],
      ...updates,
      updatedAt: serverTimestamp()
    };

    await patientRef.update({
      records,
      updatedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating record:', error);
    return { success: false, error: error.message };
  }
};

// Delete patient record (triggers real-time sync)
export const deletePatientRecord = async (patientId, recordId) => {
  try {
    const patientRef = doc(db, 'patients', patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      return { success: false, error: 'Patient not found' };
    }

    const patientData = patientDoc.data();
    const records = patientData.records || [];
    const filteredRecords = records.filter(r => r.id !== recordId);

    await patientRef.update({
      records: filteredRecords,
      updatedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('Error deleting record:', error);
    return { success: false, error: error.message };
  }
};
