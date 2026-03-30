import { useState, useEffect } from "react";


export default function DashboardLayout({ children }) {

  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      {isMobile && menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.4)",
            zIndex: 999
          }}
        />
      )}
      <div style={{ display: "flex" }}>
        <div
          style={{
            position: isMobile ? "fixed" : "relative",
            left: isMobile && !menuOpen ? "-260px" : "0",
            top: 0,
            height: "100vh",
            width: 260,
            transition: "0.3s",
            zIndex: 1000,
          }}
        >
          <Sidebar />
        </div>
        <div style={{ flex: 1, marginLeft: isMobile ? 0 : 260 }}>
          <Header>
            {isMobile && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                style={{
                  fontSize: 22,
                  background: "transparent",
                  border: "none",
                  color: "white",
                  marginRight: 10
                }}
              >
                ☰
              </button>
            )}
          </Header>
          <main>{children}</main>
        </div>
      </div>
    </>
  );
}