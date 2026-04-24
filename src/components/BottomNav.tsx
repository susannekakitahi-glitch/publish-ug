import { NavLink } from "react-router-dom";
import { isAgency, useApp } from "../lib/state";

export default function BottomNav() {
  const { user } = useApp();
  const showOrg = user?.orgId != null;
  const showClients = isAgency(user?.plan);

  const items: { to: string; label: string; ico: string; end?: boolean }[] = [
    { to: "/dashboard", label: "Home", ico: "⌂" },
    { to: "/compose", label: "Compose", ico: "+" },
    { to: "/schedule", label: "Queue", ico: "☰" },
    ...(showOrg
      ? [{ to: "/org", label: "Org", ico: "◎" }]
      : showClients
        ? [{ to: "/clients", label: "Clients", ico: "⌘" }]
        : []),
    { to: "/settings", label: "Me", ico: "·" },
  ];

  return (
    <nav className="nav" aria-label="primary">
      {items.map((it) => (
        <NavLink
          key={it.to + it.label}
          to={it.to}
          className={({ isActive }) => (isActive ? "active" : "")}
          end={it.end}
        >
          <span className="ico">{it.ico}</span>
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
