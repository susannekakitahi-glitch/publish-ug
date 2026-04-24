import { Link } from "react-router-dom";
import { useApp } from "../lib/state";

export default function Dashboard() {
  const { user, posts, accounts } = useApp();
  if (!user) return null;

  const sent = posts.filter((p) => p.status === "sent");
  const reach = sent.reduce((s, p) => s + (p.reach ?? 0), 0);
  const clicks = sent.reduce((s, p) => s + (p.clicks ?? 0), 0);

  const quota =
    user.postsQuota === "unlimited"
      ? null
      : Math.max(0, (user.postsQuota as number) - user.postsUsed);

  return (
    <main className="page">
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 22 }}>Hi, {user.name}</h1>
        <Link to="/compose" className="btn compact primary">
          + New post
        </Link>
      </div>
      <p className="muted small">Posts this month: one simple view.</p>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi">
          <div className="n">{sent.length}</div>
          <div className="l">Posts sent</div>
        </div>
        <div className="kpi">
          <div className="n">{reach.toLocaleString()}</div>
          <div className="l">People reached</div>
        </div>
        <div className="kpi">
          <div className="n">{clicks}</div>
          <div className="l">Clicks to number</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <strong>Quota</strong>
          <span className="small muted">
            {user.plan.toUpperCase()} · {user.billingCycle}
          </span>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>
          {quota === null
            ? "Unlimited posts on this plan"
            : `${quota} posts left this month`}
        </p>
        {quota !== null && quota <= 2 && (
          <Link to="/settings" className="btn primary" style={{ marginTop: 10 }}>
            Top up with a post pack
          </Link>
        )}
      </div>

      <div className="card">
        <div className="row">
          <strong>Connected pages</strong>
          <Link to="/onboarding" className="link small">
            Manage
          </Link>
        </div>
        {accounts.length === 0 ? (
          <p className="small muted">No pages connected yet.</p>
        ) : (
          <div className="list" style={{ marginTop: 6 }}>
            {accounts.map((a) => (
              <div key={a.platform} className="row-item">
                <div className="avatar">{a.platform.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.handle}
                  </div>
                  <div className="small muted">{a.platform}</div>
                </div>
                <span className="dot-indicator good" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <strong>Upcoming posts</strong>
        {posts.filter((p) => p.status === "queued").length === 0 ? (
          <p className="small muted" style={{ marginTop: 6 }}>
            Nothing scheduled. <Link to="/compose" className="link">Write one</Link>.
          </p>
        ) : (
          <div className="list">
            {posts
              .filter((p) => p.status === "queued")
              .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
              .slice(0, 4)
              .map((p) => (
                <div key={p.id} className="row-item">
                  <div className="avatar">{p.kind.slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.text || "(media post)"}
                    </div>
                    <div
                      className="small muted"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(p.scheduledAt).toLocaleString()} · {p.platforms.length}{" "}
                      platforms
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
        <Link to="/schedule" className="btn ghost" style={{ marginTop: 10 }}>
          Open queue
        </Link>
      </div>
    </main>
  );
}
