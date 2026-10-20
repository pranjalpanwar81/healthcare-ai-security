# Firebase Setup Instructions

To enable Google Authentication for your HealthGuard AI application, you need to set up a Firebase project.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" 
3. Enter a project name (e.g., "healthguard-ai")
4. Follow the setup wizard (you can disable Google Analytics for this project)

## Step 2: Enable Google Authentication

1. In your Firebase project, go to "Authentication" → "Sign-in method"
2. Click on "Google" 
3. Enable the Google sign-in method
4. Add your project support email
5. Click "Save"

## Step 3: Get Firebase Configuration

1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click on the web icon (`</>`)
4. Register your app (name it "HealthGuard AI")
5. Copy the firebaseConfig object

## Step 4: Update Firebase Configuration

Replace the placeholder config in `src/firebaseConfig.js` with your actual Firebase configuration:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Step 5: Add Authorized Domains

1. In Firebase Console, go to Authentication → Settings
2. Under "Authorized domains", add:
   - `localhost:5173` (for development)
   - Your production domain when deployed

## Step 6: Test the Application

1. Restart your development server: `npm run dev`
2. Navigate to `http://localhost:5173`
3. You should see the login page
4. Click "Sign in with Google" to test authentication

## Notes

- Make sure your Google account has Google+ API enabled
- For production, you'll need to add your production domain to authorized domains
- The Firebase free tier should be sufficient for development and testing