import { Outlet, Link } from "react-router-dom";
import "./AppLayout.css";

export default function AppLayout() {

  return (
    <div className="layout">

      <header className="header">
        <div className="logo">🏗️ EDILTRACK</div>

        <nav className="menu">
          <Link to="/">Dashboard</Link>
          <Link to="/presenze">Presenze</Link>
          <Link to="/cantieri">Cantieri</Link>
          <Link to="/spese">Spese</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="content">
        <Outlet />
      </main>

    </div>
  );
}