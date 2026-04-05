import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../services/firebase";
import { AZIENDA_ID } from "../appConfig";

import {
collection,
query,
where,
onSnapshot,
addDoc,
updateDoc,
deleteDoc,
doc,
serverTimestamp,
getDocs
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const badgeStyleBase = {
  padding:"6px 10px",
  borderRadius:"8px",
  fontWeight:500,
  fontSize:12
};

function formatDate(date){
  if(!date) return "";
  const [y,m,d] = date.split("-");
  return `${d}/${m}`;
}

export default function Operai(){

function isExpired(o){
  if(!o.fineAssenza) return false;
  const today = new Date().toISOString().slice(0,10);
  return o.fineAssenza < today;
}

function getColor(name){
  // Unified color for all worker names
  return "#f0b90b";
}

const [operai,setOperai]=useState([]);

const [nome,setNome]=useState("");
const [paga,setPaga]=useState("");

const [stato,setStato]=useState("attivo");
const [inizioAssenza,setInizioAssenza]=useState("");
const [fineAssenza,setFineAssenza]=useState("");

const [showCessati, setShowCessati] = useState(false);

const [tempDate, setTempDate] = useState({});

const [assenzeMap, setAssenzeMap] = useState({});

const navigate = useNavigate();


/* =============================
   LISTENER OPERAI
============================= */

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

list.sort((a,b)=>(a.nome||"").localeCompare(b.nome||""));

setOperai(list);

});

return ()=>unsub();

},[]);


useEffect(()=>{

  const q = query(
    collection(db,"assenze"),
    where("aziendaId","==",AZIENDA_ID)
  );

  const unsub = onSnapshot(q, snap => {
    const map = {};

    snap.docs.forEach(d=>{
      const data = d.data();
      if(data.operaioId){
        map[data.operaioId] = {
          tipo: data.tipo,
          inizio: data.inizio,
          fine: data.fine || ""
        };
      }
    });

    setAssenzeMap(map);
  });

  return ()=>unsub();

},[]);

// Sync operai state with assenze (sincronizzazione completa)
useEffect(()=>{

  operai.forEach(async o=>{

    const assenza = assenzeMap[o.id];
    const haAssenza = !!assenza;

    // 🔴 eliminata da storico → torna attivo
    if(
      (o.stato==="malattia" || o.stato==="ferie") &&
      !haAssenza &&
      o.inizioAssenza
    ){
      await updateDoc(doc(db,"operai",o.id),{
        stato:"attivo",
        inizioAssenza:"",
        fineAssenza:""
      });
      return;
    }

    // 🟡 modificata nello storico → aggiorna operai
    if(haAssenza){

      if(
        o.stato !== assenza.tipo ||
        o.inizioAssenza !== assenza.inizio ||
        o.fineAssenza !== assenza.fine
      ){

        await updateDoc(doc(db,"operai",o.id),{
          stato: assenza.tipo,
          inizioAssenza: assenza.inizio || "",
          fineAssenza: assenza.fine || ""
        });

      }
    }

  });

},[assenzeMap, operai]);



/* =============================
   AGGIUNGI OPERAIO
============================= */

async function aggiungiOperaio(){

if(!nome.trim()) return;

await addDoc(collection(db,"operai"),{

aziendaId:AZIENDA_ID,
nome:nome.trim(),
pagaGiornaliera:Number(paga || 0),

stato:"attivo",
inizioAssenza:"",
fineAssenza:"",

createdAt:serverTimestamp()

});

setNome("");
setPaga("");

}



/* =============================
   MODIFICA STATO
============================= */

