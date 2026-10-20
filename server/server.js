import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ip from 'ip';
import jwt from 'jsonwebtoken';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import langchainService from './langchainService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const LOCAL_ML_API_URL = (process.env.LOCAL_ML_API_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const localStorePath = path.join(serverDirectory, 'data', 'local-demo-store.json');

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const ALLOWED_NETWORKS = process.env.ALLOWED_NETWORKS ? process.env.ALLOWED_NETWORKS.split(',') : ['192.168.1.0/24', '10.0.0.0/8'];
const ALLOWED_SSIDS = process.env.ALLOWED_SSIDS ? process.env.ALLOWED_SSIDS.split(',') : ['Hospital-WiFi', 'HealthGuard-Network'];
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Firebase Admin SDK for real-time sync
let db;
try {
  const serviceAccount = {
    type: process.env.FIREBASE_TYPE || 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID || 'heathguard-ai',
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
  };

  const firebaseConfig = {
    credential: cert(serviceAccount)
  };

  const firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
  console.log('✅ Firebase Firestore connected for real-time sync');
} catch (error) {
  console.log('⚠️  Firebase not configured, using local file-backed demo storage');
  console.log('   Set FIREBASE credentials in .env for real-time sync');
}

// Fallback in-memory storage
const users = new Map();
const activeSessions = new Map();
const patientRecords = new Map();
const deletedDemoPatientIds = new Set();
const deletedDemoPatientEmails = new Set();
let localStoreWriteQueue = Promise.resolve();

async function loadLocalStore() {
  if (db || process.env.NODE_ENV === 'production') return;
  try {
    const saved = JSON.parse(await readFile(localStorePath, 'utf8'));
    for (const [email, user] of saved.users || []) {
      if (email && user && ['doctor', 'patient'].includes(user.role)) users.set(email, user);
    }
    for (const [patientId, records] of saved.patientRecords || []) {
      if (patientId && Array.isArray(records)) patientRecords.set(patientId, records);
    }
    for (const patientId of saved.deletedDemoPatientIds || []) {
      if (patientId) deletedDemoPatientIds.add(patientId);
    }
    for (const email of saved.deletedDemoPatientEmails || []) {
      if (email) deletedDemoPatientEmails.add(email);
    }
    console.log(`Loaded ${users.size} local demo accounts and ${patientRecords.size} patient record collections`);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to load local demo data:', error.message);
  }
}

async function persistLocalStore() {
  if (db || process.env.NODE_ENV === 'production') return;
  const snapshot = JSON.stringify({
    users: [...users.entries()],
    patientRecords: [...patientRecords.entries()],
    deletedDemoPatientIds: [...deletedDemoPatientIds],
    deletedDemoPatientEmails: [...deletedDemoPatientEmails]
  });
  localStoreWriteQueue = localStoreWriteQueue.then(async () => {
    await mkdir(path.dirname(localStorePath), { recursive: true, mode: 0o700 });
    const tempPath = `${localStorePath}.${process.pid}.tmp`;
    await writeFile(tempPath, snapshot, { encoding: 'utf8', mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, localStorePath);
  }).catch(error => {
    console.error('Unable to persist local demo data:', error.message);
  });
  await localStoreWriteQueue;
}

// TCP/IP Validation Helper
function isIPInCIDR(ipAddress, cidr) {
  const [network, maskLength] = cidr.split('/');
  const mask = parseInt(maskLength, 10);
  const ipInt = ip.toLong(ipAddress);
  const networkInt = ip.toLong(network);
  const maskInt = ~((1 << (32 - mask)) - 1);
  return (ipInt & maskInt) === (networkInt & maskInt);
}

function validateNetwork(clientIP) {
  return ALLOWED_NETWORKS.some(cidr => isIPInCIDR(clientIP, cidr));
}

// Generate JWT Token
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      network: user.network,
      ssid: user.ssid
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Verify JWT Token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Network Validation Middleware
const validateNetworkAccess = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const ssid = req.headers['x-wifi-ssid'];

  console.log(`Access attempt from IP: ${clientIP}, SSID: ${ssid}`);

  // For doctor role, require network validation
  if (req.user && req.user.role === 'doctor') {
    if (process.env.NODE_ENV === 'production' && !validateNetwork(clientIP)) {
      return res.status(403).json({
        error: 'Network access denied',
        message: 'Doctors must access from the hospital network'
      });
    }

    if (ssid && !ALLOWED_SSIDS.includes(ssid)) {
      return res.status(403).json({
        error: 'Wi-Fi network invalid',
        message: 'Doctors must connect to hospital Wi-Fi'
      });
    }
  }

  next();
};

