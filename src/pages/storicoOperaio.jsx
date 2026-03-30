import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../services/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc
} from "firebase/firestore";

function formatDateFull(dateStr){
  if(!dateStr) return "";
  const d = new Date(dateStr);
  if(isNaN(d)) return dateStr;
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function StoricoOperaio(){

  const [storico,setStorico] = useState([]);
  const [editId,setEditId] = useState(null);
  const [editData,setEditData] = useState({});

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nome = params.get("nome");
  const navigate = useNavigate();

  useEffect(()=>{

    if(!nome) return;

    const q = query(
      collection(db,"assenze"),
      where("nome","==",nome)
    );

    const unsub = onSnapshot(q, snap=>{
      const list = snap.docs.map(d=>({
        id:d.id,
        ...d.data()
      }));

      list.sort((a,b)=> new Date(b.inizio) - new Date(a.inizio));

      setStorico(list);
    });

    return ()=>unsub();

  },[nome]);

  async function eliminaStorico(id){
    if(!window.confirm("Eliminare questa assenza?")) return;
    await deleteDoc(doc(db,"assenze",id));
  }

  return(
    <div className="card" style={{ background:"#0f172a", padding:"20px", borderRadius:"16px" }}>

      <div style={{marginBottom:20}}>
        <button
          className="btn-ghost"
          onClick={()=>navigate(-1)}
          style={{
            display:"flex",
            alignItems:"center",
            gap:"6px",
            fontWeight:600,
            fontSize:"14px"
          }}
        >
          ← Indietro
        </button>
      </div>

      <h2 style={{marginBottom:"15px"}}>📄 Storico {nome}</h2>

      {storico.length===0 && (
        <p style={{opacity:0.6}}>Nessuno storico disponibile</p>
      )}

      {storico.map(s=>{
        const tipo = (s.tipo || "").toLowerCase();
        const isEditing = editId === s.id;

        return (
        <div key={s.id} style={{
          padding:"14px",
          border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:"10px",
          marginBottom:"10px",
          display:"flex",
          justifyContent:"space-between",
          alignItems:"center",
          background:"rgba(255,255,255,0.06)",
          boxShadow:"0 4px 12px rgba(0,0,0,0.25)",
          transition:"all .2s ease"
        }}
        onMouseEnter={e=>e.currentTarget.style.transform="translateX(4px)"}
        onMouseLeave={e=>e.currentTarget.style.transform="translateX(0)"}
        >

          {isEditing ? (
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <input
                type="date"
                value={editData.inizio || s.inizio}
                onChange={e=>setEditData(prev=>({...prev, inizio:e.target.value}))}
                style={{
                  padding:"6px",
                  borderRadius:"6px",
                  border:"1px solid rgba(255,255,255,0.1)",
                  background:"rgba(255,255,255,0.05)",
                  color:"#fff"
                }}
              />
              <input
                type="date"
                value={editData.fine || s.fine}
                onChange={e=>setEditData(prev=>({...prev, fine:e.target.value}))}
                style={{
                  padding:"6px",
                  borderRadius:"6px",
                  border:"1px solid rgba(255,255,255,0.1)",
                  background:"rgba(255,255,255,0.05)",
                  color:"#fff"
                }}
              />

              <button
                className="btn-primary"
                style={{fontSize:11}}
                onClick={async ()=>{
                  await updateDoc(doc(db,"assenze",s.id),{
                    inizio: editData.inizio || s.inizio,
                    fine: editData.fine || s.fine
                  });
                  setEditId(null);
                  setEditData({});
                }}
              >
                💾
              </button>
            </div>
          ) : (
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <span style={{
                fontWeight:600,
                color: tipo==="malattia" ? "#ffb020" : "#00c2ff"
              }}>
                {tipo==="malattia" ? "🟠 Malattia" : "🔵 Ferie"}
              </span>
              <span style={{
                fontSize:16,
                fontWeight:700,
                letterSpacing:0.3,
                marginLeft:12
              }}>
                da {formatDateFull(s.inizio)} a {s.fine ? formatDateFull(s.fine) : "in corso"}
              </span>
              <div style={{
                display:"flex",
                flexDirection:"column",
                fontSize:12,
                opacity:0.6,
                marginLeft:12
              }}>
                <span>
                  👤 Inserito da: {s.createdBy || "-"}
                </span>

                {s.createdAt && (
                  <span>
                    📅 {new Date(
                      s.createdAt.seconds ? s.createdAt.seconds * 1000 : s.createdAt
                    ).toLocaleDateString("it-IT")}
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{display:"flex", gap:6}}>
            {!isEditing && (
              <button
                className="btn-ghost"
                onClick={()=>{
                  setEditId(s.id);
                  setEditData({inizio:s.inizio, fine:s.fine});
                }}
                title="Modifica"
              >
                ✏️
              </button>
            )}

            <button
              className="btn-ghost"
              style={{
                border:"1px solid rgba(255,80,80,0.3)",
                color:"#ff6b6b",
                fontSize:12
              }}
              onClick={()=>eliminaStorico(s.id)}
              title="Elimina"
            >
              🗑️
            </button>
          </div>

        </div>
      );
      })}

    </div>
  );

}