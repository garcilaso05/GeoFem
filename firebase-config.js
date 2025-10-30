import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWtoOXGz_5Vsjm_Fl5r1nXy10Ndm9pVzI",
  authDomain: "controlaccesogeofem.firebaseapp.com",
  projectId: "controlaccesogeofem",
  storageBucket: "controlaccesogeofem.firebasestorage.app",
  messagingSenderId: "437321658663",
  appId: "1:437321658663:web:ab624f84423ef039d33902",
  measurementId: "G-N19B742VNB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export { auth, db, analytics };
