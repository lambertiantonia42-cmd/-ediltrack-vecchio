// src/pages/CantiereDettaglio.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../services/firebase";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import "./Cantieri.css";
import { AZIENDA_ID } from "../appConfig";

function sortByDataDesc(a, b) {
  const da = String(a.data || "");
  const dbb = String(b.data || "");
  if (da !== dbb) return dbb.localeCompare(da);

  const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
  const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
  return tb - ta;
}

export default function CantiereDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [cantiere, setCantiere] = useState(null);
  const [presenze, setPresenze] = useState([]);
  const [spese, setSpese] = useState([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("riepilogo");

  /* =========================
     DOCUMENTO CANTIERE (multi-utente: aziendaId)
  ==========================*/
  useEffect(() => {
    if (!id) return;

    let alive = true;

    (async () => {
      try {
        setErr("");
        const u = auth.currentUser;
        if (!u) {
          setErr("Non sei autenticato.");
          return;
        }

        const ref = doc(db, "cantieri", id);
        const snap = await getDoc(ref);

        if (!alive) return;

        if (!snap.exists()) {
          setErr("Cantiere non trovato.");
          setCantiere(null);
          return;
        }

        const data = { id: snap.id, ...snap.data() };

        // sicurezza: se non è della stessa azienda, blocca
        if (data.aziendaId && data.aziendaId !== AZIENDA_ID) {
          setErr("Non hai accesso a questo cantiere.");
          setCantiere(null);
          return;
        }

        setCantiere(data);
      } catch (e) {
        console.log(e);
        setErr(e?.message || "Errore caricamento cantiere.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const nomeCantiere = (cantiere?.nome || "").trim();
  const stato = cantiere?.stato || "";

  /* =========================
     PRESENZE (multi-utente: aziendaId + filtro locale per nome cantiere)
     NO orderBy => no index
  ==========================*/
  useEffect(() => {
    if (!nomeCantiere) return;

    const qRef = query(
      collection(db, "presenze"),
      where("aziendaId", "==", AZIENDA_ID),
      limit(800)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // filtro per nome cantiere (come il tuo modello attuale)
        const filtrate = all
          .filter((r) => String(r.cantiere || "").trim() === nomeCantiere)
          .sort(sortByDataDesc);
        setPresenze(filtrate);
      },
      (error) => {
        console.log("presenze snapshot error:", error);
        setErr(error?.message || "Errore lettura presenze.");
      }
    );

    return () => unsub();
  }, [nomeCantiere]);

  /* =========================
     SPESE (multi-utente: aziendaId + filtro locale per nome cantiere)
     NO orderBy => no index
  ==========================*/
  useEffect(() => {
    if (!nomeCantiere) return;

    const qRef = query(
      collection(db, "spese"),
      where("aziendaId", "==", AZIENDA_ID),
      limit(800)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtrate = all
          .filter((r) => String(r.cantiere || "").trim() === nomeCantiere)
          .sort(sortByDataDesc);
        setSpese(filtrate);
      },
      (error) => {
        console.log("spese snapshot error:", error);
        setErr(error?.message || "Errore lettura spese.");
      }
    );

    return () => unsub();
  }, [nomeCantiere]);

  /* =========================
     TOTALI
  ==========================*/
  const totaleSpese = useMemo(
    () => spese.reduce((sum, r) => sum + Number(r.importo || 0), 0),
    [spese]
  );

  const totaleGiornate = useMemo(() => {
    const intere = presenze.filter((p) => Number(p.giornata) === 1).length;
    const mezze = presenze.filter((p) => Number(p.giornata) === 0.5).length;
    return intere + mezze * 0.5;
  }, [presenze]);

  const operaiUnici = useMemo(() => {
    const uniq = new Set(
      presenze.map((p) => (p.dipendente || "").trim()).filter(Boolean)
    );
    return Array.from(uniq);
  }, [presenze]);

  return (
    <div className="cantieri-wrap">
      <div className="panel cantiere-detail-panel">
        <div className="detail-topbar">
          <button className="btn-ghost" type="button" onClick={() => navigate(-1)}>
            ← Indietro
          </button>

          <h2>🏗 {nomeCantiere || "Caricamento..."}</h2>
          {stato && <span className="status-pill">{stato}</span>}
        </div>

        {err && <div className="error">{err}</div>}

        <div className="tabs">
          <button className={tab === "riepilogo" ? "active" : ""} onClick={() => setTab("riepilogo")}>
            Riepilogo
          </button>
          <button className={tab === "presenze" ? "active" : ""} onClick={() => setTab("presenze")}>
            Presenze ({presenze.length})
          </button>
          <button className={tab === "spese" ? "active" : ""} onClick={() => setTab("spese")}>
            Spese ({spese.length})
          </button>
        </div>

        {tab === "riepilogo" && (
          <div className="stats-grid">
            <div className="stat-card">
              <div>Totale spese</div>
              <b>€ {totaleSpese.toFixed(2)}</b>
            </div>
            <div className="stat-card">
              <div>Totale giornate</div>
              <b>{totaleGiornate}</b>
            </div>
            <div className="stat-card">
              <div>Operai</div>
              <b>{operaiUnici.length}</b>
            </div>
          </div>
        )}

        {tab === "presenze" && (
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Dipendente</th>
                <th>Giornata</th>
                <th>Orario</th>
                <th>Attività</th>
              </tr>
            </thead>
            <tbody>
              {presenze.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.7 }}>
                    Nessuna presenza per questo cantiere.
                  </td>
                </tr>
              ) : (
                presenze.map((r) => (
                  <tr key={r.id}>
                    <td>{r.data}</td>
                    <td>{r.dipendente}</td>
                    <td>{Number(r.giornata) === 1 ? "Intera" : "Mezza"}</td>
                    <td>{r.orario || "-"}</td>
                    <td>{r.attivita || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === "spese" && (
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Fornitore</th>
                <th>Descrizione</th>
                <th>Pagamento</th>
                <th>Importo</th>
              </tr>
            </thead>
            <tbody>
              {spese.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.7 }}>
                    Nessuna spesa per questo cantiere.
                  </td>
                </tr>
              ) : (
                spese.map((r) => (
                  <tr key={r.id}>
                    <td>{r.data}</td>
                    <td>{r.fornitore || "-"}</td>
                    <td>{r.descrizione || "-"}</td>
                    <td>{r.pagamento || "-"}</td>
                    <td>€ {Number(r.importo || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}