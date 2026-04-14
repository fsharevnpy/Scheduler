import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import LoginPage from "./pages/LoginPage.jsx";
import ChangePasswordPage from "./pages/ChangePasswordPage.jsx";
import MonitorPage from "./pages/MonitorPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import { clearStoredSession, getStoredApiBase, getStoredToken, getStoredUser, persistSession } from "./lib/auth.js";
import { requestJson } from "./lib/http.js";

function ProtectedRoute({ isAuthenticated, isRestoring, children }) {
  const location = useLocation();

  if (isRestoring) {
    return <div className="page-status">Restoring session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function RoleRoute({ isAuthenticated, isRestoring, user, allowedRoles, children }) {
  if (isRestoring) {
    return <div className="page-status">Restoring session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user?.role)) {
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
    async function restore() {
      const storedToken = getStoredToken();
      const storedApiBase = getStoredApiBase();

      if (!storedToken) {
        setIsRestoring(false);
        return;
      }

      try {
        const restoredUser = await requestJson(`${storedApiBase}/auth/me`, {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });
        setApiBase(storedApiBase);
        setToken(storedToken);
        setUser(restoredUser);
      } catch {
        clearStoredSession();
        setToken("");
        setUser(null);
      } finally {
        setIsRestoring(false);
      }
    }

    restore();
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
    <Routes>
      <Route
        path="/login"
        element={
          auth.isAuthenticated ? <Navigate to="/monitor" replace /> : <LoginPage auth={auth} />
        }
      />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute isAuthenticated={auth.isAuthenticated} isRestoring={isRestoring}>
            <ChangePasswordPage auth={auth} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitor"
        element={
          <ProtectedRoute isAuthenticated={auth.isAuthenticated} isRestoring={isRestoring}>
            <MonitorPage auth={auth} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/register"
        element={
          <RoleRoute
            isAuthenticated={auth.isAuthenticated}
            isRestoring={isRestoring}
            user={auth.user}
            allowedRoles={["developer", "manager"]}
          >
            <RegisterPage auth={auth} />
          </RoleRoute>
        }
      />
      <Route path="*" element={<Navigate to={auth.isAuthenticated ? "/monitor" : "/login"} replace />} />
    </Routes>
  );
}
