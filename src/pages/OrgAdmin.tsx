import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { UGX } from "../lib/pricing";
import { ALL_PLATFORMS, useApp, type Platform } from "../lib/state";

const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
  reddit: "Reddit",
  bluesky: "Bluesky",
  snapchat: "Snapchat",
  discord: "Discord",
  gmb: "Google Business",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

const shortPlatform = (p: Platform) => {
  const map: Record<Platform, string> = {
    facebook: "FB",
    instagram: "IG",
    x: "X",
    linkedin: "IN",
    tiktok: "TT",
    youtube: "YT",
    pinterest: "PI",
    threads: "TH",
    reddit: "RD",
    bluesky: "BS",
    snapchat: "SC",
    discord: "DC",
    gmb: "GB",
    whatsapp: "WA",
    telegram: "TG",
  };
  return map[p];
};

const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  return `${Math.floor(diff / day)} days ago`;
};

export default function OrgAdmin() {
  const { user, orgs } = useApp();
  const [filter, setFilter] = useState<Platform | "all">("all");

  const org = orgs.find((o) => o.id === user?.orgId);

  const trendingPosts = useMemo(() => {
    if (!org) return [];
    const arr =
      filter === "all"
        ? org.trendingPosts
        : org.trendingPosts.filter((p) => p.platform === filter);
    return [...arr].sort((a, b) => b.reach - a.reach);
  }, [org, filter]);

  const trendingHashtags = useMemo(() => {
    if (!org) return [];
    const arr =
      filter === "all"
        ? org.trendingHashtags
        : org.trendingHashtags.filter((h) => h.platform === filter);
    return [...arr].sort((a, b) => b.uses - a.uses);
  }, [org, filter]);

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

  if (!org) return null;

  const seatPct = Math.round((org.memberCount / org.seatLimit) * 100);
  const monthlyRevenue = org.memberCount * org.monthlyUgx;

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
        <div className="row">
          <strong>Trending across your org</strong>
          <span className="small muted">last 7 days</span>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>
          Top content from all {org.memberCount.toLocaleString()} members,
          aggregated and anonymized.
        </p>

        <div className="chips" style={{ marginTop: 10 }}>
          <button
            className={`chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {ALL_PLATFORMS.map((p) => (
            <button
              key={p.id}
              className={`chip ${filter === p.id ? "active" : ""}`}
              onClick={() => setFilter(p.id)}
            >
              {PLATFORM_LABELS[p.id]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <strong>Trending posts</strong>
        <div className="list" style={{ marginTop: 8 }}>
          {trendingPosts.length === 0 && (
            <div className="small muted">
              No posts on {filter === "all" ? "any platform" : PLATFORM_LABELS[filter as Platform]}{" "}
              this week.
            </div>
          )}
          {trendingPosts.map((p) => (
            <div key={p.id} className="row-item trending-post">
              <div className="avatar platform-avatar">{shortPlatform(p.platform)}</div>
              <div className="trending-body">
                <div className="trending-caption">{p.caption}</div>
                <div className="small muted trending-meta">
                  {PLATFORM_LABELS[p.platform]} · {p.author} · {relTime(p.postedAt)}
                </div>
                <div className="trending-kpis small">
                  <span>
                    <strong>{p.reach.toLocaleString()}</strong> reach
                  </span>
                  <span>
                    <strong>{p.clicks.toLocaleString()}</strong> clicks
                  </span>
                  <span>
                    <strong>{(p.engagementRate * 100).toFixed(1)}%</strong>{" "}
                    engagement
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <strong>Trending hashtags</strong>
        <div className="list" style={{ marginTop: 8 }}>
          {trendingHashtags.length === 0 && (
            <div className="small muted">
              No hashtags on {filter === "all" ? "any platform" : PLATFORM_LABELS[filter as Platform]}{" "}
              this week.
            </div>
          )}
          {trendingHashtags.map((h) => (
            <div key={h.tag + h.platform} className="row-item trending-tag">
              <div className="avatar platform-avatar">{shortPlatform(h.platform)}</div>
              <div className="trending-body">
                <div className="trending-tag-line">
                  <strong>{h.tag}</strong>
                  <span className="small muted"> · {PLATFORM_LABELS[h.platform]}</span>
                </div>
                <div className="small muted">
                  {h.uses} posts · {h.reach.toLocaleString()} reach
                </div>
              </div>
              <span
                className={`delta ${h.deltaPct >= 0 ? "pos" : "neg"} small`}
              >
                {h.deltaPct >= 0 ? "+" : ""}
                {h.deltaPct}%
              </span>
            </div>
          ))}
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
        Trending content is aggregated across all members. Individual post
        contents are never shown alongside member identities.
      </p>
    </main>
  );
}
