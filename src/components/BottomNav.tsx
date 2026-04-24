import { NavLink } from "react-router-dom";
import { useApp } from "../lib/state";

export default function BottomNav() {
  const { user } = useApp();
  const showOrg = user?.orgId != null;

  const items: { to: string; label: string; ico: string }[] = [
    { to: "/dashboard", label: "Home", ico: "•" },
    { to: "/compose", label: "Compose", ico: "+" },
    { to: "/schedule", label: "Queue", ico: "☰" },
    ...(showOrg
      ? [{ to: "/org", label: "Org", ico: "◎" }]
      : [{ to: "/settings", label: "Billing", ico: "$" }]),
    { to: "/settings", label: "Me", ico: "·" },
  ];

  return (
    <nav className="nav" aria-label="primary">
      {items.map((it) => (
        <NavLink
          key={it.to + it.label}
          to={it.to}
          className={({ isActive }) => (isActive ? "active" : "")}
          end={it.to === "/dashboard"}
        >
          <span className="ico">{it.ico}</span>
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
