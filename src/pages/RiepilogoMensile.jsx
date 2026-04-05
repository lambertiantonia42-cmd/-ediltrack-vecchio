import { useEffect, useState } from "react";
import { db } from "../services/firebase";
import { collection, getDocs, query, where, onSnapshot } from "firebase/firestore";

export default function RiepilogoMensile() {
  const [mese, setMese] = useState(new Date().getMonth());
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [settimana, setSettimana] = useState(null); // 1-5 oppure null = tutto il mese
  const [modalita, setModalita] = useState("mese"); // "mese" o "settimana"

  const [operai, setOperai] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [settimaneList, setSettimaneList] = useState([]);

  useEffect(() => {
    carica();
  }, [mese, settimana, modalita, anno]);

  const carica = async () => {
    // 👉 OPERAI (no cessati)
    const operaiSnap = await getDocs(collection(db, "operai"));
const operaiAttivi = [];

operaiSnap.forEach(doc => {
  const o = doc.data();
  if (!o.nome) return;

  const nome = o.nome.trim();

  // 🚫 ESCLUDI SEMPRE cessati (case insensitive)
  if ((o.stato || "").toLowerCase() === "cessato") return;

  operaiAttivi.push(nome);
});

    // 👉 carico solo cantieri attivi già iniziati entro il mese selezionato
    // 👉 CANTIERI ATTIVI (solo della tua azienda)
    const cantieriSnap = await getDocs(
      query(
        collection(db, "cantieri"),
        where("aziendaId", "!=", null)
      )
    );
    const cantieriAttivi = new Set();

    cantieriSnap.forEach(doc => {
      const c = doc.data();

      if (c.stato !== "Attivo") return;
      if (!c.nome) return;

      const nome = c.nome.trim();

      // 👉 filtro data inizio cantiere
      if (c.dataInizio) {
        const start = new Date(c.dataInizio);

        // ultimo giorno del mese selezionato
        const endOfMonth = new Date(anno, mese + 1, 0);

        // 👉 mostra il cantiere se è iniziato ENTRO il mese
        // 👉 quindi lo escludo SOLO se inizia DOPO la fine del mese
        if (start > endOfMonth) return;
      }

      cantieriAttivi.add(nome);
    });

    // 👉 calcolo settimane ISO REALI del mese (lun-dom ma poi filtriamo lun-ven)
    const getISOWeek = (date) => {
      const tmp = new Date(date);
      tmp.setHours(0,0,0,0);
      tmp.setDate(tmp.getDate() + 3 - (tmp.getDay() + 6) % 7);
      const week1 = new Date(tmp.getFullYear(), 0, 4);
      return 1 + Math.round(((tmp - week1) / 86400000
        - 3 + (week1.getDay() + 6) % 7) / 7);
    };

    // 👉 nuova logica settimane: lun-sab, settimana assegnata al mese con più giorni
    const settimaneMese = [];
    const settimaneSet = new Set();

    const year = anno;

    const getISOWeekStart = (year, week) => {
      const jan4 = new Date(year, 0, 4);
      const day = jan4.getDay() || 7;
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - day + 1);

      const result = new Date(monday);
      result.setDate(monday.getDate() + (week - 1) * 7);

      return result;
    };

    // raccogli tutte le settimane presenti nel mese
    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, mese, day);
      if (d.getMonth() !== mese) continue;

      const w = getISOWeek(d);
      settimaneSet.add(w);
    }

    // 👉 logica professionale:
    // settimana assegnata al mese con PIÙ giorni (lun-sab)
    settimaneSet.forEach((week) => {
      const lunedi = getISOWeekStart(year, week);

      let countMese = 0;
      let countAltro = 0;

      for (let i = 0; i < 6; i++) { // lunedì → sabato
        const giorno = new Date(lunedi);
        giorno.setDate(lunedi.getDate() + i);

        if (giorno.getMonth() === mese) {
          countMese++;
        } else {
          countAltro++;
        }
      }

      if (countMese >= countAltro) {
        settimaneMese.push(week);
      }
    });

    settimaneMese.sort((a, b) => a - b);

    setSettimaneList(settimaneMese);

    // 👉 PRESENZE
    const matrice = {};
    const cantieriConPresenze = new Set();

    const presenzeRef = collection(db, "presenze");

    onSnapshot(presenzeRef, (snapshot) => {

      snapshot.forEach(doc => {
        const p = doc.data();
        if (!p.data) return;

        const d = new Date(p.data);
        if (d.getMonth() !== mese) return;
        if (d.getFullYear() !== anno) return;

        const giornoSettimana = d.getDay();
        if (giornoSettimana === 0) return;

        if (settimana !== null) {
          const settimanaCorrente = getISOWeek(d);
          const index = settimaneMese.indexOf(settimanaCorrente) + 1;
          if (index !== settimana) return;
        }

        const nome = (p.dipendente || p.nomeOperaio || p.nome || "").trim();
        const cantiere = (p.cantiere || "").trim();

        if (!operaiAttivi.includes(nome)) return;
        if (!cantieriAttivi.has(cantiere)) return;

        if (!matrice[nome]) matrice[nome] = {};
        if (!matrice[nome][cantiere]) matrice[nome][cantiere] = 0;

        const valore =
          p.giornata === "Mezza" || p.giornata === 0.5
            ? 0.5
            : 1;

        matrice[nome][cantiere] += valore;
      });

      setMatrix({ ...matrice });
    });

    // 👉 LISTA FINALE CANTIERI
    const cantieriFinali = Array.from(cantieriAttivi);

    setOperai(operaiAttivi.sort());
    setCantieri(cantieriFinali);
  };

  const mesi = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  return (
    <div id="riepilogo-print" style={{
      width: "100%",
      overflowX: "hidden"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{ textAlign: "center", margin: 0 }}>
            🧾 Riepilogo Mensile
          </h2>

          <span
            title="Le settimane sono calcolate da lunedì a sabato"
            style={{
              fontSize: "12px",
              background: "rgba(251,191,36,0.15)",
              color: "#fbbf24",
              padding: "4px 8px",
              borderRadius: "999px",
              border: "1px solid rgba(251,191,36,0.3)",
              fontWeight: 600,
              cursor: "help"
            }}
          >
            Lun–Sab
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => setAnno(anno - 1)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              background: "#1e293b",
              color: "white",
              border: "1px solid #334155",
              cursor: "pointer"
            }}
          >
            ←
          </button>

          <div style={{ fontWeight: 700, fontSize: "16px" }}>
            {anno}
          </div>

          <button
            onClick={() => setAnno(anno + 1)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              background: "#1e293b",
              color: "white",
              border: "1px solid #334155",
              cursor: "pointer"
            }}
          >
            →
          </button>
        </div>
      </div>

      {/* SELEZIONE */}
      <div style={{
        display: "flex",
        gap: 10,
        marginBottom: 20,
        overflowX: "auto",
        paddingBottom: 6
      }}>
        {mesi.map((m, i) => (
          <button
            key={i}
            onClick={() => setMese(i)}
            style={{
              padding: "6px 12px",
              background: mese === i ? "#fbbf24" : "#1e293b",
              borderRadius: 8,
              color: "white",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* SELEZIONE SETTIMANA */}
      <div style={{
        display: "flex",
        gap: 10,
        marginBottom: 20,
        overflowX: "auto",
        paddingBottom: 6
      }}>
        <button
          onClick={() => setSettimana(null)}
          style={{
            padding: "6px 12px",
            background: settimana === null ? "#22c55e" : "#1e293b",
            borderRadius: 8,
            color: "white",
          }}
        >
          Tutto
        </button>

        {settimaneList.map((week, idx) => {

          // funzione per ottenere lunedì ISO
          const getISOWeekStart = (year, week) => {
            const jan4 = new Date(year, 0, 4);
            const day = jan4.getDay() || 7;
            const monday = new Date(jan4);
            monday.setDate(jan4.getDate() - day + 1);

            const result = new Date(monday);
            result.setDate(monday.getDate() + (week - 1) * 7);

            return result;
          };

          const year = anno;

          const lunedi = getISOWeekStart(year, week);
          // estendiamo fino al sabato (lun-ven + eventuale sabato lavorato)
          const fineSettimana = new Date(lunedi);
          fineSettimana.setDate(lunedi.getDate() + 5);

          const format = (d) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

          const index = idx + 1;

          return (
            <button
              key={week}
              onClick={() => setSettimana(index)}
              style={{
                padding: "6px 12px",
                background: settimana === index ? "#fbbf24" : "transparent",
                color: settimana === index ? "#000" : "#cbd5f5",
                border: settimana === index ? "none" : "1px solid #334155",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: settimana === index ? 600 : 400,
                transition: "all 0.15s ease"
              }}
            >
              {`Set ${index}`}
              <span style={{ opacity: 0.6, marginLeft: 6 }}>
                ({format(lunedi)}-{format(fineSettimana)})
              </span>
            </button>
          );
        })}
      </div>

      {/* MOBILE VIEW */}
      <div className="mobile-riepilogo" style={{ display: "none" }}>
        {operai.map(o => {
          let totale = 0;

          return (
            <div key={o} style={{
              border:"1px solid rgba(255,255,255,0.08)",
              borderRadius:"16px",
              padding:"16px",
              marginBottom:"14px",
              background:"rgba(255,255,255,0.04)",
              width:"100%",
              maxWidth:"100%",
              overflow:"hidden"
            }}>

              <div style={{ fontWeight:700, fontSize:18, marginBottom:10 }}>
                👷 {o}
              </div>

              {cantieri.map(c => {
                const val = matrix[o]?.[c] || 0;
                totale += val;

                return (
                  <div key={c} style={{
                    display:"flex",
                    justifyContent:"space-between",
                    alignItems:"center",
                    marginBottom:6,
                    gap:8
                  }}>
                    <span style={{
                      opacity:0.85,
                      fontSize:13,
                      whiteSpace:"nowrap",
                      overflow:"hidden",
                      textOverflow:"ellipsis",
                      maxWidth:"65%"
                    }} title={c}>
                      {c}
                    </span>

                    <span style={{
                      fontWeight:700,
                      minWidth:"28px",
                      textAlign:"right",
                      color:
                        val === 0 ? "#64748b" :
                        val === 0.5 ? "#fbbf24" :
                        "#22c55e"
                    }}>
                      {val}
                    </span>
                  </div>
                );
              })}

              <div style={{
                marginTop:10,
                paddingTop:10,
                borderTop:"1px solid rgba(255,255,255,0.08)",
                display:"flex",
                justifyContent:"space-between",
                fontWeight:700,
                color:"#fbbf24"
              }}>
                <span>Totale</span>
                <span>{totale}</span>
              </div>

            </div>
          );
        })}
      </div>

      {/* TABELLA */}
      <div className="desktop-riepilogo" style={{
        overflowX: "auto",
        width: "100%",
        maxWidth: "100%"
      }}>
        <table style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse", tableLayout: "fixed", position: "relative" }}>
          <thead>
            <tr style={{ background: "#020617", color: "#fbbf24" }}>
              <th style={{
                ...th,
                position: "sticky",
                left: 0,
                zIndex: 3,
                background: "#020617"
              }}>
                Operaio
              </th>
              {cantieri.map(c => {
                const hue = 45;
                return (
                  <th
                    key={c}
                    style={{
                      ...th,
                      fontWeight: 600,
                      textAlign: "center"
                    }}
                  >
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "999px",
                        background: `hsla(${hue}, 70%, 60%, 0.15)`,
                        color: `hsl(${hue}, 70%, 65%)`,
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                        fontSize: "12px",
                        display: "inline-block",
                        maxWidth: "120px",
                        textAlign: "center",
                        lineHeight: "1.2"
                      }}
                    >
                      {c}
                    </span>
                  </th>
                );
              })}
              <th style={{ ...th, textAlign: "center" }}>Totale</th>
            </tr>
          </thead>

          <tbody>
            {operai.map(o => {
              let totale = 0;

              return (
                <tr key={o}>
                  <td style={{
                    ...td,
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    background: "#0f172a"
                  }}>
                    👷 {o}
                  </td>

                  {cantieri.map(c => {
                    const val = matrix[o]?.[c] || 0;
                    totale += val;

                    return (
                      <td
                        key={c}
                        style={{
                          ...td,
                          textAlign: "center"
                        }}
                      >
                        {val > 0 ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontWeight: 600,
                              minWidth: "28px",
                              background:
                                val === 0.5
                                  ? "rgba(251,191,36,0.10)"
                                  : "rgba(34,197,94,0.10)",
                              color:
                                val === 0.5
                                  ? "#fbbf24"
                                  : "#22c55e"
                            }}
                          >
                            {val}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.4 }}>0</span>
                        )}
                      </td>
                    );
                  })}

                  <td
                    style={{
                      ...td,
                      color: "#fbbf24",
                      fontWeight: "bold",
                      background: "rgba(251,191,36,0.12)",
                      borderRadius: "6px",
                      textAlign: "center",
                      minWidth: "60px",
                      verticalAlign: "middle",
                    }}
                  >
                    {totale}
                  </td>
                </tr>
              );
            })}

            {/* TOTALI CANTIERI */}
            <tr style={{ background: "#020617" }}>
              <td style={{
                ...td,
                fontWeight: 600,
                position: "sticky",
                left: 0,
                zIndex: 2,
                background: "#020617"
              }}>
                Totali
              </td>

              {cantieri.map(c => {
                const tot = operai.reduce((acc, o) => {
                  return acc + (matrix[o]?.[c] || 0);
                }, 0);

                return (
                  <td
                    key={c}
                    style={{
                      ...td,
                      textAlign: "center",
                      fontWeight: 600
                    }}
                  >
                    {tot}
                  </td>
                );
              })}

              <td
                style={{
                  ...td,
                  textAlign: "center",
                  fontWeight: 600
                }}
              >
                {operai.reduce((acc, o) => {
                  return acc + cantieri.reduce((sum, c) => sum + (matrix[o]?.[c] || 0), 0);
                }, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* PRINT SOLO CONTENUTO */
if (typeof window !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = `
    @media print {
      body * {
        visibility: hidden;
      }

      #riepilogo-print, #riepilogo-print * {
        visibility: visible;
      }

      #riepilogo-print {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: white;
        color: black;
      }

      table {
        color: black !important;
      }

      th, td {
        border-color: #ccc !important;
      }
    }
  `;
  document.head.appendChild(style);
}

const th = {
  padding: "10px 12px",
  borderBottom: "1px solid #334155",
  textAlign: "left"
};

const td = {
  padding: 10,
  borderBottom: "1px solid #1e293b"
};

<style>{`
@media (max-width: 768px) {

  .desktop-riepilogo {
    display: block !important;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .desktop-riepilogo table {
    min-width: 900px;
  }

  .mobile-riepilogo {
    display: none !important;
  }

}
`}</style>