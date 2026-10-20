// Demo data. All people are fictional. Every value passes through the same sealing and audit paths as live data.
import { data, save } from './lib/store.js';
import { seal, blindIndex, hashPassword, randomId } from './lib/crypto.js';
import { record } from './lib/audit.js';
import { explain } from './lib/xai.js';

export const DEMO_PASSWORD = 'HealthGuard2026';

const people = [
  { role: 'admin', name: 'Neha Kulkarni', email: 'security@healthguard.demo', specialty: 'Information Security Officer' },
  { role: 'doctor', name: 'Dr. Arjun Mehta', email: 'arjun.mehta@healthguard.demo', specialty: 'Internal Medicine' },
  { role: 'doctor', name: 'Dr. Kavya Iyer', email: 'kavya.iyer@healthguard.demo', specialty: 'Endocrinology' },
  { role: 'patient', name: 'Rohan Deshpande', email: 'rohan@healthguard.demo', profile: { dob: '1968-04-12', gender: 'Male', bloodGroup: 'B+', allergies: 'Penicillin', phone: '+91 98200 00001' } },
  { role: 'patient', name: 'Ananya Rao', email: 'ananya@healthguard.demo', profile: { dob: '1994-09-03', gender: 'Female', bloodGroup: 'O+', allergies: 'None known', phone: '+91 98200 00002' } },
  { role: 'patient', name: 'Farhan Shaikh', email: 'farhan@healthguard.demo', profile: { dob: '1979-01-27', gender: 'Male', bloodGroup: 'A-', allergies: 'Sulfa drugs', phone: '+91 98200 00003' } },
  { role: 'patient', name: 'Meera Joshi', email: 'meera@healthguard.demo', profile: { dob: '2001-06-18', gender: 'Female', bloodGroup: 'AB+', allergies: 'None known', phone: '+91 98200 00004' } },
];

const days = (n) => new Date(Date.now() - n * 86400000).toISOString();

const visits = {
  'rohan@healthguard.demo': [
    { ago: 120, by: 1, title: 'Annual health check', type: 'visit', diagnosis: 'Elevated blood pressure', notes: 'Advised reduced salt intake and a 30-minute daily walk. Recheck in three months.', medications: [],
      vitals: { age: 57, bmi: 28.9, systolic: 142, diastolic: 91, heartRate: 78, temperature: 36.7, glucose: 104, hba1c: 5.7, wbc: 7.1, crp: 4, coughDays: 0, fatigue: 3 } },
    { ago: 14, by: 1, title: 'Blood pressure follow-up', type: 'visit', diagnosis: 'Stage 2 hypertension', notes: 'Readings remain high at home and in clinic. Starting medication. Review kidney function in four weeks.', medications: ['Amlodipine 5 mg, once daily'],
      vitals: { age: 58, bmi: 29.4, systolic: 156, diastolic: 97, heartRate: 81, temperature: 36.6, glucose: 108, hba1c: 5.8, wbc: 7.3, crp: 5, coughDays: 0, fatigue: 4 } },
  ],
  'ananya@healthguard.demo': [
    { ago: 6, by: 1, title: 'Fever and sore throat', type: 'visit', diagnosis: 'Suspected viral upper respiratory infection', notes: 'Rest, fluids and paracetamol for fever. Return if fever lasts beyond five days or breathing becomes difficult.', medications: ['Paracetamol 500 mg, up to 4 times daily'],
      vitals: { age: 32, bmi: 22.1, systolic: 114, diastolic: 74, heartRate: 94, temperature: 38.3, glucose: 92, hba1c: 5.1, wbc: 5.2, crp: 18, coughDays: 4, fatigue: 6 } },
  ],
  'farhan@healthguard.demo': [
    { ago: 200, by: 2, title: 'Diabetes review', type: 'lab', diagnosis: 'Type 2 diabetes, poorly controlled', notes: 'HbA1c above target. Dietitian referral made. Increase activity.', medications: ['Metformin 500 mg, twice daily'],
      vitals: { age: 46, bmi: 31.8, systolic: 134, diastolic: 85, heartRate: 82, temperature: 36.8, glucose: 178, hba1c: 8.4, wbc: 7.9, crp: 6, coughDays: 0, fatigue: 5 } },
    { ago: 30, by: 2, title: 'Diabetes review', type: 'lab', diagnosis: 'Type 2 diabetes, improving', notes: 'Good progress. HbA1c falling. Continue current plan.', medications: ['Metformin 1000 mg, twice daily'],
      vitals: { age: 46, bmi: 30.2, systolic: 128, diastolic: 82, heartRate: 79, temperature: 36.7, glucose: 142, hba1c: 7.2, wbc: 7.5, crp: 5, coughDays: 0, fatigue: 4 } },
  ],
  'meera@healthguard.demo': [
    { ago: 60, by: 1, title: 'Routine check-up', type: 'visit', diagnosis: 'No concerns', notes: 'All readings within normal limits.', medications: [],
      vitals: { age: 25, bmi: 21.4, systolic: 112, diastolic: 72, heartRate: 68, temperature: 36.6, glucose: 86, hba1c: 5.0, wbc: 6.5, crp: 2, coughDays: 0, fatigue: 2 } },
  ],
};

