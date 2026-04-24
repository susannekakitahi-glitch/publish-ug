import { Link } from "react-router-dom";
import { UGX } from "../lib/pricing";
import { useApp } from "../lib/state";

export default function OrgAdmin() {
  const { user, orgs } = useApp();
  if (!user?.orgId) {
    return (
      <main className="page">
        <h1>Org console</h1>
        <p className="muted">
          This view is for members of an organization plan. You don't belong to
          one.
        </p>
        <Link to="/join" className="btn primary">
          Enter an invite code
        </Link>
      </main>
    );
  }

  const org = orgs.find((o) => o.id === user.orgId);
  if (!org) return null;

  const seatPct = Math.round((org.memberCount / org.seatLimit) * 100);
  const monthlyRevenue = org.memberCount * org.monthlyUgx;

  // fake activity for demo
  const recent = [
    { who: "+256 701 ***238", what: "Paid UGX 5,000 · monthly renewal", when: "2h ago" },
    { who: "+256 702 ***471", what: "Joined — first payment", when: "5h ago" },
    { who: "+256 772 ***019", what: "Paid UGX 48,000 · annual", when: "yesterday" },
    { who: "+256 757 ***332", what: "Payment failed — retrying", when: "yesterday" },
  ];

  return (
    <main className="page">
      <h1>{org.name}</h1>
      <p className="muted small">Org admin console · invite-only plan</p>

      <div className="card raised">
        <div className="row">
          <strong>Invite link</strong>
          <button
            className="btn compact"
            onClick={() => {
              const url = `${window.location.origin}/join?code=${org.inviteCode}`;
              navigator.clipboard?.writeText(url);
              alert("Invite link copied: " + url);
            }}
          >
            Copy
          </button>
        </div>
        <code className="small" style={{ color: "var(--accent)" }}>
          posta.ug/join?code={org.inviteCode}
        </code>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="n">{org.memberCount.toLocaleString()}</div>
          <div className="l">Active members</div>
        </div>
        <div className="kpi">
          <div className="n">{seatPct}%</div>
          <div className="l">Seats used</div>
        </div>
        <div className="kpi">
          <div className="n">{UGX(monthlyRevenue).replace("UGX ", "")}</div>
          <div className="l">UGX / month</div>
        </div>
      </div>

      <div className="card">
        <strong>Member pricing</strong>
        <p className="small muted" style={{ marginTop: 4 }}>
          Each member pays their own MoMo. {org.name} never fronts the cost.
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <span>Monthly</span>
          <strong>{UGX(org.monthlyUgx)}</strong>
        </div>
        <div className="row">
          <span>Annual</span>
          <strong>{UGX(org.annualUgx)} · 2 months free</strong>
        </div>
      </div>

      <div className="card">
        <strong>Recent activity</strong>
        <div className="list">
          {recent.map((r, i) => (
            <div key={i} className="row-item">
              <div className="avatar">·</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.who}</div>
                <div className="small muted">{r.what}</div>
              </div>
              <span className="small muted">{r.when}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="small muted" style={{ textAlign: "center" }}>
        The org admin never sees individual posts — only billing & seats.
      </p>
    </main>
  );
}