async function cambiaStato(id,val){

  const ref = doc(db,"operai",id);

  if(val==="attivo"){
    await updateDoc(ref,{
      stato:"attivo",
      inizioAssenza:"",
      fineAssenza:""
    });
    return;
  }

  if(val==="cessato"){

    // crea snapshot riepilogo
    const operaio = operai.find(o=>o.id===id);

    if(operaio){
      const totaleGiorni = operaio.giornateLavorate || 0;
      const totalePagato = operaio.pagamentiEffettuati || 0;
      const acconti = operaio.acconti || 0;
      const saldo = totalePagato - acconti;

      await addDoc(collection(db,"cessatiSnapshot"),{
        nome: operaio.nome,
        operaioId: operaio.id,
        totaleGiorni,
        totalePagato,
        acconti,
        saldo,
        dataCessazione: new Date().toISOString().slice(0,10),
        aziendaId: AZIENDA_ID,
        createdAt: serverTimestamp()
      });
    }

    await updateDoc(ref,{
      stato:"cessato"
    });
    return;
  }

  // per ferie/malattia NON salviamo subito date
  await updateDoc(ref,{
    stato:val,
    inizioAssenza:"",
    fineAssenza:""
  });

}




/* =============================
   SALVA ASSENZA (STORICO)
============================= */

async function salvaAssenza(operaio){
  if(!operaio.inizioAssenza) return;

  const q = query(
    collection(db,"assenze"),
    where("operaioId","==",operaio.id),
    where("inizio","==",operaio.inizioAssenza),
    where("tipo","==",operaio.stato),
    where("aziendaId","==",AZIENDA_ID)
  );

  const existing = await getDocs(q);
  if(!existing.empty) return;

  const auth = getAuth();
  const user = auth.currentUser;

  await addDoc(collection(db,"assenze"),{
    operaioId: operaio.id,
    nome: operaio.nome,
    tipo: operaio.stato,
    inizio: operaio.inizioAssenza,
    fine: operaio.fineAssenza || "",
    aziendaId: AZIENDA_ID,
    createdBy: user?.displayName || user?.email || "utente",
    createdAt: serverTimestamp()
  });
}

/* =============================
   MODIFICA PERIODO
============================= */

async function cambiaPeriodo(id,campo,val,operaio){

  await updateDoc(doc(db,"operai",id),{
    [campo]:val
  });

  const q = query(
    collection(db,"assenze"),
    where("nome","==",operaio.nome),
    where("aziendaId","==",AZIENDA_ID)
  );

  const snap = await getDocs(q);

  for (const d of snap.docs) {
    const data = d.data();

    // aggiorna se è stessa assenza (tipo uguale e date compatibili)
    if (
      data.tipo === operaio.stato &&
      (
        data.inizio === operaio.inizioAssenza ||
        data.inizio === val // caso modifica inizio
      )
    ) {
      await updateDoc(doc(db,"assenze",d.id),{
        inizio: campo==="inizioAssenza" ? val : data.inizio,
        fine: campo==="fineAssenza" ? val : data.fine
      });
    }
  }

  // se cambia l'inizio, elimina eventuali duplicati vecchi
  if(campo==="inizioAssenza"){
    const dupQ = query(
      collection(db,"assenze"),
      where("nome","==",operaio.nome),
      where("aziendaId","==",AZIENDA_ID)
    );

    const dupSnap = await getDocs(dupQ);

    dupSnap.forEach(async d=>{
      const data = d.data();
      if(
        data.tipo === operaio.stato &&
        data.inizio !== val &&
        data.inizio === operaio.inizioAssenza
      ){
        await deleteDoc(doc(db,"assenze",d.id));
      }
    });
  }

  const updated = {
    ...operaio,
    [campo]: val
  };

  if(
    (updated.stato==="malattia" || updated.stato==="ferie") &&
    updated.inizioAssenza
  ){
    await salvaAssenza(updated);
  }

}



/* =============================
   MODIFICA PAGA
============================= */

async function modificaPaga(id,val){

await updateDoc(doc(db,"operai",id),{
pagaGiornaliera:Number(val)
});

}



/* =============================
   ELIMINA
============================= */

