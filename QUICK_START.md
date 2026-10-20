# Quick Start: Multi-Device Real-Time Sync

## Keep local demo records after refresh or restart

When Firebase is not configured, the backend saves local demo accounts and records in `server/data/local-demo-store.json` and reloads them before serving requests. The data file is excluded from Git and created with owner-only file permissions. This local demo file is not encrypted and may contain passwords and health details; use fictional demo data only. For real or shared production data, configure Firebase/Firestore instead.

## Enable “Ask AI” report analysis

The Ask AI panel explains saved patient records and can suggest general healthy-living habits. By default it uses Gemini's free-tier API model. Free-tier quotas are limited and may change; Google says free-tier prompts may be used to improve its products. Use fictional demo records only unless your organization has approved the provider and data flow for real patient information.

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Add `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL=gemini-3.1-flash-lite` to `server/.env` (see `server/.env.example`). Keep the key on the backend; never put it in frontend files.
3. Restart the backend with `cd server && npm start`.
4. Open a patient record with saved entries. Confirm the consent checkbox, then select **Analyze report**.

To use OpenAI instead, set `AI_PROVIDER=openai` and configure `OPENAI_API_KEY` plus an enabled `OPENAI_MODEL`. Without a configured provider key, the app shows a setup message and does not return a simulated analysis.

## 🚀 Same-Wi-Fi Setup (one host computer)

Run the backend and Vite on the computer that owns the saved local demo data. Other devices open that computer's LAN address, so all clients talk to the same backend and record store. Do not start a separate backend or Vite server on the patient device.

1. Connect the host computer and client devices to the same Wi-Fi.
2. Find the host computer's LAN IPv4 address (macOS/Linux: `ipconfig getifaddr en0` or `hostname -I`; Windows: `ipconfig`). Example: `192.168.1.43`.
3. On the host computer, start the backend in one terminal:

   ```bash
   cd healthcare-ai-security/server
   npm start
   ```

4. Start Vite in another terminal on the host computer:

   ```bash
   cd healthcare-ai-security
   npm run dev
   ```

5. On every device, open `http://192.168.1.43:5173`, replacing the example IP with the host's LAN IP. The API client uses the page's host name to reach port `3001` automatically; no per-device code edit is needed.

On the host itself, `http://localhost:5173` also works. If another device cannot connect, allow inbound TCP connections to ports `5173` and `3001` in the host firewall and confirm the Wi-Fi router does not have client/AP isolation enabled. If the router uses a `192.168.0.x` network, add its matching subnet to `ALLOWED_NETWORKS` in `server/.env` if running with `NODE_ENV=production`.

This local-file setup shares data only while clients use this one running backend; it is not a secure production deployment. Use fictional demo data. For real patient records or access from outside the Wi-Fi, configure a properly secured shared database and HTTPS deployment.

## 🌐 For Different Networks (Use ngrok)

### Step 1: Install ngrok

Download from: https://ngrok.com/download

### Step 2: Start Backend Server

```bash
cd server
npm start
```

### Step 3: Expose with ngrok

```bash
ngrok http 3001
```

Copy the URL (e.g., `https://abc123.ngrok.io`)

### Step 4: Update API URL on Both Laptops

Edit `src/api.js` on BOTH laptops:

```javascript
const API_BASE_URL = 'https://abc123.ngrok.io'; // Use your ngrok URL
```

### Step 5: Allow All IPs (for testing)

Edit `server/.env`:

```env
ALLOWED_NETWORKS=0.0.0.0/0
```

Restart server:
```bash
cd server
npm start
```

### Step 6: Start Frontend on Both Laptops

Same as Step 4 above

## 🔥 Enable Real-Time Sync with Firebase

### Step 1: Enable Firestore

1. Go to https://console.firebase.google.com
2. Select your project: `heathguard-ai`
3. Go to Firestore Database → Create Database
4. Choose "Start in Test Mode"

### Step 2: Get Service Account Key

1. Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download and save as `server/service-account.json`

### Step 3: Add Firebase Credentials to .env

Edit `server/.env` and add:

```env
FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=heathguard-ai
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-email@heathguard-ai.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
```

### Step 4: Restart Server

```bash
cd server
npm start
```

You should see: `✅ Firebase Firestore connected for real-time sync`

### Step 5: Test Real-Time Sync

Now when you add records on the doctor laptop, they will:
- Save to Firebase Firestore
- Automatically sync to patient laptop
- Update UI in real-time

## ✅ Verification Checklist

- [ ] Backend server running on Laptop 1
- [ ] Frontend running on both laptops
- [ ] API URL updated on both laptops
- [ ] Can login as Doctor on Laptop 1
- [ ] Can login as Patient on Laptop 2
- [ ] Firebase Firestore enabled (for real-time sync)
- [ ] Real-time sync working (changes appear on both laptops)

## 🆘 Common Issues

### "Network access denied"

**Solution:** Update `server/.env`:
```env
ALLOWED_NETWORKS=0.0.0.0/0
```

### "Connection refused"

**Solution:** Check backend server is running:
```bash
cd server
npm start
```

### Real-time sync not working

**Solution:** Check server logs for:
```
✅ Firebase Firestore connected for real-time sync
```

If not, verify Firebase credentials in `.env`

### CORS errors

**Solution:** Backend already has CORS enabled. If still issues, check API URL protocol (http vs https)

## 📚 Full Documentation

- **Multi-Device Setup:** <ref_file file="/Users/pranjalpanwarsitgmail.com/healthcare-ai-security/MULTI_DEVICE_SETUP.md" />
- **Network Setup:** <ref_file file="/Users/pranjalpanwarsitgmail.com/healthcare-ai-security/NETWORK_SETUP.md" />
- **Implementation Summary:** <ref_file file="/Users/pranjalpanwarsitgmail.com/healthcare-ai-security/IMPLEMENTATION_SUMMARY.md" />

---

**Ready to go!** 🎉

Start with the "Same Wi-Fi Network" option for the quickest setup.
