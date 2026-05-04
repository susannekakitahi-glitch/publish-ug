import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { isAgency, scopePosts, useApp, type ScheduledPost } from "../lib/state";
import { zernioEnabled } from "../lib/zernio";

type View = "queue" | "calendar" | "sent" | "pending" | "failed";

interface EditDraft {
  postId: string;
  text: string;
  /** datetime-local value (no Z suffix). Minute precision. */
  when: string;
  /** What the datetime-local input read at open time (matching the
   *  precision of `when`). If `when` still equals this on save, we
   *  treat the time as unchanged — a naive comparison against the
   *  post's scheduledAt would round-trip through minute precision and
   *  always look changed (shifting upstream by up to ~59 seconds). */
  originalWhen: string;
}

/** Local date key (YYYY-MM-DD) for indexing posts by calendar day. The
 *  user's local timezone (via Date getters) — not UTC — so a post at
 *  23:30 local doesn't bleed into the next calendar day on the grid. */
function dayKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function Schedule() {
  const {
    posts: allPosts,
    cancelPost,
    editPost,
    approvePost,
    pushPostToZernio,
    syncPostStatuses,
    user,
    currentClientId,
    clients,
  } = useApp();
  const [view, setView] = useState<View>("queue");
  const agency = isAgency(user?.plan);
  // Whether the user is on Real OAuth (vs Mock). Only relevant for the
  // "Push to Zernio" affordance below — we hide it in Mock mode where
  // there's no upstream to push to. Read on render rather than via
  // state so a mode flip on /onboarding takes effect after one tab
  // switch (cheap; no listener needed).
  const realOAuth =
    zernioEnabled() &&
    typeof window !== "undefined" &&
    localStorage.getItem("posta-ug:oauth-mode") === "real";
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [distributeOpen, setDistributeOpen] = useState(false);
  /** datetime-local-style HH:MM bounds for the distribute modal. */
  const [distributeStart, setDistributeStart] = useState("09:00");
  const [distributeEnd, setDistributeEnd] = useState("18:00");
  const [distributeBusy, setDistributeBusy] = useState(false);
  const [distributeError, setDistributeError] = useState<string | null>(null);
  /** id of the post currently being dragged, so DragOverlay can render
   *  its preview without pulling it out of the list. */
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  /** Transient dayKey under the pointer during drag, used to highlight
   *  the drop target. Cleared on drop/cancel. */
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // Pointer on desktop uses a small activation distance so single-tap
  // buttons inside post cards (Edit / Cancel) still fire reliably.
  // Touch on mobile uses a 200ms press-and-hold so a normal scroll
  // flick doesn't trigger a drag. Both sensor types are always
  // registered; dnd-kit picks the right one per device.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  function openEdit(p: ScheduledPost) {
    setEditError(null);
    const initialWhen = toLocalDatetimeInput(p.scheduledAt);
    setEditing({
      postId: p.id,
      text: p.text,
      when: initialWhen,
      originalWhen: initialWhen,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setEditBusy(true);
    setEditError(null);

    // Only forward a scheduledAt patch if the user actually edited the
    // datetime input — otherwise the datetime-local round-trip drops
    // seconds and we'd shift the post by up to ~59s upstream every save.
    let scheduledAt: string | undefined;
    if (editing.when !== editing.originalWhen) {
      const parsed = new Date(editing.when);
      if (Number.isNaN(parsed.getTime())) {
        setEditBusy(false);
        setEditError("Please enter a valid date and time.");
        return;
      }
      scheduledAt = parsed.toISOString();
    }

    const result = await editPost(editing.postId, {
      text: editing.text,
      scheduledAt,
    });
    setEditBusy(false);
    if (result === "ok" || result === "ok_local_only") {
      setEditing(null);
      return;
    }
    if (result === "too_late") {
      setEditError(
        "Zernio already published this post — too late to edit. Refreshing the queue."
      );
      void syncPostStatuses();
      return;
    }
    setEditError("Couldn't reach Zernio. Try again in a moment.");
  }

  // Reconcile local post state with Zernio on mount + when the user flips
  // between tabs. Cheap in mock mode (zernioEnabled() short-circuits) and
  // a single round-trip per Zernio-linked post in Real OAuth mode.
  useEffect(() => {
    void syncPostStatuses();
    // syncPostStatuses is memoized on posts/accounts; we intentionally only
    // run when the user navigates here or flips tabs, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const posts = useMemo(
    () => scopePosts(allPosts, user?.plan, currentClientId),
    [allPosts, user?.plan, currentClientId]
  );

  const queued = useMemo(
    () =>
      posts
        .filter((p) => p.status === "queued")
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [posts]
  );
  const sent = useMemo(
    () =>
      posts
        .filter((p) => p.status === "sent")
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    [posts]
  );
  const pending = useMemo(
    () =>
      posts
        .filter((p) => p.status === "pending_approval")
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [posts]
  );
  const failed = useMemo(
    () =>
      posts
        .filter((p) => p.status === "failed")
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    [posts]
  );

  const cal = useMemo(() => buildCalendar(queued), [queued]);

  const postsOnSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return queued
      .filter((p) => dayKey(new Date(p.scheduledAt)) === selectedDay)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [queued, selectedDay]);

  function openDistribute() {
    if (postsOnSelectedDay.length < 2) return;
    setDistributeError(null);
    setDistributeOpen(true);
  }

  /** Spread the day's posts evenly between [startTime, endTime] on the
   *  selected day. Two posts get start + end; three get start + midpoint
   *  + end; etc. Forwards each new time through editPost so Zernio's
   *  upstream queue is updated in lock-step with local state. */
  async function applyDistribute() {
    if (!selectedDay) return;
    const dayPosts = postsOnSelectedDay;
    if (dayPosts.length < 2) return;

    const [startH, startM] = distributeStart.split(":").map((n) => parseInt(n, 10));
    const [endH, endM] = distributeEnd.split(":").map((n) => parseInt(n, 10));
    if (
      Number.isNaN(startH) ||
      Number.isNaN(startM) ||
      Number.isNaN(endH) ||
      Number.isNaN(endM)
    ) {
      setDistributeError("Please pick a valid start and end time.");
      return;
    }
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) {
      setDistributeError("End time must be after start time.");
      return;
    }

    const [yy, mm, dd] = selectedDay.split("-").map((n) => parseInt(n, 10));
    setDistributeBusy(true);
    setDistributeError(null);

    const stepMinutes =
      dayPosts.length === 1
        ? 0
        : (endMinutes - startMinutes) / (dayPosts.length - 1);
    let firstError: string | null = null;
    for (let i = 0; i < dayPosts.length; i++) {
      const totalMinutes = Math.round(startMinutes + stepMinutes * i);
      const slot = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
      slot.setMinutes(totalMinutes);
      const result = await editPost(dayPosts[i].id, {
        scheduledAt: slot.toISOString(),
      });
      if (result === "error" || result === "too_late") {
        if (!firstError) {
          firstError =
            result === "too_late"
              ? "One of these posts already published. Refreshed the queue."
              : "Couldn't reach Zernio for one of the posts. Try again.";
        }
        if (result === "too_late") void syncPostStatuses();
      }
    }

    setDistributeBusy(false);
    if (firstError) {
      setDistributeError(firstError);
      return;
    }
    setDistributeOpen(false);
  }

  const clientOf = (cid?: string) => clients.find((c) => c.id === cid);

  function onDragStart(e: DragStartEvent) {
    const raw = String(e.active.id);
    if (raw.startsWith("post-")) {
      setDraggingPostId(raw.slice("post-".length));
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    setDraggingPostId(null);
    setDragOverDay(null);
    const activeId = String(e.active.id);
    if (!activeId.startsWith("post-")) return;
    const postId = activeId.slice("post-".length);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || !overId.startsWith("day-")) return;
    const targetDay = overId.slice("day-".length);

    const post = queued.find((p) => p.id === postId);
    if (!post) return;
    const src = new Date(post.scheduledAt);
    if (dayKey(src) === targetDay) return; // dropped on same day → no-op

    const [yy, mm, dd] = targetDay.split("-").map((n) => parseInt(n, 10));
    if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return;
    // Preserve the original hour/minute/second so "9am every Friday"
    // stays a 9am post after drag-to-reschedule.
    const next = new Date(yy, mm - 1, dd, src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds());

    if (next.getTime() <= Date.now()) {
      const ok = confirm(
        "That day is in the past — the post can't be published. Move anyway?"
      );
      if (!ok) return;
    }

    const result = await editPost(postId, { scheduledAt: next.toISOString() });
    if (result === "too_late") {
      alert("Zernio already published this post. Queue refreshed.");
      void syncPostStatuses();
      return;
    }
    if (result === "error") {
      alert("Couldn't reach Zernio to reschedule. Try again in a moment.");
      return;
    }
    // Follow the post so the user sees where it landed.
    setSelectedDay(targetDay);
  }

  return (
    <main className="page">
      <div className="row">
        <h1 style={{ fontSize: 22 }}>Queue</h1>
        <div style={{ display: "flex", gap: 6 }}>
          <Link to="/bulk" className="btn compact">
            Bulk add
          </Link>
          <Link to="/compose" className="btn compact primary">
            + New
          </Link>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          className={`tab ${view === "queue" ? "active" : ""}`}
          onClick={() => setView("queue")}
        >
          Upcoming ({queued.length})
        </button>
        {agency && (
          <button
            className={`tab ${view === "pending" ? "active" : ""}`}
            onClick={() => setView("pending")}
          >
            Pending ({pending.length})
          </button>
        )}
        <button
          className={`tab ${view === "calendar" ? "active" : ""}`}
          onClick={() => setView("calendar")}
        >
          Calendar
        </button>
        <button
          className={`tab ${view === "sent" ? "active" : ""}`}
          onClick={() => setView("sent")}
        >
          Sent ({sent.length})
        </button>
        {failed.length > 0 && (
          <button
            className={`tab ${view === "failed" ? "active" : ""}`}
            onClick={() => setView("failed")}
          >
            Failed ({failed.length})
          </button>
        )}
      </div>

      {view === "queue" && (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragOver={(e) => {
            const overId = e.over ? String(e.over.id) : null;
            setDragOverDay(
              overId && overId.startsWith("day-")
                ? overId.slice("day-".length)
                : null
            );
          }}
          onDragCancel={() => {
            setDraggingPostId(null);
            setDragOverDay(null);
          }}
          onDragEnd={onDragEnd}
        >
          {queued.length > 0 && (
            <div className="card">
              <div className="row">
                <strong>{cal.monthLabel}</strong>
                <span className="small muted">
                  {draggingPostId
                    ? "Drop on a day to reschedule"
                    : "Drag any post onto a day to reschedule"}
                </span>
              </div>
              <div className="calendar" style={{ marginTop: 8 }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div key={i} className="dow">
                    {d}
                  </div>
                ))}
                {cal.cells.map((c, i) => (
                  <CalendarDayCell
                    key={i}
                    cell={c}
                    isSelected={false}
                    isDragTarget={!!draggingPostId && dragOverDay === c.key}
                    onSelect={() => {
                      setView("calendar");
                      setSelectedDay(c.key);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        <div className="list">
          {queued.length === 0 && (
            <p className="muted small">Nothing in your queue yet.</p>
          )}
          {queued.map((p) => {
            const c = clientOf(p.clientId);
            return (
              <DraggableUpcomingCard
                key={p.id}
                postId={p.id}
                isDragging={draggingPostId === p.id}
              >
                <div className="row">
                  <span className="pill">{p.kind}</span>
                  <span className="small muted">
                    {new Date(p.scheduledAt).toLocaleString()}
                  </span>
                </div>
                {c && (
                  <div
                    className="row"
                    style={{ marginTop: 6, gap: 6, justifyContent: "flex-start" }}
                  >
                    <span
                      className="client-swatch small-swatch"
                      style={{ background: c.color }}
                    />
                    <span className="small muted">{c.name}</span>
                  </div>
                )}
                {p.media && p.media.length > 0 && (
                  <div className="media-strip" style={{ marginTop: 8 }}>
                    {p.media.slice(0, 4).map((m, i) => (
                      <div key={i} className="media-strip-tile">
                        {m.dataUrl ? <img src={m.dataUrl} alt={m.name} /> : null}
                        {m.kind === "video" && (
                          <span className="media-strip-badge">▶</span>
                        )}
                      </div>
                    ))}
                    {p.media.length > 4 && (
                      <div className="media-strip-tile media-strip-more">
                        +{p.media.length - 4}
                      </div>
                    )}
                  </div>
                )}
                <p style={{ marginTop: 8 }}>{p.text || "(media post)"}</p>
                {p.failureReason && (
                  <p
                    className="small"
                    style={{ marginTop: 4, color: "var(--warn, #b38500)" }}
                  >
                    ⚠ {p.failureReason}
                  </p>
                )}
                {p.zernioPostId && (
                  <p className="small muted" style={{ marginTop: 4 }}>
                    Pushed to Zernio · id {p.zernioPostId.slice(0, 8)}…
                  </p>
                )}
                {!p.zernioPostId && realOAuth && (
                  <p className="small" style={{ marginTop: 4, color: "var(--warn, #b38500)" }}>
                    Not pushed to Zernio yet — won't publish upstream until you tap Push.
                  </p>
                )}
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="small muted">{p.platforms.join(" · ")}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!p.zernioPostId && realOAuth && (
                      <button
                        className="btn compact primary"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => pushPostToZernio(p.id)}
                      >
                        Push to Zernio
                      </button>
                    )}
                    <button
                      className="btn compact"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => openEdit(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn compact danger"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        if (
                          confirm(
                            "Cancel this post? It will be removed from your queue and Zernio's queue."
                          )
                        ) {
                          void cancelPost(p.id);
                        }
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </DraggableUpcomingCard>
            );
          })}
        </div>
          <DragOverlay dropAnimation={null}>
            {draggingPostId
              ? (() => {
                  const p = queued.find((x) => x.id === draggingPostId);
                  if (!p) return null;
                  return (
                    <div
                      className="card"
                      style={{
                        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                        opacity: 0.95,
                        cursor: "grabbing",
                      }}
                    >
                      <div className="row">
                        <span className="pill">{p.kind}</span>
                        <span className="small muted">
                          {new Date(p.scheduledAt).toLocaleString()}
                        </span>
                      </div>
                      <p style={{ marginTop: 8 }}>
                        {p.text || "(media post)"}
                      </p>
                    </div>
                  );
                })()
              : null}
          </DragOverlay>
        </DndContext>
      )}

      {view === "failed" && (
        <div className="list">
          {failed.length === 0 && (
            <p className="muted small">No failed posts.</p>
          )}
          {failed.map((p) => {
            const c = clientOf(p.clientId);
            return (
              <div key={p.id} className="card">
                <div className="row">
                  <span className="pill" style={{ background: "var(--bad, #b3261e)", color: "white" }}>
                    failed
                  </span>
                  <span className="small muted">
                    {new Date(p.scheduledAt).toLocaleString()}
                  </span>
                </div>
                {c && (
                  <div
                    className="row"
                    style={{ marginTop: 6, gap: 6, justifyContent: "flex-start" }}
                  >
                    <span
                      className="client-swatch small-swatch"
                      style={{ background: c.color }}
                    />
                    <span className="small muted">{c.name}</span>
                  </div>
                )}
                <p style={{ marginTop: 8 }}>{p.text || "(media post)"}</p>
                {p.failureReason && (
                  <p className="small" style={{ marginTop: 4, color: "var(--bad)" }}>
                    {p.failureReason}
                  </p>
                )}
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="small muted">{p.platforms.join(" · ")}</span>
                  <button
                    className="btn compact danger"
                    onClick={() => void cancelPost(p.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "pending" && agency && (
        <div className="list">
          {pending.length === 0 && (
            <p className="muted small">
              Nothing waiting for approval. Posts you create are held here
              until the client signs off.
            </p>
          )}
          {pending.map((p) => {
            const c = clientOf(p.clientId);
            return (
              <div key={p.id} className="card">
                <div className="row">
                  <span className="pill warn">pending approval</span>
                  <span className="small muted">
                    {new Date(p.scheduledAt).toLocaleString()}
                  </span>
                </div>
                {c && (
                  <div
                    className="row"
                    style={{ marginTop: 6, gap: 6, justifyContent: "flex-start" }}
                  >
                    <span
                      className="client-swatch small-swatch"
                      style={{ background: c.color }}
                    />
                    <span className="small muted">{c.name}</span>
                  </div>
                )}
                <p style={{ marginTop: 8 }}>{p.text || "(media post)"}</p>
                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  <span className="small muted">{p.platforms.join(" · ")}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn compact danger"
                      onClick={() => void cancelPost(p.id)}
                    >
                      Reject
                    </button>
                    <button
                      className="btn compact primary"
                      onClick={() => approvePost(p.id)}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "calendar" && (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragOver={(e) => {
            const overId = e.over ? String(e.over.id) : null;
            setDragOverDay(
              overId && overId.startsWith("day-")
                ? overId.slice("day-".length)
                : null
            );
          }}
          onDragCancel={() => {
            setDraggingPostId(null);
            setDragOverDay(null);
          }}
          onDragEnd={onDragEnd}
        >
          <div className="card">
            <div className="row">
              <strong>{cal.monthLabel}</strong>
              <span className="small muted">{queued.length} scheduled</span>
            </div>
            {draggingPostId && (
              <p className="small muted" style={{ marginTop: 6 }}>
                Drop on a day to reschedule.
              </p>
            )}
            <div className="calendar" style={{ marginTop: 8 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="dow">
                  {d}
                </div>
              ))}
              {cal.cells.map((c, i) => (
                <CalendarDayCell
                  key={i}
                  cell={c}
                  isSelected={c.key !== "" && selectedDay === c.key}
                  isDragTarget={!!draggingPostId && dragOverDay === c.key}
                  onSelect={() =>
                    setSelectedDay((prev) => (prev === c.key ? null : c.key))
                  }
                />
              ))}
            </div>
          </div>

          {selectedDay && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row">
                <strong>
                  {new Date(selectedDay + "T00:00:00").toLocaleDateString(
                    undefined,
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    }
                  )}
                </strong>
                <span className="small muted">
                  {postsOnSelectedDay.length}{" "}
                  {postsOnSelectedDay.length === 1 ? "post" : "posts"}
                </span>
              </div>
              <div
                className="row"
                style={{ marginTop: 8, justifyContent: "flex-end", gap: 6 }}
              >
                {postsOnSelectedDay.length >= 2 && (
                  <button className="btn compact" onClick={openDistribute}>
                    Distribute times
                  </button>
                )}
                <Link
                  to={`/compose?date=${encodeURIComponent(selectedDay)}`}
                  className="btn compact primary"
                >
                  + Add post
                </Link>
              </div>
              {postsOnSelectedDay.length === 0 && (
                <p className="muted small" style={{ marginTop: 8 }}>
                  No posts scheduled for this day yet — tap{" "}
                  <strong>+ Add post</strong> to schedule one.
                </p>
              )}
              <div className="list" style={{ marginTop: 8 }}>
                {postsOnSelectedDay.map((p) => (
                  <DraggablePostCard
                    key={p.id}
                    post={p}
                    client={clientOf(p.clientId)}
                    isDragging={draggingPostId === p.id}
                    onEdit={() => openEdit(p)}
                    onCancel={() => {
                      if (
                        confirm(
                          "Cancel this post? It will be removed from your queue and Zernio's queue."
                        )
                      ) {
                        void cancelPost(p.id);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <DragOverlay dropAnimation={null}>
            {draggingPostId
              ? (() => {
                  const p = queued.find((x) => x.id === draggingPostId);
                  if (!p) return null;
                  return (
                    <div
                      className="card"
                      style={{
                        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                        opacity: 0.95,
                        cursor: "grabbing",
                      }}
                    >
                      <div className="row">
                        <span className="pill">
                          {new Date(p.scheduledAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p style={{ marginTop: 8 }}>
                        {p.text || "(media post)"}
                      </p>
                    </div>
                  );
                })()
              : null}
          </DragOverlay>
        </DndContext>
      )}

      {view === "sent" && (
        <div className="list">
          {sent.length === 0 && (
            <p className="muted small">No sent posts yet.</p>
          )}
          {sent.map((p) => {
            const c = clientOf(p.clientId);
            return (
              <div key={p.id} className="card">
                <div className="row">
                  <span className="pill good">sent</span>
                  <span className="small muted">
                    {new Date(p.scheduledAt).toLocaleDateString()}
                  </span>
                </div>
                {c && (
                  <div
                    className="row"
                    style={{ marginTop: 6, gap: 6, justifyContent: "flex-start" }}
                  >
                    <span
                      className="client-swatch small-swatch"
                      style={{ background: c.color }}
                    />
                    <span className="small muted">{c.name}</span>
                  </div>
                )}
                <p style={{ marginTop: 8 }}>{p.text || "(media post)"}</p>
                {p.failureReason && (
                  <p
                    className="small"
                    style={{ marginTop: 4, color: "var(--warn, #b38500)" }}
                  >
                    ⚠ {p.failureReason}
                  </p>
                )}
                {p.zernioPostId && (
                  <p className="small muted" style={{ marginTop: 4 }}>
                    Sent via Zernio · id {p.zernioPostId.slice(0, 8)}…
                  </p>
                )}
                <div className="row">
                  <span className="small muted">{p.platforms.join(" · ")}</span>
                  <span className="small">
                    {p.reach
                      ? `${p.reach.toLocaleString()} reach · ${p.clicks ?? 0} clicks`
                      : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !editBusy && setEditing(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 16,
              background: "var(--bg, #0c1410)",
              padding: 16,
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Edit post</h2>
            <label className="label" htmlFor="edit-text">
              Text
            </label>
            <textarea
              id="edit-text"
              className="input"
              rows={4}
              value={editing.text}
              onChange={(e) =>
                setEditing({ ...editing, text: e.target.value })
              }
              style={{ marginTop: 4, marginBottom: 12, width: "100%" }}
              disabled={editBusy}
            />
            <label className="label" htmlFor="edit-when">
              Scheduled for
            </label>
            <input
              id="edit-when"
              type="datetime-local"
              className="input"
              value={editing.when}
              onChange={(e) =>
                setEditing({ ...editing, when: e.target.value })
              }
              style={{ marginTop: 4, width: "100%" }}
              disabled={editBusy}
            />
            {editError && (
              <p
                className="small"
                style={{ marginTop: 8, color: "var(--bad, #b3261e)" }}
              >
                {editError}
              </p>
            )}
            <div
              className="row"
              style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}
            >
              <button
                className="btn compact"
                onClick={() => setEditing(null)}
                disabled={editBusy}
              >
                Cancel
              </button>
              <button
                className="btn compact primary"
                onClick={() => void saveEdit()}
                disabled={editBusy}
              >
                {editBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {distributeOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !distributeBusy && setDistributeOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 16,
              background: "var(--bg, #0c1410)",
              padding: 16,
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>
              Distribute {postsOnSelectedDay.length} posts
            </h2>
            <p className="small muted" style={{ marginBottom: 12 }}>
              Spread evenly between these times. Posts keep their order;
              the earliest scheduled goes first.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="label" htmlFor="dist-start">
                  Start
                </label>
                <input
                  id="dist-start"
                  type="time"
                  className="input"
                  value={distributeStart}
                  onChange={(e) => setDistributeStart(e.target.value)}
                  style={{ marginTop: 4, width: "100%" }}
                  disabled={distributeBusy}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label" htmlFor="dist-end">
                  End
                </label>
                <input
                  id="dist-end"
                  type="time"
                  className="input"
                  value={distributeEnd}
                  onChange={(e) => setDistributeEnd(e.target.value)}
                  style={{ marginTop: 4, width: "100%" }}
                  disabled={distributeBusy}
                />
              </div>
            </div>
            {distributeError && (
              <p
                className="small"
                style={{ marginTop: 8, color: "var(--bad, #b3261e)" }}
              >
                {distributeError}
              </p>
            )}
            <div
              className="row"
              style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}
            >
              <button
                className="btn compact"
                onClick={() => setDistributeOpen(false)}
                disabled={distributeBusy}
              >
                Cancel
              </button>
              <button
                className="btn compact primary"
                onClick={() => void applyDistribute()}
                disabled={distributeBusy}
              >
                {distributeBusy ? "Updating…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

interface Cell {
  dayNum: number;
  inMonth: boolean;
  today: boolean;
  postCount: number;
  /** YYYY-MM-DD key matching dayKey(). Empty string for out-of-month
   *  filler cells so the click handler can no-op cleanly. */
  key: string;
}

function CalendarDayCell({
  cell,
  isSelected,
  isDragTarget,
  onSelect,
}: {
  cell: Cell;
  isSelected: boolean;
  isDragTarget: boolean;
  onSelect: () => void;
}) {
  // Out-of-month filler cells stay inert — not droppable, not clickable —
  // so a stray drop on a filler cell can't reschedule to a weird date.
  const enabled = cell.inMonth;
  const { setNodeRef, isOver } = useDroppable({
    id: enabled ? `day-${cell.key}` : `day-disabled-${cell.dayNum}`,
    disabled: !enabled,
  });
  const targeted = enabled && (isDragTarget || isOver);
  return (
    <div
      ref={setNodeRef}
      role={enabled ? "button" : undefined}
      tabIndex={enabled ? 0 : -1}
      aria-pressed={isSelected || undefined}
      onClick={() => enabled && onSelect()}
      onKeyDown={(e) => {
        if (!enabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`day${cell.today ? " today" : ""}`}
      style={{
        ...(cell.inMonth ? {} : { opacity: 0.35 }),
        ...(enabled ? { cursor: "pointer" } : {}),
        ...(isSelected
          ? {
              outline: "2px solid var(--accent, #f5d423)",
              outlineOffset: -2,
            }
          : {}),
        ...(targeted
          ? {
              background: "var(--accent, #f5d423)",
              color: "#000",
            }
          : {}),
      }}
    >
      {cell.dayNum}
      {cell.postCount > 0 && (
        <span className="dot" title={`${cell.postCount} posts`} />
      )}
    </div>
  );
}

function DraggableUpcomingCard({
  postId,
  isDragging,
  children,
}: {
  postId: string;
  isDragging: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `post-${postId}`,
  });
  return (
    <div
      ref={setNodeRef}
      className="card"
      {...attributes}
      {...listeners}
      style={{
        // Hide source while DragOverlay renders the preview so the
        // list layout stays stable during a drag (same pattern as the
        // Calendar tab).
        opacity: isDragging ? 0 : 1,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      {children}
    </div>
  );
}

function DraggablePostCard({
  post,
  client,
  isDragging,
  onEdit,
  onCancel,
}: {
  post: ScheduledPost;
  client: { color: string; name: string } | undefined;
  isDragging: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `post-${post.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      className="card"
      {...attributes}
      {...listeners}
      style={{
        // Hide the source card while the DragOverlay shows the preview
        // — keeps the layout stable and avoids the "ghost" being
        // visually duplicated.
        opacity: isDragging ? 0 : 1,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      <div className="row">
        <span className="pill">
          {new Date(post.scheduledAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="small muted">{post.platforms.join(" · ")}</span>
      </div>
      {client && (
        <div
          className="row"
          style={{
            marginTop: 6,
            gap: 6,
            justifyContent: "flex-start",
          }}
        >
          <span
            className="client-swatch small-swatch"
            style={{ background: client.color }}
          />
          <span className="small muted">{client.name}</span>
        </div>
      )}
      <p style={{ marginTop: 8 }}>{post.text || "(media post)"}</p>
      <div
        className="row"
        style={{ marginTop: 8, justifyContent: "flex-end", gap: 6 }}
      >
        <button
          className="btn compact"
          onClick={onEdit}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Edit
        </button>
        <button
          className="btn compact danger"
          onClick={onCancel}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function buildCalendar(queued: { scheduledAt: string }[]): {
  monthLabel: string;
  cells: Cell[];
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();

  const byDay = new Map<string, number>();
  for (const p of queued) {
    const d = new Date(p.scheduledAt);
    if (d.getFullYear() === y && d.getMonth() === m) {
      const key = String(d.getDate());
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
  }

  const cells: Cell[] = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({
      dayNum: daysInPrev - startDow + 1 + i,
      inMonth: false,
      today: false,
      postCount: 0,
      key: "",
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      dayNum: d,
      inMonth: true,
      today:
        d === now.getDate() &&
        m === now.getMonth() &&
        y === now.getFullYear(),
      postCount: byDay.get(String(d)) ?? 0,
      key: dayKey(new Date(y, m, d)),
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({
      dayNum: cells.length - (startDow + daysInMonth) + 1,
      inMonth: false,
      today: false,
      postCount: 0,
      key: "",
    });
  }
  const monthLabel = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return { monthLabel, cells };
}
