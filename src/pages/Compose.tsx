import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ALL_PLATFORMS,
  isAgency,
  scopeAccounts,
  computeOccurrences,
  scopePosts,
  useApp,
  type Platform,
  type RecurringRule,
  type MediaItem,
} from "../lib/state";
import type { ScheduledPost } from "../lib/state";
import { uploadMediaFile, zernioEnabled } from "../lib/zernio";
import {
  computeBestTimeHint,
  formatBestTimeSlot,
  type BestTimeSlot,
} from "../lib/bestTime";
import { PlatformPreview } from "../components/PlatformPreview";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";

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
    templates,
    addTemplate,
    posts: allPosts,
    addRecurringRule,
  } = useApp();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  // Schedule.tsx navigates here as `/compose?date=YYYY-MM-DD` from the
  // calendar's per-day "+ Add post" button. Pre-fill the schedule input
  // with that day at 09:00 local and lock the timing toggle to Later
  // so the user lands directly in the scheduling flow.
  const prefillDate = searchParams.get("date");
  const agency = isAgency(user?.plan);
  const scopedAccounts = useMemo(
    () => scopeAccounts(allAccounts, user?.plan, currentClientId),
    [allAccounts, user?.plan, currentClientId]
  );
  const accounts = agency && currentClientId === null ? [] : scopedAccounts;
  const needsClientPick = agency && currentClientId === null && clients.length > 0;
  const needsFirstClient = agency && clients.length === 0;
  // Best-time hint: pull a suggested dow/hour slot from the user's own
  // sent-post history, scoped to the current client in agency mode so
  // each brand gets its own recommendation. null until enough history
  // has been sent + synced via syncPostStatuses.
  const scopedSentPosts = useMemo(
    () => scopePosts(allPosts, user?.plan, currentClientId),
    [allPosts, user?.plan, currentClientId]
  );
  const bestTimeHint = useMemo(
    () => computeBestTimeHint(scopedSentPosts),
    [scopedSentPosts]
  );
  const [kind, setKind] = useState<Kind>("status");
  const [text, setText] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(
    accounts.map((a) => a.platform).slice(0, 3)
  );
  const [when, setWhen] = useState<string>(() =>
    prefillDate ? prefillFromDate(prefillDate) : defaultWhen()
  );
  const [timing, setTiming] = useState<"now" | "later">("later");
  // Recurring-posts state. Repeat is gated on timing === "later" — a
  // "Post now" with repeat doesn't make sense. Defaults: weekly on the
  // day of week that matches `when`, 12 occurrences. The user can tune
  // cadence / end in the Repeat section below the datetime picker.
  const [repeat, setRepeat] = useState(false);
  const [cadenceType, setCadenceType] = useState<
    "daily" | "weekly" | "monthly"
  >("weekly");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [monthlyDom, setMonthlyDom] = useState<number>(1);
  const [endMode, setEndMode] = useState<"count" | "date">("count");
  const [endCount, setEndCount] = useState<number>(12);
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
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

  /** Kick off (or retry) an upload for the media item at `name` (the
   *  in-app filename). Updates the matching item in state by name —
   *  index isn't stable because removals shift the array while uploads
   *  are inflight. Caller must guarantee names are unique within the
   *  current Compose session, which onPickFiles does by appending a
   *  timestamp suffix.
   */
  const startUpload = async (uniqName: string, file: File | Blob) => {
    if (!zernioEnabled()) {
      // Mock mode: leave publicUrl absent. The post will be scheduled
      // as a local-only mock and never hit the publish path.
      setMedia((arr) =>
        arr.map((it) =>
          it.name === uniqName ? { ...it, uploading: false } : it
        )
      );
      return;
    }
    // Wrap blobs (e.g. canvas output for images) in a File so that the
    // Zernio presign call sees a valid filename + contentType.
    const asFile =
      file instanceof File
        ? file
        : new File([file], uniqName, {
            type: (file as Blob).type || "application/octet-stream",
          });
    const result = await uploadMediaFile(asFile);
    setMedia((arr) =>
      arr.map((it) => {
        if (it.name !== uniqName) return it;
        if (result.kind === "ok") {
          return {
            ...it,
            publicUrl: result.publicUrl,
            uploading: false,
            uploadError: undefined,
          };
        }
        return { ...it, uploading: false, uploadError: result.message };
      })
    );
  };

  // Hold the original File objects keyed by uniq name so we can re-upload
  // on retry without forcing the user to re-pick from the picker.
  const fileBlobs = useRef<Map<string, File | Blob>>(new Map());

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusyMedia(true);
    try {
      const slots = maxItems - media.length;
      const picked = Array.from(files).slice(0, slots);
      const processed: MediaItem[] = [];
      const uploads: Array<{ uniqName: string; payload: File | Blob }> = [];
      for (const f of picked) {
        // Suffix with timestamp + random so two files picked in one batch
        // with the same OS-side filename don't collide while uploads run.
        const uniqName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}-${f.name}`;
        if (mediaMode === "image") {
          if (!f.type.startsWith("image/")) continue;
          const { dataUrl, blob } = await downscaleImage(f, 960, 0.72);
          processed.push({
            kind: "image",
            name: uniqName,
            dataUrl,
            size: blob.size,
            uploading: zernioEnabled(),
          });
          fileBlobs.current.set(uniqName, blob);
          uploads.push({ uniqName, payload: blob });
        } else if (mediaMode === "video") {
          if (!f.type.startsWith("video/")) continue;
          const dataUrl = await capturePoster(f);
          processed.push({
            kind: "video",
            name: uniqName,
            dataUrl,
            size: f.size,
            uploading: zernioEnabled(),
          });
          fileBlobs.current.set(uniqName, f);
          uploads.push({ uniqName, payload: f });
        }
      }
      setMedia((m) => [...m, ...processed]);
      // Fire uploads after the state update so the placeholder rows are
      // already on screen with their "Uploading…" indicator.
      for (const u of uploads) startUpload(u.uniqName, u.payload);
    } finally {
      setBusyMedia(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const retryUpload = (uniqName: string) => {
    const blob = fileBlobs.current.get(uniqName);
    if (!blob) return;
    setMedia((arr) =>
      arr.map((it) =>
        it.name === uniqName
          ? { ...it, uploading: true, uploadError: undefined }
          : it
      )
    );
    startUpload(uniqName, blob);
  };

  const removeMedia = (i: number) =>
    setMedia((m) => {
      const item = m[i];
      if (item) fileBlobs.current.delete(item.name);
      return m.filter((_, idx) => idx !== i);
    });

  // Sensors mirror the Calendar drag setup: small distance on desktop
  // so single-tap × and Retry buttons still fire, press-and-hold on
  // touch so scrolling the page doesn't accidentally start a reorder.
  const mediaSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  function onMediaReorder(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;
    setMedia((arr) => {
      const from = arr.findIndex((m) => m.name === activeId);
      const to = arr.findIndex((m) => m.name === overId);
      if (from === -1 || to === -1) return arr;
      return arrayMove(arr, from, to);
    });
  }

  // Desktop-only drop zone: user can drag image / video files from
  // their OS file manager straight onto the composer. Mobile uses
  // the existing Camera / Choose buttons (no OS drag).
  const [dropZoneActive, setDropZoneActive] = useState(false);
  function onNativeDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropZoneActive(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    void onPickFiles(files);
  }

  const changeKind = (k: Kind) => {
    setKind(k);
    fileBlobs.current.clear();
    setMedia([]);
  };

  // Pre-fill the `when` datetime-local with the next upcoming occurrence
  // of the given dow/hour slot in local time. Used by the 'Use this slot'
  // shortcut on the best-time hint so the user goes from hint to scheduled
  // in one tap. Always in the future — if today matches the dow but the
  // hour has already passed, jumps forward a week.
  function applyBestTimeSlot(slot: BestTimeSlot) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(slot.hour, 0, 0, 0);
    let delta = (slot.dayOfWeek - now.getDay() + 7) % 7;
    if (delta === 0 && target.getTime() <= now.getTime()) delta = 7;
    target.setDate(target.getDate() + delta);
    const pad = (n: number) => String(n).padStart(2, "0");
    setWhen(
      `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
        target.getDate()
      )}T${pad(target.getHours())}:${pad(target.getMinutes())}`
    );
    setTiming("later");
  }

  // Apply a saved caption template to the in-progress draft. Switches
  // the post kind to the template's kind (so the matching media slots
  // re-render) and overwrites the caption with the template text. We
  // intentionally don't merge with existing text because users
  // expect Use template to feel like "start from this template".
  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (
      text.trim() &&
      !confirm(`Replace the current caption with “${t.name}”?`)
    ) {
      return;
    }
    if (t.kind !== kind) changeKind(t.kind);
    setText(t.text);
  }

  // Persist the current caption + post kind as a reusable template.
  // Disabled in the UI when the caption is empty so we never end up
  // with blank rows in /settings.
  function saveAsTemplate() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const name = window.prompt(
      "Template name",
      trimmed.split(/\s+/).slice(0, 4).join(" ")
    );
    if (name === null) return; // user cancelled
    addTemplate({ name, text, kind });
  }

  const anyUploading = media.some((m) => m.uploading);
  const anyUploadFailed = media.some((m) => m.uploadError);

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
    if (anyUploading)
      return alert("Wait for media uploads to finish before scheduling.");
    if (anyUploadFailed)
      return alert(
        "One or more media uploads failed. Tap Retry on the failed item, or remove it."
      );
    const now = timing === "now";
    if (repeat && !now) {
      // Recurring path: build a rule + let the state helper materialize
      // all occurrences through the same schedulePost logic.
      const d = new Date(when);
      const pad = (n: number) => String(n).padStart(2, "0");
      const startDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const timeOfDay = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      let cadence: RecurringRule["cadence"];
      if (cadenceType === "daily") {
        cadence = { type: "daily" };
      } else if (cadenceType === "weekly") {
        const days = weeklyDays.length > 0 ? weeklyDays : [d.getDay()];
        cadence = { type: "weekly", weekdays: days };
      } else {
        cadence = {
          type: "monthly",
          dayOfMonth: Math.min(28, monthlyDom || d.getDate()),
        };
      }
      const endBy: RecurringRule["endBy"] =
        endMode === "count"
          ? { type: "count", count: Math.max(1, endCount) }
          : { type: "date", date: endDate };
      // Pre-compute the occurrence count so we can quota-check before
      // committing. Otherwise a 12-week rule could bulldoze a user
      // whose quota is only 5 posts left for the month.
      const previewRule: RecurringRule = {
        id: "preview",
        name: "",
        text,
        kind,
        platforms,
        media: media.length ? media : undefined,
        cadence,
        timeOfDay,
        startDate,
        endBy,
        paused: false,
        clientId: agency ? (currentClientId ?? undefined) : undefined,
        createdAt: "",
        updatedAt: "",
      };
      const previewCount = computeOccurrences(previewRule).length;
      if (previewCount === 0) {
        alert(
          "No occurrences fit between the start date and the end condition. Check your Repeat settings."
        );
        return;
      }
      if (quotaLeft !== Infinity && previewCount > quotaLeft) {
        alert(
          `This series needs ${previewCount} posts but you only have ${quotaLeft} left this month. Reduce the count, shorten the end date, or top up in Billing.`
        );
        return;
      }
      const { scheduled } = addRecurringRule({
        text: kind === "youtube" ? `${text}\n${ytUrl}` : text,
        kind,
        platforms,
        media: media.length ? media : undefined,
        cadence,
        timeOfDay,
        startDate,
        endBy,
        clientId: agency ? (currentClientId ?? undefined) : undefined,
      });
      if (scheduled === 0) {
        // Defensive — previewCount > 0 above but state.tsx may still
        // skip past occurrences if the user dawdled on the form.
        alert(
          "All occurrences landed in the past. Adjust the start date or time."
        );
        return;
      }
      nav("/schedule");
      return;
    }
    schedulePost({
      text: kind === "youtube" ? `${text}\n${ytUrl}` : text,
      kind,
      platforms,
      // For Post now, stamp scheduledAt with the current moment so the
      // Calendar / Schedule list still sorts correctly. The publishNow
      // flag is what tells Zernio to fire immediately instead of holding.
      scheduledAt: now ? new Date().toISOString() : new Date(when).toISOString(),
      media: media.length ? media : undefined,
      clientId: agency ? (currentClientId ?? undefined) : undefined,
      publishNow: now ? true : undefined,
    });
    nav("/schedule");
  };

  const togglePlatform = (p: Platform) =>
    setPlatforms((xs) =>
      xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]
    );

  const connectedSet = new Set(accounts.map((a) => a.platform));
  // Map of platform -> connected handle so the platform tile can show
  // "Facebook · BBQ Kings" instead of just "Facebook". connectAccount
  // upserts on (platform, clientId) so there is at most one entry per
  // platform within the current scope.
  const handleByPlatform = new Map(
    accounts.map((a) => [a.platform, a.handle] as const)
  );

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
        <div
          className="card"
          onDragOver={(e) => {
            // Accept OS file drags only — ignore dnd-kit's synthetic
            // events (they don't set dataTransfer.types with "Files").
            if (
              e.dataTransfer &&
              Array.from(e.dataTransfer.types).includes("Files")
            ) {
              e.preventDefault();
              setDropZoneActive(true);
            }
          }}
          onDragLeave={(e) => {
            // Fire only when leaving the card itself, not one of its
            // children (dragleave bubbles from every nested node).
            if (e.currentTarget === e.target) setDropZoneActive(false);
          }}
          onDrop={onNativeDrop}
          style={
            dropZoneActive
              ? { outline: "2px dashed var(--accent, #f5d423)", outlineOffset: -4 }
              : undefined
          }
        >
          <div className="row">
            <span className="label">
              {kind === "carousel"
                ? `Photos (${media.length}/${MAX_CAROUSEL})`
                : kind === "video"
                  ? "Video"
                  : "Photo"}
            </span>
            {kind === "carousel" && media.length > 1 && (
              <span className="small muted">
                Drag to reorder · first photo is the cover
              </span>
            )}
          </div>

          {media.length > 0 && (
            <DndContext sensors={mediaSensors} onDragEnd={onMediaReorder}>
              <SortableContext
                items={media.map((m) => m.name)}
                strategy={rectSortingStrategy}
              >
                <div className="media-grid">
                  {media.map((m, i) => (
                    <SortableMediaTile
                      key={m.name}
                      item={m}
                      index={i}
                      showCoverBadge={
                        kind === "carousel" && media.length > 1 && i === 0
                      }
                      onRemove={() => removeMedia(i)}
                      onRetry={() => retryUpload(m.name)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {media.length === 0 && (
            <p
              className="small muted"
              style={{
                marginTop: 6,
                padding: "12px 8px",
                border: "1px dashed var(--line)",
                borderRadius: 8,
                textAlign: "center",
              }}
            >
              Drag {mediaMode === "image" ? "images" : "a video"} here, or use the
              buttons below.
            </p>
          )}
          {(anyUploading || anyUploadFailed) && (
            <p
              className="small"
              style={{
                marginTop: 6,
                color: anyUploadFailed ? "var(--bad)" : "var(--muted)",
              }}
            >
              {anyUploadFailed
                ? "Some uploads failed — retry or remove the failed items before scheduling."
                : "Uploading media to Zernio… you can keep editing while this finishes."}
            </p>
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
          <div className="row" style={{ gap: 6 }}>
            <select
              className="select compact"
              aria-label="Use template"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                applyTemplate(id);
                // Reset back to placeholder so picking the same template
                // twice in a row still fires onChange.
                e.target.value = "";
              }}
              disabled={templates.length === 0}
              title={
                templates.length === 0
                  ? "Save your first template below to reuse it later"
                  : "Insert a saved caption"
              }
            >
              <option value="">
                {templates.length === 0
                  ? "No templates yet"
                  : "Use template…"}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              className="btn compact ghost"
              type="button"
              onClick={saveAsTemplate}
              disabled={!text.trim()}
              title={
                text.trim()
                  ? "Save this caption as a reusable template"
                  : "Type a caption first"
              }
            >
              Save
            </button>
            <button
              className="btn compact ghost"
              onClick={enhance}
              disabled={aiThinking}
            >
              {aiThinking ? "Thinking…" : "✨ AI enhance"}
            </button>
          </div>
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
                title={
                  connected
                    ? handleByPlatform.get(p.id)
                      ? `${p.label} · ${handleByPlatform.get(p.id)}`
                      : p.label
                    : "Connect in onboarding first"
                }
              >
                <span className="ico">{p.ico}</span>
                {p.label}
                {connected && handleByPlatform.get(p.id) && (
                  <span className="plat-handle" title={handleByPlatform.get(p.id)}>
                    {handleByPlatform.get(p.id)}
                  </span>
                )}
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
        <span className="label">When to post</span>
        <div className="tabs" role="tablist" style={{ marginTop: 6 }}>
          <button
            className={`tab ${timing === "now" ? "active" : ""}`}
            onClick={() => setTiming("now")}
            type="button"
          >
            Now
          </button>
          <button
            className={`tab ${timing === "later" ? "active" : ""}`}
            onClick={() => setTiming("later")}
            type="button"
          >
            Later
          </button>
        </div>
        {timing === "later" ? (
          <>
            <input
              id="when"
              type="datetime-local"
              className="input"
              style={{ marginTop: 8 }}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <p className="small muted" style={{ marginTop: 6 }}>
              Africa/Kampala time. We'll retry if the network is down.
            </p>
            {bestTimeHint && (
              <div
                className="row"
                style={{
                  marginTop: 8,
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <p className="small muted" style={{ flex: 1 }}>
                  💡 Best slot so far:{" "}
                  <strong>{formatBestTimeSlot(bestTimeHint.top)}</strong>{" "}
                  (from {bestTimeHint.totalSamples} sent post
                  {bestTimeHint.totalSamples === 1 ? "" : "s"})
                </p>
                <button
                  type="button"
                  className="btn compact ghost"
                  onClick={() => applyBestTimeSlot(bestTimeHint.top)}
                >
                  Use this slot
                </button>
              </div>
            )}
            <div
              className="row"
              style={{ marginTop: 12, alignItems: "center", gap: 8 }}
            >
              <label className="row" style={{ alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                />
                <strong>Repeat this post</strong>
              </label>
              {repeat && (
                <span className="small muted">
                  Series starts from the time above.
                </span>
              )}
            </div>
            {repeat && (
              <div className="col" style={{ gap: 8, marginTop: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <label className="small muted" style={{ minWidth: 80 }}>
                    Cadence
                  </label>
                  <select
                    className="input"
                    value={cadenceType}
                    onChange={(e) =>
                      setCadenceType(
                        e.target.value as "daily" | "weekly" | "monthly"
                      )
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="daily">Every day</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                {cadenceType === "weekly" && (
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {["S", "M", "T", "W", "T", "F", "S"].map((letter, dow) => {
                      const active = weeklyDays.includes(dow);
                      return (
                        <button
                          type="button"
                          key={dow}
                          className={`chip ${active ? "active" : ""}`}
                          onClick={() =>
                            setWeeklyDays((xs) =>
                              active ? xs.filter((d) => d !== dow) : [...xs, dow]
                            )
                          }
                          title={
                            [
                              "Sunday",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                            ][dow]
                          }
                        >
                          {letter}
                        </button>
                      );
                    })}
                    <span className="small muted" style={{ alignSelf: "center" }}>
                      {weeklyDays.length === 0
                        ? "(uses start day's weekday)"
                        : ""}
                    </span>
                  </div>
                )}
                {cadenceType === "monthly" && (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <label className="small muted" style={{ minWidth: 80 }}>
                      On day
                    </label>
                    <input
                      type="number"
                      className="input"
                      min={1}
                      max={28}
                      value={monthlyDom}
                      onChange={(e) =>
                        setMonthlyDom(
                          Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1))
                        )
                      }
                      style={{ flex: 1 }}
                    />
                    <span className="small muted">1–28</span>
                  </div>
                )}
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <label className="small muted" style={{ minWidth: 80 }}>
                    Ends
                  </label>
                  <select
                    className="input"
                    value={endMode}
                    onChange={(e) =>
                      setEndMode(e.target.value as "count" | "date")
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="count">After N occurrences</option>
                    <option value="date">On a specific date</option>
                  </select>
                </div>
                {endMode === "count" ? (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <label className="small muted" style={{ minWidth: 80 }}>
                      Count
                    </label>
                    <input
                      type="number"
                      className="input"
                      min={1}
                      max={365}
                      value={endCount}
                      onChange={(e) =>
                        setEndCount(
                          Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 1))
                        )
                      }
                      style={{ flex: 1 }}
                    />
                  </div>
                ) : (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <label className="small muted" style={{ minWidth: 80 }}>
                      Until
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                )}
                <p className="small muted">
                  Each occurrence counts against your monthly posts quota.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="small muted" style={{ marginTop: 8 }}>
            Publishes immediately to the selected pages. You can watch the
            status flip in <strong>Queue → Sent</strong>.
          </p>
        )}
      </div>

      {platforms.length > 0 && (
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <strong>Preview</strong>
            <span className="small muted">
              {platforms.length} platform{platforms.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="small muted" style={{ marginTop: 4 }}>
            Approximate — real previews depend on each app's renderer.
          </p>
          <div className="pp-row">
            {platforms.map((p) => (
              <PlatformPreview
                key={p}
                platform={p}
                text={text}
                media={media}
                kind={kind}
                handle={handleByPlatform.get(p)}
                youtubeUrl={ytUrl || undefined}
              />
            ))}
          </div>
        </div>
      )}

      <button
        className="btn primary"
        onClick={submit}
        disabled={anyUploading}
        title={
          anyUploading
            ? "Wait for media uploads to finish"
            : anyUploadFailed
              ? "Retry or remove the failed media before scheduling"
              : undefined
        }
      >
        {anyUploading
          ? "Uploading media…"
          : timing === "now"
            ? "Post now"
            : repeat
              ? "Schedule series"
              : "Schedule post"}
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

/** Map a YYYY-MM-DD calendar day key to a datetime-local-style string at
 *  09:00 local time. Falls back to defaultWhen() if the date can't be
 *  parsed (malformed query param) or is in the past — Zernio rejects
 *  scheduledFor in the past, so we'd just round-trip into a 4xx. */
function prefillFromDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return defaultWhen();
  const [, y, mo, d] = m;
  const slot = new Date(Number(y), Number(mo) - 1, Number(d), 9, 0, 0, 0);
  if (Number.isNaN(slot.getTime()) || slot.getTime() < Date.now()) {
    return defaultWhen();
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${slot.getFullYear()}-${pad(slot.getMonth() + 1)}-${pad(
    slot.getDate()
  )}T${pad(slot.getHours())}:${pad(slot.getMinutes())}`;
}

