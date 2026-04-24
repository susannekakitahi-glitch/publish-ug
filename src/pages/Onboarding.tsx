import { Link } from "react-router-dom";
import { ALL_PLATFORMS, useApp } from "../lib/state";

export default function Onboarding() {
  const { accounts, connectAccount, disconnectAccount, user } = useApp();
  const connected = new Set(accounts.map((a) => a.platform));
  const cap =
    user?.accountsQuota === "unlimited"
      ? Infinity
      : (user?.accountsQuota as number) ?? 1;

  return (
    <main className="page">
      <h1>Connect your pages</h1>
      <p className="muted">
        Pick the pages you want to post to. You can always add more later.
      </p>

      <div className="card">
        <div className="small muted">
          {accounts.length} of {cap === Infinity ? "unlimited" : cap} connected
        </div>
        <div className="platforms" style={{ marginTop: 10 }}>
          {ALL_PLATFORMS.map((p) => {
            const isConn = connected.has(p.id);
            const atCap = !isConn && accounts.length >= cap;
            return (
              <button
                key={p.id}
                className={`plat ${isConn ? "active" : ""}`}
                disabled={atCap}
                onClick={() => {
                  if (isConn) disconnectAccount(p.id);
                  else {
                    const handle = prompt(`${p.label} handle or page name`);
                    if (handle) connectAccount(p.id, handle);
                  }
                }}
              >
                <span className="ico">{p.ico}</span>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <strong>Heads up</strong>
        <ul className="feature-list">
          <li>Instagram & TikTok require business or creator accounts</li>
          <li>Facebook Pages connects via Meta Graph API</li>
          <li>We never post without your approval</li>
        </ul>
      </div>

      <Link to="/dashboard" className="btn primary">
        {accounts.length > 0 ? "Go to dashboard" : "Skip for now"}
      </Link>
    </main>
  );
}
