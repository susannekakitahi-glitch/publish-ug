import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ALL_PLATFORMS,
  isAgency,
  scopeAccounts,
  useApp,
  type Platform,
} from "../lib/state";
import { OAuthMock } from "../components/OAuthMock";
import {
  createProfile,
  getConnectUrl,
  listAccounts,
  zernioEnabled,
} from "../lib/zernio";

type Mode = "mock" | "real";

export default function Onboarding() {
  const {
    accounts: allAccounts,
    connectAccount,
    disconnectAccount,
    user,
    clients,
    currentClientId,
    selectClient,
    setUserZernioProfileId,
    setClientZernioProfileId,
  } = useApp();
  const agency = isAgency(user?.plan);
  const location = useLocation();

  const [oauthFor, setOauthFor] = useState<Platform | null>(null);
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem("posta-ug:oauth-mode");
    return saved === "real" && zernioEnabled() ? "real" : "mock";
  });
  const [realBusy, setRealBusy] = useState<Platform | null>(null);
  const [realError, setRealError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("posta-ug:oauth-mode", mode);
  }, [mode]);

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

  /**
   * De-dupes concurrent profile lookups. Keyed by tenant scope (user id /
   * client id) so sync + connect fired in the same tick share one
   * createProfile() call instead of racing and stranding duplicate profiles
   * on Zernio.
   */
  const inflightProfile = useRef<Map<string, Promise<string | null>>>(
    new Map()
  );

  /**
   * Get the Zernio profile ID for the *current tenant scope* (user or
   * client for Agency users), lazily creating it on first use so demo /
   * mock-only users never burn through the Zernio free-tier profile quota.
   */
  async function ensureTenantProfileId(): Promise<string | null> {
    if (!user) return null;

    const scopeKey = agency
      ? activeClient
        ? `client:${activeClient.id}`
        : null
      : `user:${user.phone}`;
    if (!scopeKey) return null;

    const existing = inflightProfile.current.get(scopeKey);
    if (existing) return existing;

    const promise = (async () => {
      if (agency) {
        if (!activeClient) return null;
        if (activeClient.zernioProfileId) return activeClient.zernioProfileId;
        const prof = await createProfile(
          `${user.name} — ${activeClient.name}`
        );
        setClientZernioProfileId(activeClient.id, prof._id);
        return prof._id;
      }
      if (user.zernioProfileId) return user.zernioProfileId;
      const prof = await createProfile(user.name || user.phone);
      setUserZernioProfileId(prof._id);
      return prof._id;
    })();

    inflightProfile.current.set(scopeKey, promise);
    try {
      return await promise;
    } finally {
      inflightProfile.current.delete(scopeKey);
    }
  }

  // Sync real accounts from Zernio on mount / when returning from OAuth.
  async function syncFromZernio() {
    if (mode !== "real" || !zernioEnabled()) return;
    setRealError(null);
    try {
      const profileId = await ensureTenantProfileId();
      if (!profileId) return;
      const remote = await listAccounts(profileId);
      for (const a of remote) {
        const platMap: Record<string, Platform> = {
          facebook: "facebook",
          instagram: "instagram",
          twitter: "x",
          linkedin: "linkedin",
          tiktok: "tiktok",
          youtube: "youtube",
          whatsapp: "whatsapp",
          telegram: "telegram",
        };
        const p = platMap[a.platform];
        if (!p) continue;
        const handle = a.username || a.name || a.platform;
        connectAccount(
          p,
          handle,
          agency ? currentClientId ?? undefined : undefined,
          a._id
        );
      }
      setLastSync(new Date().toLocaleTimeString());
    } catch (e) {
      setRealError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (mode === "real") {
      syncFromZernio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, location.key, currentClientId]);

  async function startRealConnect(p: Platform) {
    if (!zernioEnabled()) return;
    setRealBusy(p);
    setRealError(null);
    try {
      const profileId = await ensureTenantProfileId();
      if (!profileId) {
        setRealError("Could not resolve a Zernio profile for this tenant.");
        return;
      }
      const url = await getConnectUrl(p, profileId);
      window.open(url, "posta-oauth", "width=520,height=720");
    } catch (e) {
      setRealError(e instanceof Error ? e.message : String(e));
    } finally {
      setRealBusy(null);
    }
  }

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

      {zernioEnabled() && (
        <div className="card">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <strong>Connection mode</strong>
            <div className="chips">
              <button
                className={`chip ${mode === "mock" ? "active" : ""}`}
                onClick={() => setMode("mock")}
                type="button"
              >
                Mock OAuth (demo)
              </button>
              <button
                className={`chip ${mode === "real" ? "active" : ""}`}
                onClick={() => setMode("real")}
                type="button"
              >
                Real OAuth (Zernio)
              </button>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {mode === "real"
              ? "Real mode opens the platform's actual consent screen via Zernio. After you approve access, come back to this page and your account will appear here."
              : "Mock mode fakes a connection for demo purposes. Switch to Real OAuth when you want to connect live accounts."}
          </p>
          {mode === "real" && (
            <div className="small muted" style={{ marginTop: 4 }}>
              {lastSync && <span>Synced at {lastSync} · </span>}
              <button
                className="linklike"
                onClick={syncFromZernio}
                type="button"
              >
                Re-sync now
              </button>
            </div>
          )}
          {realError && (
            <p className="small" style={{ color: "var(--bad)", marginTop: 6 }}>
              {realError}
            </p>
          )}
        </div>
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
            const busy = realBusy === p.id;
            return (
              <button
                key={p.id}
                className={`plat ${isConn ? "active" : ""}`}
                disabled={atCap || busy}
                onClick={() => {
                  if (isConn) {
                    disconnectAccount(
                      p.id,
                      agency ? currentClientId ?? undefined : undefined
                    );
                  } else if (mode === "real") {
                    startRealConnect(p.id);
                  } else {
                    setOauthFor(p.id);
                  }
                }}
              >
                <span className="ico">{p.ico}</span>
                {busy ? "…" : p.label}
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