// Firestore Helper Functions
async function getUserFromFirestore(email) {
  if (!db) return null;
  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Firestore error:', error);
    return null;
  }
}

async function updateUserInFirestore(id, updates) {
  if (!db) return null;
  try {
    let ref = db.collection('users').doc(id);
    let snapshot = await ref.get();
    if (!snapshot.exists) {
      const legacySnapshot = await db.collection('users').where('id', '==', id).limit(1).get();
      if (legacySnapshot.empty) return null;
      ref = legacySnapshot.docs[0].ref;
    }
    await ref.update(updates);
    snapshot = await ref.get();
    return snapshot.exists ? { ...snapshot.data(), id: snapshot.data().id || snapshot.id } : null;
  } catch (error) {
    console.error('Firestore error:', error);
    return null;
  }
}

async function getUserById(id) {
  if (!db) return Array.from(users.values()).find(user => user.id === id) || null;
  try {
    const snapshot = await db.collection('users').doc(id).get();
    if (snapshot.exists) return { ...snapshot.data(), id: snapshot.data().id || snapshot.id };
    const legacySnapshot = await db.collection('users').where('id', '==', id).limit(1).get();
    if (legacySnapshot.empty) return null;
    const doc = legacySnapshot.docs[0];
    return { ...doc.data(), id: doc.data().id || doc.id };
  } catch (error) {
    console.error('Firestore error:', error);
    return null;
  }
}

async function saveUserToFirestore(user) {
  if (!db) return null;
  try {
    await db.collection('users').doc(user.id).set(user);
    return user;
  } catch (error) {
    console.error('Firestore error:', error);
    return null;
  }
}

