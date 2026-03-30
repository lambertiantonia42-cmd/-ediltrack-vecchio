// src/pages/Spese.jsx
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
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
} from "firebase/firestore";
import "./Spese.css";
import { AZIENDA_ID } from "../appConfig";
import { logActivity } from "../utils/logActivity";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sortByDataDesc(a, b) {
  const da = String(a.data || "");
  const dbb = String(b.data || "");
  if (da !== dbb) return dbb.localeCompare(da);

  const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
  const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
  return tb - ta;
}

export default function Spese() {

  const [data, setData] = useState(todayISO());
  const [cantiere, setCantiere] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [importo, setImporto] = useState("");
  const [pagamento, setPagamento] = useState("Contanti");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  const [cantieriAttivi, setCantieriAttivi] = useState([]);

  const [editingId, setEditingId] = useState(null);

  const [editForm, setEditForm] = useState({
    data: "",
    cantiere: "",
    fornitore: "",
    descrizione: "",
    importo: "",
    pagamento: "Contanti",
  });

  // LISTENER SPESE
  useEffect(() => {

    const qRef = query(
      collection(db, "spese"),
      where("aziendaId", "==", AZIENDA_ID)
    );

    const unsub = onSnapshot(qRef, (snap) => {

      const all = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      all.sort(sortByDataDesc);

      setRows(all);

    });

    return () => unsub();

  }, []);

  // LISTENER CANTIERI ATTIVI
  useEffect(() => {

    const qCantieri = query(
      collection(db, "cantieri"),
      where("aziendaId", "==", AZIENDA_ID),
      where("stato", "==", "Attivo")
    );

    const unsub = onSnapshot(qCantieri, (snap) => {

      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const norm = list
        .map((c) => ({
          id: c.id,
          nome: c.nome || "",
        }))
        .filter((c) => c.nome.trim());

      norm.sort((a, b) => a.nome.localeCompare(b.nome));

      setCantieriAttivi(norm);

    });

    return () => unsub();

  }, []);

  const canSubmit = useMemo(() => {
    return data && descrizione.trim() && String(importo).trim() && Number(importo) > 0;
  }, [data, descrizione, importo]);

  async function onSubmit(e) {

    e.preventDefault();
    setErr("");

    const u = auth.currentUser;

    if (!u) return setErr("Non sei autenticato.");
    if (!canSubmit) return setErr("Compila almeno data, descrizione e importo.");

    try {

      setLoading(true);

      const payload = {
        aziendaId: AZIENDA_ID,
        data,
        cantiere: cantiere.trim(),
        fornitore: fornitore.trim(),
        descrizione: descrizione.trim(),
        importo: Number(importo),
        pagamento,
        createdAt: serverTimestamp(),
        createdBy: u.uid,
        createdByEmail: u.email || "",
      };

      const ref = await addDoc(collection(db, "spese"), payload);

      await logActivity({
        tipo: "spesa",
        azione: "create",
        cantiere: payload.cantiere,
        targetId: ref.id,
        note: `€ ${payload.importo.toFixed(2)} • ${payload.descrizione}`,
      });

      setCantiere("");
      setFornitore("");
      setDescrizione("");
      setImporto("");
      setPagamento("Contanti");

    } catch (e2) {

      console.log(e2);
      setErr(e2?.message || "Errore nel salvataggio.");

    } finally {

      setLoading(false);

    }

  }

  async function onDelete(id) {

    const u = auth.currentUser;

    if (!u) return setErr("Non sei autenticato.");

    if (!confirm("Eliminare questa spesa?")) return;

    try {

      await deleteDoc(doc(db, "spese", id));

    } catch (e) {

      console.log(e);
      setErr("Errore eliminazione.");

    }

  }

  function startEdit(row) {

    setEditingId(row.id);

    setEditForm({
      data: row.data || todayISO(),
      cantiere: row.cantiere || "",
      fornitore: row.fornitore || "",
      descrizione: row.descrizione || "",
      importo: row.importo ?? "",
      pagamento: row.pagamento || "Contanti",
    });

  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id) {

    const u = auth.currentUser;

    if (!u) return;

    await updateDoc(doc(db, "spese", id), {
      data: editForm.data,
      cantiere: editForm.cantiere,
      fornitore: editForm.fornitore,
      descrizione: editForm.descrizione,
      importo: Number(editForm.importo),
      pagamento: editForm.pagamento,
      updatedAt: serverTimestamp(),
      updatedBy: u.uid,
    });

    setEditingId(null);

  }

  const totaleGiorno = useMemo(() => {
    return rows
      .filter((r) => r.data === data)
      .reduce((sum, r) => sum + Number(r.importo || 0), 0);
  }, [rows, data]);

  const rowsDelGiorno = useMemo(() => {
    return rows.filter((r) => r.data === data);
  }, [rows, data]);

  const descrizioniSuggerite = useMemo(() => {

    const set = new Set();

    rows.forEach((r) => {
      if (r.descrizione) set.add(r.descrizione.trim());
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));

  }, [rows]);

  return (
    <div className="spese-wrap">
      <div className="panel">

        <h2>💸 Spese giornaliere</h2>

        <p className="muted">
          Totale del giorno selezionato: <b>€ {totaleGiorno.toFixed(2)}</b>
        </p>

        <form onSubmit={onSubmit}>

          <div className="form-grid">

            <div className="field">
              <label>Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>

            <div className="field">
              <label>Cantiere</label>

              <select value={cantiere} onChange={(e) => setCantiere(e.target.value)}>

                <option value="">Seleziona cantiere</option>

                {cantieriAttivi.map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}

              </select>

            </div>

            <div className="field">
              <label>Fornitore</label>
              <input
                placeholder="Es. Brico / Ferramenta..."
                value={fornitore}
                onChange={(e) => setFornitore(e.target.value)}
              />
            </div>

            <div className="field descrizione">
              <label>Descrizione *</label>

              <input
                list="prodotti"
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
              />

              <datalist id="prodotti">
                {descrizioniSuggerite.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>

            </div>

            <div className="field">
              <label>Importo (€)</label>
              <input
                type="number"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Pagamento</label>
              <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
                <option>Contanti</option>
                <option>Carta</option>
                <option>Bonifico</option>
              </select>
            </div>

          </div>

          <div className="actions">
            <button className="btn-primary" type="submit">Salva</button>
          </div>

        </form>

        <table className="table" style={{ marginTop: 14 }}>

          <thead>
            <tr>
              <th>Data</th>
              <th>Cantiere</th>
              <th>Fornitore</th>
              <th>Descrizione</th>
              <th>Pagamento</th>
              <th>Importo</th>
              <th></th>
            </tr>
          </thead>

          <tbody>

            {rowsDelGiorno.map((r) => (

              <tr key={r.id}>

                <td>
                  {editingId === r.id ? (
                    <input type="date"
                      style={{width:"100%", maxWidth:"140px"}}
                      value={editForm.data}
                      onChange={(e)=>setEditForm({...editForm,data:e.target.value})}
                    />
                  ) : r.data}
                </td>

                <td>
                  {editingId === r.id ? (
                    <input
                      style={{width:"100%", maxWidth:"140px"}}
                      value={editForm.cantiere}
                      onChange={(e)=>setEditForm({...editForm,cantiere:e.target.value})}
                    />
                  ) : r.cantiere}
                </td>

                <td>
                  {editingId === r.id ? (
                    <input
                      style={{width:"100%", maxWidth:"140px"}}
                      value={editForm.fornitore}
                      onChange={(e)=>setEditForm({...editForm,fornitore:e.target.value})}
                    />
                  ) : r.fornitore}
                </td>

                <td>
                  {editingId === r.id ? (
                    <input
                      style={{width:"100%", maxWidth:"140px"}}
                      value={editForm.descrizione}
                      onChange={(e)=>setEditForm({...editForm,descrizione:e.target.value})}
                    />
                  ) : r.descrizione}
                </td>

                <td>
                  {editingId === r.id ? (
                    <select
                      style={{width:"100%", maxWidth:"140px"}}
                      value={editForm.pagamento}
                      onChange={(e)=>setEditForm({...editForm,pagamento:e.target.value})}
                    >
                      <option>Contanti</option>
                      <option>Carta</option>
                      <option>Bonifico</option>
                    </select>
                  ) : r.pagamento}
                </td>

                <td>
                  {editingId === r.id ? (
                    <input
                      type="number"
                      style={{width:"100%", maxWidth:"140px"}}
                      value={editForm.importo}
                      onChange={(e)=>setEditForm({...editForm,importo:e.target.value})}
                    />
                  ) : `€ ${Number(r.importo).toFixed(2)}`}
                </td>

                <td>
                  <div style={{display:"flex",gap:8, justifyContent:"flex-end"}}>

                  {editingId === r.id ? (
                    <>
                      <button className="btn-primary" onClick={()=>saveEdit(r.id)}>Salva</button>
                      <button className="btn-ghost" onClick={cancelEdit}>Annulla</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-ghost" onClick={()=>startEdit(r)}>Modifica</button>
                      <button className="btn-ghost" onClick={()=>onDelete(r.id)}>Elimina</button>
                    </>
                  )}
                  </div>
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>
    </div>
  );
}