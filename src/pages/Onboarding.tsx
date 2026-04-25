import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ALL_PLATFORMS,
  isAgency,
  scopeAccounts,
  useApp,
  type Platform,
} from "../lib/state";
import { OAuthMock } from "../components/OAuthMock";

export default function Onboarding() {
  const {
    accounts: allAccounts,
    connectAccount,
    disconnectAccount,
    user,
    clients,
    currentClientId,
    selectClient,
  } = useApp();
  const agency = isAgency(user?.plan);
  const [oauthFor, setOauthFor] = useState<Platform | null>(null);

  const scoped = useMemo(
    () => scopeAccounts(allAccounts, user?.plan, currentClientId),
    [allAccounts, user?.plan, currentClientId]
  );

  const accounts =
    agency && currentClientId === null ? allAccounts : scoped;

  const connected = new Set(accounts.map((a) => a.platform));
  const cap =
    user?.accountsQuota === "unlimited"
      ? Infinity
      : (user?.accountsQuota as number) ?? 1;
  const totalUsed = allAccounts.length;

  const needsFirstClient = agency && clients.length === 0;
  const needsClientPick =
    agency && currentClientId === null && clients.length > 0;
  const activeClient = clients.find((c) => c.id === currentClientId);

  if (needsFirstClient) {
    return (
      <main className="page">
        <h1>Connect your pages</h1>
        <div className="card">
          <strong>Add a client first</strong>
          <p className="small muted" style={{ marginTop: 6 }}>
            Agency users connect social pages per client brand. Create your
            first client to start.
          </p>
          <Link to="/clients" className="btn primary" style={{ marginTop: 10 }}>
            Go to Clients
          </Link>
        </div>
      </main>
    );
  }

  if (needsClientPick) {
    return (
      <main className="page">
        <h1>Connect your pages</h1>
        <p className="small muted">
          Pick the client you want to connect pages for.
        </p>
        <div className="col" style={{ marginTop: 12, gap: 8 }}>
          {clients.map((c) => (
            <button
              key={c.id}
              className="btn ghost"
              onClick={() => selectClient(c.id)}
              style={{ justifyContent: "flex-start", gap: 10 }}
            >
              <span
                className="client-swatch"
                style={{ background: c.color }}
                aria-hidden
              />
              {c.name}
            </button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Connect your pages</h1>
      {agency && activeClient && (
        <p className="muted small">
          Connecting pages for <strong>{activeClient.name}</strong>. Switch
          brand from the pill above to connect others.
        </p>
      )}
      {!agency && (
        <p className="muted">
          Pick the pages you want to post to. You can always add more later.
        </p>
      )}

      <div className="card">
        <div className="small muted">
          {agency
            ? `${accounts.length} connected for this client · ${totalUsed} of ${cap === Infinity ? "unlimited" : cap} total`
            : `${accounts.length} of ${cap === Infinity ? "unlimited" : cap} connected`}
        </div>
        <div className="platforms" style={{ marginTop: 10 }}>
          {ALL_PLATFORMS.map((p) => {
            const isConn = connected.has(p.id);
            const atCap = !isConn && totalUsed >= cap;
            return (
              <button
                key={p.id}
                className={`plat ${isConn ? "active" : ""}`}
                disabled={atCap}
                onClick={() => {
                  if (isConn) {
                    disconnectAccount(
                      p.id,
                      agency ? currentClientId ?? undefined : undefined
                    );
                  } else {
                    setOauthFor(p.id);
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

      {oauthFor && (
        <OAuthMock
          platform={oauthFor}
          onClose={() => setOauthFor(null)}
          onSuccess={(handle) => {
            connectAccount(
              oauthFor,
              handle,
              agency ? currentClientId ?? undefined : undefined
            );
            setOauthFor(null);
          }}
        />
      )}
    </main>
  );
}
