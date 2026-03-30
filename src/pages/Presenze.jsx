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
  where
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
    const duplicato = rows.find(r =>
      r.id !== editingId &&
      r.data === data &&
      r.dipendente === dipendente &&
      r.cantiereId === cantiereId &&
      r.orario === orario
    );

    if(duplicato){
      setErr("Presenza già inserita per questo operaio/cantiere/orario.");
      return;
    }

    // ⚖️ BLOCCO GIORNATA > 1 (es: 1 + 0.5 non consentito)
    const sommaGiornate = rows
      .filter(r => r.id !== editingId && r.data === data && r.dipendente === dipendente)
      .reduce((acc, r) => acc + Number(r.giornata || 0), 0);

    if(sommaGiornate + Number(giornata) > 1){
      setErr("Totale giornata supera 1 (Intera). Controlla le presenze.");
      return;
    }

    // 🔥 ATTIVITA NON PIÙ OBBLIGATORIA
    if(!dipendente || !cantiereId){
      setErr("Compila i campi obbligatori.");
      return;
    }

    try{

      setLoading(true);

      const payload={
        aziendaId:AZIENDA_ID,
        data,
        dipendente,
        cantiereId,
        cantiereNome,
        cantiere:cantiereNome,
        giornata:Number(giornata),
        orario,
        attivita:attivita || "",
        createdAt:serverTimestamp(),
        createdBy:u.uid
      };

      let targetId;

      if(editingId){
        await updateDoc(doc(db,"presenze",editingId),payload);
        targetId = editingId;
      } else {
        const ref=await addDoc(collection(db,"presenze"),payload);
        targetId = ref.id;
        setLastAddedId(ref.id);
      }

      await logActivity({
        tipo:"presenza",
        azione: editingId ? "update" : "create",
        cantiere:cantiereNome,
        targetId,
        note:`${dipendente} • ${data}`
      });

      // reset
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
    setEditingId(r.id);
    setErr("");
    setData(r.data);
    setDipendente(r.dipendente);
    setCantiereId(String(r.cantiereId || ""));
    setCantiereNome(r.cantiereNome);
    setGiornata(r.giornata);
    setOrario(r.orario);
    setAttivita(r.attivita || "");
  }

  /* =========================
     UI
  ========================= */

  return(

    <div className="presenze-wrap">

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
              <label>Cantiere</label>
              <select
                value={cantiereId}
                onChange={e=>onSelectCantiere(e.target.value)}
              >
                <option value="">Seleziona cantiere</option>
                {cantieriAttivi.map(c=>(
                  <option key={c.id} value={c.id}>
                    {c.nome}
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

            <div className="field">
              <label>Orario</label>
              <input
                value={orario}
                onChange={e=>setOrario(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Attività (opzionale)</label>
              <input
                value={attivita}
                onChange={e=>setAttivita(e.target.value)}
              />
            </div>

          </div>

          <div className="actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Salvataggio..." : (editingId ? "Aggiorna" : "Salva")}
            </button>
          </div>

        </form>

        <table className="table">

          <thead>
            <tr>
              <th>Data</th>
              <th>Dipendente</th>
              <th>Cantiere</th>
              <th>Giornata</th>
              <th>Orario</th>
              <th>Attività</th>
              <th></th>
            </tr>
          </thead>

          <tbody>

            {rows.length===0 ? (
              <tr>
                <td colSpan="7">Nessuna presenza</td>
              </tr>
            ) : rows.map(r=>{
              const isToday = r.data === data;
              return (
              <tr
                key={r.id}
                style={{
                  opacity: r.data===data ? 1 : 0.6
                }}
                className={
                  (r.id===lastAddedId ? "row-new " : "") +
                  (r.dipendente===dipendente ? "row-selected" : "")
                }
              >
                <td>{formatDateIT(r.data)}</td>
                <td>{r.dipendente}</td>
                <td>
                  {(() => {
                    const colore = cantieriMap[r.cantiereId]?.colore || getColorFromName(r.cantiereNome);
                    return (
                      <span
                        className="badge"
                        style={{
                          background: colore + "22",
                          border: `1px solid ${colore}`,
                          color: colore
                        }}
                      >
                        {r.cantiereNome}
                      </span>
                    );
                  })()}
                </td>
                <td>
                  <span className={r.giornata===1 ? "badge badge-green" : "badge"}>
                    {r.giornata===1?"Intera":"Mezza"}
                  </span>
                </td>
                <td>{r.orario}</td>
                <td>{r.attivita || "-"}</td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={()=>onEdit(r)}
                  >
                    Modifica
                  </button>

                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={()=>onDelete(r.id)}
                  >
                    Elimina
                  </button>
                </td>
              </tr>
              );
            })}

          </tbody>

        </table>

      </div>

    </div>

  );

}