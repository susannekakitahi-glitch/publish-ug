import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import MomoCheckout from "../components/MomoCheckout";
import { UGX, getPlan, type PlanId } from "../lib/pricing";
import { useApp } from "../lib/state";

const PUBLIC_PLAN_IDS = ["free", "starter", "business", "agency"] as const;
type PublicPlanId = (typeof PUBLIC_PLAN_IDS)[number];

function coercePlan(raw: string | null): PublicPlanId {
  return (PUBLIC_PLAN_IDS as readonly string[]).includes(raw ?? "")
    ? (raw as PublicPlanId)
    : "free";
}

export default function Signup() {
  const [params] = useSearchParams();
  const initialPlan: PublicPlanId = coercePlan(params.get("plan"));
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPay, setShowPay] = useState(false);
  const { signup } = useApp();
  const nav = useNavigate();

  const p = getPlan(plan);

  const start = () => {
    if (!name.trim() || !phone.trim()) {
      alert("Enter your name and phone number");
      return;
    }
    if (plan === "free") {
      signup(name, phone, "free");
      nav("/onboarding");
    } else {
      setShowPay(true);
    }
  };

  return (
    <main className="page">
      <h1>Create your account</h1>
      <p className="muted">It takes under a minute.</p>

      <div className="card" style={{ marginTop: 14 }}>
        <label className="label" htmlFor="name">
          Business name or your name
        </label>
        <input
          id="name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Suzie's Salon"
          autoComplete="organization"
        />
        <div style={{ height: 10 }} />
        <label className="label" htmlFor="phone">
          MoMo / Airtel phone number
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

      <div className="card">
        <div className="row">
          <strong>Your plan</strong>
          <Link to="/pricing" className="link small">
            Change
          </Link>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div className="small muted">{p.tagline}</div>
          </div>
          <div className="price">
            <span className="amt">
              {p.monthlyUgx === 0 ? "Free" : UGX(p.monthlyUgx)}
            </span>
            {p.monthlyUgx > 0 ? <span className="per">/ mo</span> : null}
          </div>
        </div>
      </div>

      <button className="btn primary" onClick={start}>
        {plan === "free" ? "Create account" : `Pay ${UGX(p.monthlyUgx)} & start`}
      </button>

      <p className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
        By continuing you agree to our fair-use terms. Already have an account?{" "}
        <Link to="/login" className="link">
          Log in
        </Link>
      </p>

      {showPay && (
        <MomoCheckout
          amountUgx={p.monthlyUgx}
          label={`${p.name} · monthly`}
          defaultPhone={phone}
          onCancel={() => setShowPay(false)}
          onSuccess={() => {
            signup(name, phone, plan);
            nav("/onboarding");
          }}
        />
      )}

      {/* quick plan swap */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="small muted">Quick switch</div>
        <div className="tabs" style={{ marginTop: 8 }}>
          {(["free", "starter", "business", "agency"] as PlanId[]).map((id) => (
            <button
              key={id}
              className={`tab ${plan === id ? "active" : ""}`}
              onClick={() => setPlan(id)}
            >
              {getPlan(id).name}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
