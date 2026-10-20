# Multi-Device Setup Guide

This guide explains how to run the doctor and patient views on different laptops with real-time synchronization.

## 🎯 Overview

The system uses:
- **Firebase Firestore** for real-time data synchronization
- **Custom backend server** for network-based access control
- **ngrok** (optional) for exposing local server to internet
- **Firebase Hosting** (recommended) for production deployment

## 📋 Prerequisites

1. Backend server running on one machine
2. Firebase project configured
3. All devices have internet connection
4. Network access configured for both devices

## 🚀 Option 1: Local Network Setup (Same Wi-Fi)

Use one computer as the host. Start both the backend and Vite there; every device must open the host's LAN URL so they share that computer's backend and local record store.

1. Find the host's LAN IPv4 address (`ipconfig getifaddr en0` on macOS, `hostname -I` on Linux, or `ipconfig` on Windows), such as `192.168.1.43`.
2. On the host, run `cd healthcare-ai-security/server && npm start` in one terminal.
3. On the host, run `cd healthcare-ai-security && npm run dev` in a second terminal. Vite and the backend are configured to listen on the network.
4. On both doctor and patient devices, open `http://192.168.1.43:5173`, replacing the example with the host IP. The browser client automatically sends API requests to port `3001` on that same host.
5. If clients cannot connect, allow inbound TCP ports `5173` and `3001` in the host firewall and check that router client/AP isolation is off.

Do not run separate app copies on client devices for this same-Wi-Fi flow. The local JSON database is on the host only and is not encrypted; use fictional demo data. For real patient records, configure Firestore with appropriate access rules and deploy over HTTPS.

## 🌐 Option 2: ngrok (Testing Across Networks)

### Step 1: Install ngrok

Download from https://ngrok.com/download

### Step 2: Start Backend Server

```bash
cd server
npm start
```

### Step 3: Expose Server with ngrok

```bash
ngrok http 3001
```

You'll get a URL like: `https://abc123.ngrok.io`

### Step 4: Update Frontend API URL

On both laptops, update `src/api.js`:

```javascript
const API_BASE_URL = 'https://abc123.ngrok.io'; // Use your ngrok URL
```

### Step 5: Disable Network Validation (for testing)

Update `server/.env`:

```env
ALLOWED_NETWORKS=0.0.0.0/0  # Allow all IPs for testing
```

### Step 6: Start Frontend on Both Laptops

Same as Option 1, Step 4

## ☁️ Option 3: Firebase Hosting (Production - Recommended)

### Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Step 2: Login to Firebase

```bash
firebase login
```

### Step 3: Initialize Firebase Hosting

```bash
cd healthcare-ai-security
firebase init hosting
```

Select:
- Use existing project: `heathguard-ai`
- Public directory: `dist`
- Configure as single-page app: Yes
- Set up automatic builds: No

### Step 4: Build for Production

```bash
npm run build
```

### Step 5: Deploy to Firebase Hosting

```bash
firebase deploy
```

You'll get a URL like: `https://heathguard-ai.web.app`

### Step 6: Deploy Backend Server

Deploy your backend server to:
- **Heroku**: `heroku create healthcare-ai-server`
- **Railway**: `railway up`
- **Render**: Push to GitHub and connect
- **AWS/Azure/GCP**: Use their services

### Step 7: Update Frontend API URL

In production, update `src/api.js`:

```javascript
const API_BASE_URL = 'https://your-backend-url.com';
```

### Step 8: Configure Network Settings

Update `server/.env` with your actual network:

```env
ALLOWED_NETWORKS=192.168.1.0/24,10.0.0.0/8
ALLOWED_SSIDS=Hospital-WiFi,HealthGuard-Network
FACILITY_LAT=40.7128
FACILITY_LNG=-74.0060
FACILITY_RADIUS=0.01
```

## 🔥 Firebase Firestore Setup

### Step 1: Enable Firestore

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project: `heathguard-ai`
3. Go to Firestore Database
4. Click "Create Database"
5. Select location (closest to your users)
6. Choose "Start in Test Mode" (for development)

### Step 2: Set Firestore Rules

In Firebase Console → Firestore → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Step 3: Get Service Account Key

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Rename it to `service-account.json`
5. Place it in `server/` directory

### Step 4: Update Server .env

Add Firebase credentials to `server/.env`:

```env
FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=heathguard-ai
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-client-email@heathguard-ai.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-client-email%40heathguard-ai.iam.gserviceaccount.com
```

