import { NavLink, Outlet, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { useState, useEffect } from "react";
import "./Dashboard.css";

function getFirstNameFromEmail(email = "") {
  const left = email.split("@")[0] || "";
  const first = left.split(".")[0] || left;
  return first.charAt(0).toUpperCase() + first.slice(1) || "Utente";
}

export default function DashboardLayout() {
  const email = auth.currentUser?.email || "";
  const name = getFirstNameFromEmail(email);

  const userColors = {
    giuseppe: "#fbbf24", // oro
    adele: "#ec4899",    // fucsia
    giupy: "#34d399"     // verde
  };

  const nameKey = name.toLowerCase();
  const userColor = userColors[nameKey] || "#fbbf24";

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const location = useLocation();

  useEffect(() => {
    if (isMobile) {
      setMenuOpen(false);
    }
  }, [location]);

  const hour = now.getHours();
  let saluto = "Buongiorno";
  let salutoColor = "#fbbf24"; 

  if (hour >= 18) {
    saluto = "Buonasera";
    salutoColor = "#60a5fa"; 
  } else if (hour >= 12) {
    saluto = "Buon pomeriggio";
    salutoColor = "#fbbf24";
  }

  return (
    <div className="app-shell">
      <style>{`
        /* STRUTTURA LATERALE */
        .sidebar { 
          width: 320px; 
          background: #0f172a; 
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          padding: 30px 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 45px;
          padding-left: 10px;
        }

        .brand-icon {
          width: 52px;
          height: 52px;
          background: linear-gradient(135deg, #f59e0b, #fbbf24);
          color: #0f172a;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 24px;
          position: relative;

          box-shadow:
            0 10px 25px rgba(251,191,36,0.35),
            0 0 40px rgba(251,191,36,0.25);
        }

        .brand-icon::after{
          content:"";
          position:absolute;
          inset:-6px;
          border-radius:18px;
          background: radial-gradient(circle, rgba(251,191,36,0.25), transparent 70%);
          z-index:-1;
        }

        .brand-name { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
        .brand-sub { 
          font-size: 13px; 
          color: #cbd5f5; 
          font-weight: 700; 
          letter-spacing: 1px; 
          text-shadow: 0 0 12px rgba(251,191,36,0.25);
        }

        /* NAVIGAZIONE */
        .nav { display: flex; flex-direction: column; gap: 10px; flex: 1; }

        .nav-item { 
          font-size: 19px; 
          padding: 18px 22px;
          color: #94a3b8;
          text-decoration: none;
          border-radius: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 15px;
          transition: all 0.3s ease;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.03);
          color: #fff;
          transform: translateX(5px);
        }

        .nav-item.active {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
          box-shadow: inset 4px 0 0 #fbbf24;
        }

        /* LOGOUT */
        .logout-container { margin-top: auto; padding-top: 20px; }
        .logout-btn {
          width: 100%;
          padding: 18px;
          background: linear-gradient(135deg, rgba(239,68,68,0.25), rgba(127,29,29,0.6));
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #ffffff;
          border-radius: 16px;
          font-size: 18px;
          font-weight: 900;
          cursor: pointer;
          transition: 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          letter-spacing: 1px;
        }

        .logout-btn:hover {
          background: linear-gradient(135deg, #ef4444, #b91c1c);
          color: #fff;
          box-shadow: 0 10px 25px rgba(239, 68, 68, 0.4);
          transform: translateY(-2px);
        }

        /* HEADER SUPERIORE */
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 30px 40px;
          background: rgba(2, 6, 23, 0.45);
          backdrop-filter: blur(10px);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .topbar h1 { 
          font-size: 48px; 
          font-weight: 900; 
          margin: 0; 
          letter-spacing: -1px; 
          text-shadow: 0 0 25px rgba(251,191,36,0.35);
        }
        .subtitle { 
          font-size: 20px; 
          color: #cbd5f5; 
          font-weight: 500; 
          margin-top: 6px; 
          opacity: 0.85;
        }

        /* BADGE DATA PRO */
        .date-colored {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          background: linear-gradient(135deg, #fbbf24, #60a5fa);
          padding: 14px 28px;
          border-radius: 20px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.3);
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* ===== MOBILE FIX SAFE ===== */
        @media (max-width: 768px) {
          .topbar {
            flex-direction: column;
            align-items: flex-start;
            gap: 15px;
            padding: 20px;
          }

          .topbar h1 {
            font-size: 34px !important;
            line-height: 1.1;
          }

          .subtitle {
            font-size: 16px;
          }

          .date-colored {
            width: 100%;
            justify-content: center;
            font-size: 16px;
            padding: 10px 16px;
          }

          .page-content {
            padding: 20px !important;
          }
        }
      `}</style>

      {/* SIDEBAR */}
      <aside className="sidebar" style={{
        position: isMobile ? "fixed" : "relative",
        left: isMobile && !menuOpen ? "-320px" : "0",
        top: 0,
        height: "100vh",
        zIndex: 1000,
        transition: "0.3s",
        boxShadow: isMobile && menuOpen ? "0 0 40px rgba(0,0,0,0.6)" : "none",
      }}>
        <div className="brand">
          <div className="brand-icon">V</div>
          <div className="brand-text">
            <div className="brand-name">EdilTrack</div>
            <div className="brand-sub">Vecchio</div>
          </div>
        </div>

        <nav className="nav">
          <NavLink
            to="/"
            end
            onClick={() => isMobile && setMenuOpen(false)}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            <span>🏠</span> Dashboard
          </NavLink>
          <NavLink
            to="/presenze"
            onClick={() => isMobile && setMenuOpen(false)}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            <span>📒</span> Presenze
          </NavLink>
          <NavLink
            to="/spese"
            onClick={() => isMobile && setMenuOpen(false)}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            <span>💶</span> Spese
          </NavLink>
          <NavLink
            to="/cantieri"
            onClick={() => isMobile && setMenuOpen(false)}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            <span>🏗️</span> Cantieri
          </NavLink>
          <NavLink
            to="/conteggi"
            onClick={() => isMobile && setMenuOpen(false)}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            <span>💰</span> Conteggi
          </NavLink>
          <NavLink
            to="/operai"
            onClick={() => isMobile && setMenuOpen(false)}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            <span>👷</span> Operai
          </NavLink>
          <NavLink
            to="/riepilogo"
            onClick={() => isMobile && setMenuOpen(false)}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            <span>📊</span> Riepilogo Mensile
          </NavLink>
        </nav>

        <div className="logout-container">
          <button className="logout-btn" onClick={() => signOut(auth)}>
            CHIUDI SESSIONE 🚪
          </button>
        </div>
      </aside>

      {isMobile && menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            zIndex: 999
          }}
        />
      )}

      {/* CONTENUTO PRINCIPALE */}
      <main className="content" style={{ flex: 1, overflowY: "auto", background: "#0b1220" }}>
        <header
          className="topbar"
          style={{
            position: isMobile ? "relative" : "sticky",
            top: isMobile ? "auto" : 0
          }}
        >
          <div>
            {isMobile && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                style={{
                  fontSize: 24,
                  background: "transparent",
                  border: "none",
                  color: "white",
                  marginBottom: 10,
                  cursor: "pointer",
                  zIndex: 2001,
                }}
              >
                ☰
              </button>
            )}
            <h1 style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    ...(isMobile
                      ? {
                          color: userColor,
                          textShadow: `0 0 10px ${userColor}`
                        }
                      : {
                          background: `linear-gradient(90deg, ${userColor}, #ffffff)`,
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          textShadow: `0 0 25px ${userColor}`
                        })
                  }}
                >
                  {saluto},
                </span>

                <span
                  style={{
                    color: userColor,
                    fontWeight: 900
                  }}
                >
                  {name}
                </span>
              </div>
            </h1>
            <p className="subtitle">
              Sono le ore {now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          
          <div className="date-colored">
            <span style={{fontSize: "24px"}}>🗓️</span>
            {now.toLocaleDateString("it-IT", { 
              weekday: "long", 
              day: "numeric", 
              month: "long" 
            })}
          </div>
        </header>

        <div className="page-content" style={{ padding: "40px", background: "#0f172a" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}