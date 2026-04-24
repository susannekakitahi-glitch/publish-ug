import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ALL_PLATFORMS, useApp, type Platform } from "../lib/state";
import type { ScheduledPost } from "../lib/state";

type Kind = ScheduledPost["kind"];

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: "status", label: "Status", hint: "Text update — fastest to publish" },
  { id: "photo", label: "Photo", hint: "1 image — compressed on upload" },
  { id: "carousel", label: "Carousel", hint: "Up to 10 photos" },
  { id: "video", label: "Short video", hint: "Under 10 min, Reels / TikTok / Shorts" },
  { id: "youtube", label: "YouTube share", hint: "Paste a YT link — we preview it" },
];

export default function Compose() {
  const { accounts, schedulePost, user } = useApp();
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind>("status");
  const [text, setText] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(
    accounts.map((a) => a.platform).slice(0, 3)
  );
  const [when, setWhen] = useState<string>(defaultWhen());
  const [aiThinking, setAiThinking] = useState(false);

  const quotaLeft =
    user?.postsQuota === "unlimited"
      ? Infinity
      : Math.max(0, (user!.postsQuota as number) - user!.postsUsed);

  const aiEligible = user?.plan === "business" || user?.plan === "agency";

  const enhance = () => {
    if (!aiEligible) {
      alert("AI caption suggestions are available on Business and Agency plans.");
      return;
    }
    setAiThinking(true);
    setTimeout(() => {
      const base = text.trim() || "Fresh arrivals today!";
      const hooks = [
        "🔥 " + base + " — tag a friend who needs this.",
        base + " Call " + (user?.phone ?? "us") + " to reserve yours.",
        base + " Drop a 💛 if you want the price list.",
      ];
      setText(hooks[Math.floor(Math.random() * hooks.length)]);
      setAiThinking(false);
    }, 800);
  };

  const submit = () => {
    if (platforms.length === 0) return alert("Pick at least one platform");
    if (kind === "youtube" && !ytUrl.trim()) return alert("Paste a YouTube link");
    if (kind !== "youtube" && !text.trim()) return alert("Write something");
    if (quotaLeft <= 0) return alert("You've used your posts this month. Top up in Billing.");
    schedulePost({
      text: kind === "youtube" ? `${text}\n${ytUrl}` : text,
      kind,
      platforms,
      scheduledAt: new Date(when).toISOString(),
    });
    nav("/schedule");
  };

  const togglePlatform = (p: Platform) =>
    setPlatforms((xs) =>
      xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]
    );

  const connectedSet = new Set(accounts.map((a) => a.platform));

  return (
    <main className="page">
      <h1>New post</h1>
      <p className="muted small">
        {quotaLeft === Infinity
          ? "Unlimited on your plan"
          : `${quotaLeft} post${quotaLeft === 1 ? "" : "s"} left this month`}
      </p>

      <div className="tabs" role="tablist" style={{ marginTop: 12 }}>
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={`tab ${kind === k.id ? "active" : ""}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 6 }}>
        {KINDS.find((k) => k.id === kind)!.hint}
      </p>

      <div className="card">
        {kind === "youtube" && (
          <>
            <label className="label" htmlFor="yt">
              YouTube URL
            </label>
            <input
              id="yt"
              className="input"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              inputMode="url"
            />
            <div style={{ height: 10 }} />
          </>
        )}
        <label className="label" htmlFor="txt">
          {kind === "youtube" ? "Intro text (optional)" : "What do you want to say?"}
        </label>
        <textarea
          id="txt"
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            kind === "youtube"
              ? "Tell people why they should watch"
              : "Keep it short and clear…"
          }
        />
        <div className="row" style={{ marginTop: 8 }}>
          <span className="small muted">{text.length} chars</span>
          <button className="btn compact ghost" onClick={enhance} disabled={aiThinking}>
            {aiThinking ? "Thinking…" : "✨ AI enhance"}
          </button>
        </div>
        {!aiEligible && (
          <p className="small muted" style={{ marginTop: 6 }}>
            AI suggestions unlock on Business and Agency plans.
          </p>
        )}
      </div>

      <div className="card">
        <span className="label">Post to</span>
        <div className="platforms">
          {ALL_PLATFORMS.map((p) => {
            const connected = connectedSet.has(p.id);
            const active = platforms.includes(p.id);
            return (
              <button
                key={p.id}
                className={`plat ${active ? "active" : ""}`}
                onClick={() => togglePlatform(p.id)}
                disabled={!connected}
                title={connected ? p.label : "Connect in onboarding first"}
              >
                <span className="ico">{p.ico}</span>
                {p.label}
              </button>
            );
          })}
        </div>
        {accounts.length === 0 && (
          <p className="small muted" style={{ marginTop: 8 }}>
            No pages connected.{" "}
            <Link to="/onboarding" className="link">
              Connect one now
            </Link>
          </p>
        )}
      </div>

      <div className="card">
        <label className="label" htmlFor="when">
          When to post
        </label>
        <input
          id="when"
          type="datetime-local"
          className="input"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <p className="small muted" style={{ marginTop: 6 }}>
          Africa/Kampala time. We'll retry if the network is down.
        </p>
      </div>

      <button className="btn primary" onClick={submit}>
        Schedule post
      </button>
    </main>
  );
}

function defaultWhen(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