async function eliminaOperaio(id){

if(!window.confirm("Eliminare questo operaio?")) return;

await deleteDoc(doc(db,"operai",id));

}



/* =============================
   UI
============================= */

return(

<div className="card operai-page" style={{
  background: "#0f172a",
  color: "#e5e7eb",
  borderRadius: "20px",
  padding: "20px",
  boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
}}>

<h2 style={{color:"#f0b90b"}}>👷 Gestione operai</h2>






{/* FORM AGGIUNTA */}

<div style={{
  border:"1px solid rgba(255,255,255,0.1)",
  borderRadius:"18px",
  padding:"20px",
  background:"#1e293b",
  boxShadow:"0 6px 20px rgba(0,0,0,0.4)",
  marginBottom:"30px",
  marginTop:"20px",
  maxWidth:"650px"
}}>

<h3 style={{marginBottom:"15px"}}>➕ Aggiungi operaio</h3>

<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>

<input
placeholder="Nome operaio"
value={nome}
onChange={e=>setNome(e.target.value)}
style={{flex:1,minWidth:200}}
/>

<input
placeholder="Paga giornaliera"
type="number"
value={paga}
onChange={e=>setPaga(e.target.value)}
style={{width:160}}
/>

<button
className="btn-primary"
onClick={aggiungiOperaio}
>
Aggiungi
</button>

</div>

</div>


{/* TABELLA */}

<div className="operai-table-wrap" style={{marginTop:"20px"}}>
<div style={{
    border:"1px solid rgba(255,255,255,0.1)",
    borderRadius:"18px",
    padding:"15px",
    background:"#1e293b",
    boxShadow:"0 6px 25px rgba(0,0,0,0.4)"
}}>

<h3 style={{marginBottom:"15px"}}>📋 Operai attivi</h3>
<table className="operai-table" style={{tableLayout:"auto", width:"100%", minWidth:"650px"}}>

<thead className="desktop-only">

<tr>
  <th style={{width:"22%", textAlign:"left"}}>Operaio</th>
  <th style={{width:"14%", textAlign:"left"}}>Paga</th>
  <th style={{width:"18%", textAlign:"left"}}>Stato</th>
  <th style={{width:"35%", textAlign:"left"}}>Periodo</th>
  <th style={{width:"8%", textAlign:"left"}}>Storico</th>
  <th style={{width:"5%", textAlign:"center"}}>Elimina</th>
</tr>

</thead>

<tbody style={{display:"table-row-group"}}>

{operai.filter(o=>o.stato!=="cessato").map(o=>{
  return (
    <>
      {/* DESKTOP ROW */}
      <tr key={o.id} className="desktop-only" style={{
        height:64,
        borderBottom:"1px solid #e2e8f0",
        transition:"background 0.2s"
      }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
      >
        <td style={{
          whiteSpace:"nowrap",
          padding:"12px 6px",
        }}>
          <span style={{
            whiteSpace:"nowrap",
            fontWeight:600,
            fontSize:18,
            color:"#f8fafc",
            letterSpacing:0.3
          }}>
            👷 {o.nome}
          </span>
        </td>
        <td style={{
          padding:"12px 6px",
          display:"flex",
          justifyContent:"flex-end"
        }}>
          <div style={{display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap"}}>
            <span style={{fontWeight:500}}>€ {o.pagaGiornaliera || 0}</span>
            <button
              className="btn-ghost"
              style={{padding:"4px 6px", fontSize:12}}
              onClick={()=>{
                const nuova = prompt("Nuova paga giornaliera:", o.pagaGiornaliera);
                if(nuova!==null){
                  modificaPaga(o.id, nuova);
                }
              }}
            >
              ✏️
            </button>
          </div>
        </td>
        <td style={{padding:"12px 6px"}}>
          <select
            value={o.stato || "attivo"}
            disabled={(o.stato==="malattia" || o.stato==="ferie") && o.inizioAssenza}
            onChange={async e=>{
              const val = e.target.value;
              await cambiaStato(o.id,val);
            }}
            style={{
              minWidth:120,
              padding:"6px 10px",
              borderRadius:"8px",
              fontWeight:500,
              background:
                o.stato==="malattia" ? "#fff7ed" :
                o.stato==="ferie" ? "#ecfeff" :
                "#ecfdf5",
              color:
                o.stato==="malattia" ? "#ea580c" :
                o.stato==="ferie" ? "#0891b2" :
                "#16a34a",
              border:"1px solid rgba(255,255,255,0.1)",
              opacity:
                ((o.stato==="malattia" || o.stato==="ferie") && o.inizioAssenza)
                  ? 0.5
                  : 1,
              cursor:
                ((o.stato==="malattia" || o.stato==="ferie") && o.inizioAssenza)
                  ? "not-allowed"
                  : "pointer"
            }}
          >
            <option value="attivo">Attivo</option>
            <option value="malattia">Malattia</option>
            <option value="ferie">Ferie</option>
            <option value="cessato">Cessato</option>
          </select>
        </td>
        <td style={{whiteSpace:"nowrap", padding:"12px 6px"}}>
          {(o.stato==="malattia" || o.stato==="ferie") ? (
            o.inizioAssenza ? (
              <span style={{whiteSpace:"nowrap", fontSize:15, fontWeight:600}}>
                {o.stato==="malattia" ? "🟠 Malattia" : "🔵 Ferie"} ·
                dal {formatDate(o.inizioAssenza)}
                {o.fineAssenza ? ` al ${formatDate(o.fineAssenza)}` : " (in corso)"}
              </span>
            ) : (
              <div style={{
                display:"flex",
                flexDirection:"column",
                alignItems:"center",
                gap:6,
                width:"100%",
                marginTop:6
              }}>
                <div style={{
                  display:"flex",
                  alignItems:"center",
                  gap:8
                }}>
                  <input
                    type="date"
                    value={inizioAssenza}
                    onChange={e=>setInizioAssenza(e.target.value)}
                    style={{padding:"5px", borderRadius:"6px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"white"}}
                  />
                  <span style={{opacity:0.6}}>→</span>
                  <input
                    type="date"
                    value={fineAssenza}
                    onChange={e=>setFineAssenza(e.target.value)}
                    style={{padding:"5px", borderRadius:"6px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"white"}}
                  />
                </div>
                <div style={{
                  display:"flex",
                  justifyContent:"center",
                  alignItems:"center",
                  gap:10
                }}>
                  <button
                    className="btn-ghost"
                    style={{
                      fontSize:11,
                      padding:"4px 10px",
                      display:"flex",
                      alignItems:"center",
                      gap:4,
                      border:"1px solid rgba(34,197,94,0.4)",
                      color:"#4ade80"
                    }}
                    onClick={async ()=>{
                      if(fineAssenza && inizioAssenza && fineAssenza < inizioAssenza){
                        alert("La data di fine non può essere precedente alla data di inizio");
                        return;
                      }
                      if(!inizioAssenza){
                        alert("Inserisci la data di inizio");
                        return;
                      }
                      await updateDoc(doc(db,"operai",o.id),{
                        stato:o.stato,
                        inizioAssenza:inizioAssenza,
                        fineAssenza:fineAssenza || ""
                      });
                      await salvaAssenza({
                        ...o,
                        id: o.id,
                        inizioAssenza:inizioAssenza,
                        fineAssenza:fineAssenza || ""
                      });
                      setInizioAssenza("");
                      setFineAssenza("");
                    }}
                  >
                    💾 Salva
                  </button>
                  <button
                    className="btn-ghost"
                    style={{
                      fontSize:11,
                      padding:"4px 10px",
                      display:"flex",
                      alignItems:"center",
                      gap:4,
                      border:"1px solid rgba(248,113,113,0.4)",
                      color:"#f87171"
                    }}
                    onClick={async ()=>{
                      await updateDoc(doc(db,"operai",o.id),{
                        stato:"attivo",
                        inizioAssenza:"",
                        fineAssenza:""
                      });
                      setInizioAssenza("");
                      setFineAssenza("");
                    }}
                  >
                    ✖ Annulla
                  </button>
                </div>
              </div>
            )
          ) : (
            <span style={{opacity:0.4}}>-</span>
          )}
        </td>
        <td style={{padding:"12px 6px"}}>
          <button
            className="btn-ghost"
            style={{fontSize:12}}
            onClick={() => navigate(`/storico-operaio?nome=${o.nome}`)}
          >
            📄
          </button>
        </td>
        <td style={{
          padding:"12px 6px",
          display:"flex",
          justifyContent:"flex-end",
          gap:"8px"
        }}>
          <button
            className="btn-ghost"
            style={{
              fontSize:12,
              border:"1px solid rgba(255,80,80,0.3)",
              color:"#ff6b6b"
            }}
            onClick={()=>eliminaOperaio(o.id)}
            title="Elimina operaio"
          >
            🗑️
          </button>
        </td>
      </tr>
      {/* MOBILE CARD ROW */}
      <tr className="mobile-row">
        <td colSpan="6">
          <div
            style={{
              border:"1px solid rgba(255,255,255,0.08)",
              borderRadius:"16px",
              padding:"16px",
              background:"rgba(255,255,255,0.04)",
              width:"100%",
              boxSizing:"border-box"
            }}
          >
            <div style={{
              fontWeight:700,
              fontSize:18,
              marginBottom:10
            }}>
              👷 {o.nome}
            </div>
            <div style={{
              height:"1px",
              background:"rgba(255,255,255,0.08)",
              marginBottom:"12px"
            }} />
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
              <span style={{opacity:0.6}}>Paga</span>

              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <span style={{fontWeight:600}}>€ {o.pagaGiornaliera || 0}</span>

                <button
                  className="btn-ghost"
                  style={{
                    padding:"6px 10px",
                    borderRadius:"10px",
                    border:"1px solid rgba(255,255,255,0.1)"
                  }}
                  onClick={()=>{
                    const nuova = prompt("Nuova paga giornaliera:", o.pagaGiornaliera);
                    if(nuova!==null){
                      modificaPaga(o.id, nuova);
                    }
                  }}
                >
                  ✏️
                </button>
              </div>
            </div>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
              <span style={{opacity:0.6}}>Stato</span>
              <select
                value={o.stato || "attivo"}
                onChange={async e=>{
                  const val = e.target.value;
                  await cambiaStato(o.id,val);
                }}
                style={{
                  padding:"8px 12px",
                  borderRadius:"10px",
                  fontWeight:600,
                  background:
                    o.stato==="malattia" ? "#fff7ed" :
                    o.stato==="ferie" ? "#ecfeff" :
                    o.stato==="cessato" ? "rgba(255,0,0,0.15)" :
                    "rgba(34,197,94,0.15)",
                  color:
                    o.stato==="malattia" ? "#ea580c" :
                    o.stato==="ferie" ? "#0891b2" :
                    o.stato==="cessato" ? "#ef4444" :
                    "#22c55e",
                  border:"1px solid rgba(255,255,255,0.1)",
                  minWidth:"120px",
                  textAlign:"center"
                }}
              >
                <option value="attivo">Attivo</option>
                <option value="malattia">Malattia</option>
                <option value="ferie">Ferie</option>
                <option value="cessato">Cessato</option>
              </select>
            </div>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
              <span style={{opacity:0.6}}>Storico</span>
              <button className="btn-ghost" onClick={() => navigate(`/storico-operaio?nome=${o.nome}`)}>📄</button>
            </div>
            <div style={{display:"flex", justifyContent:"space-between"}}>
              <span style={{opacity:0.6}}>Elimina</span>
              <button className="btn-ghost" onClick={()=>eliminaOperaio(o.id)}>🗑️</button>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
})}

</tbody>

 </table>
 </div>

{/* SEZIONE CONTRATTI CESSATI */}

<div style={{
  marginTop:"30px",
  border:"1px solid rgba(255,255,255,0.08)",
  borderRadius:"12px",
  padding:"15px",
  background:"#1e293b",
  boxShadow:"0 6px 20px rgba(0,0,0,0.4)"
}}>

<div
  style={{display:"flex", alignItems:"center", cursor:"pointer", gap:8}}
  onClick={()=>setShowCessati(prev=>!prev)}
>
  <span>📦</span>
  <h3 style={{margin:0, opacity:0.8}}>Contratti terminati</h3>
  <span style={{marginLeft:"auto"}}>{showCessati ? "▲" : "▼"}</span>
</div>

{showCessati && (
  <div style={{marginTop:15, display:"flex", flexDirection:"column", gap:10}}>
    {operai.filter(o=>o.stato==="cessato").map(o=>(
      <div key={o.id} style={{
        padding:"14px",
        border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:"10px",
        display:"flex",
        justifyContent:"space-between",
        alignItems:"center",
        background:"rgba(255,255,255,0.04)"
      }}>

        <div style={{display:"flex", flexDirection:"column"}}>
          <span style={{fontWeight:600}}>👷 {o.nome}</span>
          <span style={{fontSize:12, opacity:0.6}}>
            {o.giornateLavorate || 0} gg · € {o.pagamentiEffettuati || 0}
          </span>
        </div>

        <div style={{display:"flex", alignItems:"center", gap:10}}>

          <span style={{
            ...badgeStyleBase,
            background:"rgba(255,0,0,0.2)",
            color:"#ff6b6b"
          }}>
            🔴 Cessato
          </span>

          <button
            className="btn-ghost"
            style={{fontSize:12}}
            onClick={() => navigate(`/snapshot-operaio?id=${o.id}`)}
            title="Scheda finale"
          >
            📊
          </button>

          <button
            className="btn-ghost"
            style={{fontSize:12}}
            onClick={() => cambiaStato(o.id, "attivo")}
            title="Riattiva"
          >
            🔄
          </button>

        </div>

      </div>
    ))}
  </div>
)}
</div>
<style>{`
.mobile-row {
  display: none;
}

@media (max-width: 768px) {

  .desktop-only {
    display: none;
  }

  .mobile-row {
    display: table-row;
  }

  .operai-table {
    min-width: 100% !important;
  }

  .mobile-row td {
    display: block;
    width: 100%;
    padding: 10px 0;
    border: none !important;
  }

  .mobile-row > td {
    width: 100%;
  }

  .mobile-row > td > div {
    width: 100%;
  }

  /* NOME */
  .mobile-row td:nth-child(1) {
    font-weight: 700;
    font-size: 18px;
    justify-content: flex-start;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 8px;
  }

  /* LABELS */
  .mobile-row td:nth-child(2)::before { content: "Paga"; }
  .mobile-row td:nth-child(3)::before { content: "Stato"; }
  .mobile-row td:nth-child(4)::before { content: "Periodo"; }
  .mobile-row td:nth-child(5)::before { content: "Storico"; }
  .mobile-row td:nth-child(6)::before { content: "Elimina"; }

  .mobile-row td::before {
    font-size: 13px;
    color: #94a3b8;
    font-weight: 500;
  }

  /* BOTTONI DESTRA */
  .mobile-row td:nth-child(5),
  .mobile-row td:nth-child(6) {
    justify-content: flex-end;
  }

  select {
    width: 55% !important;
    min-width: unset !important;
  }

  button {
    padding: 6px 10px !important;
  }

}
`}</style>

</div>

</div>

);

}