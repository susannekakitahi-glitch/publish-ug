import { useState } from "react";
import { UGX } from "../lib/pricing";

type Provider = "mtn" | "airtel";

interface Props {
  amountUgx: number;
  label: string;
  defaultPhone?: string;
  onCancel: () => void;
  onSuccess: (ref: string, provider: Provider, phone: string) => void;
}

export default function MomoCheckout({
  amountUgx,
  label,
  defaultPhone,
  onCancel,
  onSuccess,
}: Props) {
  const [provider, setProvider] = useState<Provider>("mtn");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [stage, setStage] = useState<"form" | "stk" | "done">("form");

  const pay = () => {
    if (!/^(\+?256|0)?\d{9}$/.test(phone.replace(/\s/g, ""))) {
      alert("Enter a valid Ugandan phone number");
      return;
    }
    setStage("stk");
    // mocked STK push
    setTimeout(() => {
      const ref = "MM" + Math.random().toString(36).slice(2, 8).toUpperCase();
      setStage("done");
      setTimeout(() => onSuccess(ref, provider, phone), 700);
    }, 1800);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2>Mobile Money</h2>
          <button className="btn compact ghost" onClick={onCancel} aria-label="close">
            ✕
          </button>
        </div>
        <p className="muted small">
          {label} · {UGX(amountUgx)}
        </p>

        {stage === "form" && (
          <div className="stack" style={{ marginTop: 12 }}>
            <div>
              <span className="label">Provider</span>
              <div className="grid-2">
                <button
                  className={`btn ${provider === "mtn" ? "primary" : "ghost"}`}
                  onClick={() => setProvider("mtn")}
                >
                  MTN MoMo
                </button>
                <button
                  className={`btn ${provider === "airtel" ? "primary" : "ghost"}`}
                  onClick={() => setProvider("airtel")}
                >
                  Airtel Money
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="phone">
                Phone number
              </label>
              <input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                className="input"
                placeholder="0700 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <p className="small muted">
              We'll send a prompt to your phone. Enter your PIN to confirm{" "}
              {UGX(amountUgx)}.
            </p>
            <button className="btn primary" onClick={pay}>
              Pay {UGX(amountUgx)}
            </button>
          </div>
        )}

        {stage === "stk" && (
          <div className="stack" style={{ marginTop: 20, textAlign: "center" }}>
            <div className="muted small">Waiting for PIN on {phone}…</div>
            <div style={{ fontSize: 36 }}>⏳</div>
            <p className="small muted">
              Check your phone. If no prompt came through, dial{" "}
              {provider === "mtn" ? "*165#" : "*185#"} and follow the steps.
            </p>
          </div>
        )}

        {stage === "done" && (
          <div className="stack" style={{ marginTop: 20, textAlign: "center" }}>
            <div
              className="pill good"
              style={{ alignSelf: "center", padding: "6px 14px" }}
            >
              Payment confirmed
            </div>
            <p className="small muted">Activating your access…</p>
          </div>
        )}
      </div>
    </div>
  );
}
