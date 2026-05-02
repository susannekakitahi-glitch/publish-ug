import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ALL_PLATFORMS,
  isAgency,
  scopeAccounts,
  useApp,
  type Platform,
} from "../lib/state";

/** Day-of-week labels used by the "Skip days" picker. Sunday-first to
 *  match the local calendar grid in /schedule. */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Hard cap on how many captions we'll schedule at once. Stops a
 *  pasted-runaway-CSV from blowing through the user's quota and
 *  flooding /schedule with hundreds of cards. The UI surfaces the
 *  cap in the warning area. */
const MAX_BULK = 60;

/** Hard cap on how many days forward we'll search for valid slots
 *  before we stop and ask the user to add more posting times or
 *  unskip days. Keeps the slot loop bounded. */
const MAX_LOOKAHEAD_DAYS = 365;

export default function BulkAdd() {
  const {
    schedulePost,
    accounts: allAccounts,
    user,
    clients,
    currentClientId,
  } = useApp();
  const nav = useNavigate();
  const agency = isAgency(user?.plan);

  const needsClientPick =
    agency && currentClientId === null && clients.length > 0;
  const needsFirstClient = agency && clients.length === 0;
  const connectedPlatforms = useMemo(() => {
    const scoped = scopeAccounts(allAccounts, user?.plan, currentClientId);
    const accounts =
      agency && currentClientId === null ? [] : scoped;
    return Array.from(new Set(accounts.map((a) => a.platform)));
  }, [allAccounts, user?.plan, currentClientId, agency]);

  const [raw, setRaw] = useState("");
  const [startDate, setStartDate] = useState(tomorrowDateKey());
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [skipDays, setSkipDays] = useState<Set<number>>(new Set([0])); // skip Sunday by default
  // null = user hasn't picked yet, fall back to all connected platforms.
  // Once the user toggles a chip we capture their explicit selection and
  // stop following connectedPlatforms changes — they're driving now.
  const [explicitPlatforms, setExplicitPlatforms] = useState<
    Platform[] | null
  >(null);
  // Filter the explicit selection against the currently connected list
  // so that switching clients (which changes connectedPlatforms) drops
  // stale platforms from the previous client. If everything filters
  // out, platforms.length === 0 and platformError surfaces a "Pick at
  // least one platform" error before the user can submit.
  const platforms = useMemo(
    () =>
      explicitPlatforms
        ? explicitPlatforms.filter((p) => connectedPlatforms.includes(p))
        : connectedPlatforms,
    [explicitPlatforms, connectedPlatforms]
  );
  const [submitting, setSubmitting] = useState(false);

  const captions = useMemo(() => parseCaptions(raw), [raw]);

  const quotaLeft =
    user?.postsQuota === "unlimited"
      ? Infinity
      : Math.max(0, (user!.postsQuota as number) - user!.postsUsed);

  // Plan how many captions actually get scheduled given quota + the bulk cap.
  const willSchedule = Math.min(captions.length, quotaLeft, MAX_BULK);

  // A cleared <input type="time"> reads as "". Drop those before
  // feeding computeSlots so we don't silently schedule everything at
  // 00:00 — the validator below surfaces an error instead.
  const validTimes = useMemo(
    () => times.filter((t) => /^\d{2}:\d{2}$/.test(t)),
    [times]
  );

  const slots = useMemo(
    () =>
      computeSlots({
        count: willSchedule,
        startDate,
        times: validTimes,
        skipDays,
      }),
    [willSchedule, startDate, validTimes, skipDays]
  );

  const platformError =
    platforms.length === 0 ? "Pick at least one platform." : null;
  const timesError =
    validTimes.length === 0 ? "Add at least one valid posting time." : null;
  const captionError =
    captions.length === 0
      ? "Paste at least one caption above."
      : null;
  const slotError =
    captions.length > 0 && slots.length < willSchedule
      ? `Couldn't find enough slots in the next ${MAX_LOOKAHEAD_DAYS} days. Add more posting times or unskip a day.`
      : null;

  const blocking =
    captionError ||
    platformError ||
    timesError ||
    slotError ||
    (willSchedule === 0 && captions.length > 0
      ? "You've used your posts this period. Top up in Settings."
      : null) ||
    (needsClientPick ? "Pick a client from the brand switcher above." : null) ||
    (needsFirstClient ? "Add at least one client before bulk-scheduling." : null);

  function toggleSkipDay(idx: number) {
    setSkipDays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function togglePlatform(p: Platform) {
    const current = explicitPlatforms ?? connectedPlatforms;
    const next = current.includes(p)
      ? current.filter((x) => x !== p)
      : [...current, p];
    setExplicitPlatforms(next);
  }

  function addTime() {
    setTimes((prev) => {
      // Suggest a slot 3 hours after the latest one, capped at 21:00.
      // `||` (not `??`) so an empty/cleared trailing input falls back
      // to the 09:00 baseline instead of "" → NaN → "NaN:00".
      const last = prev[prev.length - 1] || "09:00";
      const [h, m] = last.split(":").map(Number);
      const next = Math.min(21, (Number.isFinite(h) ? h : 9) + 3);
      const candidate = `${String(next).padStart(2, "0")}:${String(
        Number.isFinite(m) ? m : 0
      ).padStart(2, "0")}`;
      // De-dup so adding twice doesn't create duplicate slots.
      return prev.includes(candidate) ? prev : [...prev, candidate].sort();
    });
  }

  function setTimeAt(i: number, value: string) {
    setTimes((prev) => {
      const next = [...prev];
      next[i] = value;
      return next.sort();
    });
  }

  function removeTime(i: number) {
    setTimes((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function scheduleAll() {
    if (blocking) return;
    setSubmitting(true);
    try {
      // schedulePost is synchronous (state setter) but its fire-and-forget
      // Zernio push happens in the background. Loop over captions in
      // order so the resulting /schedule list reads top-to-bottom by time.
      for (let i = 0; i < willSchedule; i++) {
        schedulePost({
          text: captions[i],
          kind: "status",
          platforms,
          scheduledAt: slots[i],
          clientId: currentClientId ?? undefined,
        });
      }
      nav("/schedule");
    } finally {
      setSubmitting(false);
    }
  }

  // Pretty preview line for slot N: "Mon Apr 27 · 09:00".
  const fmtSlot = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <main className="page">
      <div className="row">
        <h1 style={{ fontSize: 22 }}>Bulk add</h1>
        <Link to="/schedule" className="btn compact">
          Back to queue
        </Link>
      </div>

      <p className="small muted" style={{ marginTop: 4 }}>
        Paste a list of captions, one per blank-lined block. Posta spreads
        them across upcoming days at the times you choose. Text-only — for
        photo or video posts use{" "}
        <Link to="/compose">Compose</Link>.
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <label className="label" htmlFor="bulk-captions">
          Captions
        </label>
        <textarea
          id="bulk-captions"
          className="input"
          rows={10}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={
            "Happy Monday! Time to grill 🔥\n\nNew menu item dropping this Friday — guess what?\n\nTag a friend who needs BBQ in their life."
          }
          style={{ marginTop: 4, fontFamily: "inherit" }}
          disabled={submitting}
        />
        <p className="small muted" style={{ marginTop: 6 }}>
          {captions.length === 0 && "0 captions detected."}
          {captions.length > 0 && (
            <>
              <strong>{captions.length}</strong> caption
              {captions.length === 1 ? "" : "s"} detected
              {captions.length > willSchedule && (
                <>
                  {" — "}
                  <span style={{ color: "var(--warn, #b38500)" }}>
                    only the first {willSchedule} will be scheduled
                    {captions.length > MAX_BULK
                      ? ` (max ${MAX_BULK} per bulk add)`
                      : Number.isFinite(quotaLeft)
                        ? ` (you have ${quotaLeft} posts left this period)`
                        : ""}
                  </span>
                </>
              )}
              .
            </>
          )}
        </p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <label className="label" htmlFor="bulk-start">
          Start date
        </label>
        <input
          id="bulk-start"
          type="date"
          className="input"
          value={startDate}
          min={todayDateKey()}
          onChange={(e) => setStartDate(e.target.value || todayDateKey())}
          style={{ marginTop: 4 }}
          disabled={submitting}
        />

        <div style={{ marginTop: 12 }}>
          <label className="label">Posting times</label>
          <div className="list" style={{ marginTop: 4, gap: 6 }}>
            {times.map((t, i) => (
              <div
                key={i}
                className="row"
                style={{ gap: 8, justifyContent: "flex-start" }}
              >
                <input
                  type="time"
                  className="input"
                  value={t}
                  onChange={(e) => setTimeAt(i, e.target.value)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="btn compact"
                  onClick={() => removeTime(i)}
                  disabled={submitting || times.length === 1}
                  aria-label={`Remove time ${t}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn compact"
            onClick={addTime}
            disabled={submitting || times.length >= 6}
            style={{ marginTop: 6 }}
          >
            + Add time
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">Skip days</label>
          <div className="chips" style={{ marginTop: 4 }}>
            {DOW.map((label, idx) => {
              const active = skipDays.has(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  className={`chip ${active ? "active" : ""}`}
                  onClick={() => toggleSkipDay(idx)}
                  disabled={submitting}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Highlighted days are skipped. Default skips Sunday.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <label className="label">Platforms</label>
        {connectedPlatforms.length === 0 ? (
          <p className="small muted" style={{ marginTop: 6 }}>
            No social accounts connected{agency ? " for this client" : ""}{" "}
            yet. <Link to="/onboarding">Connect one</Link>.
          </p>
        ) : (
          <div className="chips" style={{ marginTop: 4 }}>
            {ALL_PLATFORMS.filter((pf) =>
              connectedPlatforms.includes(pf.id)
            ).map((pf) => {
              const active = platforms.includes(pf.id);
              return (
                <button
                  key={pf.id}
                  type="button"
                  className={`chip ${active ? "active" : ""}`}
                  onClick={() => togglePlatform(pf.id)}
                  disabled={submitting}
                  aria-pressed={active}
                >
                  {pf.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {willSchedule > 0 && slots.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <strong>Preview</strong>
          <p className="small muted" style={{ marginTop: 4 }}>
            Will schedule {willSchedule} post
            {willSchedule === 1 ? "" : "s"} between{" "}
            <strong>{fmtSlot(slots[0])}</strong> and{" "}
            <strong>{fmtSlot(slots[slots.length - 1])}</strong>.
          </p>
          <ul
            className="small"
            style={{
              marginTop: 6,
              paddingLeft: 16,
              listStyle: "disc",
              opacity: 0.8,
            }}
          >
            {slots.slice(0, 3).map((iso, i) => (
              <li key={i}>
                <strong>{fmtSlot(iso)}</strong> — {trim(captions[i], 60)}
              </li>
            ))}
            {slots.length > 3 && <li>… {slots.length - 3} more</li>}
          </ul>
        </div>
      )}

      {blocking && (
        <p
          className="small"
          style={{ marginTop: 12, color: "var(--bad, #b3261e)" }}
        >
          {blocking}
        </p>
      )}

      <button
        type="button"
        className="btn primary"
        onClick={() => void scheduleAll()}
        disabled={submitting || !!blocking}
        style={{ marginTop: 12, width: "100%" }}
      >
        {submitting
          ? "Scheduling…"
          : `Schedule ${willSchedule || ""} ${
              willSchedule === 1 ? "post" : "posts"
            }`.trim()}
      </button>
    </main>
  );
}

/** Split a big paste into discrete captions. Blank-line-separated wins;
 *  if the user only used single newlines we fall back to per-line.
 *  Numbered or bulleted prefixes (1., 1), -, *, •) are stripped so a
 *  pasted-from-notes list reads cleanly on /schedule. */
function parseCaptions(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parts = trimmed.split(/\n\s*\n+/);
  if (parts.length <= 1) {
    parts = trimmed.split(/\r?\n/);
  }

  return parts
    .map((p) => p.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, "").trim())
    .filter((p) => p.length > 0);
}

interface SlotPlan {
  count: number;
  startDate: string; // YYYY-MM-DD
  times: string[]; // HH:MM, will be sorted ascending
  skipDays: Set<number>; // 0=Sun..6=Sat
}

/** Generate `count` ISO timestamps starting at `startDate`, walking
 *  forward day-by-day and yielding one slot per posting time. Skips
 *  weekdays in `skipDays`. Discards any slot already in the past so
 *  Zernio doesn't 4xx on `scheduledFor` before now. */
function computeSlots(plan: SlotPlan): string[] {
  if (plan.count <= 0 || plan.times.length === 0) return [];

  const sortedTimes = [...plan.times].sort();
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plan.startDate);
  const start = startMatch
    ? new Date(
        Number(startMatch[1]),
        Number(startMatch[2]) - 1,
        Number(startMatch[3])
      )
    : new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(Math.max(start.getTime(), today.getTime()));
  cursor.setHours(0, 0, 0, 0);

  const out: string[] = [];
  for (let day = 0; day < MAX_LOOKAHEAD_DAYS && out.length < plan.count; day++) {
    const dow = cursor.getDay();
    if (!plan.skipDays.has(dow)) {
      for (const t of sortedTimes) {
        const [h, m] = t.split(":").map(Number);
        const slot = new Date(cursor);
        slot.setHours(h ?? 9, m ?? 0, 0, 0);
        if (slot.getTime() <= Date.now()) continue;
        out.push(slot.toISOString());
        if (out.length >= plan.count) break;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function todayDateKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tomorrowDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function trim(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
