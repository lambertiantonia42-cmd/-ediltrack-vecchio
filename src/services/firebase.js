import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAnTQOeZaVngVwR1Fi_hAhugoQSQL5fxmo",
  authDomain: "diario-ditta.firebaseapp.com",
  projectId: "diario-ditta",
  storageBucket: "diario-ditta.firebasestorage.app",
  messagingSenderId: "308468209568",
  appId: "1:308468209568:web:0e67db649bb5f30706f6c5",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);