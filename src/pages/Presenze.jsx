// src/pages/Presenze.jsx
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { AZIENDA_ID } from "../appConfig";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc,
  getDoc
} from "firebase/firestore";

import "./Presenze.css";
import { logActivity } from "../utils/logActivity";

function todayISO(){
  const d=new Date();
  const yyyy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateIT(dateStr){
  if(!dateStr) return "";
  const [y,m,d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function sortByDataDesc(a,b){
  const da=String(a.data||"");
  const dbb=String(b.data||"");

  if(da!==dbb) return dbb.localeCompare(da);

  const ta=a.createdAt?.toMillis?a.createdAt.toMillis():0;
  const tb=b.createdAt?.toMillis?b.createdAt.toMillis():0;

  return tb-ta;
}

export default function Presenze(){

  const [data,setData]=useState(todayISO());

  const [dipendente,setDipendente]=useState("");
  const [cantiereId,setCantiereId]=useState("");
  const [cantiereNome,setCantiereNome]=useState("");

  const [giornata,setGiornata]=useState(1);
  const [orario,setOrario]=useState("06:00-15:00");
  const [attivita,setAttivita]=useState("");

  // Stato per più attività/cantieri/orari
  const [attivitaList, setAttivitaList] = useState([
    { cantiereId:"", cantiereNome:"", orario:"", attivita:"" }
  ]);
  // ========== PREDEFINITO ==========
  const [orarioDefaultDB, setOrarioDefaultDB] = useState("");
  const [usaPredefinito, setUsaPredefinito] = useState(false);

  // Carica il default da DB una sola volta
  useEffect(() => {
    async function fetchDefault() {
      try {
        const docRef = doc(db, "settings", AZIENDA_ID);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.orarioDefault) setOrarioDefaultDB(data.orarioDefault);
        }
      } catch (e) {}
    }
    fetchDefault();
  }, []);

  const [rows,setRows]=useState([]);
  const [cantieriAttivi,setCantieriAttivi]=useState([]);
  const [operai,setOperai]=useState([]);

  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [lastAddedId,setLastAddedId]=useState(null);

  /* =========================
     PRESENZE GIORNO
  ========================= */

  useEffect(()=>{

    const q=query(
      collection(db,"presenze"),
      where("aziendaId","==",AZIENDA_ID),
      where("data","==",data)
    );

    const unsub=onSnapshot(q,snap=>{
      const list=snap.docs.map(d=>({
        id:d.id,
        ...d.data()
      }));

      list.sort(sortByDataDesc);
      setRows(list);
    });

    return ()=>unsub();

  },[data]);

  /* =========================
     CANTIERI
  ========================= */

  useEffect(()=>{

    const q=query(
      collection(db,"cantieri"),
      where("aziendaId","==",AZIENDA_ID),
      where("stato","==","Attivo")
    );

    const unsub=onSnapshot(q,snap=>{
      const list=snap.docs.map(d=>({
        id:d.id,
        ...d.data()
      }));

      list.sort((a,b)=>(a.nome||"").localeCompare(b.nome||""));
      setCantieriAttivi(list);
    });

    return ()=>unsub();

  },[]);

  // Helper to get a color from a string name (if colore not defined)
  function getColorFromName(name){
    if(!name) return "#888";

    let hash = 0;
    for(let i=0;i<name.length;i++){
      hash = name.charCodeAt(i) + ((hash<<5) - hash);
    }

    const colors = [
      "#3b82f6", // blu
      "#22c55e", // verde
      "#f59e0b", // arancio
      "#ef4444", // rosso
      "#a855f7", // viola
      "#06b6d4"  // cyan
    ];

    return colors[Math.abs(hash) % colors.length];
  }

  // Helper map: cantiereId -> cantiere object
  const cantieriMap = useMemo(() => {
    const map = {};
    cantieriAttivi.forEach(c => {
      if (c.id) {
        map[c.id] = c;
      }
    });
    return map;
  }, [cantieriAttivi]);

  /* =========================
     OPERAI
  ========================= */

  useEffect(()=>{

    const q=query(
      collection(db,"operai"),
      where("aziendaId","==",AZIENDA_ID)
    );

    const unsub=onSnapshot(q,snap=>{
      const list=snap.docs.map(d=>({
        id:d.id,
        ...d.data()
      }));

      setOperai(list);
    });

    return ()=>unsub();

  },[]);

  /* =========================
     OPERAI DISPONIBILI
  ========================= */

  const operaiDisponibili=useMemo(()=>{

    return operai.filter(o=>{

      if(!o.nome) return false;

      if((o.stato || "").toLowerCase() === "cessato") return false;

      const stato = (o.stato || "").toLowerCase();

      if(stato === "malattia" || stato === "ferie"){
        if(o.inizioAssenza){
          // se NON c'è fineAssenza → è ancora in corso
          if(!o.fineAssenza){
            if(data >= o.inizioAssenza){
              return false;
            }
          }else{
            if(data >= o.inizioAssenza && data <= o.fineAssenza){
              return false;
            }
          }
        }
      }

      return true;

    });

  },[operai,data]);

  /* =========================
     SELEZIONE CANTIERE
  ========================= */

  function onSelectCantiere(id){
    setCantiereId(id);
    const found=cantieriAttivi.find(c=>c.id===id);
    setCantiereNome(found?.nome||"");
  }

  /* =========================
     SALVA PRESENZA
  ========================= */

  async function onSubmit(e){

    e.preventDefault();
    setErr("");

    const u=auth.currentUser;
    if(!u) return;

    // 🚫 BLOCCO DUPLICATI (stesso giorno, stesso operaio, stesso cantiere, stesso orario)
    // (non implementato qui per multi-attività, aggiungere se necessario)

    // ⚖️ BLOCCO SOLO PER MEZZA GIORNATA
    // Se inserisco MEZZA, controllo che non esista già una INTERA per quel giorno/operaio
    if(Number(giornata) === 0.5){
      const esisteIntera = rows.some(r =>
        r.data === data &&
        r.dipendente === dipendente &&
        Number(r.giornata) === 1 &&
        r.id !== editingId
      );

      if(esisteIntera){
        setErr("Esiste già una giornata INTERA per questo operaio.");
        return;
      }
    }

    // 🔥 ATTIVITA NON PIÙ OBBLIGATORIA
    if(!dipendente){
      setErr("Compila i campi obbligatori.");
      return;
    }

    let nuovoDefault = orarioDefaultDB;

    if(usaPredefinito && attivitaList[0]?.orario){
      nuovoDefault = attivitaList[0].orario;

      await setDoc(doc(db, "settings", AZIENDA_ID), {
        orarioDefault: nuovoDefault
      }, { merge:true });

      setOrarioDefaultDB(nuovoDefault);
    }

    try{
      setLoading(true);

      // 🔧 FIX DUPLICATI IN MODIFICA
      // Se sto modificando, cancello tutte le righe del gruppo (stessa data + dipendente)
      if(editingId){
        const gruppo = rows.filter(r => r.data === data && r.dipendente === dipendente);
        for(const g of gruppo){
          await deleteDoc(doc(db, "presenze", g.id));
        }
      }

      for(let i = 0; i < attivitaList.length; i++){
        const att = attivitaList[i];

        if(!att.cantiereId) continue;

        const payload={
          aziendaId:AZIENDA_ID,
          data,
          dipendente,
          cantiereId:att.cantiereId,
          cantiereNome:att.cantiereNome,
          cantiere:att.cantiereNome,
          giornata: i === 0 ? Number(giornata) : 0,
          orario:att.orario,
          attivita:att.attivita || "",
          createdAt:serverTimestamp(),
          createdBy:u.uid
        };

        const ref=await addDoc(collection(db,"presenze"),payload);

        await logActivity({
          tipo:"presenza",
          azione:"create",
          cantiere:att.cantiereNome,
          targetId:ref.id,
          note:`${dipendente} • ${data}`
        });

        setLastAddedId(ref.id);
      }

      // reset
      setAttivitaList([{ cantiereId:"", cantiereNome:"", orario:nuovoDefault, attivita:"" }]);
      setAttivita("");
      setEditingId(null);
      setTimeout(()=>setLastAddedId(null),1500);

    }catch(e){
      console.log(e);
      setErr("Errore salvataggio");
    }finally{
      setLoading(false);
    }

  }

  /* =========================
     ELIMINA
  ========================= */

  async function onDelete(id){
    if(!confirm("Eliminare presenza?")) return;
    await deleteDoc(doc(db,"presenze",id));
  }

  function onEdit(r){
    const gruppo = rows.filter(x => x.data === r.data && x.dipendente === r.dipendente);

    setEditingId(r.id);
    setErr("");
    setData(r.data);
    setDipendente(r.dipendente);
    const giornataGroup = gruppo.some(g => Number(g.giornata) === 1) ? 1 : 0.5;
    setGiornata(giornataGroup);

    setAttivitaList(
      gruppo.map(g => ({
        cantiereId: g.cantiereId,
        cantiereNome: g.cantiereNome,
        orario: g.orario,
        attivita: g.attivita || ""
      }))
    );
  }

  /* =========================
     UI
  ========================= */

  return(

    <div
      className="presenze-wrap"
      style={{
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden"
      }}
    >

      <div className="panel">

        <h2>📒 Giornale presenze</h2>

        {err && <p style={{color:"red"}}>{err}</p>}

        <form onSubmit={onSubmit}>

          <div className="form-grid">

            <div className="field">
              <label>Data</label>
              <input
                type="date"
                value={data}
                onChange={e=>setData(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Dipendente</label>
              <select
                value={dipendente}
                onChange={e=>setDipendente(e.target.value)}
              >
                <option value="">Seleziona operaio</option>
                {operaiDisponibili.map(o=>(
                  <option key={o.id} value={o.nome}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Tipo giornata</label>
              <select
                value={giornata}
                onChange={e=>setGiornata(Number(e.target.value))}
              >
                <option value={1}>Intera</option>
                <option value={0.5}>Mezza</option>
              </select>
            </div>

            {/* MULTI CANTIERE */}
            <div className="field" style={{gridColumn:"1/-1"}}>
              <label>Suddivisione giornata (più cantieri)</label>

              {attivitaList.map((row,i)=>(
                <div 
                  key={i} 
                  style={{
                    display:"flex",
                    flexDirection:"row",
                    alignItems:"center",
                    flexWrap:"wrap",
                    gap:"10px",
                    marginBottom:"12px",
                    padding:"10px",
                    border:"1px solid rgba(255,255,255,0.1)",
                    borderRadius:"10px"
                  }}
                >
                  <strong>Cantiere {i+1}</strong>
                  <select
                    value={row.cantiereId}
                    onChange={e=>{
                      const newList=[...attivitaList];
                      const id=e.target.value;
                      const found=cantieriAttivi.find(c=>c.id===id);
                      newList[i].cantiereId=id;
                      newList[i].cantiereNome=found?.nome||"";
                      setAttivitaList(newList);
                    }}
                    style={{minWidth:"160px", flex:"1"}}
                  >
                    <option value="">Seleziona cantiere</option>
                    {cantieriAttivi.map(c=>(
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <div style={{display:"flex", alignItems:"center", gap:"4px"}}>
                    <input
                      value={row.orario}
                      placeholder="07:00-15:00"
                      onChange={e=>{
                        const newList=[...attivitaList];
                        newList[i].orario=e.target.value;
                        setAttivitaList(newList);
                      }}
                      style={{width:"125px", fontSize:"14px", padding:"8px"}}
                    />

                    {i === 0 && (
                      <label style={{
                        display:"flex",
                        alignItems:"center",
                        gap:"4px",
                        fontSize:"12px",
                        cursor:"pointer",
                        color: usaPredefinito ? "#fbbf24" : "#cbd5f5",
                        fontWeight: usaPredefinito ? "700" : "500"
                      }}>
                        <input
                          type="checkbox"
                          checked={usaPredefinito}
                          onChange={(e)=>setUsaPredefinito(e.target.checked)}
                          style={{width:"14px", height:"14px"}}
                        />
                        predefinito
                      </label>
                    )}
                  </div>
                  <input
                    value={row.attivita}
                    placeholder="Attività svolta"
                    onChange={e=>{
                      const newList=[...attivitaList];
                      newList[i].attivita=e.target.value;
                      setAttivitaList(newList);
                    }}
                    style={{minWidth:"180px", flex:"2"}}
                  />
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => {
                      if(i === 0) return;
                      const newList = attivitaList.filter((_, idx) => idx !== i);
                      setAttivitaList(newList.length ? newList : [{ cantiereId:"", cantiereNome:"", orario:"", attivita:"" }]);
                    }}
                    style={{
                      marginLeft:"auto",
                      background: i === 0 ? "#555" : "#ef4444",
                      color:"white",
                      border:"none",
                      borderRadius:"6px",
                      padding:"6px 10px",
                      fontSize:"12px",
                      cursor: i === 0 ? "not-allowed" : "pointer",
                      transition:"all 0.2s ease",
                      transform:"scale(1)"
                    }}
                    onMouseEnter={e => {
                      if(i === 0) return;
                      e.currentTarget.style.transform = "scale(1.08)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    ❌ Rimuovi cantiere
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={()=>
                  setAttivitaList([
                    ...attivitaList,
                    {cantiereId:"", cantiereNome:"", orario:orarioDefaultDB, attivita:""}
                  ])
                }
                style={{
                  marginTop:"10px",
                  display:"inline-block",
                  background:"#22c55e",
                  color:"white",
                  border:"none",
                  borderRadius:"8px",
                  padding:"8px 14px",
                  fontWeight:"600",
                  cursor:"pointer",
                  transition:"all 0.2s ease",
                  transform:"scale(1)"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "scale(1.08)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                ➕ Aggiungi cantiere
              </button>

            </div>

          </div>

          <div className="actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Salvataggio..." : (editingId ? "Aggiorna" : "Salva")}
            </button>
          </div>

        </form>

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table className="table" style={{ minWidth: "700px" }}>

          <thead>
            <tr>
              <th>Data</th>
              <th>Dipendente</th>
              <th>
                <div style={{display:"grid", gridTemplateColumns:"180px 120px 1fr", gap:"10px"}}>
                  <span>Cantiere</span>
                  <span>Orario</span>
                  <span>Attività</span>
                </div>
              </th>
              <th>Giornata</th>
              <th></th>
            </tr>
          </thead>

          <tbody>

            {Object.values(
              rows.reduce((acc, r) => {
                const key = r.data + "_" + r.dipendente;
                if (!acc[key]) acc[key] = [];
                acc[key].push(r);
                return acc;
              }, {})
            ).map((group, idx) => {

              const first = group[0];
              const giornataValue = group.some(g => Number(g.giornata) === 1) ? 1 : 0.5;

              return (
                <tr key={idx}>
                  <td>{formatDateIT(first.data)}</td>
                  <td>{first.dipendente}</td>

                  <td>
                    {[...group]
                      .sort((a, b) => {
                        const getStart = (o) => {
                          if (!o) return 0;
                          const start = o.split("-")[0];
                          const [h, m] = start.split(":");
                          return Number(h) * 60 + Number(m);
                        };
                        return getStart(a.orario) - getStart(b.orario);
                      })
                      .map((g, i) => {
                        const colore = cantieriMap[g.cantiereId]?.colore || getColorFromName(g.cantiereNome);
                        return (
                          <div
                            key={i}
                            style={{
                              marginBottom: "6px",
                              display: "grid",
                              gridTemplateColumns: "180px 120px 1fr",
                              alignItems: "center",
                              gap: "10px",
                              width: "100%"
                            }}
                          >
                            <span
                              className="badge"
                              style={{
                                background: colore + "22",
                                border: `1px solid ${colore}`,
                                color: colore,
                                width: "170px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "inline-block",
                                textAlign: "center"
                              }}
                            >
                              {g.cantiereNome}
                            </span>
                            <strong
                              style={{
                                width: "120px",
                                display: "inline-block",
                                fontFamily: "monospace",
                                fontVariantNumeric: "tabular-nums",
                                textAlign: "left"
                              }}
                            >
                              {g.orario}
                            </strong>
                            <span
                              style={{
                                display: "block",
                                whiteSpace: "nowrap",
                                fontSize: "12px"
                              }}
                            >
                              {g.attivita || "-"}
                            </span>
                          </div>
                        );
                      })}
                  </td>

                  <td>
                    <span className={giornataValue===1 ? "badge badge-green" : "badge"}>
                      {giornataValue===1 ? "Intera" : "Mezza"}
                    </span>
                  </td>

                  <td style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => onEdit(first)}
                    >
                      Modifica
                    </button>

                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={async () => {
                        if(!confirm("Eliminare tutta la giornata?")) return;

                        const gruppo = rows.filter(r => r.data === first.data && r.dipendente === first.dipendente);

                        for(const g of gruppo){
                          await deleteDoc(doc(db, "presenze", g.id));
                        }
                      }}
                      style={{ color: "#ef4444" }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}

          </tbody>

          </table>
        </div>

      </div>

    </div>

  );

}