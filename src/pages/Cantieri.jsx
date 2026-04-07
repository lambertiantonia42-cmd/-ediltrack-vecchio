// src/pages/Cantieri.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../services/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import "./Cantieri.css";
import { AZIENDA_ID } from "../appConfig";
import { logActivity } from "../utils/logActivity";

async function geocodeAddress(indirizzo) {
  try {
    if (!indirizzo || !indirizzo.trim()) {
      return { lat: null, lng: null };
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(indirizzo)}`;

    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "ediltrack-app (antonio@example.com)"
      }
    });

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return { lat: null, lng: null };
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };

  } catch (err) {
    console.log("Geocoding error:", err);
    return { lat: null, lng: null };
  }
}

function sortByDateLikeDesc(a, b, field = "data") {
  const da = String(a?.[field] || "");
  const dbb = String(b?.[field] || "");
  if (da !== dbb) return dbb.localeCompare(da);

  const ta = a?.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
  const tb = b?.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
  return tb - ta;
}

function sortCantieri(a, b) {
  const ta = a?.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
  const tb = b?.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
  if (ta !== tb) return tb - ta;
  return String(a?.nome || "").localeCompare(String(b?.nome || ""), "it");
}

export default function Cantieri() {

  const navigate = useNavigate();

  const [cantieri, setCantieri] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState("Tutti");

  const [nomeNew, setNomeNew] = useState("");
  const [statoNew, setStatoNew] = useState("Attivo");
  const [dataInizioNew, setDataInizioNew] = useState("");
  const [indirizzoNew, setIndirizzoNew] = useState("");
  const [loadingNew, setLoadingNew] = useState(false);

  // Modifica cantiere
  const [editingCantiere, setEditingCantiere] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [editIndirizzo, setEditIndirizzo] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(false);

  const [presenzeAll, setPresenzeAll] = useState([]);
  const [speseAll, setSpeseAll] = useState([]);

  // Mobile-only modal for 'Crea nuovo cantiere'
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [err, setErr] = useState("");

  const [filtroData, setFiltroData] = useState("");
  const [meseAperto, setMeseAperto] = useState(null);
  const [sectionOpen, setSectionOpen] = useState("presenze");

const modalRef = useRef(null);
const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

useEffect(() => {
  if (meseAperto && modalRef.current) {
    // porta SEMPRE la modale davanti agli occhi
    modalRef.current.scrollIntoView({
      behavior: "instant",
      block: "start"
    });

    // reset scroll interno
    modalRef.current.scrollTop = 0;

    // blocca scroll pagina sotto
    document.body.style.overflow = "hidden";
  }

  return () => {
    document.body.style.overflow = "auto";
  };
}, [meseAperto]);


  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {

    const qRef = query(
      collection(db, "cantieri"),
      where("aziendaId", "==", AZIENDA_ID)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {

        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort(sortCantieri);

        setCantieri(list);

        if (!selectedId && list.length > 0) setSelectedId(list[0].id);

        if (selectedId && !list.some((c) => c.id === selectedId) && list.length > 0) {
          setSelectedId(list[0].id);
        }

      },
      (e) => setErr(e?.message || "Errore lettura cantieri.")
    );

    return () => unsub();

  }, []);

  const selected = useMemo(
    () => cantieri.find((c) => c.id === selectedId) || null,
    [cantieri, selectedId]
  );

  const nomeSelected = (selected?.nome || "").trim();

  useEffect(() => {

    const qRef = query(
      collection(db, "presenze"),
      where("aziendaId", "==", AZIENDA_ID),
      limit(800)
    );

    const unsub = onSnapshot(qRef, (snap) => {

      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      all.sort((a, b) => sortByDateLikeDesc(a, b, "data"));

      setPresenzeAll(all);

    });

    return () => unsub();

  }, []);

  useEffect(() => {

    const qRef = query(
      collection(db, "spese"),
      where("aziendaId", "==", AZIENDA_ID),
      limit(800)
    );

    const unsub = onSnapshot(qRef, (snap) => {

      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      all.sort((a, b) => sortByDateLikeDesc(a, b, "data"));

      setSpeseAll(all);

    });

    return () => unsub();

  }, []);

  const listaFiltrata = useMemo(() => {

    const s = search.trim().toLowerCase();

    return cantieri.filter((c) => {

      const okNome = !s || String(c.nome || "").toLowerCase().includes(s);

      const okStato =
        filterStato === "Tutti" || String(c.stato || "") === filterStato;

      return okNome && okStato;

    });

  }, [cantieri, search, filterStato]);

  const presenzeSelected = useMemo(() => {

    if (!nomeSelected) return [];

    let list = presenzeAll.filter(
      (r) => String(r.cantiere || "").trim() === nomeSelected
    );

    if (filtroData) {
      list = list.filter(r => String(r.data || "").startsWith(filtroData));
    }

    return list;

  }, [presenzeAll, nomeSelected, filtroData]);

  const speseSelected = useMemo(() => {

    if (!nomeSelected) return [];

    return speseAll.filter(
      (r) => String(r.cantiere || "").trim() === nomeSelected
    );

  }, [speseAll, nomeSelected]);

  const ultimePresenze = useMemo(
    () => presenzeSelected.slice(0, 6),
    [presenzeSelected]
  );

  const ultimeSpese = useMemo(
    () => speseSelected.slice(0, 6),
    [speseSelected]
  );

  const totSpese = useMemo(() => {
    return speseSelected.reduce(
      (sum, r) => sum + Number(r.importo || 0),
      0
    );
  }, [speseSelected]);

  const countPresenze = useMemo(
    () => presenzeSelected.length,
    [presenzeSelected]
  );

  const operaiPreview = useMemo(() => {

    const uniq = new Set(
      ultimePresenze
        .map((p) => (p.dipendente || "").trim())
        .filter(Boolean)
    );

    return Array.from(uniq);

  }, [ultimePresenze]);

  async function creaCantiere() {

    setErr("");

    const u = auth.currentUser;

    if (!u) return setErr("Non sei autenticato.");

    if (!nomeNew.trim()) {
      return setErr("Inserisci un nome cantiere.");
    }

    if (!indirizzoNew.trim()) {
      return setErr("Inserisci un indirizzo completo (via + città) per vedere il cantiere sulla mappa.");
    }

    try {

      setLoadingNew(true);

      const coords = await geocodeAddress(indirizzoNew.trim());

      // Se non trova coordinate, NON bloccare ma salva comunque
      if (!coords.lat || !coords.lng) {
        console.log("Geocoding fallito, salvo senza coordinate");
      }

      const payload = {
        aziendaId: AZIENDA_ID,
        nome: nomeNew.trim(),
        stato: statoNew,
        indirizzo: indirizzoNew.trim(),
        dataInizio: dataInizioNew || null,
        lat: coords.lat,
        lng: coords.lng,
        createdAt: serverTimestamp(),
        createdBy: u.uid,
        createdByEmail: u.email || "",
      };

      const ref = await addDoc(collection(db, "cantieri"), payload);

      await logActivity({
        tipo: "cantiere",
        azione: "create",
        cantiere: payload.nome,
        targetId: ref.id,
        note: `Creato cantiere • stato: ${payload.stato}`,
      });

      setNomeNew("");
      setStatoNew("Attivo");
      setIndirizzoNew("");
      setDataInizioNew("");
   
    } catch (e) {

      console.log(e);
      setErr(e?.message || "Errore creazione cantiere.");

    } finally {

      setLoadingNew(false);

    }

  }

  async function deleteCantiere(c) {

    const ok = confirm(
      `Eliminare il cantiere "${c.nome}"?\n\nAttenzione: presenze/spese collegate NON verranno cancellate.`
    );

    if (!ok) return;

    await deleteDoc(doc(db, "cantieri", c.id));

  }

  async function updateStatoCantiere(c, newStato) {

    const u = auth.currentUser;

    if (!u) return;

    await updateDoc(doc(db, "cantieri", c.id), {
      stato: newStato,
      updatedAt: serverTimestamp(),
      updatedBy: u.uid,
      updatedByEmail: u.email || "",
    });

  }

  async function salvaModificaCantiere() {

    if (!editingCantiere) return;

    const u = auth.currentUser;
    if (!u) return;

    if (!editNome.trim()) {
      setErr("Nome cantiere obbligatorio.");
      return;
    }

    try {

      setLoadingEdit(true);

      const coords = editIndirizzo.trim()
        ? await geocodeAddress(editIndirizzo.trim())
        : { lat: null, lng: null };

      await updateDoc(doc(db, "cantieri", editingCantiere.id), {
        nome: editNome.trim(),
        indirizzo: editIndirizzo.trim(),
        lat: coords.lat,
        lng: coords.lng,
        updatedAt: serverTimestamp(),
        updatedBy: u.uid
      });

      setEditingCantiere(null);

    } catch (e) {
      console.log(e);
      setErr("Errore modifica cantiere");
    } finally {
      setLoadingEdit(false);
    }

  }

  const infoBlock = (
    <>
      <div style={{
        marginTop: "12px",
        marginBottom: "4px",
        fontSize: "12px",
        opacity: 0.6,
        letterSpacing: "0.5px"
      }}>
        INFORMAZIONI CANTIERE
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: "12px",
          marginTop: "16px",
          alignItems: "stretch"
        }}
      >
        <div className="mini-card" style={{ boxShadow:"0 4px 12px rgba(0,0,0,0.08)", transition:"all .2s ease", padding:"10px", minHeight:"70px", maxWidth:"100%" }}>
          <div className="mini-label">Data creazione</div>
          <div className="mini-sub" style={{ fontWeight: 600 }}>
            {selected?.dataInizio
              ? new Date(selected.dataInizio).toLocaleDateString("it-IT")
              : selected?.createdAt?.toDate
              ? selected.createdAt.toDate().toLocaleDateString("it-IT")
              : "-"}
          </div>
        </div>

        <div className="mini-card" style={{ boxShadow:"0 4px 12px rgba(0,0,0,0.08)", transition:"all .2s ease", padding:"10px", minHeight:"70px", maxWidth:"100%" }}>
          <div className="mini-label">Ultimo aggiornamento</div>
          <div className="mini-sub" style={{ fontWeight: 600 }}>
            {selected?.updatedAt?.toDate
              ? selected.updatedAt.toDate().toLocaleDateString("it-IT")
              : "-"}
          </div>
        </div>

        <div className="mini-card" style={{ boxShadow:"0 4px 12px rgba(0,0,0,0.08)", transition:"all .2s ease", padding:"10px", minHeight:"70px", maxWidth:"100%" }}>
          <div className="mini-label">Ultima modifica</div>
          <div className="mini-sub" style={{ fontWeight: 600, textTransform: "capitalize" }}>
            {(selected?.updatedByEmail || selected?.createdByEmail || "").split("@")[0] || "-"}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      className="cantieri-wrap"
      style={{
        background: "var(--bg-main)",
        color: "var(--text-main)",
        minHeight: "100vh",
        padding: isMobile ? "6px" : "20px",
        width: "100%",
        maxWidth: "1400px",
        margin: "0 auto",
        overflowX: "hidden"
      }}
    >
      <div className="panel" style={{ background: "transparent", width: "100%", maxWidth: "100%" }}>

        {/* HEADER PAGINA */}
        <div style={{ 
          marginBottom: "16px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "var(--bg-main)",
          paddingTop: "10px",
          paddingBottom: "10px",
          backdropFilter: "blur(6px)"
        }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-main)" }}>🏗 Gestione cantieri</h1>
        </div>




        {/* CARD 1 - CREAZIONE */}
        <div
          className="detail-box"
          style={{
            marginBottom: "16px",
            background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(0,0,0,0.4))",
            border: "1px solid rgba(34,197,94,0.25)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            borderRadius: "18px",
            transition: "all .2s ease",
            padding: isMobile ? "16px" : undefined,
            width: "100%",
            marginLeft: undefined,
            marginRight: undefined,
            borderRadius: isMobile ? "14px" : undefined,
            display: isMobile ? "none" : "block",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 600 }}>➕ Aggiungi nuovo cantiere</h2>
              <p className="muted">Inserisci i dati per creare un nuovo cantiere</p>
            </div>
          </div>

          <div className="cantieri-create" style={{ marginTop: "12px" }}>
            <input
              className="input"
              placeholder="Nuovo cantiere…"
              value={nomeNew}
              onChange={(e) => setNomeNew(e.target.value)}
            />

            <input
              className="input"
              placeholder="Indirizzo completo (via + città)"
              value={indirizzoNew}
              onChange={(e) => setIndirizzoNew(e.target.value)}
            />

            <input
              type="date"
              className="input"
              value={dataInizioNew}
              onChange={(e) => setDataInizioNew(e.target.value)}
            />

            <button
              className="btn-primary"
              onClick={creaCantiere}
              disabled={loadingNew}
            >
              {loadingNew ? "Creazione..." : "Crea"}
            </button>
          </div>
        </div>

        {/* Mobile: button to open modal for nuovo cantiere */}
        {isMobile && (
          <button
            className="btn-primary"
            style={{ width: "100%", marginBottom: "10px" }}
            onClick={() => setShowCreateModal(true)}
          >
            ➕ Nuovo cantiere
          </button>
        )}

        <div
          className="cantieri-layout"
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: isMobile ? "10px" : "12px",
            width: "100%",
            maxWidth: "100%",
            alignItems: "flex-start"
          }}
        >

          <aside
            className="cantieri-left"
            style={{
              width: isMobile ? "100%" : "320px",
              flexShrink: 0
            }}
          >
            <div className="detail-box" style={{
              padding: "16px",
              marginTop: "-8px",
            background:"linear-gradient(135deg, rgba(59,130,246,0.15), rgba(15,23,42,0.95))",
            border:"1px solid rgba(59,130,246,0.25)",       
              boxShadow:"0 4px 20px rgba(0,0,0,0.06)",
              border:"1px solid rgba(255,255,255,0.08)",
              backdropFilter:"blur(6px)",
              padding: isMobile ? "16px" : undefined,
              width: "100%",
              marginLeft: undefined,
              marginRight: undefined,
              borderRadius: isMobile ? "14px" : undefined,
              overflow: "hidden",
              borderLeft: "none",
              borderRight: "none",
              backgroundClip: "padding-box",
            }}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px"}}>
                <span style={{fontWeight:600}}>📂 Lista cantieri</span>
                <span style={{fontSize:"12px", opacity:0.6}}>{listaFiltrata.length} totali</span>
              </div>

            <div className="cantieri-filters" style={{ marginTop: "-4px" }}>

              <input
                className="input"
                placeholder="Cerca cantiere…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="select"
                value={filterStato}
                onChange={(e) => setFilterStato(e.target.value)}
              >
                <option value="Tutti">Tutti</option>
                <option value="Attivo">Attivo</option>
                <option value="Completato">Completato</option>
                <option value="In pausa">In pausa</option>
              </select>

            </div>

            <div className="cantieri-list" style={{ display:"flex", flexDirection:"column", gap:"10px" }}>

              {listaFiltrata.map((c) => (

                <button
                  key={c.id}
                  className={`cantiere-row ${selectedId === c.id ? "active" : ""}`}
                  style={{
                    marginBottom: "10px",
                    background: selectedId === c.id
                      ? `linear-gradient(135deg, hsl(${(c.nome?.length || 5) * 40}, 70%, 20%), rgba(20,20,30,0.9))`
                      : `linear-gradient(135deg, rgba(255,255,255,0.05), rgba(0,0,0,0.2))`,
                    border:"1px solid rgba(255,255,255,0.06)",
                    transition:"all .2s ease",
                    cursor:"pointer",
                    touchAction: "manipulation",
                    width:"100%",
                    border:"none",
                    outline:"none",
                  }}
                  onClick={() => setSelectedId(c.id)}
                  onTouchStart={() => setSelectedId(c.id)}
                  onMouseEnter={!isMobile ? (e => e.currentTarget.style.transform = "translateY(-4px)") : undefined}
                  onMouseLeave={!isMobile ? (e => e.currentTarget.style.transform = "translateY(0px)") : undefined}
                >

                  <div className="row-left">
                    <div className="row-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: `hsl(${(c.nome?.length || 5) * 40}, 70%, 55%)`,
                          boxShadow: `0 0 6px hsl(${(c.nome?.length || 5) * 40}, 70%, 55%)`
                        }}
                      />
                      {c.nome}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
                    <button
                      className="row-trash"
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCantiere(c);
                        setEditNome(c.nome || "");
                        setEditIndirizzo(c.indirizzo || "");
                      }}
                    >
                      ✏️
                    </button>

                    <button
                      className="row-trash"
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCantiere(c);
                      }}
                    >
                      🗑
                    </button>
                  </div>

                </button>

              ))}

            </div>

            </div>
          </aside>

          <section
            className="cantieri-right"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              width: "100%",
              minWidth: 0
            }}
          >
            <div style={{
              background:"transparent",
              padding:"12px",
              borderRadius:"16px",
              border:"none"
            }}>

            {editingCantiere && (
              <div className="detail-box" style={{
                marginBottom: "16px",
                padding: isMobile ? "16px" : undefined,
                width:"100%",
                marginLeft: undefined,
                marginRight: undefined,
                borderRadius: isMobile ? "14px" : undefined,
              }}>

                <div className="detail-box-title">✏️ Modifica cantiere</div>

                <input
                  className="input"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  placeholder="Nome cantiere"
                />

                <input
                  className="input"
                  value={editIndirizzo}
                  onChange={(e) => setEditIndirizzo(e.target.value)}
                  placeholder="Indirizzo"
                  style={{ marginTop: "8px" }}
                />

                <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
                  <button
                    className="btn-primary"
                    onClick={salvaModificaCantiere}
                    disabled={loadingEdit}
                  >
                    {loadingEdit ? "Salvataggio..." : "Salva"}
                  </button>

                  <button
                    className="btn-ghost"
                    onClick={() => setEditingCantiere(null)}
                  >
                    Annulla
                  </button>
                </div>

              </div>
            )}

            {selected && (

              <>
                {/* HEADER PRO */}
                <div className="detail-top" style={{
                  padding: "8px 2px",
                  background: "none",
                  boxShadow: "none",
                  border: "none",
                  backdropFilter: "none",
                  borderRadius: "0"
                }}>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

                    <div className="detail-kicker">Cantiere</div>

                    <h3 className="detail-name" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: `hsl(${(selected.nome?.length || 5) * 40}, 70%, 55%)`,
                          boxShadow: `0 0 8px hsl(${(selected.nome?.length || 5) * 40}, 70%, 55%)`
                        }}
                      />
                      {selected.nome}
                    </h3>

                    {selected.indirizzo && (
                      <div className="detail-status">
                        📍 {selected.indirizzo}
                      </div>
                    )}

                    {selected.committente && (
                      <div className="detail-status dim">
                        👤 {selected.committente}
                      </div>
                    )}

                  </div>

                  {/* stato badge */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", justifyContent: "center" }}>

                    <select
                      className="select small"
                      value={selected.stato}
                      onChange={(e) => updateStatoCantiere(selected, e.target.value)}
                      style={{
                        background:
                          selected.stato === "Attivo"
                            ? "rgba(34,197,94,.15)"
                            : selected.stato === "In pausa"
                            ? "rgba(251,191,36,.15)"
                            : "rgba(239,68,68,.15)",
                        color:
                          selected.stato === "Attivo"
                            ? "#22c55e"
                            : selected.stato === "In pausa"
                            ? "#fbbf24"
                            : "#ef4444",
                        border: "1px solid rgba(255,255,255,0.08)",
                        fontWeight: 600,
                        borderRadius: "10px",
                        padding: "6px 10px"
                      }}
                    >
                      <option>Attivo</option>
                      <option>Completato</option>
                      <option>In pausa</option>
                    </select>

                  </div>

                </div>

                {/* Desktop: info block */}
                {!isMobile && infoBlock}

                {/* KPI */}
                <div
                  className="detail-cards"
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "row" : "row",
                    gap: isMobile ? "10px" : "12px",
                    flexWrap: isMobile ? "nowrap" : "wrap",
                    marginTop: "12px",
                    justifyContent: isMobile ? "space-between" : undefined,
                    marginBottom: isMobile ? "10px" : undefined
                  }}
                >
                  <div
                    className="mini-card"
                    style={{
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      transition: "all .2s ease",
                      padding: "10px",
                      minHeight: "70px",
                      width: isMobile ? "48%" : undefined,
                      flex: isMobile ? undefined : "1 1 calc(33.33% - 10px)",
                      maxWidth: isMobile ? undefined : "calc(33.33% - 10px)",
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0px)"}
                  >
                    <div className="mini-label">Totale spese</div>
                    <div className="mini-value" style={{ fontSize: isMobile ? "20px" : undefined }}>
                      € {Number(totSpese).toFixed(2)}
                    </div>
                  </div>

                  <div
                    className="mini-card"
                    style={{
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      transition: "all .2s ease",
                      padding: "10px",
                      minHeight: "70px",
                      width: isMobile ? "48%" : undefined,
                      flex: isMobile ? undefined : "1 1 calc(33.33% - 10px)",
                      maxWidth: isMobile ? undefined : "calc(33.33% - 10px)",
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0px)"}
                  >
                    <div className="mini-label">Presenze</div>
                    <div className="mini-value" style={{ fontSize: isMobile ? "20px" : undefined }}>{countPresenze}</div>
                  </div>

                  <div
                    className="mini-card"
                    style={{
                      display: isMobile ? "none" : undefined,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      transition: "all .2s ease",
                      padding: "10px",
                      minHeight: "70px",
                      width: isMobile ? "48%" : undefined,
                      flex: isMobile ? undefined : "1 1 calc(33.33% - 10px)",
                      maxWidth: isMobile ? undefined : "calc(33.33% - 10px)",
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0px)"}
                  >
                    <div className="mini-label">Operai</div>
                    <div className="mini-value" style={{ fontSize: isMobile ? "20px" : undefined }}>
                      <span className="mini-sub">{operaiPreview.join(", ")}</span>
                    </div>
                  </div>
                </div>

                {/* 🔥 TABELLA COMPLETA PRESENZE */}
                <div
                  className="detail-box"
                  style={{
                    marginTop: "16px",
                    background:"linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.95))",
                    border:"1px solid rgba(59,130,246,0.25)",
                    padding: isMobile ? "16px" : undefined,
                    width:"100%",
                    borderRadius: isMobile ? "14px" : undefined,
                    cursor: "pointer",
                    transition: "transform .12s ease, box-shadow .12s ease",
                  }}
                  onClick={() => setSectionOpen(sectionOpen === "presenze" ? null : "presenze")}
                  onMouseDown={(e)=> e.currentTarget.style.transform = "scale(0.99)"}
                  onMouseUp={(e)=> e.currentTarget.style.transform = "scale(1)"}
                  onMouseLeave={(e)=> e.currentTarget.style.transform = "scale(1)"}
                >
                  <div className="detail-box-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>📋 Presenze</span>
                    <span
                      style={{
                        transition: "transform .2s ease, opacity .2s ease",
                        transform: sectionOpen === "presenze" ? "rotate(180deg)" : "rotate(0deg)",
                        opacity: 0.8
                      }}
                    >▾</span>
                  </div>

                  {sectionOpen === "presenze" && (
                    <>
                      {/* FILTRI + CONTROLLO */}
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap", alignItems:"center" }}>
                        <span style={{fontSize:"12px", opacity:0.6}}>📅 Filtra per mese</span>

                        <input
                          type="month"
                          className="input"
                          value={filtroData}
                          onChange={(e) => setFiltroData(e.target.value)}
                          style={{
                            minWidth:"160px",
                            textAlign:"center",
                            fontWeight:600,
                            letterSpacing:"1px",
                            background:"rgba(255,255,255,0.06)"
                          }}
                        />
                      </div>

                      {presenzeSelected.length === 0 ? (
                        <p className="dim">Nessuna presenza</p>
                      ) : (
                        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
                          {Object.entries(
                            presenzeSelected.reduce((acc, p) => {
                              const mese = (p.data || "").slice(0,7); // YYYY-MM
                              if (!acc[mese]) acc[mese] = [];
                              acc[mese].push(p);
                              return acc;
                            }, {})
                          )
                            .sort((a,b)=> b[0].localeCompare(a[0]))
                            .map(([mese, listaMese]) => {

                              const labelMese = (() => {
                                if(!mese) return "-";
                                const [y,m] = mese.split("-");
                                const d = new Date(y, m-1);
                                return d.toLocaleDateString("it-IT", { month:"long", year:"numeric" });
                              })();

                              return (
                                <div key={mese} style={{
                                  background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(15,23,42,0.95))",
                                  border: "1px solid rgba(59,130,246,0.25)",
                                  boxShadow: "0 8px 25px rgba(0,0,0,0.25)",
                                  padding: "14px",
                                  borderRadius: "14px"
                                }}>
                                  <div
                                    onClick={() => setMeseAperto(mese)}
                                    style={{
                                      cursor:"pointer",
                                      fontWeight:700,
                                      fontSize:"15px"
                                    }}
                                  >
                                    📅 {labelMese}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* MODAL PRESENZE MENSILI */}
                {meseAperto && (
                  <div style={{
                    position:"fixed",
                    inset:0,
                    background:"rgba(0,0,0,0.7)",
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"center",
                    zIndex:999
                  }} onClick={()=>setMeseAperto(null)}>

                    <div
                      key={meseAperto}
                      ref={modalRef}
                      onClick={e=>e.stopPropagation()}
                      style={{
                        width:"90%",
                        maxWidth:"900px",
                        maxHeight:"80vh",
                        overflowY:"auto",
                        background:"#1e293b",
                        borderRadius:"18px",
                        padding:"20px",
                        boxShadow:"0 20px 60px rgba(0,0,0,0.6)",
                        marginTop:"0"
                      }}
                    >

                      <div style={{display:"flex", justifyContent:"space-between", marginBottom:"12px"}}>
                        <h3 style={{fontSize:"18px"}}>📅 {meseAperto}</h3>
                        <button className="btn-ghost" onClick={()=>setMeseAperto(null)}>Chiudi</button>
                      </div>

                      {Object.entries(
                        presenzeSelected.filter(p => (p.data||"").startsWith(meseAperto))
                        .reduce((acc, p) => {
                          const giorno = p.data || "Senza data";
                          if (!acc[giorno]) acc[giorno] = [];
                          acc[giorno].push(p);
                          return acc;
                        }, {})
                      )
                      .sort((a,b)=> a[0].localeCompare(b[0]))
                      .map(([giorno, presenze]) => (

                        <div key={giorno} style={{ marginTop:"12px" }}>

                          <div style={{ fontWeight:700, color:"#60a5fa" }}>
                            {(() => {
                              if (!giorno) return "-";
                              const [y,m,d] = giorno.split("-");
                              return `${d}/${m}/${y}`;
                            })()}
                          </div>

                          {presenze.map(p => (
                            <div key={p.id} style={{
                              display:"flex",
                              justifyContent:"space-between",
                              padding:"10px",
                              marginTop:"4px",
                              borderRadius:"10px",
                              background:"#243244",
                              fontSize:"15px"
                            }}>
                              <div>
                                <div>{p.dipendente}</div>
                                <div style={{fontSize:"12px", opacity:0.6}}>
                                  {p.attivita || "-"}
                                </div>
                              </div>

                              <div style={{
                                color: Number(p.giornata) === 1 ? "#22c55e" : "#fbbf24",
                                fontWeight:700
                              }}>
                                {Number(p.giornata) === 1 ? "Intera" : "Mezza"}
                              </div>

                            </div>
                          ))}

                        </div>
                      ))}

                    </div>
                  </div>
                )}

                {/* SPESE */}
                <div
                  className="detail-box"
                  style={{
                    marginTop: "16px",
                    background:"linear-gradient(135deg, rgba(239,68,68,0.18), rgba(15,23,42,0.95))",
                    border:"1px solid rgba(239,68,68,0.25)",
                    padding: isMobile ? "16px" : undefined,
                    width:"100%",
                    borderRadius: isMobile ? "14px" : undefined,
                    cursor: "pointer",
                    transition: "transform .12s ease, box-shadow .12s ease",
                  }}
                  onClick={() => setSectionOpen(sectionOpen === "spese" ? null : "spese")}
                  onMouseDown={(e)=> e.currentTarget.style.transform = "scale(0.99)"}
                  onMouseUp={(e)=> e.currentTarget.style.transform = "scale(1)"}
                  onMouseLeave={(e)=> e.currentTarget.style.transform = "scale(1)"}
                >
                  <div className="detail-box-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>💸 Spese</span>
                    <span
                      style={{
                        transition: "transform .2s ease, opacity .2s ease",
                        transform: sectionOpen === "spese" ? "rotate(180deg)" : "rotate(0deg)",
                        opacity: 0.8
                      }}
                    >▾</span>
                  </div>

                  {sectionOpen === "spese" && (
                    <>
                      {speseSelected.length === 0 ? (
                        <p className="dim">Nessuna spesa</p>
                      ) : isMobile ? (
                        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {speseSelected.map((s) => (
                            <div key={s.id} style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              padding: "14px",
                              borderRadius: "14px",
                              background: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(15,23,42,0.95))",
                              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                              border: "1px solid rgba(239,68,68,0.25)",
                              boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
                              position: "relative"
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "6px" }}>
                                <span style={{ fontWeight: 600, fontSize: "14px" }}>
                                  {(() => {
                                    if (!s.data) return "-";
                                    const [y,m,d] = s.data.split("-");
                                    return `${d}/${m}/${y}`;
                                  })()}
                                </span>
                                <span style={{
                                  color: "#ef4444",
                                  fontWeight: 700,
                                  fontSize: isMobile ? "16px" : "15px"
                                }}>
                                  € {Number(s.importo || 0).toFixed(2)}
                                </span>
                              </div>
                              {s.fornitore && (
                                <div style={{ fontSize: "13px", opacity: 0.8 }}>
                                  🏢 {s.fornitore}
                                </div>
                              )}
                              {s.descrizione && (
                                <div style={{ fontSize: "13px", opacity: 0.85, lineHeight: "1.4" }}>
                                  {s.descrizione}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <table className="table" style={{ marginTop: "10px" }}>
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Importo</th>
                              <th>Fornitore</th>
                              <th>Descrizione</th>
                            </tr>
                          </thead>
                          <tbody>
                            {speseSelected.map((s) => (
                              <tr key={s.id}>
                                <td>{(() => {
                                  if (!s.data) return "-";
                                  const [y,m,d] = s.data.split("-");
                                  return `${d}/${m}/${y}`;
                                })()}</td>
                                <td>€ {Number(s.importo || 0).toFixed(2)}</td>
                                <td>{s.fornitore || "-"}</td>
                                <td>{s.descrizione || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                </div>
                {/* Mobile: info block */}
                {isMobile && (
                  <div
                    className="detail-box"
                    style={{
                      marginTop: "16px",
                      background:"linear-gradient(135deg, rgba(148,163,184,0.15), rgba(15,23,42,0.95))",
                      border:"1px solid rgba(148,163,184,0.25)",
                      padding: "16px",
                      borderRadius: "14px",
                      cursor: "pointer",
                      transition: "transform .12s ease, box-shadow .12s ease",
                    }}
                    onClick={() => setSectionOpen(sectionOpen === "info" ? null : "info")}
                    onMouseDown={(e)=> e.currentTarget.style.transform = "scale(0.99)"}
                    onMouseUp={(e)=> e.currentTarget.style.transform = "scale(1)"}
                    onMouseLeave={(e)=> e.currentTarget.style.transform = "scale(1)"}
                  >
                    <div className="detail-box-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>ℹ️ Info cantiere</span>
                      <span
                        style={{
                          transition: "transform .2s ease, opacity .2s ease",
                          transform: sectionOpen === "info" ? "rotate(180deg)" : "rotate(0deg)",
                          opacity: 0.8
                        }}
                      >▾</span>
                    </div>

                    {sectionOpen === "info" && infoBlock}
                  </div>
                )}
              </>
            )}
            </div>
          </section>

        </div>

      </div>
      {/* Mobile-only modal for nuovo cantiere */}
      {isMobile && showCreateModal && (
        <div
          onClick={() => setShowCreateModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "420px",
              margin: "0 auto",
              borderRadius: "18px",
              padding: "16px",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.6)",
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "12px", fontSize: "16px" }}>
              ➕ Nuovo cantiere
            </div>
            <div style={{ fontSize: "12px", opacity: 0.7, width: "100%", textAlign: "left" }}>
              Inserisci il nome del cantiere
            </div>
            <input
              className="input"
              placeholder="Nome cantiere"
              value={nomeNew}
              onChange={(e) => setNomeNew(e.target.value)}
              style={{ width: "100%", textAlign: "center" }}
            />
            <div style={{ fontSize: "12px", opacity: 0.7, width: "100%", textAlign: "left", marginTop: "6px" }}>
              Inserisci l'indirizzo (es. Via Roma, Agropoli)
            </div>
            <input
              className="input"
              placeholder="Indirizzo completo"
              value={indirizzoNew}
              onChange={(e) => setIndirizzoNew(e.target.value)}
              style={{ width: "100%", textAlign: "center", marginTop: "6px" }}
            />
            <div style={{ fontSize: "12px", opacity: 0.7, width: "100%", textAlign: "left", marginTop: "6px" }}>
              Data attivazione
            </div>
            <input
              type="date"
              className="input"
              value={dataInizioNew}
              onChange={(e) => setDataInizioNew(e.target.value)}
              style={{ width: "100%", textAlign: "center", marginTop: "6px" }}
            />

            <div style={{ display: "flex", gap: "10px", marginTop: "12px", width: "100%" }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  await creaCantiere();
                  setShowCreateModal(false);
                }}
              >
                Crea
              </button>

              <button
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setShowCreateModal(false)}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}