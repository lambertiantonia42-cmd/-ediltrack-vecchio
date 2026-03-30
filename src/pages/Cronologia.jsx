import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { AZIENDA_ID } from "../appConfig";
import "./Cronologia.css";

function sortByCreatedAtDesc(a, b) {
  const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
  const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
  return tb - ta;
}

function formatDate(ts) {
  if (!ts?.toDate) return "-";
  return ts.toDate().toLocaleString("it-IT");
}

export default function Cronologia() {
  const [mese, setMese] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [tipo, setTipo] = useState("Tutti");
  const [utente, setUtente] = useState("");
  const [cantiere, setCantiere] = useState("");

  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      setErr("Non sei autenticato.");
      return;
    }

    setErr("");
    const qRef = query(
      collection(db, "activity_logs"),
      where("aziendaId", "==", AZIENDA_ID)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        all.sort(sortByCreatedAtDesc);
        setRows(all);
      },
      (e) => setErr(e?.message || "Errore lettura cronologia.")
    );

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const u = utente.trim().toLowerCase();
    const c = cantiere.trim().toLowerCase();

    return rows.filter((r) => {
      const iso = r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : "";
      const okMese = iso.startsWith(mese);

      const okTipo = tipo === "Tutti" || String(r.tipo || "") === tipo;

      const who = String(r.userEmail || r.userName || "").toLowerCase();
      const okUser = !u || who.includes(u);

      const can = String(r.cantiere || "").toLowerCase();
      const okCan = !c || can.includes(c);

      return okMese && okTipo && okUser && okCan;
    });
  }, [rows, mese, tipo, utente, cantiere]);

  return (
    <div className="cron-wrap">
      <div className="panel">
        <h2>🕘 Cronologia attività</h2>

        {err && <div className="error">{err}</div>}

        <div className="cron-filters">
          <div className="field">
            <label>Mese</label>
            <input type="month" value={mese} onChange={(e) => setMese(e.target.value)} />
          </div>

          <div className="field">
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="Tutti">Tutti</option>
              <option value="presenza">Presenze</option>
              <option value="spesa">Spese</option>
              <option value="cantiere">Cantieri</option>
              <option value="auth">Accessi</option>
            </select>
          </div>

          <div className="field">
            <label>Utente (opz.)</label>
            <input value={utente} onChange={(e) => setUtente(e.target.value)} placeholder="Es. giupy / gmail..." />
          </div>

          <div className="field">
            <label>Cantiere (opz.)</label>
            <input value={cantiere} onChange={(e) => setCantiere(e.target.value)} placeholder="Es. via apollo..." />
          </div>
        </div>

        <table className="table" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Data/Ora</th>
              <th>Tipo</th>
              <th>Azione</th>
              <th>Cantiere</th>
              <th>Utente</th>
              <th>Dettaglio</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ opacity: 0.7, padding: 12 }}>
                  Nessuna attività per i filtri selezionati.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>{r.tipo || "-"}</td>
                  <td>{r.azione || "-"}</td>
                  <td>{r.cantiere || "—"}</td>
                  <td>{r.userEmail || r.userName || "—"}</td>
                  <td style={{ opacity: 0.9 }}>{r.note || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}