async function updatePatientRecord(patientId, recordData) {
  if (!db) return null;
  try {
    const patientRef = db.collection('patients').doc(patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      // Create new patient document
      await patientRef.set({
        records: [recordData],
        updatedAt: new Date().toISOString()
      });
    } else {
      // Append to existing records
      const patientData = patientDoc.data();
      const records = patientData.records || [];
      records.push(recordData);
      await patientRef.update({
        records,
        updatedAt: new Date().toISOString()
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Firestore error:', error);
    return { success: false, error: error.message };
  }
}

async function getPatientRecords(patientId) {
  if (!db) return patientRecords.get(patientId) || [];
  try {
    const doc = await db.collection('patients').doc(patientId).get();
    if (!doc.exists) return [];
    const data = doc.data();
    return data.records || [];
  } catch (error) {
    console.error('Firestore error:', error);
    return [];
  }
}

function publicPatientProfile(user) {
  if (!user) return null;
  const fields = ['id', 'name', 'email', 'phone', 'dateOfBirth', 'address', 'bloodType', 'allergies', 'emergencyContact', 'insuranceProvider', 'insuranceNumber', 'createdAt'];
  return Object.fromEntries(fields.filter(field => user[field] !== undefined).map(field => [field, user[field]]));
}

// Auth Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  const user = await getUserById(decoded.id);
  if (!user || user.role !== decoded.role) {
    return res.status(401).json({ error: 'This account is no longer available. Please sign in again.' });
  }

  req.user = decoded;
  next();
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Network validation endpoint
app.post('/api/validate-network', (req, res) => {
  const { ssid, location } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;

  const networkValid = validateNetwork(clientIP);
  const ssidValid = ssid && ALLOWED_SSIDS.includes(ssid);
  const locationValid = true;

  res.json({
    networkValid,
    ssidValid,
    locationValid,
    patientLocationRequired: false,
    clientIP,
    allowedNetworks: ALLOWED_NETWORKS,
    allowedSSIDs: ALLOWED_SSIDS
  });
});

// Register user
app.post('/api/auth/register', async (req, res) => {
  const { email, password, role, name, ssid, location } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['doctor', 'patient'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Check if user exists in Firestore or memory
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = db ? await getUserFromFirestore(normalizedEmail) : users.get(normalizedEmail);
  if (existingUser) {
    if (role === 'patient' && existingUser.role === 'patient' && !existingUser.password) {
      const claimedUser = { ...existingUser, password, name: name || existingUser.name, ssid, location };
      if (db) {
        const savedUser = await updateUserInFirestore(existingUser.id, { password, name: claimedUser.name, ssid, location });
        if (!savedUser) return res.status(500).json({ error: 'Unable to link this patient account' });
        return res.json({ message: 'Patient account linked successfully', user: { id: savedUser.id, email: savedUser.email, role: savedUser.role, name: savedUser.name } });
      }
      users.set(normalizedEmail, claimedUser);
      await persistLocalStore();
      return res.json({ message: 'Patient account linked successfully', user: { id: claimedUser.id, email: claimedUser.email, role: claimedUser.role, name: claimedUser.name } });
    }
    return res.status(409).json({ error: 'User already exists' });
  }

  const user = {
    id: Date.now().toString(),
    email: normalizedEmail,
    password, // In production, hash this!
    role,
    name,
    ssid,
    location,
    createdAt: new Date().toISOString()
  };

  // Save to Firestore if available, otherwise use memory
  if (db) {
    const savedUser = await saveUserToFirestore(user);
    if (savedUser) {
      if (savedUser.role === 'patient') await seedDemoRecords(savedUser.id, savedUser.email);
      return res.json({
        message: 'User registered successfully',
        user: {
          id: savedUser.id,
          email: savedUser.email,
          role: savedUser.role,
          name: savedUser.name
        }
      });
    }
  }

  // Fallback to in-memory
  users.set(normalizedEmail, user);
  await persistLocalStore();
  if (user.role === 'patient') await seedDemoRecords(user.id, user.email);

  res.json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    }
  });
});

async function seedDemoRecords(patientId, email) {
  if (deletedDemoPatientEmails.has(email)) return;
  const demoByEmail = {
    'john.doe@email.com': [
      { date: '2025-09-15', type: 'Check-up', doctor: 'Dr. Sarah Smith', diagnosis: 'Routine wellness visit', prescription: 'Daily multivitamin', notes: 'Fictional demo entry. Blood pressure 120/80; follow-up in six months.' },
      { date: '2025-08-20', type: 'Lab Test', doctor: 'Dr. Sarah Smith', diagnosis: 'Routine blood panel', prescription: '', notes: 'Fictional demo entry. Results reviewed with patient.' }
    ],
    'sarah.johnson@email.com': [
      { date: '2025-09-10', type: 'Consultation', doctor: 'Dr. Michael Chen', diagnosis: 'Seasonal allergies', prescription: 'Non-drowsy antihistamine as directed', notes: 'Fictional demo entry. Discussed symptom tracking.' }
    ],
    'michael.chen@email.com': [
      { date: '2025-09-03', type: 'Follow-up', doctor: 'Dr. Emily Davis', diagnosis: 'Routine recovery follow-up', prescription: '', notes: 'Fictional demo entry. Patient reports steady improvement.' }
    ]
  };
  const records = (demoByEmail[email] || []).map((record, index) => ({ ...record, id: `DEMO-${patientId}-${index + 1}`, demo: true }));
  if (db) {
    const ref = db.collection('patients').doc(patientId);
    const snapshot = await ref.get();
    if (!snapshot.exists) await ref.set({ records, updatedAt: new Date().toISOString() });
  } else if (!patientRecords.has(patientId)) {
    patientRecords.set(patientId, records);
    await persistLocalStore();
  }
}

async function seedLocalDemoPatients() {
  if (db || process.env.NODE_ENV === 'production') return;
  const demoUsers = [
    { id: 'demo-patient-alex', email: 'john.doe@email.com', name: 'Alex Morgan (Demo)', password: 'DemoPatient123!', role: 'patient', bloodType: 'A+', allergies: 'Penicillin', phone: '+1 555 010 1101', dateOfBirth: '1990-05-15', address: '100 Demo Lane, Sample City', emergencyContact: 'Morgan Lee — +1 555 010 1102', insuranceProvider: 'Demo Health Plan', insuranceNumber: 'DEMO-A1001' },
    { id: 'demo-patient-jamie', email: 'sarah.johnson@email.com', name: 'Jamie Patel (Demo)', password: 'DemoPatient123!', role: 'patient', bloodType: 'O+', allergies: 'None known', phone: '+1 555 010 2201', dateOfBirth: '1985-08-22', address: '200 Demo Avenue, Sample City', emergencyContact: 'Riley Patel — +1 555 010 2202', insuranceProvider: 'SampleCare', insuranceNumber: 'DEMO-J2002' },
    { id: 'demo-patient-taylor', email: 'michael.chen@email.com', name: 'Taylor Kim (Demo)', password: 'DemoPatient123!', role: 'patient', bloodType: 'B+', allergies: 'Seasonal pollen', phone: '+1 555 010 3301', dateOfBirth: '1978-12-10', address: '300 Demo Street, Sample City', emergencyContact: 'Jordan Kim — +1 555 010 3302', insuranceProvider: 'Example Medical', insuranceNumber: 'DEMO-T3003' }
  ];
  for (const user of demoUsers) {
    if (deletedDemoPatientIds.has(user.id) || deletedDemoPatientEmails.has(user.email)) continue;
    if (!users.has(user.email)) users.set(user.email, user);
    await seedDemoRecords(user.id, user.email);
  }
  await persistLocalStore();
}

// Login
app.post('/api/auth/demo-session', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Demo sign-in is disabled' });
  }
  const { email, name, role } = req.body;
  if (!email || !['doctor', 'patient'].includes(role)) {
    return res.status(400).json({ error: 'Email and valid role are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let user = db ? await getUserFromFirestore(normalizedEmail) : users.get(normalizedEmail);
  if (user && user.role !== role) {
    return res.status(409).json({ error: `This email is already registered as a ${user.role}` });
  }
  if (!user) {
    user = { id: Date.now().toString(), email: normalizedEmail, name: name || normalizedEmail.split('@')[0], role, createdAt: new Date().toISOString() };
    if (db) {
      const savedUser = await saveUserToFirestore(user);
      if (savedUser) user = savedUser;
      else users.set(normalizedEmail, user);
    } else {
      users.set(normalizedEmail, user);
      await persistLocalStore();
    }
  }
  if (role === 'patient') await seedDemoRecords(user.id, user.email);

  const clientIP = req.ip || req.connection.remoteAddress;
  const token = generateToken({ id: user.id, role, network: clientIP, ssid: null });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role: requestedRole, ssid, location } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;

  // Get user from Firestore or memory
  const normalizedEmail = email.trim().toLowerCase();
  const user = db ? await getUserFromFirestore(normalizedEmail) : users.get(normalizedEmail);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (requestedRole && user.role !== requestedRole) {
    return res.status(403).json({ error: `This account is registered as a ${user.role} and cannot sign in as a ${requestedRole}.` });
  }

  // Network validation based on role
  if (user.role === 'doctor') {
    if (process.env.NODE_ENV === 'production' && !validateNetwork(clientIP)) {
      return res.status(403).json({
        error: 'Network access denied',
        message: 'Doctors must access from hospital network'
      });
    }

    if (process.env.NODE_ENV === 'production' && (!ssid || !ALLOWED_SSIDS.includes(ssid))) {
      return res.status(403).json({
        error: 'Wi-Fi network invalid',
        message: 'Doctors must connect to hospital Wi-Fi'
      });
    }
  }

  const token = generateToken({
    id: user.id,
    role: user.role,
    network: clientIP,
    ssid: ssid || null
  });

  // Store session
  activeSessions.set(token, {
    userId: user.id,
    email: user.email,
    role: user.role,
    network: clientIP,
    ssid: ssid || null,
    createdAt: new Date().toISOString()
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    }
  });
});

