import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { useState, useEffect } from "react";

const MENU_ITEMS = [
  { path: "/", label: "Dashboard", icon: "🏠" },
  { path: "/presenze", label: "Giornale Presenze", icon: "📅" },
  { path: "/spese", label: "Spese Cantiere", icon: "💳" },
  { path: "/cantieri", label: "Gestione Cantieri", icon: "🏗️" },
  { path: "/operai", label: "Anagrafica Operai", icon: "👷" },
  { path: "/conteggi", label: "Conteggi & Saldi", icon: "💰" },
  { path: "/riepilogo", label: "Riepilogo Mensile", icon: "🧾" },
];

function getFirstNameFromEmail(email = "") {
  const left = email.split("@")[0] || "";
  const first = left.split(".")[0] || left;
  return first.charAt(0).toUpperCase() + first.slice(1) || "UTENTE";
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = auth.currentUser?.email || "";
  const name = getFirstNameFromEmail(email);

  const [now, setNow] = useState(new Date());
  const [sessionStart] = useState(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hour = now.getHours();
  let saluto = "Buongiorno";
  let salutoColor = "#fbbf24"; 

  if (hour >= 18 || hour < 5) {
    saluto = "Buonasera";
    salutoColor = "#60a5fa"; 
  } else if (hour >= 12) {
    saluto = "Buon pomeriggio";
    salutoColor = "#f59e0b";
  }

  const diffMins = Math.floor((new Date() - new Date().setHours(sessionStart.split(":")[0], sessionStart.split(":")[1])) / 60000);

  const isFixedTopbar = ["/cantieri", "/presenze", "/conteggi"].includes(location.pathname);

  return (
    <div className="app-shell">
      <style>{`
        /* --- RESET E BASE --- */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          height: 100%;
          overflow: hidden;
        }
        
        .app-shell {
          display: flex;
          height: 100vh;
          width: 100vw;
          background: #020617;
          color: #f8fafc;
          font-family: 'Inter', -apple-system, sans-serif;
          overflow: hidden;
        }

        /* --- SIDEBAR (BLINDATA) --- */
        .sidebar {
          width: 280px;
          min-width: 280px;
          background: #0f172a;
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          padding: 30px 20px;
          height: 100vh;
          z-index: 100;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 50px;
          padding-left: 10px;
        }

        .brand-logo-v {
          width: 50px;
          height: 50px;
          background: linear-gradient(135deg, #f59e0b, #fbbf24);
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          font-weight: 900;
          font-size: 24px;
          box-shadow: 0 8px 20px rgba(245, 158, 11, 0.3);
        }

        .brand-info b { 
          display: block; 
          font-size: 20px; 
          color: #fff; 
          letter-spacing: -0.5px; 
          line-height: 1.2;
        }
        
        .brand-info span { 
          font-size: 10px; 
          color: #fbbf24; 
          font-weight: 700; 
          text-transform: uppercase; 
          letter-spacing: 2px; 
        }

        .nav-menu {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 18px;
          border-radius: 14px;
          color: #94a3b8;
          text-decoration: none;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.2s ease;
        }

        .nav-link:hover {
          background: rgba(255, 255, 255, 0.03);
          color: #fff;
        }

        .nav-link.active {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          box-shadow: inset 4px 0 0 #fbbf24;
        }

        .btn-logout-shell {
          margin-top: auto;
          padding: 16px;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 14px;
          cursor: pointer;
          font-weight: 800;
          text-transform: uppercase;
          font-size: 14px;
          transition: 0.3s;
        }

        .btn-logout-shell:hover {
          background: #ef4444;
          color: #fff;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
        }

        /* --- CONTENT AREA (COMPATTA) --- */
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #020617;
          position: relative;
          height: 100vh;
        }

        .topbar {
          padding: 20px 40px; /* RIDOTTO: elimina lo spazio vuoto tra header e card */
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(2, 6, 23, 0.85);
          backdrop-filter: blur(20px);
          z-index: 999;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .saluto-box h1 {
          font-size: 36px;
          font-weight: 900;
          letter-spacing: -1.5px;
          margin: 0;
        }

        .status-row {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-top: 5px;
          color: #94a3b8;
          font-size: 14px;
        }

        .live-dot {
          width: 10px;
          height: 10px;
          background: #22c55e;
          border-radius: 50%;
          box-shadow: 0 0 10px #22c55e;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }

        .clock-big {
          font-size: 20px;
          font-weight: 800;
          color: #fff;
        }

        /* --- DATA LUMINOSA --- */
        .date-badge-pro {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          color: #000;
          padding: 12px 28px;
          border-radius: 16px;
          font-weight: 900;
          font-size: 15px;
          box-shadow: 0 10px 25px rgba(245, 158, 11, 0.4);
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .page-content-wrapper {
          padding: 30px 40px; /* SPAZIO EQUILIBRATO */
          max-width: 1600px;
          width: 100%;
          margin: 0 auto;
          margin-top: ${isFixedTopbar ? "100px" : "0"};
        }
      `}</style>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo-v">V</div>
          <div className="brand-info">
            <b>EdilTrack</b>
            <span>Costruzioni Pro</span>
          </div>
        </div>

        <nav className="nav-menu">
          {MENU_ITEMS.map((item) => (
            <NavLink 
              key={item.path} 
              to={item.path} 
              end={item.path === "/"}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <span style={{fontSize: "20px"}}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="btn-logout-shell" onClick={() => signOut(auth)}>
          CHIUDI SESSIONE 🚪
        </button>
      </aside>

      {/* CONTENUTO */}
      <main className="main-content">
        <header
          className="topbar"
          style={{
            position: isFixedTopbar ? "fixed" : "sticky",
            top: 0,
            left: isFixedTopbar ? "280px" : "auto",
            width: isFixedTopbar ? "calc(100% - 280px)" : "auto",
            zIndex: 9999
          }}
        >
          <div className="saluto-box">
            <h1>
              <span style={{ color: salutoColor, textShadow: `0 0 30px ${salutoColor}55` }}>{saluto}</span>, {name} 👋
            </h1>
            <div className="status-row">
              <div className="live-dot"></div>
              <span className="clock-big">
                {now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span style={{opacity: 0.3}}>|</span>
              <span>Inizio sessione: {sessionStart}</span>
            </div>
          </div>

          <div className="date-badge-pro">
            <span>🗓️</span>
            {now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </header>

        <div className="page-content-wrapper">
          <Outlet />
        </div>
      </main>
    </div>
  );
}