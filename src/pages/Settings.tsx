import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MomoCheckout from "../components/MomoCheckout";
import { PLANS, UGX, getPlan, type PlanId } from "../lib/pricing";
import { useApp } from "../lib/state";

export default function Settings() {
  const {
    user,
    logout,
    topUpPosts,
    setPlan,
    templates,
    updateTemplate,
    removeTemplate,
  } = useApp();
  const nav = useNavigate();
  const [pendingPack, setPendingPack] = useState<{
    label: string;
    amount: number;
    posts?: number;
    onDone: () => void;
  } | null>(null);

  if (!user) return null;
  const plan = getPlan(user.plan);

  const upgradeTargets = PLANS.filter(
    (p) => !p.hidden && p.id !== user.plan && p.monthlyUgx > plan.monthlyUgx
  );

  return (
    <main className="page">
      <h1>Billing & account</h1>

      <div className="card raised">
        <div className="row">
          <div>
            <div className="small muted">Current plan</div>
            <strong style={{ fontSize: 18 }}>{plan.name}</strong>
            {user.orgId && (
              <div className="small muted">via {user.orgId.toUpperCase()}</div>
            )}
          </div>
          <div className="price">
            <span className="amt">
              {plan.monthlyUgx === 0
                ? "Free"
                : UGX(
                    user.billingCycle === "annual" && plan.annualUgx
                      ? plan.annualUgx
                      : plan.monthlyUgx
                  )}
            </span>
            {plan.monthlyUgx > 0 && (
              <span className="per">
                / {user.billingCycle === "annual" ? "yr" : "mo"}
              </span>
            )}
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small muted">
            {user.postsUsed} used ·{" "}
            {user.postsQuota === "unlimited"
              ? "unlimited"
              : `${user.postsQuota} total`}
          </span>
          <span className="pill good">active</span>
        </div>
      </div>

      {plan.packs.length > 0 && (
        <div className="card">
          <strong>Top up with a post pack</strong>
          <p className="small muted">
            One-off MoMo payment. Goes straight onto your account.
          </p>
          <div className="col" style={{ marginTop: 10 }}>
            {plan.packs.map((pk) => (
              <div key={pk.label} className="row">
                <div>
                  <div style={{ fontWeight: 600 }}>{pk.label}</div>
                  <div className="small muted">
                    {UGX(pk.priceUgx)}
                    {pk.extra ? ` · ${pk.extra}` : ""}
                  </div>
                </div>
                <button
                  className="btn compact primary"
                  onClick={() =>
                    setPendingPack({
                      label: pk.label,
                      amount: pk.priceUgx,
                      posts: pk.posts,
                      onDone: () => {
                        if (pk.posts) topUpPosts(pk.posts);
                      },
                    })
                  }
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {upgradeTargets.length > 0 && (
        <div className="card">
          <strong>Upgrade</strong>
          <p className="small muted">Switch anytime — we prorate fairly.</p>
          <div className="col" style={{ marginTop: 10 }}>
            {upgradeTargets.map((p) => (
              <button
                key={p.id}
                className="btn ghost"
                onClick={() =>
                  setPendingPack({
                    label: `Upgrade to ${p.name}`,
                    amount: p.monthlyUgx,
                    onDone: () => setPlan(p.id as PlanId, "monthly"),
                  })
                }
              >
                {p.name} · {UGX(p.monthlyUgx)}/mo →
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <strong>Caption templates</strong>
        <p className="small muted" style={{ marginTop: 4 }}>
          Reusable caption presets. Save one from Compose, then pick it
          from the <em>Use template</em> menu next time.
        </p>
        {templates.length === 0 ? (
          <p className="small muted" style={{ marginTop: 8 }}>
            No templates yet.
          </p>
        ) : (
          <div className="col" style={{ marginTop: 10, gap: 8 }}>
            {templates.map((t) => (
              <div
                key={t.id}
                className="row"
                style={{ alignItems: "flex-start", gap: 8 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div
                    className="small muted"
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={t.text}
                  >
                    {t.kind} · {t.text || "(empty)"}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn compact ghost"
                    onClick={() => {
                      const name = window.prompt(
                        "Rename template",
                        t.name
                      );
                      if (name === null) return;
                      updateTemplate(t.id, { name });
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn compact ghost"
                    onClick={() => {
                      if (
                        window.confirm(`Delete template “${t.name}”?`)
                      ) {
                        removeTemplate(t.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <strong>Your details</strong>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="small muted">Name</span>
          <span>{user.name}</span>
        </div>
        <div className="row">
          <span className="small muted">Phone</span>
          <span>{user.phone}</span>
        </div>
        <div className="divider" />
        <div className="col" style={{ gap: 6 }}>
          <Link to="/onboarding" className="btn ghost">
            Manage connected pages
          </Link>
          <Link to="/pricing" className="btn ghost">
            See all plans
          </Link>
          <button
            className="btn ghost"
            onClick={() => {
              logout();
              nav("/");
            }}
          >
            Log out
          </button>
        </div>
      </div>

      {pendingPack && (
        <MomoCheckout
          amountUgx={pendingPack.amount}
          label={pendingPack.label}
          defaultPhone={user.phone}
          onCancel={() => setPendingPack(null)}
          onSuccess={() => {
            pendingPack.onDone();
            setPendingPack(null);
          }}
        />
      )}
    </main>
  );
}