// Get user info (protected)
app.get('/api/user/me', authenticateToken, validateNetworkAccess, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    network: req.user.network,
    ssid: req.user.ssid
  });
});

// Get all patients (doctor only)
app.get('/api/doctor/overview', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'doctor') return res.status(403).json({ error: 'Access denied. Doctors only.' });
  const memoryPatients = Array.from(users.values()).filter(user => user.role === 'patient').map(user => ({
    id: user.id, email: user.email, name: user.name, createdAt: user.createdAt
  }));
  const firestorePatients = db
    ? (await db.collection('users').where('role', '==', 'patient').get()).docs.map(doc => ({ id: doc.id, ...doc.data() }))
    : [];
  const patients = [...memoryPatients, ...firestorePatients.filter(p => !memoryPatients.some(m => m.email === p.email))];
  const enriched = await Promise.all(patients.map(async patient => ({
    ...patient,
    records: await getPatientRecords(patient.id)
  })));
  res.json({
    patients: enriched,
    totalRecords: enriched.reduce((count, patient) => count + patient.records.length, 0),
    demo: process.env.NODE_ENV !== 'production'
  });
});

// Create or link a patient profile from the doctor's patient form.
app.post('/api/patients', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Access denied. Doctors only.' });
  }

  const { name, email, initialRecord, ...submittedProfile } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Patient name and email are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let patient = db ? await getUserFromFirestore(normalizedEmail) : users.get(normalizedEmail);
  if (patient && patient.role !== 'patient') {
    return res.status(409).json({ error: 'That email is already registered to a doctor account.' });
  }

  const profileFields = ['phone', 'dateOfBirth', 'address', 'bloodType', 'allergies', 'emergencyContact', 'insuranceProvider', 'insuranceNumber'];
  const profile = Object.fromEntries(profileFields.filter(field => submittedProfile[field] !== undefined).map(field => [field, submittedProfile[field]]));
  if (patient) {
    const updates = { ...profile, name: name.trim(), email: normalizedEmail };
    if (db) {
      patient = await updateUserInFirestore(patient.id, updates);
      if (!patient) return res.status(500).json({ error: 'Unable to update the patient profile.' });
    } else {
      patient = { ...patient, ...updates };
      users.set(normalizedEmail, patient);
      await persistLocalStore();
    }
  } else {
    const patientProfile = {
      id: Date.now().toString(),
      ...profile,
      name: name.trim(),
      email: normalizedEmail,
      role: 'patient',
      createdAt: new Date().toISOString()
    };
    if (db) {
      patient = await saveUserToFirestore(patientProfile);
      if (!patient) return res.status(500).json({ error: 'Unable to create the patient profile.' });
    } else {
      patient = patientProfile;
      users.set(normalizedEmail, patient);
      await persistLocalStore();
    }
  }

  let record = null;
  if (initialRecord && (initialRecord.date || initialRecord.type || initialRecord.diagnosis)) {
    record = {
      ...initialRecord,
      id: `MR-${Date.now()}`,
      addedBy: req.user.id,
      addedAt: new Date().toISOString()
    };
    if (db) {
      const result = await updatePatientRecord(patient.id, record);
      if (!result?.success) return res.status(500).json({ error: 'Patient profile was saved, but the initial record could not be saved.' });
    } else {
      const records = patientRecords.get(patient.id) || [];
      records.push(record);
      patientRecords.set(patient.id, records);
      await persistLocalStore();
    }
  }

  await persistLocalStore();

  res.status(201).json({
    patient: publicPatientProfile(patient),
    record,
    records: await getPatientRecords(patient.id)
  });
});

