import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import type { User, AuthContextValue } from "../types";

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "cruzimex_token";
const API_BASE = import.meta.env.MODE === 'production'
  ? '/sistemabi/api'
  : 'http://localhost:8000/api';
const INACTIVITY_MS = 30 * 60 * 1000;   // 30 minutos
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // renovar token cada 15 min de actividad

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const tokenRef = useRef(token);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefresh = useRef<number>(Date.now());

  // Mantener tokenRef sincronizado
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Verificar token guardado al montar
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/auth/me/`, {
      headers: { Authorization: `Token ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { user: User }) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doExpiredLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.setItem("session_expired", "1");
    setToken(null);
    setUser(null);
    window.location.replace("/login");
  }, []);

  // Renovar token si han pasado más de REFRESH_INTERVAL_MS desde el último refresh
  const maybeRefreshToken = useCallback(() => {
    const currentToken = tokenRef.current;
    if (!currentToken) return;
    if (Date.now() - lastRefresh.current < REFRESH_INTERVAL_MS) return;
    lastRefresh.current = Date.now();
    fetch(`${API_BASE}/auth/refresh/`, {
      method: "POST",
      headers: { Authorization: `Token ${currentToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { success: boolean; token: string }) => {
        if (data.success) {
          localStorage.setItem(TOKEN_KEY, data.token);
          setToken(data.token);
        }
      })
      .catch(() => {
        // Si el refresh falla (token expirado) forzar logout
        doExpiredLogout();
      });
  }, [doExpiredLogout]);

  // Reiniciar timer de inactividad y opcionalmente renovar token
  const resetInactivityTimer = useCallback(() => {
    if (!tokenRef.current) return;
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      doExpiredLogout();
    }, INACTIVITY_MS);
    maybeRefreshToken();
  }, [doExpiredLogout, maybeRefreshToken]);

  // Registrar eventos de actividad del usuario
  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetInactivityTimer, { passive: true }));
    resetInactivityTimer(); // arrancar timer al loguear
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [user, resetInactivityTimer]);

  const login = async (username: string, password: string): Promise<User> => {
    const res = await fetch(`${API_BASE}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = (await res.json()) as { success: boolean; token: string; user: User; error?: string };
    if (!data.success) throw new Error(data.error ?? "Error al iniciar sesión");

    localStorage.setItem(TOKEN_KEY, data.token);
    lastRefresh.current = Date.now();
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async (): Promise<void> => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (token) {
      await fetch(`${API_BASE}/auth/logout/`, {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
      }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const apiFetch = async <T = unknown,>(path: string, options: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token ?? ""}`,
        ...options.headers,
      },
    });
    if (res.status === 401) {
      doExpiredLogout();
      throw new Error("Sesión expirada");
    }
    return res.json() as Promise<T>;
  };

  return <AuthContext.Provider value={{ user, token, loading, login, logout, apiFetch }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
