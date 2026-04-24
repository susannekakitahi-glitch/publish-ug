import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MomoCheckout from "../components/MomoCheckout";
import { UGX } from "../lib/pricing";
import { useApp, type Org } from "../lib/state";

export default function JoinOrg() {
  const [params] = useSearchParams();
  const preset = params.get("code") ?? "";
  const [code, setCode] = useState(preset);
  const [org, setOrg] = useState<Org | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [showPay, setShowPay] = useState(false);
  const { lookupOrg, signup } = useApp();
  const nav = useNavigate();

  const check = () => {
    const found = lookupOrg(code);
    setOrg(found);
    setChecked(true);
  };

  const price = org
    ? cycle === "monthly"
      ? org.monthlyUgx
      : org.annualUgx
    : 0;

  return (
    <main className="page">
      <h1>Join your organization</h1>
      <p className="muted">
        Enter the invite code your admin shared. Org plans aren't listed
        publicly.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <label className="label" htmlFor="code">
          Invite code
        </label>
        <input
          id="code"
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. ELYON2026"
          autoCapitalize="characters"
        />
        <button className="btn" style={{ marginTop: 10 }} onClick={check}>
          Check code
        </button>
        {checked && !org && (
          <p className="small" style={{ color: "var(--bad)", marginTop: 10 }}>
            That code isn't valid. Ask your org admin for the latest link.
          </p>
        )}
      </div>

      {org && (
        <>
          <div className="banner">
            <strong>{org.name}</strong>
            <div className="small muted">
              {org.memberCount.toLocaleString()} of {org.seatLimit.toLocaleString()}{" "}
              seats used
              {org.memberCount >= org.seatLimit ? " · at capacity" : ""}
            </div>
          </div>

          <div className="card">
            <div className="tabs" role="tablist">
              <button
                className={`tab ${cycle === "monthly" ? "active" : ""}`}
                onClick={() => setCycle("monthly")}
              >
                Monthly · {UGX(org.monthlyUgx)}
              </button>
              <button
                className={`tab ${cycle === "annual" ? "active" : ""}`}
                onClick={() => setCycle("annual")}
              >
                Annual · {UGX(org.annualUgx)} (save 2 months)
              </button>
            </div>

            <label className="label" htmlFor="nm">
              Your name
            </label>
            <input
              id="nm"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
            <div style={{ height: 10 }} />
            <label className="label" htmlFor="ph">
              MoMo / Airtel phone number
            </label>
            <input
              id="ph"
              className="input"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0700 000 000"
            />

            <button
              className="btn primary"
              style={{ marginTop: 14 }}
              disabled={org.memberCount >= org.seatLimit}
              onClick={() => {
                if (!name.trim() || !phone.trim()) {
                  alert("Enter your name and phone number");
                  return;
                }
                setShowPay(true);
              }}
            >
              Pay {UGX(price)} & join
            </button>
            <p className="small muted" style={{ marginTop: 8 }}>
              Individual billing: {org.name} doesn't pay for your seat — you pay
              your own UGX {org.monthlyUgx.toLocaleString()}/month directly from
              your MoMo.
            </p>
          </div>
        </>
      )}

      {showPay && org && (
        <MomoCheckout
          amountUgx={price}
          label={`${org.name} · ${cycle}`}
          defaultPhone={phone}
          onCancel={() => setShowPay(false)}
          onSuccess={() => {
            signup(name, phone, "org", org.id);
            nav("/onboarding");
          }}
        />
      )}
    </main>
  );
}