app.get('/api/patients', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Access denied. Doctors only.' });
  }

  const memoryPatients = Array.from(users.values())
    .filter(u => u.role === 'patient')
    .map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt
    }));

  const firestorePatients = db
    ? (await db.collection('users').where('role', '==', 'patient').get()).docs.map(doc => ({
      id: doc.id, email: doc.data().email, name: doc.data().name, createdAt: doc.data().createdAt
    }))
    : [];
  const patients = [...memoryPatients, ...firestorePatients.filter(p => !memoryPatients.some(m => m.email === p.email))];

  res.json({ patients });
});

// Delete a patient account and all records attached to it (doctor only).
app.delete('/api/patients/:id', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Access denied. Doctors only.' });
  }

  const patientId = req.params.id;
  const patient = await getUserById(patientId);
  if (!patient || patient.role !== 'patient') {
    return res.status(404).json({ error: 'Patient not found.' });
  }

  try {
    if (db) {
      let userRef = db.collection('users').doc(patientId);
      const userSnapshot = await userRef.get();
      if (!userSnapshot.exists) {
        const legacySnapshot = await db.collection('users').where('id', '==', patientId).limit(1).get();
        userRef = legacySnapshot.empty ? null : legacySnapshot.docs[0].ref;
      }

      const batch = db.batch();
      batch.delete(db.collection('patients').doc(patientId));
      if (userRef) batch.delete(userRef);
      await batch.commit();
    } else {
      if (['demo-patient-alex', 'demo-patient-jamie', 'demo-patient-taylor'].includes(patientId)) {
        deletedDemoPatientIds.add(patientId);
        if (patient.email) deletedDemoPatientEmails.add(patient.email);
      }
    }

    for (const [email, user] of users.entries()) {
      if (user.id === patientId) users.delete(email);
    }
    patientRecords.delete(patientId);
    if (!db) await persistLocalStore();

    for (const [token, session] of activeSessions.entries()) {
      if (session.userId === patientId) activeSessions.delete(token);
    }

    res.json({ message: 'Patient and associated records deleted successfully.', patientId });
  } catch (error) {
    console.error('Unable to delete patient:', error.message);
    res.status(500).json({ error: 'Unable to delete the patient and records.' });
  }
});

