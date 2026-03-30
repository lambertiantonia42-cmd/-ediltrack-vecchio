import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

export default function DashboardHome() {
  const navigate = useNavigate();
  const [cantieri, setCantieri] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "cantieri"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCantieri(list);
    });
    return () => unsub();
  }, []);

  const presenzeData = [
    { day: "Lun", presenze: 4 }, { day: "Mar", presenze: 2 },
    { day: "Mer", presenze: 5 }, { day: "Gio", presenze: 3 },
    { day: "Ven", presenze: 4 }
  ];

  const speseData = [
    { mese: "Gen", spesa: 2200 }, { mese: "Feb", spesa: 5800 },
    { mese: "Mar", spesa: 3100 }
  ];

  return (
    <div className="dashboard-wrapper">
      <style>{`
        .dashboard-wrapper {
          padding: 0 10px 10px 10px;
          margin-top: -10px;
          animation: fadeIn 0.5s ease-in-out;
        }

        /* QUICK ACTIONS - RENDERLI VERI BOTTONI */
        .quick-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .quick-card { 
          position: relative;
          background: #1e293b;
          padding: 25px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Effetto hover stile Apple/Enterprise */
        .quick-card:hover {
          transform: translateY(-5px);
          background: #2d3a4f;
          border-color: rgba(255, 255, 255, 0.2);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
        }

        .quick-card:active {
          transform: translateY(0) scale(0.98);
        }

        .quick-card h3 { 
          font-size: 18px !important;
          font-weight: 900;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
          color: #fff;
        }

        .quick-card p { 
          font-size: 14px !important; 
          color: #94a3b8;
          margin: 0;
        }

        /* Linea di accento in fondo alla card */
        .card-accent {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 5px;
          width: 100%;
        }
        .yellow .card-accent { background: #fbbf24; }
        .blue .card-accent { background: #60a5fa; }
        .green .card-accent { background: #34d399; }
        .purple .card-accent { background: #a78bfa; }

        /* MAPPA */
        .map-section {
          background: #1e293b;
          padding: 20px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
          margin-bottom: 30px;
        }

        .map-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .map-header h2 {
          font-size: 20px;
          font-weight: 800;
          color: #fbbf24;
          margin: 0;
        }

        .dashboard-map { 
          height: 450px !important; 
          border-radius: 16px;
          z-index: 1;
        }

        /* GRAFICI */
        .charts-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25px;
        }

        .chart-box {
          background: #1e293b;
          padding: 25px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .chart-box h3 {
          font-size: 16px;
          color: #94a3b8;
          text-transform: uppercase;
          font-weight: 800;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1000px) {
          .charts-container { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* BLOCCO PULSANTI RAPIDI */}
      <div className="quick-actions">
        <div className="quick-card yellow" onClick={() => navigate("/presenze")}>
          <h3>📒 PRESENZE</h3>
          <p>Gestione operai odierna</p>
          <div className="card-accent"></div>
        </div>
        <div className="quick-card blue" onClick={() => navigate("/spese")}>
          <h3>💶 SPESE</h3>
          <p>Uscite e materiali</p>
          <div className="card-accent"></div>
        </div>
        <div className="quick-card green" onClick={() => navigate("/cantieri")}>
          <h3>🏗️ CANTIERI</h3>
          <p>Anagrafica e mappe</p>
          <div className="card-accent"></div>
        </div>
        <div className="quick-card purple" onClick={() => navigate("/operai")}>
          <h3>👷 OPERAI</h3>
          <p>Stipendi e documenti</p>
          <div className="card-accent"></div>
        </div>
      </div>

      {/* BLOCCO MAPPA */}
      <div className="map-section">
        <div className="map-header">
          <h2>📍 POSIZIONE CANTIERI ATTIVI</h2>
          <span style={{color: '#94a3b8', fontSize: '12px'}}>Aggiornato in tempo reale</span>
        </div>
        <MapContainer center={[40.3499, 14.9904]} zoom={11} className="dashboard-map">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {cantieri.map((c) => (
            c.lat && c.lng && (
              <Marker key={c.id} position={[Number(c.lat), Number(c.lng)]}>
                <Popup>
                  <div style={{padding: '5px'}}>
                    <strong style={{fontSize: '16px', color: '#1e293b'}}>{c.nome}</strong><br/>
                    <p style={{margin: '5px 0 0', color: '#64748b'}}>{c.indirizzo}</p>
                  </div>
                </Popup>
              </Marker>
            )
          ))}
        </MapContainer>
      </div>

      {/* BLOCCO ANALISI */}
      <div className="charts-container">
        <div className="chart-box">
          <h3>📊 Presenze Settimanali</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={presenzeData}>
              <XAxis dataKey="day" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} tick={{fontWeight: 'bold'}} />
              <YAxis hide />
              <Tooltip 
                cursor={{fill: 'transparent'}}
                contentStyle={{background: '#0f172a', border: 'none', borderRadius: '10px', boxShadow: '0 10px 15px rgba(0,0,0,0.5)'}}
              />
              <Bar dataKey="presenze" radius={[6, 6, 6, 6]} barSize={35}>
                {presenzeData.map((entry, index) => (
                  <Cell key={index} fill={index === 2 ? '#fbbf24' : '#334155'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <h3>💰 Flusso Spese</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={speseData}>
              <XAxis dataKey="mese" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} tick={{fontWeight: 'bold'}} />
              <YAxis hide />
              <Tooltip 
                cursor={{fill: 'transparent'}}
                contentStyle={{background: '#0f172a', border: 'none', borderRadius: '10px', boxShadow: '0 10px 15px rgba(0,0,0,0.5)'}}
              />
              <Bar dataKey="spesa" fill="#60a5fa" radius={[6, 6, 6, 6]} barSize={35} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}