/** Downscale a user-picked image and return both the data URI (for the
 *  in-app preview) and the compressed Blob (for upload to Zernio). The
 *  data URI is identical to the blob's bytes — we encode once on the
 *  canvas and reuse that output for both consumers.
 */
function downscaleImage(
  file: File,
  maxDim: number,
  quality: number
): Promise<{ dataUrl: string; blob: Blob }> {
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
      const dataUrl = c.toDataURL("image/jpeg", quality);
      c.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("canvas toBlob returned null"));
          resolve({ dataUrl, blob });
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function capturePoster(file: File): Promise<string> {
  // Generating a poster frame from a user video is a best-effort nicety —
  // never let a slow/unsupported codec block the upload. We race all event
  // paths against a 4s timeout and always resolve with either the jpeg
  // dataUrl or "" (caller renders a generic video badge for empty posters).
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = url;

    let settled = false;
    const done = (dataUrl: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
      resolve(dataUrl);
    };
    const timer = setTimeout(() => done(""), 4000);

    const grab = () => {
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

    v.onloadeddata = () => {
      try {
        const t = Math.min(0.2, Math.max(0, (v.duration || 1) * 0.05));
        if (Math.abs((v.currentTime || 0) - t) < 0.01) {
          grab();
        } else {
          v.currentTime = t;
        }
      } catch {
        grab();
      }
    };
    v.onseeked = grab;
    v.onerror = () => done("");
  });
}