### Step 5: Restart Backend Server

```bash
cd server
npm start
```

You should see: `✅ Firebase Firestore connected for real-time sync`

## 📱 Real-Time Sync Implementation

### Doctor Dashboard (Add Record)

The doctor dashboard now automatically syncs changes to patient dashboards:

```javascript
import { addPatientRecord } from './realtime';

// When doctor adds a record
const handleAddRecord = async (patientId, recordData) => {
  const result = await addPatientRecord(patientId, recordData);
  if (result.success) {
    console.log('Record added and synced!');
  }
};
```

### Patient Dashboard (Real-time Listener)

The patient dashboard automatically receives updates:

```javascript
import { subscribeToPatientRecords } from './realtime';
import { useEffect } from 'react';

useEffect(() => {
  const unsubscribe = subscribeToPatientRecords(patientId, (records, error) => {
    if (error) {
      console.error('Sync error:', error);
      return;
    }
    setMedicalRecords(records); // Auto-updates UI
  });

  return () => unsubscribe(); // Cleanup on unmount
}, [patientId]);
```

## 🧪 Testing Real-Time Sync

### Test 1: Add Record Sync

1. Open doctor dashboard on Laptop 1
2. Open patient dashboard on Laptop 2
3. On doctor laptop, add a medical record
4. Within seconds, it appears on patient laptop

### Test 2: Update Record Sync

1. Doctor updates a record
2. Patient sees the updated version automatically

### Test 3: Delete Record Sync

1. Doctor deletes a record
2. Patient sees it removed automatically

## 🔧 Troubleshooting

### Real-time sync not working

**Check:**
1. Firebase Firestore is enabled
2. Service account key is correct
3. Backend server shows "Firebase Firestore connected"
4. Firestore rules allow read/write
5. Both devices have internet connection

**Solution:**
```bash
# Check server logs
cd server
npm start

# Look for: ✅ Firebase Firestore connected for real-time sync
```

### Network access denied

**Check:**
1. Device IP is in allowed range
2. Doctor is on correct Wi-Fi SSID
3. Patient location is within facility radius

**Solution:**
```env
# For testing, allow all IPs
ALLOWED_NETWORKS=0.0.0.0/0
```

### CORS errors

**Check:**
1. Backend server has CORS enabled
2. API URL is correct (http vs https)

**Solution:**
```javascript
// In server.js, ensure CORS is configured
app.use(cors({
  origin: '*' // or specific domains
}));
```

### ngrok connection issues

**Check:**
1. ngrok is running
2. ngrok URL is correct
3. Backend server is running on port 3001

**Solution:**
```bash
# Restart ngrok
ngrok http 3001
```

## 📊 Architecture Diagram

```
┌─────────────────┐         ┌─────────────────┐
│  Doctor Laptop  │         │ Patient Laptop  │
│  - React App    │         │  - React App    │
│  - Doctor View  │         │  - Patient View │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ Firebase Firestore (Real-time)
         │                           │
         └───────────┬───────────────┘
                     │
         ┌───────────▼───────────────┐
         │  Firebase Firestore       │
         │  - Real-time Sync         │
         │  - Data Storage          │
         └───────────┬───────────────┘
                     │
         ┌───────────▼───────────────┐
         │  Backend Server          │
         │  - Network Validation     │
         │  - Authentication         │
         │  - Role-based Access      │
         └───────────────────────────┘
```

## 🎯 Best Practices

### For Development
- Use ngrok for testing across networks
- Allow all IPs during development
- Use test mode in Firestore
- Monitor server logs

### For Production
- Deploy backend to cloud (Heroku/Railway/Render)
- Use Firebase Hosting for frontend
- Implement proper Firestore security rules
- Use strong network restrictions
- Enable monitoring and logging
- Use HTTPS everywhere
- Implement rate limiting

## 📚 Additional Resources

- Firebase Firestore: https://firebase.google.com/docs/firestore
- Firebase Hosting: https://firebase.google.com/docs/hosting
- ngrok Documentation: https://ngrok.com/docs
- React Real-time Sync: https://firebase.google.com/docs/firestore/quickstart

## 🆘 Support

If you encounter issues:

1. Check server logs for errors
2. Verify Firebase configuration
3. Test network connectivity
4. Check CORS settings
5. Review Firestore rules
6. Ensure both devices have internet

---

**Real-time sync is now enabled!** 🎉

Changes made on the doctor's laptop will automatically appear on the patient's laptop within seconds.
