import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {

  apiKey: "AIzaSyDTbA1vOGpNELb7ifEC3EKiDVKJeqweVgU",
  authDomain: "heathguard-ai.firebaseapp.com",
  projectId: "heathguard-ai",
  storageBucket: "heathguard-ai.firebasestorage.app",
  messagingSenderId: "574051337756",
  appId: "1:574051337756:web:61ed715b140b0915d701d9",
  measurementId: "G-JX1RX6HL02"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

export { auth, googleProvider, getRedirectResult, signInWithPopup, signInWithRedirect, signOut, db };