function SortableMediaTile({
  item,
  showCoverBadge,
  onRemove,
  onRetry,
}: {
  item: MediaItem;
  /** Position in the grid. Currently unused in the render but kept
   *  so future UX (e.g. "Photo 3 of 5" announcements) can plug in. */
  index: number;
  showCoverBadge: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.name });
  const style: React.CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      className="media-tile"
      style={style}
      {...attributes}
      {...listeners}
    >
      {item.kind === "image" ? (
        <img src={item.dataUrl} alt={item.name} />
      ) : (
        <div className="media-video">
          {item.dataUrl ? <img src={item.dataUrl} alt={item.name} /> : null}
          <span className="media-video-badge">▶ video</span>
        </div>
      )}
      {showCoverBadge && (
        <span
          className="media-video-badge"
          style={{ top: 4, bottom: "auto", left: 4, right: "auto" }}
        >
          Cover
        </span>
      )}
      {(item.uploading || item.uploadError) && (
        <div
          className="media-upload-overlay"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            background: item.uploadError
              ? "rgba(180,30,30,0.75)"
              : "rgba(0,0,0,0.55)",
            color: "#fff",
            fontSize: 11,
            textAlign: "center",
            padding: 6,
          }}
        >
          {item.uploading && <span>Uploading…</span>}
          {item.uploadError && (
            <>
              <span>Upload failed</span>
              <span style={{ opacity: 0.85, fontSize: 10 }}>
                {item.uploadError.slice(0, 60)}
              </span>
              <button
                className="btn compact"
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                style={{ marginTop: 2 }}
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        className="media-remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${item.name}`}
      >
        ×
      </button>
      <span className="media-name" title={item.name}>
        {item.name}
      </span>
    </div>
  );
}