// Get patient records (doctor only)
app.get('/api/patients/:id/records', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Access denied. Doctors only.' });
  }

  const patientId = req.params.id;

  const patient = await getUserById(patientId);
  if (!patient || patient.role !== 'patient') return res.status(404).json({ error: 'Patient not found' });

  // Fetch from Firestore if available
  if (db) {
    const records = await getPatientRecords(patientId);
    return res.json({
      patientId,
      patientName: patient.name || 'Unknown',
      patient: publicPatientProfile(patient),
      records
    });
  }

  // Fallback to in-memory
  res.json({
    patientId,
    patientName: patient.name,
    patient: publicPatientProfile(patient),
    records: patientRecords.get(patientId) || []
  });
});

// Update patient records (doctor only) - Real-time sync
app.post('/api/patients/:id/records', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Access denied. Doctors only.' });
  }

  const patientId = req.params.id;
  const recordData = {
    ...req.body,
    id: `MR-${Date.now()}`,
    addedBy: req.user.id,
    addedAt: new Date().toISOString()
  };

  // Save to Firestore for real-time sync
  if (db) {
    const result = await updatePatientRecord(patientId, recordData);
    if (result.success) {
      return res.json({
        message: 'Record added successfully',
        record: recordData,
        synced: true
      });
    } else {
      return res.status(500).json({ error: 'Failed to save record' });
    }
  }

  const records = patientRecords.get(patientId) || [];
  records.push(recordData);
  patientRecords.set(patientId, records);
  await persistLocalStore();

  // Fallback storage supports local demos and restarts only when Firebase is configured.
  res.json({
    message: 'Record added to local demo storage',
    record: recordData,
    synced: false
  });
});

// Get own records (patient only)
app.get('/api/my-records', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Access denied. Patients only.' });
  }

  const patientId = req.user.id;
  const patient = await getUserById(patientId);

  // Fetch from Firestore if available
  if (db) {
    const records = await getPatientRecords(patientId);
    return res.json({
      patientId,
      patientName: patient?.name || 'Unknown',
      patient: patient ? publicPatientProfile(patient) : null,
      records
    });
  }

  // Fallback to in-memory
  res.json({
    patientId,
    patientName: patient?.name || 'Unknown',
    patient: patient ? publicPatientProfile(patient) : null,
    records: patientRecords.get(patientId) || []
  });
});

