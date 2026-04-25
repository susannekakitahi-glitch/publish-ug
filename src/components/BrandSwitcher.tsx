import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isAgency, useApp } from "../lib/state";

export default function BrandSwitcher() {
  const { user, clients, currentClientId, selectClient } = useApp();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!isAgency(user?.plan)) return null;

  const current = clients.find((c) => c.id === currentClientId);
  const label = current ? current.name : "All clients";
  const color = current ? current.color : "#9ab0a6";

  return (
    <div className="brand-switcher" ref={boxRef}>
      <button
        type="button"
        className="brand-pill"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="brand-dot" style={{ background: color }} />
        <span className="brand-label">Viewing: {label}</span>
        <span className="brand-caret">▾</span>
      </button>
      {open && (
        <div className="brand-menu" role="menu">
          <button
            type="button"
            className={`brand-menu-item ${currentClientId === null ? "active" : ""}`}
            onClick={() => {
              selectClient(null);
              setOpen(false);
            }}
          >
            <span className="brand-dot" style={{ background: "#9ab0a6" }} />
            All clients
            <span className="small muted" style={{ marginLeft: "auto" }}>
              aggregate
            </span>
          </button>
          {clients.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`brand-menu-item ${c.id === currentClientId ? "active" : ""}`}
              onClick={() => {
                selectClient(c.id);
                setOpen(false);
              }}
            >
              <span className="brand-dot" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
          <Link
            to="/clients"
            className="brand-menu-item"
            onClick={() => setOpen(false)}
          >
            <span className="brand-dot" style={{ background: "transparent", border: "1px dashed var(--muted)" }} />
            Manage clients →
          </Link>
        </div>
      )}
    </div>
  );
}
