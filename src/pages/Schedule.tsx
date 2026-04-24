import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/state";

type View = "queue" | "calendar" | "sent";

export default function Schedule() {
  const { posts, cancelPost } = useApp();
  const [view, setView] = useState<View>("queue");

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

  const cal = useMemo(() => buildCalendar(queued), [queued]);

  return (
    <main className="page">
      <div className="row">
        <h1 style={{ fontSize: 22 }}>Queue</h1>
        <Link to="/compose" className="btn compact primary">
          + New
        </Link>
      </div>

      <div className="tabs" role="tablist">
        <button
          className={`tab ${view === "queue" ? "active" : ""}`}
          onClick={() => setView("queue")}
        >
          Upcoming ({queued.length})
        </button>
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
      </div>

      {view === "queue" && (
        <div className="list">
          {queued.length === 0 && (
            <p className="muted small">Nothing in your queue yet.</p>
          )}
          {queued.map((p) => (
            <div key={p.id} className="card">
              <div className="row">
                <span className="pill">{p.kind}</span>
                <span className="small muted">
                  {new Date(p.scheduledAt).toLocaleString()}
                </span>
              </div>
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
              <div className="row" style={{ marginTop: 8 }}>
                <span className="small muted">
                  {p.platforms.join(" · ")}
                </span>
                <button
                  className="btn compact danger"
                  onClick={() => cancelPost(p.id)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "calendar" && (
        <div className="card">
          <div className="row">
            <strong>{cal.monthLabel}</strong>
            <span className="small muted">{queued.length} scheduled</span>
          </div>
          <div className="calendar" style={{ marginTop: 8 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="dow">
                {d}
              </div>
            ))}
            {cal.cells.map((c, i) => (
              <div
                key={i}
                className={`day${c.today ? " today" : ""}`}
                style={c.inMonth ? {} : { opacity: 0.35 }}
              >
                {c.dayNum}
                {c.postCount > 0 && <span className="dot" title={`${c.postCount} posts`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "sent" && (
        <div className="list">
          {sent.length === 0 && (
            <p className="muted small">No sent posts yet.</p>
          )}
          {sent.map((p) => (
            <div key={p.id} className="card">
              <div className="row">
                <span className="pill good">sent</span>
                <span className="small muted">
                  {new Date(p.scheduledAt).toLocaleDateString()}
                </span>
              </div>
              <p style={{ marginTop: 8 }}>{p.text || "(media post)"}</p>
              <div className="row">
                <span className="small muted">{p.platforms.join(" · ")}</span>
                <span className="small">
                  {p.reach ? `${p.reach.toLocaleString()} reach · ${p.clicks ?? 0} clicks` : "—"}
                </span>
              </div>
            </div>
          ))}
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
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({
      dayNum: cells.length - (startDow + daysInMonth) + 1,
      inMonth: false,
      today: false,
      postCount: 0,
    });
  }
  const monthLabel = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return { monthLabel, cells };
}
