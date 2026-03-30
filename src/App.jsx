import { Routes, Route } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import DashboardLayout from "./pages/Dashboard";
import DashboardHome from "./pages/DashboardHome";
import Presenze from "./pages/Presenze";
import Spese from "./pages/Spese";
import Cantieri from "./pages/Cantieri";
import Cronologia from "./pages/Cronologia";
import Login from "./pages/Login";
import Conteggi from "./pages/Conteggi";
import SchedaOperaio from "./pages/SchedaOperaio";
import Operai from "./pages/Operai";
import StoricoOperaio from "./pages/storicoOperaio";
import SnapshotOperaio from "./pages/snapshot-operaio";

export default function App() {
  return (
    <>
      <Routes>

      {/* ROUTA PUBBLICA */}
      <Route path="/login" element={<Login />} />

      {/* ROUTE PROTETTE */}
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>

          <Route path="/" element={<DashboardHome />} />
          <Route path="/presenze" element={<Presenze />} />
          <Route path="/spese" element={<Spese />} />
          <Route path="/cantieri" element={<Cantieri />} />
          <Route path="/cronologia" element={<Cronologia />} />

          <Route path="/conteggi" element={<Conteggi />} />
          <Route path="/conteggi/:nome" element={<SchedaOperaio />} />
          <Route path="/storico-operaio" element={<StoricoOperaio />} />
          <Route path="/operai" element={<Operai />} />
          <Route path="/snapshot-operaio" element={<SnapshotOperaio />} />
        </Route>
      </Route>

    </Routes>
    </>
  );
}