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
  /** Platform the user is about to connect via Real OAuth, *before* we
   *  open the OAuth popup. We interrupt the click with a small confirm
   *  dialog so the user can sign out of the wrong account first —
   *  Safari auto-uses whichever account is signed in, and there's no
   *  way for Zernio's URL to force an account picker. */
  const [confirmConnect, setConfirmConnect] = useState<Platform | null>(
    null
  );

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

  /** True when an Error came from a Zernio 404 "Profile not found".
   *  The j() helper in zernio.ts throws Error("<status> <body>") so we
   *  match on the status prefix. The body shape is FastAPI-wrapped
   *  (`{"detail":{"error":"Profile not found"}}`) but we only need the
   *  status — the body is logged via setRealError when the self-heal
   *  itself fails. */
  function isStaleProfile404(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.startsWith("404");
  }

  /** Replace the cached Zernio profile id with a freshly-minted one.
   *  Used by self-heal paths when an upstream call 404s with "Profile
   *  not found" — usually because the user deleted the profile on
   *  zernio.com or the Zernio account was reset. Returns the new id, or
   *  null when the tenant scope can't be resolved (no logged-in user,
   *  agency without active client). */
  async function mintFreshProfile(): Promise<string | null> {
    if (!user) return null;
    if (agency && !activeClient) return null;
    const fresh =
      agency && activeClient
        ? await createProfile(`${user.name} — ${activeClient.name}`)
        : await createProfile(user.name || user.phone);
    if (agency && activeClient) {
      setClientZernioProfileId(activeClient.id, fresh._id);
    } else {
      setUserZernioProfileId(fresh._id);
    }
    inflightProfile.current.clear();
    return fresh._id;
  }

  // Sync real accounts from Zernio on mount / when returning from OAuth.
  async function syncFromZernio() {
    if (mode !== "real" || !zernioEnabled()) return;
    setRealError(null);
    try {
      let profileId = await ensureTenantProfileId();
      if (!profileId) return;
      let remote: Awaited<ReturnType<typeof listAccounts>>;
      try {
        remote = await listAccounts(profileId);
      } catch (e) {
        if (isStaleProfile404(e)) {
          const fresh = await mintFreshProfile();
          if (!fresh) throw e;
          profileId = fresh;
          remote = await listAccounts(profileId);
        } else {
          throw e;
        }
      }
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
    // Open the popup synchronously inside the click handler. iOS Safari
    // (and some popup-blocker configs on desktop) only allow window.open
    // when it is called directly from a user gesture — opening it AFTER
    // an `await` is treated as not-user-initiated and silently blocked.
    // Strategy: open about:blank now, navigate it once we have the URL.
    const popup = window.open(
      "about:blank",
      "posta-oauth",
      "width=520,height=720"
    );
    setRealBusy(p);
    setRealError(null);
    try {
      let profileId = await ensureTenantProfileId();
      if (!profileId) {
        setRealError("Could not resolve a Zernio profile for this tenant.");
        popup?.close();
        return;
      }
      let url: string;
      try {
        url = await getConnectUrl(p, profileId);
      } catch (e) {
        // /connect/{platform} 404s with "Profile not found" when the
        // cached profileId no longer exists upstream (user deleted it
        // on zernio.com or Zernio reset their data). Self-heal: mint a
        // fresh profile and retry, mirroring syncFromZernio's recovery
        // path. Without this the user is permanently locked out of
        // OAuth and the only way out is clearing Safari's site data.
        if (isStaleProfile404(e)) {
          const fresh = await mintFreshProfile();
          if (!fresh) throw e;
          profileId = fresh;
          url = await getConnectUrl(p, profileId);
        } else {
          throw e;
        }
      }
      if (popup && !popup.closed) {
        popup.location.assign(url);
      } else if (!popup) {
        // Popup was blocked at open time (popup === null). Rare on desktop,
        // happens when popup blockers are very strict. Fall back to
        // same-tab navigation so the user still completes OAuth instead of
        // hitting a dead end. The Zernio consent page redirects back to
        // the app on success.
        window.location.assign(url);
      }
      // If the popup opened but the user closed it before the URL resolved,
      // treat that as cancellation — do NOT yank the main tab to Facebook.
    } catch (e) {
      setRealError(e instanceof Error ? e.message : String(e));
      popup?.close();
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
                    // Interrupt the OAuth flow with an account-picker
                    // confirmation. The popup itself is opened from
                    // startRealConnect inside the dialog's Continue
                    // button click, which is still a user gesture so
                    // iOS Safari won't block it.
                    setConfirmConnect(p.id);
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

      {confirmConnect && (
        <ConnectAccountPicker
          platform={confirmConnect}
          onCancel={() => setConfirmConnect(null)}
          onContinue={() => {
            const p = confirmConnect;
            setConfirmConnect(null);
            startRealConnect(p);
          }}
        />
      )}
    </main>
  );
}

/** Per-platform sign-out URLs. Tapping the link opens the platform's
 *  logout page in a new tab so the user can switch which account
 *  Safari is signed into before continuing. We can't deep-link an
 *  account picker on Facebook/Instagram — their OAuth flow always
 *  uses the cookie that's currently set in the browser. */
const SIGN_OUT_URLS: Partial<Record<Platform, string>> = {
  facebook: "https://www.facebook.com/logout.php",
  instagram: "https://www.instagram.com/accounts/logout/",
  youtube: "https://accounts.google.com/Logout",
  x: "https://twitter.com/logout",
  linkedin: "https://www.linkedin.com/m/logout/",
  tiktok: "https://www.tiktok.com/logout",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube / Google",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

function ConnectAccountPicker({
  platform,
  onContinue,
  onCancel,
}: {
  platform: Platform;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const label = PLATFORM_LABEL[platform];
  const signOutUrl = SIGN_OUT_URLS[platform];
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <h3 style={{ margin: 0 }}>Connect {label}</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          Posta will connect with the {label} account currently signed
          into Safari. If that's the wrong one (e.g. a personal account
          with no Pages), sign out first, then come back and tap
          {` ${label}`} again.
        </p>
        <div className="col" style={{ gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="btn primary"
            onClick={onContinue}
          >
            Continue with current {label} account
          </button>
          {signOutUrl && (
            <a
              className="btn ghost"
              href={signOutUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ textAlign: "center" }}
            >
              Sign out of {label} first
            </a>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
