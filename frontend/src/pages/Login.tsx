import { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, AlertCircle, Clock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import logoLogin from "../assets/CRUIZMEX_LOGO_LOGIN.png";

interface FormState {
  username: string;
  password: string;
}

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({ username: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sessionExpired = sessionStorage.getItem("session_expired") === "1";

  if (!loading && user) return <Navigate to="/dashboard/ventas" replace />;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("Completa usuario y contraseña");
      return;
    }
    setSubmitting(true);
    try {
      await login(form.username.trim(), form.password);
      sessionStorage.removeItem("session_expired");
      navigate("/dashboard/ventas", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logoLogin} alt="Cruzimex" className="h-24 mx-auto mb-3 drop-shadow-2xl" />
          <h1 className="text-3xl font-bold text-white tracking-tight">CRUZIMEX</h1>
          <p className="text-slate-400 mt-1 text-sm">Sistema de Inteligencia de Datos</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Iniciar sesión</h2>

          {sessionExpired && !error && (
            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 mb-5 text-sm">
              <Clock size={16} className="shrink-0" />
              <span>Tu sesión expiró. Por favor iniciá sesión nuevamente.</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
                Usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={handleChange}
                placeholder="Tu usuario"
                className="input-field"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="input-field pr-11"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPass ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Ingresar
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">© {new Date().getFullYear()} Cruzimex · Sistema interno</p>
      </div>
    </div>
  );
}
