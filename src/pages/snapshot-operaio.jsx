import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../services/firebase";
import { AZIENDA_ID } from "../appConfig";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc
} from "firebase/firestore";

export default function SnapshotOperaio() {
  function formatDateIT(dateStr){
    if(!dateStr) return "";
    const d = new Date(dateStr);
    if(isNaN(d)) return dateStr;
    return d.toLocaleDateString("it-IT");
  }
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [reportMensile, setReportMensile] = useState({});
  const [riepilogoGenerale, setRiepilogoGenerale] = useState({ giorni: 0, pagato: 0, acconti: 0 });
  const [meseAperto, setMeseAperto] = useState(null);
  const [annoFiltro, setAnnoFiltro] = useState(new Date().getFullYear().toString());

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const nomeParam = params.get("nome");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        if (!id) return;

        // 1. RECUPERO SNAPSHOT CESSAZIONE
        const qSnap = query(
          collection(db, "cessatiSnapshot"),
          where("operaioId", "==", id),
          where("aziendaId", "==", AZIENDA_ID)
        );
        const snapRes = await getDocs(qSnap);
        const snapData = !snapRes.empty ? snapRes.docs[0].data() : null;
        setSnapshot(snapData);

        // NOTA: snapshot NON contiene sempre la paga aggiornata
        // quindi leggiamo direttamente da "operai"
        // 🔥 PRENDE DATI OPERAIO REALI (IMPORTANTISSIMO)
        let operaioData = null;

        try {
          const operaioRef = doc(db, "operai", id);
          const operaioSnap = await getDoc(operaioRef);

          if (operaioSnap.exists()) {
            operaioData = operaioSnap.data();
          }
        } catch (e) {
          console.warn("Errore lettura operaio:", e);
        }

        // 🔥 fallback paga globale operaio
        const pagaOperaio = operaioData?.pagaGiornaliera || operaioData?.paga || 0;

        const nomeRif = (snapData?.nome || nomeParam || "").toLowerCase().trim();

        // 2. RECUPERO PRESENZE (Come da tua foto)
        const presenzeQ = query(collection(db, "presenze"), where("aziendaId", "==", AZIENDA_ID));
        const presenzeSnap = await getDocs(presenzeQ);

        const stats = {};

        presenzeSnap.docs.forEach(doc => {
          const p = doc.data();
          const nomeDoc = (p.dipendente || "").toLowerCase().trim();

          // Filtro per nome o per ID
          if (nomeDoc.includes(nomeRif) || nomeRif.includes(nomeDoc) || p.operaioId === id) {
            const mese = p.data?.slice(0, 7); 
            if (!mese) return;

            if (!stats[mese]) {
              stats[mese] = { giorni: 0, maturato: 0, pagato: 0, dettagli: [], pagamenti: [] };
            }

            // Dati dalla tua foto: 'giornata' (0.5, 1, ecc.)
            const valoreGiornata = Number(p.giornata ?? 1);
            // Logica migliorata per pagaBase
            let pagaBase = p.pagaGiornaliera;

            // 🔥 FIX: usa SEMPRE la paga dell'operaio se la presenza non ce l'ha
            if (!pagaBase || pagaBase === 0) {
              pagaBase = pagaOperaio;
            }

            // fallback snapshot (ultima spiaggia)
            if (!pagaBase || pagaBase === 0) {
              pagaBase = snapData?.pagaGiornaliera || snapData?.pagaBase || snapData?.paga || 0;
            }

            stats[mese].giorni += valoreGiornata;
            stats[mese].maturato += (valoreGiornata * pagaBase);
            stats[mese].dettagli.push({
              data: p.data,
              cantiere: p.cantiereNome || p.cantiere || "N/D",
              giornata: valoreGiornata,
              importo: valoreGiornata * pagaBase,
              _debugPaga: pagaBase
            });
          }
        });

        // 3. RECUPERO ACCONTI (I pagamenti che hai fatto)
        const accontiQ = query(collection(db, "acconti"), where("aziendaId", "==", AZIENDA_ID));
        const accontiSnap = await getDocs(accontiQ);

        accontiSnap.docs.forEach(doc => {
          const a = doc.data();

          const nomeAcconto = (a.nome || a.operaioNome || a.dipendente || "").toLowerCase().trim();
          const nomeTarget = (snapData?.nome || nomeParam || "").toLowerCase().trim();

          // 🔥 FIX: filtra SOLO acconti di questo operaio
          if (!(a.operaioId === id || nomeAcconto === nomeTarget)) return;

          let mese = null;

          if (typeof a.data === "string") {
            mese = a.data.slice(0, 7);
          } else if (a.data?.seconds) {
            const d = new Date(a.data.seconds * 1000);
            mese = d.toISOString().slice(0, 7);
          } else if (a.createdAt?.seconds) {
            const d = new Date(a.createdAt.seconds * 1000);
            mese = d.toISOString().slice(0, 7);
          }

          if (!mese) return;

          if (!stats[mese]) {
            stats[mese] = { giorni: 0, maturato: 0, pagato: 0, dettagli: [], pagamenti: [] };
          }

          const importo = Number(a.importo || 0);

          // salva totale pagato
          stats[mese].pagato += importo;

          // salva dettaglio pagamento
          let dataPagamento = "";

          if (typeof a.data === "string") {
            dataPagamento = a.data;
          } else if (a.data?.seconds) {
            dataPagamento = new Date(a.data.seconds * 1000).toISOString().slice(0,10);
          } else if (a.createdAt?.seconds) {
            dataPagamento = new Date(a.createdAt.seconds * 1000).toISOString().slice(0,10);
          }

          stats[mese].pagamenti.push({
            data: dataPagamento,
            importo
          });
        });

        setReportMensile(stats);

        // 4. CALCOLO RIEPILOGO FINALE
        const totali = Object.values(stats).reduce((acc, m) => ({
          giorni: acc.giorni + m.giorni,
          pagato: acc.pagato + m.maturato, // totale maturato
          acconti: acc.acconti + m.pagato   // totale pagato realmente
        }), { giorni: 0, pagato: 0, acconti: 0 });

        setRiepilogoGenerale(totali);

      } catch (err) {
        console.error("Errore nel caricamento:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, AZIENDA_ID, nomeParam]);

  if (loading) return <div className="card">Caricamento in corso...</div>;

  return (
    <div className="card" style={{ color: "#fff", background: "#121212", padding: "20px", borderRadius: "12px" }}>
      <button
        className="btn-ghost"
        style={{
          position: "relative",
          marginBottom: "15px",
          zIndex: 9999,
          color: "#aaa",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.1)"
        }}
        onClick={() => window.history.back()}
      >
        ← Indietro
      </button>

      <h2 style={{ marginBottom: "5px" }}>📊 Report Finale: {snapshot?.nome || nomeParam}</h2>
      <p style={{ opacity: 0.6, marginBottom: "30px" }}>Dati estratti dal registro presenze e pagamenti</p>

      {/* BOX RIEPILOGO GENERALE */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "15px", marginBottom: "40px" }}>
        <div style={statBox}><span>Giorni Totali</span><b>{riepilogoGenerale.giorni}</b></div>
        <div style={statBox}><span>Tot. Guadagnato</span><b>€ {riepilogoGenerale.pagato.toFixed(2)}</b></div>
        <div style={statBox}><span>Tot. Pagato</span><b style={{color: "#4caf50"}}>€ {riepilogoGenerale.acconti.toFixed(2)}</b></div>
        <div style={{...statBox, border: "1px solid #ffc107", background: "rgba(255,193,7,0.05)"}}>
          <span>Saldo Residuo</span>
          <b style={{color: "#ffc107"}}>€ {(riepilogoGenerale.pagato - riepilogoGenerale.acconti).toFixed(2)}</b>
        </div>
      </div>

      {/* ➕ AGGIUNTA PAGAMENTO VELOCE */}
      <div style={{
        marginBottom: "30px",
        padding: "15px",
        border: "1px solid #333",
        borderRadius: "10px",
        background: "#1a1a1a"
      }}>
        <h4 style={{ marginBottom: "10px" }}>➕ Registra pagamento</h4>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            type="number"
            placeholder="Importo €"
            id="importoPagamento"
            style={{
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid #333",
              background: "#121212",
              color: "#fff"
            }}
          />

          <button
            onClick={async () => {
              const input = document.getElementById("importoPagamento");
              const importo = Number(input.value);

              if (!importo) return alert("Inserisci importo valido");

              try {
                await addDoc(collection(db, "acconti"), {
                  aziendaId: AZIENDA_ID,
                  operaioId: id,
                  nome: snapshot?.nome || nomeParam,
                  importo,
                  data: new Date().toISOString().slice(0,10),
                  createdAt: new Date()
                });

                alert("Pagamento salvato");
                window.location.reload();

              } catch (err) {
                console.error(err);
                alert("Errore salvataggio");
              }
            }}
            style={{
              background: "#ffc107",
              border: "none",
              padding: "8px 14px",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            Salva pagamento
          </button>
        </div>
      </div>

      <h3 style={{ marginBottom: "20px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>Analisi Mensile</h3>

      {Object.entries(reportMensile)
        .sort((a, b) => b[0].localeCompare(a[0])) // Ordina dal mese più recente
        .map(([mese, data]) => {
          const labelMese = new Date(mese + "-01").toLocaleDateString("it-IT", { month: "long", year: "numeric" });
          const saldo = data.maturato - data.pagato;
          
          return (
            <div key={mese} style={meseContainer}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontWeight: "bold", textTransform: "capitalize", fontSize: "1.1rem" }}>{labelMese}</span>
                <span style={{ fontWeight: "bold" }}>Guadagnato: € {data.maturato.toFixed(2)}</span>
              </div>

              <div style={{ display: "flex", gap: "20px", fontSize: "0.9rem", opacity: 0.8, marginBottom: "15px" }}>
                <span>📅 {data.giorni} giornate</span>
                <span>💸 Pagati: € {data.pagato.toFixed(2)}</span>
                <span style={{ color: saldo > 0 ? "#ffc107" : "#4caf50" }}>
                   Saldo: € {saldo.toFixed(2)}
                </span>
              </div>

              <button 
                onClick={() => setMeseAperto(meseAperto === mese ? null : mese)}
                style={{ background: "none", border: "none", color: "#ffc107", cursor: "pointer", padding: 0, fontSize: "0.85rem" }}
              >
                {meseAperto === mese ? "Nascondi dettagli giornate ▲" : "Mostra dettagli giornate ▼"}
              </button>

              {meseAperto === mese && (
                <div style={{ marginTop: "15px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "10px" }}>
                  {data.dettagli.map((d, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "5px 0", borderBottom: "1px solid #333" }}>
                      <span>{formatDateIT(d.data)} — {d.cantiere}</span>
                      <span>{d.giornata} gg — <b>€ {d.importo.toFixed(2)}</b></span>
                    </div>
                  ))}

                  {/* PAGAMENTI */}
                  {data.pagamenti && data.pagamenti.length > 0 && (
                    <div style={{ marginTop: "10px", borderTop: "1px solid #444", paddingTop: "10px" }}>
                      <div style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "5px" }}>
                        💸 Pagamenti effettuati
                      </div>

                      {data.pagamenti.map((p, i) => (
                        <div key={"pay"+i} style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8rem",
                          padding: "4px 0",
                          color: "#4caf50"
                        }}>
                          <span>{formatDateIT(p.data)}</span>
                          <span>€ {p.importo.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

// STILI RAPIDI
const statBox = {
  background: "#1e1e1e",
  padding: "15px",
  borderRadius: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  border: "1px solid #333"
};

const meseContainer = {
  background: "#1a1a1a",
  padding: "20px",
  borderRadius: "12px",
  marginBottom: "15px",
  border: "1px solid #222"
};