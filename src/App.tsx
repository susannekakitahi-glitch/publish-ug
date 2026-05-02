import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Compose from "./pages/Compose";
import BulkAdd from "./pages/BulkAdd";
import Schedule from "./pages/Schedule";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import JoinOrg from "./pages/JoinOrg";
import OrgAdmin from "./pages/OrgAdmin";
import Onboarding from "./pages/Onboarding";
import Clients from "./pages/Clients";
import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";
import BrandSwitcher from "./components/BrandSwitcher";
import { useApp, isAgency } from "./lib/state";

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useApp();
  const loc = useLocation();

  const appRoutes = [
    "/compose",
    "/bulk",
    "/schedule",
    "/dashboard",
    "/settings",
    "/org",
    "/onboarding",
    "/clients",
  ];
  const inApp = user && appRoutes.some((r) => loc.pathname.startsWith(r));
  const showBrandSwitcher =
    inApp &&
    isAgency(user?.plan) &&
    [
      "/dashboard",
      "/compose",
      "/bulk",
      "/schedule",
      "/clients",
      "/onboarding",
    ].some((r) => loc.pathname.startsWith(r));

  return (
    <div className="app">
      <TopBar />
      {showBrandSwitcher && <BrandSwitcher />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<JoinOrg />} />
        <Route
          path="/onboarding"
          element={
            <Protected>
              <Onboarding />
            </Protected>
          }
        />
        <Route
          path="/compose"
          element={
            <Protected>
              <Compose />
            </Protected>
          }
        />
        <Route
          path="/bulk"
          element={
            <Protected>
              <BulkAdd />
            </Protected>
          }
        />
        <Route
          path="/schedule"
          element={
            <Protected>
              <Schedule />
            </Protected>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <Settings />
            </Protected>
          }
        />
        <Route
          path="/clients"
          element={
            <Protected>
              <Clients />
            </Protected>
          }
        />
        <Route
          path="/org"
          element={
            <Protected>
              <OrgAdmin />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {inApp ? <BottomNav /> : null}
    </div>
  );
}
