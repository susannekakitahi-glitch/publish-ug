import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/state";

export default function Login() {
  const [phone, setPhone] = useState("");
  const { login } = useApp();
  const nav = useNavigate();

  return (
    <main className="page">
      <h1>Log in</h1>
      <p className="muted">Use the MoMo number you signed up with.</p>

      <div className="card" style={{ marginTop: 14 }}>
        <label className="label" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          className="input"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0700 000 000"
        />
      </div>
      <button
        className="btn primary"
        onClick={() => {
          if (!phone.trim()) return alert("Enter your phone number");
          if (login(phone)) nav("/dashboard");
        }}
      >
        Send code & log in
      </button>
      <p className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
        New here?{" "}
        <Link to="/signup" className="link">
          Create an account
        </Link>{" "}
        · or{" "}
        <Link to="/join" className="link">
          enter invite code
        </Link>
      </p>
    </main>
  );
}