export function seedDemo() {
  const db = data();
  const users = people.map((p) => {
    const id = randomId(p.role === 'patient' ? 'pat' : p.role === 'doctor' ? 'doc' : 'adm');
    const u = {
      id, role: p.role, name: p.name, emailIndex: blindIndex(p.email), passwordHash: hashPassword(DEMO_PASSWORD),
      specialty: p.specialty, pii: seal({ email: p.email, phone: '', dob: '', gender: '', bloodGroup: '', allergies: '', ...(p.profile || {}) }, id),
      createdAt: days(365), failedLogins: 0, lockedUntil: null, demo: true,
    };
    db.users.push(u);
    return { ...u, email: p.email };
  });
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  const doctors = users.filter((u) => u.role === 'doctor');
  const admin = users.find((u) => u.role === 'admin');

  for (const [email, list] of Object.entries(visits)) {
    const patient = byEmail[email];
    for (const v of list) {
      const author = users[v.by];
      const body = { title: v.title, type: v.type, diagnosis: v.diagnosis, notes: v.notes, medications: v.medications, vitals: v.vitals, assessment: explain(v.vitals).prediction };
      db.records.push({ id: randomId('rec'), patientId: patient.id, authorId: author.id, authorName: author.name, createdAt: days(v.ago), sealed: seal(body, patient.id) });
    }
  }

  // Consent: Dr. Mehta cares for Rohan, Ananya and Meera; Dr. Iyer cares for Farhan and Rohan (time-limited).
  const grant = (patientEmail, doctor, expiresInDays = null) => db.consents.push({
    patientId: byEmail[patientEmail].id, doctorId: doctor.id, grantedAt: days(90),
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
  });
  grant('rohan@healthguard.demo', doctors[0]);
  grant('ananya@healthguard.demo', doctors[0]);
  grant('meera@healthguard.demo', doctors[0]);
  grant('farhan@healthguard.demo', doctors[1]);
  grant('rohan@healthguard.demo', doctors[1], 30);

  save();

  // A short, genuine history in the ledger so the access timeline is not empty on first visit.
  const ip = '10.20.0.14';
  record({ actor: admin, action: 'system.init', ip, detail: { note: 'Ledger created' } });
  for (const [email, doctor] of [['rohan@healthguard.demo', doctors[0]], ['farhan@healthguard.demo', doctors[1]], ['ananya@healthguard.demo', doctors[0]], ['rohan@healthguard.demo', doctors[1]]]) {
    const p = byEmail[email];
    record({ actor: p, action: 'consent.grant', patientId: p.id, target: doctor.id, ip: '49.36.112.8', detail: { doctor: doctor.name } });
    record({ actor: doctor, action: 'record.read', patientId: p.id, ip, detail: { basis: 'consent' } });
  }
  record({ actor: doctors[0], action: 'record.write', patientId: byEmail['ananya@healthguard.demo'].id, ip, detail: { basis: 'consent' } });
  console.log(`[seed] Demo data created. Password for all demo accounts: ${DEMO_PASSWORD}`);
}
