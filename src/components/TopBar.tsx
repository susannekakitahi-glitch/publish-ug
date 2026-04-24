import { Link, useLocation } from "react-router-dom";
import { useApp } from "../lib/state";

export default function TopBar() {
  const { user } = useApp();
  const loc = useLocation();
  const appPaths = ["/compose", "/schedule", "/dashboard", "/settings", "/org", "/onboarding"];
  const inApp = appPaths.some((p) => loc.pathname.startsWith(p));

  return (
    <header className="topbar">
      <Link to={user && inApp ? "/dashboard" : "/"} className="logo">
        Posta<span className="dot">.</span>
      </Link>
      {inApp ? (
        <span className="brandline">
          {user?.plan === "org" ? "Org member" : user?.plan.toUpperCase()}
        </span>
      ) : (
        <nav style={{ display: "flex", gap: 14, fontSize: 13 }}>
          <Link to="/pricing">Pricing</Link>
          <Link to="/login" className="pill">
            Log in
          </Link>
        </nav>
      )}
    </header>
  );
}
