import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isAgency, scopeAccounts, scopePosts, useApp } from "../lib/state";
import {
  getAnalyticsForProfile,
  zernioEnabled,
  type AnalyticsResult,
} from "../lib/zernio";
import { computeBestTimeHint, formatBestTimeSlot } from "../lib/bestTime";

export default function Dashboard() {
  const {
    user,
    posts: allPosts,
    accounts: allAccounts,
    clients,
    currentClientId,
  } = useApp();

  const agency = isAgency(user?.plan);

  const posts = useMemo(
    () => scopePosts(allPosts, user?.plan, currentClientId),
    [allPosts, user?.plan, currentClientId]
  );
  const accounts = useMemo(
    () => scopeAccounts(allAccounts, user?.plan, currentClientId),
    [allAccounts, user?.plan, currentClientId]
  );

  const perClientRollup = useMemo(() => {
    if (!agency) return [];
    return clients.map((c) => {
      const cPosts = allPosts.filter((p) => p.clientId === c.id);
      const cAccounts = allAccounts.filter((a) => a.clientId === c.id);
      return {
        client: c,
        accounts: cAccounts.length,
        queued: cPosts.filter((p) => p.status === "queued").length,
        pending: cPosts.filter((p) => p.status === "pending_approval").length,
        sent: cPosts.filter((p) => p.status === "sent").length,
        reach: cPosts
          .filter((p) => p.status === "sent")
          .reduce((s, p) => s + (p.reach ?? 0), 0),
      };
    });
  }, [agency, clients, allPosts, allAccounts]);

  // Which Zernio profile's analytics should this Dashboard pull? Agency users
  // drill into one client at a time; the "all clients" view keeps the mocked
  // rollup because Zernio returns per-profile data and we don't want N calls.
  const activeZernioProfileId = useMemo(() => {
    if (!user) return undefined;
    if (agency) {
      if (currentClientId === null) return undefined;
      return clients.find((c) => c.id === currentClientId)?.zernioProfileId;
    }
    return user.zernioProfileId;
  }, [user, agency, currentClientId, clients]);

  const oauthMode =
    typeof window !== "undefined"
      ? localStorage.getItem("posta-ug:oauth-mode")
      : null;
  const canFetchReal =
    zernioEnabled() && oauthMode === "real" && Boolean(activeZernioProfileId);

  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (!canFetchReal || !activeZernioProfileId) return;
    let cancelled = false;
    // setState inside effect is flagged by react-hooks/set-state-in-effect,
    // but here it's synchronising with an external system (Zernio) via an
    // async fetch — the canonical use case. Silence the rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnalytics(null);
    setAnalyticsLoading(true);
    getAnalyticsForProfile(activeZernioProfileId)
      .then((r) => {
        if (!cancelled) setAnalytics(r);
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetchReal, activeZernioProfileId]);

  if (!user) return null;

  const sent = posts.filter((p) => p.status === "sent");
  // Best-time hint uses the same scoped posts as the KPI tiles, so
  // agency users get a per-client recommendation in single-client view.
  const bestTimeHint = computeBestTimeHint(posts);
  const queuedAll = posts.filter((p) => p.status === "queued");
  const pendingAll = posts.filter((p) => p.status === "pending_approval");

  // Prefer live Zernio KPIs when available; otherwise fall back to the mocked
  // numbers we've always derived from local `posts` so demo flows still work.
  // Guard on canFetchReal so a stale fetched value is ignored after the user
  // toggles back to Mock mode or switches to the agency "all clients" view.
  const useLive = canFetchReal && analytics?.kind === "ok";
  const sentCount = useLive ? analytics.summary.posts : sent.length;
  const reach = useLive
    ? analytics.summary.reach
    : sent.reduce((s, p) => s + (p.reach ?? 0), 0);
  const clicks = useLive
    ? analytics.summary.clicks
    : sent.reduce((s, p) => s + (p.clicks ?? 0), 0);

  const quota =
    user.postsQuota === "unlimited"
      ? null
      : Math.max(0, (user.postsQuota as number) - user.postsUsed);

  const viewingAllClients = agency && currentClientId === null;
  const activeClient = clients.find((c) => c.id === currentClientId);
  const clientOf = (cid?: string) => clients.find((c) => c.id === cid);

  return (
    <main className="page">
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 22 }}>
          {agency
            ? viewingAllClients
              ? "All clients"
              : (activeClient?.name ?? `Hi, ${user.name}`)
            : `Hi, ${user.name}`}
        </h1>
        <Link to="/compose" className="btn compact primary">
          + New post
        </Link>
      </div>
      <p className="muted small">
        {agency
          ? viewingAllClients
            ? "Aggregate view across every client brand."
            : "Single-client view — switch brands from the top pill."
          : "Posts this month: one simple view."}
      </p>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi">
          <div className="n">{sentCount}</div>
          <div className="l">Posts sent</div>
        </div>
        <div className="kpi">
          <div className="n">{reach.toLocaleString()}</div>
          <div className="l">People reached</div>
        </div>
        <div className="kpi">
          <div className="n">{clicks.toLocaleString()}</div>
          <div className="l">Clicks</div>
        </div>
      </div>
      {canFetchReal && (
        <p className="small muted" style={{ marginTop: 6 }}>
          {analyticsLoading && "Loading live analytics from Zernio…"}
          {!analyticsLoading && analytics?.kind === "ok" && (
            <>
              Live from Zernio · {analytics.summary.likes.toLocaleString()} likes ·{" "}
              {analytics.summary.comments.toLocaleString()} comments ·{" "}
              {analytics.summary.shares.toLocaleString()} shares ·{" "}
              {analytics.summary.engagementRate}% engagement
            </>
          )}
          {!analyticsLoading && analytics?.kind === "empty" && (
            <>No posts yet on Zernio — publish one to see live numbers.</>
          )}
          {!analyticsLoading && analytics?.kind === "addon_required" && (
            <>
              Showing demo numbers. {analytics.message}{" "}
              <a
                href="https://zernio.com/social-media-analytics"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Learn more
              </a>
              .
            </>
          )}
          {!analyticsLoading && analytics?.kind === "error" && (
            <>Showing demo numbers · Zernio analytics unavailable ({analytics.message})</>
          )}
        </p>
      )}

      {bestTimeHint && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row">
            <strong>Best times to post</strong>
            <span className="small muted">
              from {bestTimeHint.totalSamples} sent
            </span>
          </div>
          <p className="small muted" style={{ marginTop: 4 }}>
            Based on reach + clicks on your own sent posts.
          </p>
          <div className="col" style={{ marginTop: 8, gap: 4 }}>
            <div className="row">
              <span>
                🏆 <strong>{formatBestTimeSlot(bestTimeHint.top)}</strong>
              </span>
              <span className="small muted">
                {bestTimeHint.top.samples} post
                {bestTimeHint.top.samples === 1 ? "" : "s"}
              </span>
            </div>
            {bestTimeHint.runnersUp.map((slot) => (
              <div key={`${slot.dayOfWeek}-${slot.hour}`} className="row">
                <span className="small muted">
                  {formatBestTimeSlot(slot)}
                </span>
                <span className="small muted">
                  {slot.samples} post{slot.samples === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
          <Link
            to="/compose"
            className="btn compact ghost"
            style={{ marginTop: 10 }}
          >
            Schedule one now
          </Link>
        </div>
      )}

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

      {agency && viewingAllClients && (
        <div className="card">
          <div className="row">
            <strong>Clients</strong>
            <Link to="/clients" className="link small">
              Manage
            </Link>
          </div>
          {perClientRollup.length === 0 ? (
            <p className="small muted" style={{ marginTop: 6 }}>
              No clients yet.{" "}
              <Link to="/clients" className="link">
                Add one
              </Link>
              .
            </p>
          ) : (
            <div className="list" style={{ marginTop: 6 }}>
              {perClientRollup.map((r) => (
                <div key={r.client.id} className="row-item">
                  <span
                    className="client-swatch"
                    style={{ background: r.client.color }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.client.name}
                    </div>
                    <div
                      className="small muted"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.accounts} accounts · {r.queued} queued
                      {r.pending > 0 ? ` · ${r.pending} pending` : ""} ·{" "}
                      {r.sent} sent
                    </div>
                  </div>
                  {r.pending > 0 && (
                    <span className="pill warn" style={{ fontSize: 10 }}>
                      {r.pending}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="row">
          <strong>Connected pages</strong>
          <Link to="/onboarding" className="link small">
            Manage
          </Link>
        </div>
        {accounts.length === 0 ? (
          <p className="small muted">
            {agency && viewingAllClients
              ? "No pages connected across any client yet."
              : "No pages connected yet."}
          </p>
        ) : (
          <div className="list" style={{ marginTop: 6 }}>
            {accounts.map((a) => {
              const c = clientOf(a.clientId);
              return (
                <div key={`${a.platform}-${a.clientId ?? "none"}`} className="row-item">
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
                    <div
                      className="small muted"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.platform}
                      {c ? ` · ${c.name}` : ""}
                    </div>
                  </div>
                  <span className="dot-indicator good" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {agency && pendingAll.length > 0 && (
        <div className="card">
          <div className="row">
            <strong>Awaiting approval</strong>
            <Link to="/schedule" className="link small">
              Review
            </Link>
          </div>
          <p className="small muted" style={{ marginTop: 4 }}>
            {pendingAll.length} post{pendingAll.length === 1 ? "" : "s"} need
            client sign-off before they go live.
          </p>
        </div>
      )}

      <div className="card">
        <strong>Upcoming posts</strong>
        {queuedAll.length === 0 ? (
          <p className="small muted" style={{ marginTop: 6 }}>
            Nothing scheduled.{" "}
            <Link to="/compose" className="link">
              Write one
            </Link>
            .
          </p>
        ) : (
          <div className="list">
            {queuedAll
              .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
              .slice(0, 4)
              .map((p) => {
                const c = clientOf(p.clientId);
                return (
                  <div key={p.id} className="row-item">
                    <div className="avatar">
                      {p.kind.slice(0, 2).toUpperCase()}
                    </div>
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
                        {new Date(p.scheduledAt).toLocaleString()} ·{" "}
                        {p.platforms.length} platforms
                        {c ? ` · ${c.name}` : ""}
                      </div>
                    </div>
                    {c && (
                      <span
                        className="client-swatch small-swatch"
                        style={{ background: c.color }}
                        aria-hidden
                      />
                    )}
                  </div>
                );
              })}
          </div>
        )}
        <Link to="/schedule" className="btn ghost" style={{ marginTop: 10 }}>
          Open queue
        </Link>
      </div>
    </main>
  );
}
