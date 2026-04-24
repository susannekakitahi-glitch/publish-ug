import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ALL_PLATFORMS,
  isAgency,
  scopeAccounts,
  useApp,
  type Platform,
  type MediaItem,
} from "../lib/state";
import type { ScheduledPost } from "../lib/state";

type Kind = ScheduledPost["kind"];

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: "status", label: "Status", hint: "Text update — fastest to publish" },
  { id: "photo", label: "Photo", hint: "1 image — compressed on upload" },
  { id: "carousel", label: "Carousel", hint: "Up to 10 photos" },
  { id: "video", label: "Short video", hint: "Under 10 min, Reels / TikTok / Shorts" },
  { id: "youtube", label: "YouTube share", hint: "Paste a YT link — we preview it" },
];

const MAX_CAROUSEL = 10;

export default function Compose() {
  const {
    accounts: allAccounts,
    schedulePost,
    user,
    clients,
    currentClientId,
    selectClient,
  } = useApp();
  const nav = useNavigate();
  const agency = isAgency(user?.plan);
  const scopedAccounts = useMemo(
    () => scopeAccounts(allAccounts, user?.plan, currentClientId),
    [allAccounts, user?.plan, currentClientId]
  );
  const accounts = agency && currentClientId === null ? [] : scopedAccounts;
  const needsClientPick = agency && currentClientId === null && clients.length > 0;
  const needsFirstClient = agency && clients.length === 0;
  const [kind, setKind] = useState<Kind>("status");
  const [text, setText] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(
    accounts.map((a) => a.platform).slice(0, 3)
  );
  const [when, setWhen] = useState<string>(defaultWhen());
  const [aiThinking, setAiThinking] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busyMedia, setBusyMedia] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const quotaLeft =
    user?.postsQuota === "unlimited"
      ? Infinity
      : Math.max(0, (user!.postsQuota as number) - user!.postsUsed);

  const aiEligible =
    user?.plan === "business" ||
    user?.plan === "agency" ||
    user?.plan === "org";

  const mediaMode: "none" | "image" | "video" =
    kind === "photo" || kind === "carousel"
      ? "image"
      : kind === "video"
        ? "video"
        : "none";

  const maxItems = kind === "carousel" ? MAX_CAROUSEL : 1;

  const enhance = () => {
    if (!aiEligible) {
      alert(
        "AI caption suggestions are available on Business, Agency and Org plans."
      );
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

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusyMedia(true);
    try {
      const slots = maxItems - media.length;
      const picked = Array.from(files).slice(0, slots);
      const processed: MediaItem[] = [];
      for (const f of picked) {
        if (mediaMode === "image") {
          if (!f.type.startsWith("image/")) continue;
          const dataUrl = await downscaleImage(f, 960, 0.72);
          processed.push({ kind: "image", name: f.name, dataUrl, size: dataUrl.length });
        } else if (mediaMode === "video") {
          if (!f.type.startsWith("video/")) continue;
          const dataUrl = await capturePoster(f);
          processed.push({ kind: "video", name: f.name, dataUrl, size: f.size });
        }
      }
      setMedia((m) => [...m, ...processed]);
    } finally {
      setBusyMedia(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const removeMedia = (i: number) =>
    setMedia((m) => m.filter((_, idx) => idx !== i));

  const changeKind = (k: Kind) => {
    setKind(k);
    setMedia([]);
  };

  const submit = () => {
    if (platforms.length === 0) return alert("Pick at least one platform");
    if (kind === "youtube" && !ytUrl.trim()) return alert("Paste a YouTube link");
    if (kind === "photo" && media.length === 0)
      return alert("Add a photo first");
    if (kind === "carousel" && media.length < 2)
      return alert("Add at least 2 photos for a carousel");
    if (kind === "video" && media.length === 0)
      return alert("Add a video first");
    if (kind !== "youtube" && kind !== "photo" && kind !== "carousel" && kind !== "video" && !text.trim())
      return alert("Write something");
    if (quotaLeft <= 0) return alert("You've used your posts this month. Top up in Billing.");
    schedulePost({
      text: kind === "youtube" ? `${text}\n${ytUrl}` : text,
      kind,
      platforms,
      scheduledAt: new Date(when).toISOString(),
      media: media.length ? media : undefined,
      clientId: agency ? (currentClientId ?? undefined) : undefined,
    });
    nav("/schedule");
  };

  const togglePlatform = (p: Platform) =>
    setPlatforms((xs) =>
      xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]
    );

  const connectedSet = new Set(accounts.map((a) => a.platform));

  if (needsFirstClient) {
    return (
      <main className="page">
        <h1>New post</h1>
        <div className="card">
          <strong>Add a client first</strong>
          <p className="small muted" style={{ marginTop: 6 }}>
            Agency posts are always attached to a client brand. Create one to
            unlock Compose.
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
        <h1>New post</h1>
        <p className="small muted">
          Pick the client this post is for — you're currently viewing
          <strong> all clients</strong>.
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

  const activeClient = clients.find((c) => c.id === currentClientId);

  return (
    <main className="page">
      <h1>New post</h1>
      {agency && activeClient && (
        <p className="small muted">
          Posting as <strong>{activeClient.name}</strong> — uses that
          brand's connected pages.
        </p>
      )}
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
            onClick={() => changeKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 6 }}>
        {KINDS.find((k) => k.id === kind)!.hint}
      </p>

      {mediaMode !== "none" && (
        <div className="card">
          <span className="label">
            {kind === "carousel"
              ? `Photos (${media.length}/${MAX_CAROUSEL})`
              : kind === "video"
                ? "Video"
                : "Photo"}
          </span>

          {media.length > 0 && (
            <div className="media-grid">
              {media.map((m, i) => (
                <div key={i} className="media-tile">
                  {m.kind === "image" ? (
                    <img src={m.dataUrl} alt={m.name} />
                  ) : (
                    <div className="media-video">
                      {m.dataUrl ? <img src={m.dataUrl} alt={m.name} /> : null}
                      <span className="media-video-badge">▶ video</span>
                    </div>
                  )}
                  <button
                    className="media-remove"
                    onClick={() => removeMedia(i)}
                    aria-label={`Remove ${m.name}`}
                  >
                    ×
                  </button>
                  <span className="media-name" title={m.name}>
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {media.length < maxItems && (
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button
                className="btn compact ghost"
                onClick={() => fileRef.current?.click()}
                disabled={busyMedia}
              >
                {busyMedia
                  ? "Processing…"
                  : mediaMode === "image"
                    ? kind === "carousel"
                      ? "📎 Add from gallery"
                      : "📎 Choose photo"
                    : "📎 Choose video"}
              </button>
              <button
                className="btn compact ghost"
                onClick={() => cameraRef.current?.click()}
                disabled={busyMedia}
              >
                {mediaMode === "image" ? "📷 Camera" : "🎥 Record"}
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={mediaMode === "image" ? "image/*" : "video/*"}
            multiple={kind === "carousel"}
            hidden
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept={mediaMode === "image" ? "image/*" : "video/*"}
            capture={mediaMode === "image" ? "environment" : "user"}
            hidden
            onChange={(e) => onPickFiles(e.target.files)}
          />

          <p className="small muted" style={{ marginTop: 8 }}>
            {mediaMode === "image"
              ? "Photos are compressed to ~960px to save your data."
              : "Videos are sent in the background when you have good signal."}
          </p>
        </div>
      )}

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
          {kind === "youtube"
            ? "Intro text (optional)"
            : mediaMode !== "none"
              ? "Caption"
              : "What do you want to say?"}
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

function downscaleImage(
  file: File,
  maxDim: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function capturePoster(file: File): Promise<string> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    const done = (dataUrl: string) => {
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.2, Math.max(0, (v.duration || 1) * 0.05));
      } catch {
        done("");
      }
    };
    v.onseeked = () => {
      try {
        const w = Math.min(640, v.videoWidth || 640);
        const scale = w / (v.videoWidth || w);
        const h = Math.round((v.videoHeight || 360) * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return done("");
        ctx.drawImage(v, 0, 0, w, h);
        done(c.toDataURL("image/jpeg", 0.7));
      } catch {
        done("");
      }
    };
    v.onerror = () => done("");
  });
}