// ===== LANGCHAIN AI ENDPOINTS =====

// Medical Record Summarization
app.post('/api/ai/summarize-records', authenticateToken, validateNetworkAccess, async (req, res) => {
  try {
    const { patientId, audience } = req.body;
    
    let targetPatientId = patientId;
    if (req.user.role === 'patient') {
      targetPatientId = req.user.id;
    } else if (req.user.role === 'doctor' && !patientId) {
      return res.status(400).json({ error: 'Patient ID required for doctors' });
    }

    const records = await getPatientRecords(targetPatientId);
    if (!records.length) {
      return res.status(400).json({ error: 'No records found to summarize' });
    }

    const summary = await langchainService.summarizeMedicalRecords(records, audience || req.user.role);
    
    res.json({
      summary,
      recordsAnalyzed: records.length,
      audience: audience || req.user.role
    });
  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ error: error.message || 'Failed to summarize records' });
  }
});

// Symptom Analysis
app.post('/api/ai/analyze-symptoms', authenticateToken, validateNetworkAccess, async (req, res) => {
  try {
    const { symptoms, patientContext } = req.body;
    
    if (!symptoms || (Array.isArray(symptoms) && symptoms.length === 0)) {
      return res.status(400).json({ error: 'Symptoms are required' });
    }

    const symptomList = (Array.isArray(symptoms) ? symptoms : String(symptoms).split(','))
      .map(value => String(value).trim().toLowerCase().replace(/[ -]+/g, '_'))
      .filter(Boolean);
    const recognizedSymptoms = new Set([
      'fever', 'headache', 'fatigue', 'body_ache', 'sore_throat', 'chills',
      'dizziness', 'blurred_vision', 'increased_thirst', 'frequent_urination',
      'localized_pain', 'high_fever', 'severe_fatigue', 'none'
    ]);
    const modelSymptoms = symptomList.filter(symptom => recognizedSymptoms.has(symptom));
    const emergencySymptoms = new Set([
      'chest_pain', 'difficulty_breathing', 'shortness_of_breath',
      'severe_bleeding', 'loss_of_consciousness', 'seizure'
    ]);
    const emergency = symptomList.some(symptom => emergencySymptoms.has(symptom));

    if (emergency) {
      return res.json({
        analysis: {
          possibleConditions: [],
          urgencyLevel: 'EMERGENCY',
          recommendedActions: ['Contact your local emergency services or go to an emergency department now.'],
          disclaimer: 'This is an automated safety message, not a diagnosis. Contact a healthcare professional for medical advice.'
        },
        model: 'local-healthcare-classifier',
        timestamp: new Date().toISOString()
      });
    }

    if (!modelSymptoms.length) {
      return res.status(422).json({
        error: 'Enter at least one symptom recognized by the local model: fever, headache, fatigue, body ache, sore throat, chills, dizziness, blurred vision, increased thirst, frequent urination, localized pain, high fever, or severe fatigue.'
      });
    }

    const context = patientContext || {};
    let modelResponse;
    try {
      const response = await fetch(`${LOCAL_ML_API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: Number(context.age) || 35,
          gender: String(context.gender || 'male').toLowerCase(),
          symptoms: modelSymptoms
        }),
        signal: AbortSignal.timeout(15000)
      });
      modelResponse = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Local ML prediction failed:', modelResponse.error || response.statusText);
        return res.status(502).json({ error: 'The local prediction model could not process this request.' });
      }
    } catch (error) {
      console.error('Local ML service unavailable:', error.message);
      return res.status(503).json({
        error: 'Local symptom model is unavailable. Start it with PORT=5001 ./ml/venv/bin/python ml/src/predict.py.'
      });
    }

    const prediction = modelResponse.prediction;
    if (!prediction?.condition) {
      return res.status(502).json({ error: 'The local prediction model returned no condition.' });
    }

    const conditionLabel = value => String(value).replace(/_/g, ' ');
    const possibleConditions = [prediction.condition, ...(prediction.top_alternatives || [])
      .map(alternative => alternative.condition)]
      .filter(Boolean)
      .map(conditionLabel);
    const analysis = {
      possibleConditions,
      urgencyLevel: 'MEDIUM',
      recommendedActions: ['Discuss these symptoms with a licensed healthcare professional. Seek urgent care if symptoms become severe or worsen.'],
      disclaimer: 'This educational model was trained on synthetic data. Its output is not a diagnosis, medical advice, or a clinically validated triage assessment. Consult a healthcare professional.'
    };
    
    res.json({
      analysis,
      model: 'local-healthcare-classifier',
      confidence: prediction.confidence,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Symptom analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze symptoms' });
  }
});

// Drug Interaction Checker
app.post('/api/ai/check-drug-interactions', authenticateToken, validateNetworkAccess, async (req, res) => {
  try {
    const { medications } = req.body;
    
    if (!medications || (Array.isArray(medications) && medications.length === 0)) {
      return res.status(400).json({ error: 'Medications are required' });
    }

    const interactions = await langchainService.checkDrugInteractions(medications);
    
    res.json({
      interactions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Drug interaction check error:', error);
    res.status(500).json({ error: error.message || 'Failed to check drug interactions' });
  }
});

// Treatment Recommendations
app.post('/api/ai/suggest-treatments', authenticateToken, validateNetworkAccess, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Access denied. Doctors only.' });
  }

  try {
    const { diagnosis, patientId } = req.body;
    
    if (!diagnosis) {
      return res.status(400).json({ error: 'Diagnosis is required' });
    }

    const records = patientId ? await getPatientRecords(patientId) : [];
    const recommendations = await langchainService.suggestTreatmentOptions(diagnosis, records);
    
    res.json({
      recommendations,
      recordsAnalyzed: records.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Treatment suggestion error:', error);
    res.status(500).json({ error: error.message || 'Failed to suggest treatments' });
  }
});

// Medical Chatbot
app.post('/api/ai/chat', authenticateToken, validateNetworkAccess, async (req, res) => {
  try {
    const { message, patientId, clearHistory } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (clearHistory) {
      langchainService.medicalChatbot.clearHistory();
    }

    let patientContext = {};
    if (patientId) {
      const patient = await getUserById(patientId);
      if (patient) {
        patientContext = {
          name: patient.name,
          bloodType: patient.bloodType,
          allergies: patient.allergies,
          recentRecords: (await getPatientRecords(patientId)).slice(-3)
        };
      }
    }

    const response = await langchainService.medicalChatbot.chat(message, patientContext);
    
    res.json({
      ...response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: error.message || 'Chatbot error' });
  }
});

// Anomaly Detection
app.post('/api/ai/detect-anomalies', authenticateToken, validateNetworkAccess, async (req, res) => {
  try {
    const { patientId } = req.body;
    
    let targetPatientId = patientId;
    if (req.user.role === 'patient') {
      targetPatientId = req.user.id;
    } else if (req.user.role === 'doctor' && !patientId) {
      return res.status(400).json({ error: 'Patient ID required for doctors' });
    }

    const records = await getPatientRecords(targetPatientId);
    if (!records.length) {
      return res.status(400).json({ error: 'No records found for analysis' });
    }

    const anomalies = await langchainService.detectAnomalies(records);
    
    res.json({
      anomalies,
      recordsAnalyzed: records.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({ error: error.message || 'Failed to detect anomalies' });
  }
});

// Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  const token = req.headers['authorization'].split(' ')[1];
  activeSessions.delete(token);

  res.json({ message: 'Logged out successfully' });
});

// Load local demo storage before accepting requests so saved records survive a restart.
async function startServer() {
  await loadLocalStore();
  await seedLocalDemoPatients();
  app.listen(PORT, HOST, () => {
    console.log(`HealthGuard AI Server running on port ${PORT}`);
    console.log(`Allowed Networks: ${ALLOWED_NETWORKS.join(', ')}`);
    console.log(`Allowed SSIDs: ${ALLOWED_SSIDS.join(', ')}`);
    console.log(`Server IP: ${ip.address()}`);
  });
}

startServer().catch(error => {
  console.error('Unable to start HealthGuard AI Server:', error.message);
  process.exitCode = 1;
});
