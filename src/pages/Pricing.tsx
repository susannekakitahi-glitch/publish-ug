import { Link, useNavigate } from "react-router-dom";
import { PUBLIC_PLANS, UGX, type PlanId } from "../lib/pricing";

export default function Pricing() {
  const nav = useNavigate();
  const choose = (id: PlanId) => nav(`/signup?plan=${id}`);

  return (
    <main className="page">
      <h1>Pricing</h1>
      <p className="muted">
        All prices in Ugandan Shillings. Pay via MTN MoMo or Airtel Money — no
        card needed.
      </p>

      <div className="stack" style={{ marginTop: 16 }}>
        {PUBLIC_PLANS.map((p) => (
          <div key={p.id} className={`card ${p.recommended ? "raised" : ""}`}>
            <div className="row">
              <div>
                <h2 style={{ marginBottom: 2 }}>{p.name}</h2>
                <div className="small muted">{p.tagline}</div>
              </div>
              {p.recommended ? <span className="pill good">Most chosen</span> : null}
            </div>

            <div className="price" style={{ marginTop: 12 }}>
              <span className="amt">
                {p.monthlyUgx === 0 ? "Free" : UGX(p.monthlyUgx)}
              </span>
              {p.monthlyUgx > 0 ? <span className="per">/ month</span> : null}
            </div>

            <ul className="feature-list">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>

            {p.packs.length > 0 && (
              <>
                <div className="divider" />
                <div className="small muted" style={{ marginBottom: 6 }}>
                  Add-on packs
                </div>
                <div className="col">
                  {p.packs.map((pack) => (
                    <div
                      key={pack.label}
                      className="row"
                      style={{ fontSize: 13 }}
                    >
                      <span>{pack.label}</span>
                      <strong>
                        {UGX(pack.priceUgx)}
                        {pack.extra ? ` · ${pack.extra}` : ""}
                      </strong>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              className={`btn ${p.recommended ? "primary" : ""}`}
              style={{ marginTop: 14 }}
              onClick={() => choose(p.id)}
            >
              {p.monthlyUgx === 0 ? "Start free" : `Choose ${p.name}`}
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Not sure yet?</h3>
        <p className="small muted">
          Start on Free and upgrade any time. You only pay when you're ready.
        </p>
        <Link to="/signup" className="btn ghost" style={{ marginTop: 8 }}>
          Start with Free
        </Link>
      </div>

      <p className="small muted" style={{ marginTop: 12, textAlign: "center" }}>
        Partner with a bank, SACCO or association?{" "}
        <Link to="/join" className="link">
          Enter invite code
        </Link>
      </p>
    </main>
  );
}
