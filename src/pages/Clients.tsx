import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/state";

export default function Clients() {
  const {
    user,
    clients,
    accounts,
    posts,
    addClient,
    renameClient,
    removeClient,
    selectClient,
  } = useApp();
  const nav = useNavigate();
  const [newName, setNewName] = useState("");

  if (!user) return null;

  const accountsQuota =
    user.accountsQuota === "unlimited"
      ? Infinity
      : (user.accountsQuota as number);
  const accountsUsed = accounts.length;

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    addClient(name);
    setNewName("");
  };

  return (
    <main className="page">
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 22 }}>Clients</h1>
        <span className="small muted">
          {accountsUsed} of {accountsQuota === Infinity ? "∞" : accountsQuota}{" "}
          accounts
        </span>
      </div>
      <p className="muted small">
        Keep each client's pages, queue, and analytics separate. Switch
        between them from any screen.
      </p>

      <div className="card">
        <label className="label" htmlFor="new-client">
          Add a new client
        </label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="new-client"
            className="input"
            placeholder="e.g. Cafe Java, Pearl Dental"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <button className="btn primary compact" onClick={create}>
            Add
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="card">
          <p className="small muted">
            No clients yet. Add your first one above to start organising work
            by brand.
          </p>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {clients.map((c) => {
            const cAccounts = accounts.filter((a) => a.clientId === c.id);
            const cQueued = posts.filter(
              (p) => p.clientId === c.id && p.status === "queued"
            );
            const cPending = posts.filter(
              (p) =>
                p.clientId === c.id && p.status === "pending_approval"
            );
            const cSent = posts.filter(
              (p) => p.clientId === c.id && p.status === "sent"
            );
            return (
              <div key={c.id} className="card client-card">
                <div className="row">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <span
                      className="client-swatch"
                      style={{ background: c.color }}
                      aria-hidden
                    />
                    <strong
                      style={{
                        fontSize: 16,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.name}
                    </strong>
                  </div>
                  <button
                    className="btn compact ghost"
                    onClick={() => {
                      const name = prompt("Rename client", c.name);
                      if (name) renameClient(c.id, name);
                    }}
                  >
                    Rename
                  </button>
                </div>
                <div
                  className="row"
                  style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}
                >
                  <span className="small muted">
                    {cAccounts.length} account{cAccounts.length === 1 ? "" : "s"}
                  </span>
                  <span className="small muted">· {cQueued.length} queued</span>
                  {cPending.length > 0 && (
                    <span className="pill warn" style={{ fontSize: 10 }}>
                      {cPending.length} awaiting approval
                    </span>
                  )}
                  <span className="small muted">· {cSent.length} sent</span>
                </div>
                <div
                  className="row"
                  style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}
                >
                  <button
                    className="btn compact primary"
                    onClick={() => {
                      selectClient(c.id);
                      nav("/dashboard");
                    }}
                  >
                    Open dashboard
                  </button>
                  <Link
                    to="/onboarding"
                    className="btn compact ghost"
                    onClick={() => selectClient(c.id)}
                  >
                    Connect pages
                  </Link>
                  <button
                    className="btn compact danger"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove ${c.name}? This deletes their accounts and scheduled posts.`
                        )
                      ) {
                        removeClient(c.id);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <strong>Across all clients</strong>
        <div className="small muted" style={{ marginTop: 4 }}>
          Account pool usage
        </div>
        <div className="quota-bar" style={{ marginTop: 8 }}>
          <div
            className="quota-bar-fill"
            style={{
              width:
                accountsQuota === Infinity
                  ? "100%"
                  : `${Math.min(100, (accountsUsed / Math.max(1, accountsQuota)) * 100)}%`,
            }}
          />
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          {accountsUsed} of {accountsQuota === Infinity ? "∞" : accountsQuota}{" "}
          social accounts used across {clients.length} client
          {clients.length === 1 ? "" : "s"}.
        </div>
      </div>
    </main>
  );
}
