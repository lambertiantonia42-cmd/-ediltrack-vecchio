import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../services/firebase";
import { AZIENDA_ID } from "../appConfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

export default function Conteggi() {
  const navigate = useNavigate();
  const [operai, setOperai] = useState([]);
  const [presenze, setPresenze] = useState([]);
  const [acconti, setAcconti] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [operaioSel, setOperaioSel] = useState("");
  const [importo, setImporto] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [tipoPagamento, setTipoPagamento] = useState("Acconto");
  const [meseSelezionato, setMeseSelezionato] = useState(
    new Date().toISOString().slice(0,7) // YYYY-MM
  );

  useEffect(() => {
    const qO = query(collection(db, "operai"), where("aziendaId", "==", AZIENDA_ID));
    const unsubO = onSnapshot(qO, snap => setOperai(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const qP = query(collection(db, "presenze"), where("aziendaId", "==", AZIENDA_ID));
    const unsubP = onSnapshot(qP, snap => setPresenze(snap.docs.map(d => d.data())));
    const qA = query(collection(db, "acconti"), where("aziendaId", "==", AZIENDA_ID));
    const unsubA = onSnapshot(qA, snap => setAcconti(snap.docs.map(d => d.data())));
    return () => { unsubO(); unsubP(); unsubA(); };
  }, []);

  function getMese(dataStr){
    if(!dataStr) return "";
    return dataStr.slice(0,7);
  }

  const dati = useMemo(() => {
    return operai
      .filter(o => o.stato !== "cessato")
      .map(o => {
        const nome = o.nome;
        const presenzeOp = presenze.filter(p =>
          p.dipendente === nome && getMese(p.data) === meseSelezionato
        );
        const ggI = presenzeOp.filter(p => Number(p.giornata) === 1).length;
        const ggM = presenzeOp.filter(p => Number(p.giornata) === 0.5).length;
        const guadagno = (ggI * (o.pagaGiornaliera || 0)) + (ggM * ((o.pagaGiornaliera || 0) / 2));
        const pagato = acconti
          .filter(a =>
            a.dipendente === nome &&
            (a.meseCompetenza
              ? a.meseCompetenza === meseSelezionato
              : getMese(a.data) === meseSelezionato)
          )
          .reduce((sum, a) => sum + Number(a.importo || 0), 0);
        return { id: o.id, nome, giorni: ggI + (ggM * 0.5), guadagno, acconti: pagato, saldo: guadagno - pagato };
      });
  }, [operai, presenze, acconti, meseSelezionato]);

  async function salvaAcconto() {
    if (!importo || !operaioSel) return;
    await addDoc(collection(db, "acconti"), {
      aziendaId: AZIENDA_ID,
      operaioId: operai.find(o => o.nome === operaioSel)?.id || "",
      dipendente: operaioSel,
      importo: Number(importo),
      tipo: tipoPagamento.toLowerCase(),
      descrizione: descrizione || "",
      data: data,
      meseCompetenza: meseSelezionato,
      createdAt: serverTimestamp()
    });
    console.log("Acconto salvato:", {
      dipendente: operaioSel,
      importo,
      data
    });
    setShowModal(false);
    setImporto("");
    setDescrizione("");
  }

  return (
    <div className="conteggi-container">
      <div className="conteggi-card">
      <style>{`
        .conteggi-container {
          padding: 30px;
          background: #0f172a;
          min-height: 100vh;
          color: #f8fafc;
          font-family: 'Inter', sans-serif;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .conteggi-card {
          width: 100%;
          max-width: 1200px;
          background: #1e293b;
          border-radius: 22px;
          padding: 30px;
          border: 1px solid #334155;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
          overflow: hidden;
        }
        .conteggi-card::before{
          content:"";
          position:absolute;
        }

        .header-dash { margin-bottom: 30px; }
        .header-dash h1 { font-size: 28px; color: #fbbf24; margin: 0; }
        
        .stats-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 20px; 
          margin-bottom: 40px; 
        }

        .stat-card { 
          background: #1e293b; 
          padding: 24px; 
          border-radius: 12px; 
          border: 1px solid #334155;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .stat-card label { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 10px; text-transform: uppercase; font-weight: 700; }
        .stat-card b { font-size: 24px; color: #fff; }

        /* LISTA */
        .list-box {
          background: #1e293b;
          border-radius: 18px;
          border: 1px solid #334155;
          overflow: hidden;
        }

        .list-header {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr 1.5fr 1.5fr;
          padding: 18px 25px;
          background: #334155;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          border-top-left-radius: 18px;
          border-top-right-radius: 18px;
        }

        .list-row {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr 1.5fr 1.5fr;
          padding: 20px 25px;
          align-items: center;
          border-bottom: 1px solid #334155;
          transition: all .2s ease;
        }
        .list-row:hover {
          background: rgba(255,255,255,0.04);
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(251,191,36,0.15);
          border-bottom: 1px solid transparent;
        }

        .list-row:last-child{
          border-bottom: none;
        }

        /* MODALE - CORRETTO */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .modal-box {
          background: #1e293b;
          width: 100%;
          max-width: 450px;
          padding: 35px;
          border-radius: 16px;
          border: 1px solid #475569;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 30px;
        }

        .btn-cancel {
          flex: 1;
          padding: 12px;
          background: #334155;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-confirm {
          flex: 2;
          padding: 12px;
          background: #22c55e;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .saldo-tag { padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 12px; }
        .tag-red { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .tag-green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }

        .btn-table { background: #334155; color: #fff; border: 1px solid #475569; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; }
        .btn-pay { background: #fbbf24; color: #000 !important; border: none; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 700; }
        
        .toggle-box { display: flex; gap: 8px; background: #0f172a; padding: 5px; border-radius: 12px; margin-bottom: 20px; }
        .toggle-box button { flex: 1; padding: 10px; border: none; border-radius: 10px; background: transparent; color: #94a3b8; cursor: pointer; font-weight: 600; }
        .toggle-box button.active { background: #fbbf24; color: #000; }

        input { background: #0f172a; border: 1px solid #334155; color: #fff; padding: 12px; border-radius: 10px; width: 100%; box-sizing: border-box; outline: none; margin-bottom: 10px; }

        /* MOBILE FIX */
        @media (max-width: 768px) {

          .list-header {
            display: none;
          }

          .list-row {
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 16px;
          }

          .list-row > div {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
          }

          .list-row > div:first-child {
            justify-content: flex-start;
            gap: 10px;
          }

          .list-row span {
            font-size: 14px !important;
          }

          .saldo-tag {
            font-size: 12px;
            padding: 4px 8px;
          }

          .btn-table,
          .btn-pay {
            font-size: 12px;
            padding: 6px 10px;
          }

          /* LABELS MOBILE */
          .list-row {
            gap: 12px;
          }

          .list-row > div {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          /* Giorni lavorati */
          .list-row > div:nth-child(2)::before {
            content: "Giorni lavorati:";
            font-weight: 600;
            color: #94a3b8;
          }

          /* Guadagno */
          .list-row > div:nth-child(3)::before {
            content: "Guadagno:";
            font-weight: 600;
            color: #94a3b8;
          }

          /* Pagati */
          .list-row > div:nth-child(4)::before {
            content: "Pagati:";
            font-weight: 600;
            color: #94a3b8;
          }

          /* Da saldare */
          .list-row > div:nth-child(5)::before {
            content: "Da saldare:";
            font-weight: 600;
            color: #94a3b8;
          }

          /* Spazio tra label e valore */
          .list-row > div::before {
            margin-right: 10px;
          }
        }

        .month-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .month-btn {
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid #334155;
          background: #0f172a;
          color: #94a3b8;
          cursor: pointer;
          font-size: 13px;
        }

        .month-btn.active {
          background: #fbbf24;
          color: #000;
          font-weight: 700;
        }

        .mobile-month {
          display: none;
        }

        @media (max-width: 768px) {
          .month-bar {
            display: none;
          }

          .mobile-month {
            display: block;
            margin-bottom: 20px;
          }
        }
      `}</style>

      <div className="header-dash">
        <h1>💰 Conteggi Operai</h1>
        <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "5px" }}>Situazione economica aggiornata al {new Date().toLocaleDateString('it-IT')}</p>
      </div>

      {/* MOBILE */}
      <div className="mobile-month">
        <input
          type="month"
          value={meseSelezionato}
          onChange={e => setMeseSelezionato(e.target.value)}
        />
      </div>

      {/* DESKTOP */}
      <div className="month-bar">
        {[
          "01","02","03","04","05","06",
          "07","08","09","10","11","12"
        ].map(m => {
          const anno = new Date().getFullYear();
          const value = `${anno}-${m}`;
          const mesi = [
            "Gen","Feb","Mar","Apr","Mag","Giu",
            "Lug","Ago","Set","Ott","Nov","Dic"
          ];
          return (
            <button
              key={m}
              className={`month-btn ${meseSelezionato === value ? "active" : ""}`}
              onClick={() => setMeseSelezionato(value)}
            >
              {mesi[Number(m)-1]}
            </button>
          );
        })}
      </div>

      <div className="list-box">
        <div className="list-header">
          <span>OPERAIO</span>
          <span>PRESENZE</span>
          <span>GUADAGNO</span>
          <span>ACCONTI</span>
          <span>SALDO</span>
          <span style={{ textAlign: "right" }}>AZIONI</span>
        </div>

        {dati.map((o) => (
          <div key={o.id} className="list-row">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "20px" }}>👷</span>
              <div style={{ fontWeight: "700", color: "#fff" }}>{o.nome}</div>
            </div>
            <div><span style={{ color: "#38bdf8", fontWeight: "700" }}>{o.giorni} gg</span></div>
            <div style={{ color: "#fff" }}>€ {o.guadagno.toFixed(2)}</div>
            <div style={{ color: "#22c55e" }}>€ {o.acconti.toFixed(2)}</div>
            <div>
              <span className={`saldo-tag ${o.saldo > 0 ? "tag-red" : "tag-green"}`}>
                {o.saldo > 0 ? `€ ${o.saldo.toFixed(2)}` : "SALDATO"}
              </span>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-table" onClick={() => navigate(`/conteggi/${o.nome}`)}>Scheda</button>
              <button className="btn-pay" onClick={() => { setOperaioSel(o.nome); setShowModal(true); }}>Paga</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h2 style={{ marginBottom: "10px", color: "#fff" }}>Registra Versamento</h2>
            <p style={{ color: "#94a3b8", marginBottom: "25px" }}>Versamento per: <b style={{ color: "#fbbf24" }}>{operaioSel}</b></p>

            <div className="toggle-box">
               <button className={tipoPagamento === "Acconto" ? "active" : ""} onClick={() => setTipoPagamento("Acconto")}>Acconto</button>
               <button className={tipoPagamento === "Saldo" ? "active" : ""} onClick={() => setTipoPagamento("Saldo")}>Saldo Mese</button>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <input type="date" value={data} onChange={e => setData(e.target.value)} />
              <input type="number" placeholder="Importo €" value={importo} onChange={e => setImporto(e.target.value)} />
            </div>

            <input type="text" placeholder="Note facoltative" value={descrizione} onChange={e => setDescrizione(e.target.value)} />

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn-confirm" onClick={salvaAcconto}>Conferma</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}