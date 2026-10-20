import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { lazy, useEffect, useMemo, useState } from "react";

import AppUpdateBanner from "./components/AppUpdateBanner.jsx";
import AsyncContent from "./components/AsyncContent.jsx";
import LoginPage from "./pages/login/LoginPage.jsx";
import { clearStoredSession, getStoredApiBase, getStoredToken, getStoredUser, persistSession } from "./lib/auth.js";
import { requestJson } from "./lib/http.js";
import { useLanguage } from "./lib/i18n.jsx";

const ProfileSettingsPage = lazy(() => import("./pages/profile-settings/ProfileSettingsPage.jsx"));
const MonitorPage = lazy(() => import("./pages/monitor/MonitorPage.jsx"));
const RegisterPage = lazy(() => import("./pages/register/RegisterPage.jsx"));

function RouteGuard({ isAuthenticated, isRestoring, user, allowedRoles, children }) {
  const location = useLocation();
  const { t } = useLanguage();

  if (isRestoring) {
    return <div className="page-status">{t("restoringSession")}</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/monitor" replace />;
  }

  return children;
}

export default function App() {
  const navigate = useNavigate();
  const [apiBase, setApiBase] = useState(getStoredApiBase());
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState(getStoredUser());
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function restore() {
      const storedToken = getStoredToken();
      const storedApiBase = getStoredApiBase();

      if (!storedToken) {
        setIsRestoring(false);
        return;
      }

      try {
        const restoredUser = await requestJson(`${storedApiBase}/auth/me`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });
        if (controller.signal.aborted) return;
        setApiBase(storedApiBase);
        setToken(storedToken);
        setUser(restoredUser);
      } catch {
        if (controller.signal.aborted) return;
        clearStoredSession();
        setToken("");
        setUser(null);
      } finally {
        if (!controller.signal.aborted) setIsRestoring(false);
      }
    }

    restore();
    return () => controller.abort();
  }, []);

  const auth = useMemo(
    () => ({
      apiBase,
      token,
      user,
      isAuthenticated: Boolean(token && user),
      async login(nextApiBase, credentials) {
        const data = await requestJson(`${nextApiBase}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
        });

        persistSession(nextApiBase, data.access_token, data.user);
        setApiBase(nextApiBase);
        setToken(data.access_token);
        setUser(data.user);
        navigate("/monitor", { replace: true });
        return data;
      },
      logout() {
        clearStoredSession();
        setApiBase(getStoredApiBase());
        setToken("");
        setUser(null);
        navigate("/login", { replace: true });
      },
      updateUser(nextUser) {
        persistSession(apiBase, token, nextUser);
        setUser(nextUser);
      },
    }),
    [apiBase, navigate, token, user],
  );

  return (
    <>
      <AppUpdateBanner />
      <AsyncContent>
      <Routes>
        <Route
          path="/login"
          element={
            auth.isAuthenticated ? <Navigate to="/monitor" replace /> : <LoginPage auth={auth} />
          }
        />
        <Route
          path="/profile-settings"
          element={
            <RouteGuard isAuthenticated={auth.isAuthenticated} isRestoring={isRestoring}>
              <ProfileSettingsPage auth={auth} />
            </RouteGuard>
          }
        />
        <Route
          path="/monitor"
          element={
            <RouteGuard isAuthenticated={auth.isAuthenticated} isRestoring={isRestoring}>
              <MonitorPage auth={auth} />
            </RouteGuard>
          }
        />
        <Route
          path="/register"
          element={
            <RouteGuard
              isAuthenticated={auth.isAuthenticated}
              isRestoring={isRestoring}
              user={auth.user}
              allowedRoles={["developer", "manager"]}
            >
              <RegisterPage auth={auth} />
            </RouteGuard>
          }
        />
        <Route path="*" element={<Navigate to={auth.isAuthenticated ? "/monitor" : "/login"} replace />} />
      </Routes>
      </AsyncContent>
    </>
  );
}
