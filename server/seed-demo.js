import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

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

if (!serviceAccount.private_key || !serviceAccount.client_email) {
  console.error('Firebase service account credentials are required to seed demo records.');
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const examples = [
  {
    name: 'Alex Morgan (Demo)', email: 'alex.morgan.demo@example.com', password: 'DemoPatient123!', role: 'patient',
    phone: '+1 555 010 1101', dateOfBirth: '1990-05-15', address: '100 Demo Lane, Sample City',
    emergencyContact: 'Morgan Lee — +1 555 010 1102', insuranceProvider: 'Demo Health Plan', insuranceNumber: 'DEMO-A1001',
    bloodType: 'A+', allergies: 'Penicillin',
    records: [
      { date: '2025-09-15', type: 'Check-up', doctor: 'Dr. Sarah Smith', diagnosis: 'Routine wellness visit', prescription: 'Daily multivitamin', notes: 'Fictional demo entry. Blood pressure 120/80; follow-up in six months.' },
      { date: '2025-08-20', type: 'Lab Test', doctor: 'Dr. Sarah Smith', diagnosis: 'Routine blood panel', prescription: '', notes: 'Fictional demo entry. Results reviewed with patient.' }
    ]
  },
  {
    name: 'Jamie Patel (Demo)', email: 'jamie.patel.demo@example.com', password: 'DemoPatient123!', role: 'patient',
    phone: '+1 555 010 2201', dateOfBirth: '1985-08-22', address: '200 Demo Avenue, Sample City',
    emergencyContact: 'Riley Patel — +1 555 010 2202', insuranceProvider: 'SampleCare', insuranceNumber: 'DEMO-J2002',
    bloodType: 'O+', allergies: 'None known',
    records: [
      { date: '2025-09-10', type: 'Consultation', doctor: 'Dr. Michael Chen', diagnosis: 'Seasonal allergies', prescription: 'Non-drowsy antihistamine as directed', notes: 'Fictional demo entry. Discussed symptom tracking.' }
    ]
  }
];

for (const example of examples) {
  const existing = await db.collection('users').where('email', '==', example.email).get();
  let id;
  if (existing.empty) {
    const user = { ...example, createdAt: new Date().toISOString() };
    const ref = await db.collection('users').add(user);
    id = ref.id;
    console.log(`Created demo patient ${example.email} (password: ${example.password})`);
  } else {
    id = existing.docs[0].id;
    console.log(`Demo patient already exists: ${example.email}`);
  }
  const recordsRef = db.collection('patients').doc(id);
  const recordSnapshot = await recordsRef.get();
  if (!recordSnapshot.exists) {
    await recordsRef.set({
      records: example.records.map((record, index) => ({ ...record, id: `DEMO-${index + 1}`, demo: true })),
      updatedAt: new Date().toISOString()
    });
    console.log(`Seeded ${example.records.length} clearly labeled fictional records for ${example.email}`);
  } else {
    console.log(`Records already exist for ${example.email}; left unchanged`);
  }
}

await app.delete();
