import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { db } from "../services/firebase";
import { AZIENDA_ID } from "../appConfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc
} from "firebase/firestore";

export default function SchedaOperaio() {
  const { nome } = useParams();
  const navigate = useNavigate();
  const nomeOperaio = decodeURIComponent(nome || "").trim().toLowerCase();

  const [presenze, setPresenze] = useState([]);
  const [acconti, setAcconti] = useState([]);
  const [assenze, setAssenze] = useState([]);
  const [operaio, setOperaio] = useState(null);
  const [paga, setPaga] = useState("");
  const [filtroEvento, setFiltroEvento] = useState("tutti");
  const [meseSelezionato, setMeseSelezionato] = useState(
    new Date().toISOString().slice(0,7)
  );

  function colorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 70%)`;
  }

  useEffect(() => {
    const qBase = (col) => query(collection(db, col), where("aziendaId", "==", AZIENDA_ID));

    const unsubOp = onSnapshot(qBase("operai"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const found = list.find(o => (o.nome || "").trim().toLowerCase() === nomeOperaio);
      setOperaio(found || null);
      if (found) setPaga(found.pagaGiornaliera ?? "");
    });

    const unsubPre = onSnapshot(qBase("presenze"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = list.filter(p => (p.dipendente || "").trim().toLowerCase() === nomeOperaio);
      filtered.sort((a, b) => b.data.localeCompare(a.data));
      setPresenze(filtered);
    });

    const unsubAcc = onSnapshot(qBase("acconti"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = list.filter(a => (a.dipendente || "").trim().toLowerCase() === nomeOperaio);
      setAcconti(filtered);
    });

    const unsubAss = onSnapshot(qBase("assenze"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = list.filter(a => (a.nome || "").trim().toLowerCase() === nomeOperaio);
      setAssenze(filtered);
    });

    return () => { unsubOp(); unsubPre(); unsubAcc(); unsubAss(); };
  }, [nomeOperaio]);

  function getMese(dataStr){
    if(!dataStr) return "";
    return dataStr.slice(0,7);
  }

  const presenzeFiltrate = useMemo(() => 
    presenze.filter(p => getMese(p.data) === meseSelezionato),
    [presenze, meseSelezionato]
  );

  const presenzeRaggruppate = useMemo(() => {
    const map = {};

    presenzeFiltrate.forEach(p => {
      if (!map[p.data]) {
        map[p.data] = {
          data: p.data,
          cantieri: [],
          giornate: []
        };
      }

      map[p.data].cantieri.push(p.cantiere);
      map[p.data].giornate.push(Number(p.giornata));
    });

    return Object.values(map).map(g => {
      const totale = g.giornate.reduce((sum, val) => sum + val, 0);
      return {
        ...g,
        giornataFinale: totale >= 1 ? 1 : 0.5
      };
    }).sort((a,b) => b.data.localeCompare(a.data));
  }, [presenzeFiltrate]);

  const giorniInteri = useMemo(() => presenzeFiltrate.filter(p => Number(p.giornata) === 1).length, [presenzeFiltrate]);
  const giorniMezzi = useMemo(() => presenzeFiltrate.filter(p => Number(p.giornata) === 0.5).length, [presenzeFiltrate]);
  const pagaNumero = Number(paga || 0);
  const guadagno = useMemo(() => giorniInteri * pagaNumero + giorniMezzi * (pagaNumero / 2), [giorniInteri, giorniMezzi, pagaNumero]);
  const totaleAcconti = useMemo(() => 
    acconti
      .filter(a =>
        (a.meseCompetenza
          ? a.meseCompetenza === meseSelezionato
          : getMese(a.data) === meseSelezionato)
      )
      .reduce((sum, a) => sum + Number(a.importo || 0), 0),
    [acconti, meseSelezionato]
  );
  const saldo = guadagno - totaleAcconti;

  const eventi = useMemo(() => {
    const list = [
      ...acconti
        .filter(a =>
          (a.meseCompetenza
            ? a.meseCompetenza === meseSelezionato
            : getMese(a.data) === meseSelezionato)
        )
        .map(a => ({ 
          tipo: a.tipo || a.tipoPagamento || "acconto", 
          data: a.data, 
          importo: Number(a.importo || 0), 
          nota: a.nota || a.descrizione || "",
          id: a.id 
        })),
      ...assenze.map(ass => ({ tipo: "assenza", stato: ass.tipo, da: ass.inizio, a: ass.fine, id: ass.id }))
    ];
    const sorted = list.sort((a, b) => (b.data || b.da || "").localeCompare(a.data || a.da || ""));

    return sorted.filter(e => {
      if (filtroEvento === "tutti") return true;
      if (filtroEvento === "acconti") return e.tipo === "acconto";
      if (filtroEvento === "malattia") return e.tipo === "assenza" && e.stato?.toLowerCase() === "malattia";
      if (filtroEvento === "ferie") return e.tipo === "assenza" && e.stato?.toLowerCase() === "ferie";
      return true;
    });
  }, [acconti, assenze, filtroEvento, meseSelezionato]);

  async function salvaPaga() {
    if (!operaio) return;
    await updateDoc(doc(db, "operai", operaio.id), { pagaGiornaliera: Number(paga) });
    alert("Paga aggiornata!");
  }

  async function eliminaAcconto(id) {
    if (!confirm("Eliminare questo acconto?")) return;
    await deleteDoc(doc(db, "acconti", id));
  }

  async function modificaAcconto(a) {
    const nuovo = prompt("Nuovo importo:", a.importo);
    if (nuovo === null) return;
    await updateDoc(doc(db, "acconti", a.id), { importo: Number(nuovo) });
  }

  function formatDate(data) {
    if (!data) return "-";
    return data.split("-").reverse().join("/");
  }

  const mesi = [
    { label: "Gen", val: "01" },
    { label: "Feb", val: "02" },
    { label: "Mar", val: "03" },
    { label: "Apr", val: "04" },
    { label: "Mag", val: "05" },
    { label: "Giu", val: "06" },
    { label: "Lug", val: "07" },
    { label: "Ago", val: "08" },
    { label: "Set", val: "09" },
    { label: "Ott", val: "10" },
    { label: "Nov", val: "11" },
    { label: "Dic", val: "12" }
  ];

  const annoCorrente = new Date().getFullYear();

  // 🚫 nascondi operai cessati
  if (operaio && operaio.stato === "Cessato") {
    navigate(-1);
    return null;
  }

  return (
    <div className="scheda-operaio" style={{ padding: window.innerWidth < 768 ? "15px" : "30px", background: "var(--bg-main)", minHeight: "100vh", color: "var(--text-main)" }}>
      
      {/* HEADER */}
      <div style={{
        display: "flex",
        flexDirection: window.innerWidth < 768 ? "column" : "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: window.innerWidth < 768 ? "15px" : "0px",
        marginBottom: "25px"
      }}>
        <div>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", marginBottom: "10px", color: "#666", fontWeight: "600" }}>← INDIETRO</button>
          <h2 style={{ fontSize: "32px", margin: 0, color: "var(--text-main)" }}>👷 {nome?.toUpperCase()}</h2>
          <p style={{ opacity: 0.7, margin: 0, color: "var(--text-main)" }}>Gestione Documentale ed Economica</p>
        </div>

        <div style={{
          width: window.innerWidth < 768 ? "100%" : "auto",
          background: "var(--bg-card)",
          padding: "15px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          display: "flex",
          justifyContent: window.innerWidth < 768 ? "space-between" : "center",
          alignItems: "center",
          gap: "10px"
        }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888" }}>PAGA GIORNALIERA</label>
            <input 
              type="number" 
              value={paga} 
              onChange={e => setPaga(e.target.value)} 
              style={{ fontSize: "22px", fontWeight: "bold", border: "none", outline: "none", width: "110px", color: "var(--text-main)" }} 
            />
          </div>
          <button onClick={salvaPaga} style={{ background: "#f0b90b", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", color: "#000" }}>SALVA</button>
        </div>
      </div>

      <div style={{ marginBottom: "20px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {mesi.map(m => {
          const valore = `${annoCorrente}-${m.val}`;
          const active = meseSelezionato === valore;

          return (
            <button
              key={m.val}
              onClick={() => setMeseSelezionato(valore)}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: active ? "2px solid #f0b90b" : "1px solid rgba(255,255,255,0.1)",
                background: active ? "rgba(251,191,36,0.2)" : "var(--bg-card)",
                color: active ? "#fbbf24" : "var(--text-main)",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "13px"
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* RIEPILOGO STATS */}
      <div style={{
        display: "grid",
        gridTemplateColumns: window.innerWidth < 768 ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: "15px",
        marginBottom: "30px"
      }}>
        <StatBox label="GIORNATE TOTALI" value={`${giorniInteri + giorniMezzi * 0.5} gg`} sub={`${giorniInteri} intere / ${giorniMezzi} mezze`} color="var(--text-main)" />
        <StatBox label="MATURATO LORDO" value={`€ ${guadagno.toFixed(2)}`} sub="Totale lordo lavoro" color="#22c55e" />
        <StatBox label="ACCONTI VERSATI" value={`€ ${totaleAcconti.toFixed(2)}`} sub="Totale pagamenti" color="#f0b90b" />
        <StatBox label="SALDO RESIDUO" value={`€ ${saldo.toFixed(2)}`} sub="Debito attuale" color={saldo > 0 ? "#ef4444" : "#22c55e"} bg={saldo > 0 ? "rgba(255,0,0,0.08)" : "rgba(0,255,150,0.08)"} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "1.6fr 1fr",
        gap: "25px"
      }}>
        
        {/* TABELLA PRESENZE */}
        <div style={{
          background: "var(--bg-card)",
          padding: window.innerWidth < 768 ? "15px" : "20px",
          borderRadius: "15px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.03)",
          overflowX: "auto"
        }}>
          <h3 style={{ marginBottom: "20px", color: "var(--text-main)" }}>📋 Registro Attività Cantiere</h3>
          <table style={{
            width: window.innerWidth < 768 ? "700px" : "100%",
            borderCollapse: "collapse",
            color: "var(--text-main)"
          }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-main)", fontSize: "12px", borderBottom: "2px solid var(--bg-main)" }}>
                <th style={{ padding: "12px" }}>DATA</th>
                <th style={{ padding: "12px" }}>CANTIERE</th>
                <th style={{ padding: "12px" }}>GIORNATA</th>
                <th style={{ padding: "12px" }}>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              {presenzeRaggruppate.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "12px", fontWeight: "bold", color: "var(--text-main)" }}>{formatDate(p.data)}</td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                      {p.cantieri.map((c,i) => (
                        <div key={i} style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: colorFromString(c || "")
                        }}>
                          • {(c || "N/D").toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "12px", color: "var(--text-main)" }}>{p.giornataFinale === 1 ? "Intera" : "Mezza"}</td>
                  <td style={{ padding: "12px", fontWeight: "bold", color: "var(--text-main)" }}>€ {(p.giornataFinale * pagaNumero).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* STORICO EVENTI */}
        <div style={{ background: "var(--bg-card)", padding: "20px", borderRadius: "15px", boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
          <h3 style={{ marginBottom: "10px", color: "var(--text-main)" }}>📜 Storico Eventi</h3>

          <div style={{ display: "flex", gap: "8px", marginBottom: "15px" }}>
            {[
              { key: "tutti", label: "Tutti" },
              { key: "acconti", label: "Pagamenti" },
              { key: "malattia", label: "Malattia" },
              { key: "ferie", label: "Ferie" }
            ].map(btn => (
              <button
                key={btn.key}
                onClick={() => setFiltroEvento(btn.key)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: filtroEvento === btn.key ? "2px solid #f0b90b" : "1px solid rgba(255,255,255,0.1)",
                  background: filtroEvento === btn.key ? "rgba(251,191,36,0.2)" : "var(--bg-card)",
                  color: filtroEvento === btn.key ? "#fbbf24" : "#e2e8f0",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "12px"
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {eventi.map((e, i) => {
            const isAssenza = e.tipo === "assenza";
            const tipoAss = e.stato?.toLowerCase();
            return (
              <div key={i} style={{ 
                display: "flex", justifyContent: "space-between", alignItems: "center", 
                padding: "15px", borderRadius: "12px", marginBottom: "10px", 
                background: isAssenza ? (tipoAss === "malattia" ? "rgba(255,0,0,0.08)" : "rgba(0,150,255,0.08)") : "rgba(0,255,150,0.08)",
                borderLeft: `5px solid ${isAssenza ? (tipoAss === "malattia" ? "#ef4444" : "#00c2ff") : "#22c55e"}`
              }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: "600", color: "#9ca3af" }}>{isAssenza ? `${formatDate(e.da)} → ${formatDate(e.a) || 'In corso'}` : formatDate(e.data)}</div>
                  <b style={{ fontSize: "14px", color: "var(--text-main)" }}>
                    {isAssenza 
                      ? (tipoAss === "malattia" ? "🤒 MALATTIA" : "🏖️ FERIE")
                      : (e.tipo === "saldo" ? "💵 SALDO" : "💰 ACCONTO")
                    }
                  </b>

                  {!isAssenza && e.nota && (
                    <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}>
                      {e.nota}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text-main)" }}>{isAssenza ? "-" : `€ ${e.importo.toFixed(2)}`}</span>
                  {!isAssenza && (
                    <div style={{ display: "flex", gap: "5px" }}>
                      <button onClick={() => modificaAcconto(e)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "14px" }}>✏️</button>
                      <button onClick={() => eliminaAcconto(e.id)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "14px" }}>🗑️</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

function StatBox({ label, value, sub, color, bg }) {
  return (
    <div style={{ background: bg || "var(--bg-card)", padding: "20px", borderRadius: "15px", boxShadow: "0 2px 10px rgba(0,0,0,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--text-main)", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: "bold", color: color }}>{value}</div>
      <div style={{ fontSize: "11px", opacity: 0.7, color: "var(--text-main)" }}>{sub}</div>
    </div>
  );
}