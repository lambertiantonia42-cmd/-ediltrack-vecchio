// src/utils/logActivity.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { AZIENDA_ID } from "../appConfig";

export async function logActivity({ tipo, azione, cantiere = "", targetId = "", note = "" }) {
  const u = auth.currentUser;
  if (!u) return;

  await addDoc(collection(db, "attivita"), {
    aziendaId: AZIENDA_ID,
    tipo: String(tipo || "evento"),
    azione: String(azione || ""),
    cantiere: String(cantiere || ""),
    targetId: String(targetId || ""),
    note: String(note || ""),
    createdAt: serverTimestamp(),
    uid: u.uid,
    userEmail: u.email || "",
  });
}