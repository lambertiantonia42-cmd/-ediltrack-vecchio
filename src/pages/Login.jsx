import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setErr("");

    if (!email || !password) {
      setErr("Inserisci email e password");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (e) {
      console.error(e);
      if (e.code === "auth/invalid-credential" || e.code === "auth/user-not-found") {
        setErr("Credenziali non corrette.");
      } else {
        setErr("Errore di connessione. Riprova.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      {/* SFERE DI SFONDO (Generate via CSS) */}
      <div className="login-card animate-in">
        
        <div className="logo-section">
          <div className="logo-box-led">V</div>
          <div className="logo-text">
            <div className="brand-name">EdilTrack</div>
            <div className="brand-sub">VECCHIO</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <div className="input-group">
            <input
              type="email"
              placeholder="Email Aziendale"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="input-group pwd-container">
            <input
              type={showPwd ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="pwd-toggle"
              onClick={() => setShowPwd(!showPwd)}
              tabIndex="-1"
            >
              {showPwd ? "🙈" : "👁️"}
            </button>
          </div>

          {err && <div className="login-error-msg">{err}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "VERIFICA..." : "ACCEDI"}
          </button>
        </form>

        <p className="login-footer">© EdilTrack Pro • {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}