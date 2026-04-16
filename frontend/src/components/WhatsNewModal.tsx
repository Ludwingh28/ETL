import { useState, useEffect } from "react";
import { X, Sparkles, Wrench, LayoutDashboard } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { CURRENT_VERSION, CHANGELOG } from "../constants/changelog";

const LS_KEY = "cruzimex_changelog_seen";

export default function WhatsNewModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const seen = localStorage.getItem(LS_KEY);
    if (seen !== CURRENT_VERSION) {
      setOpen(true);
    }
  }, [user]);

  function handleClose() {
    localStorage.setItem(LS_KEY, CURRENT_VERSION);
    setOpen(false);
  }

  if (!open || !user) return null;

  const entry = CHANGELOG[0]; // versión más reciente

  // Dashboards nuevos a los que este usuario tiene acceso
  const perms: string[] = (user as any).dashboard_permissions ?? [];
  const myNewDashboards = entry.newDashboardPerms.filter((p) =>
    perms.includes(p)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand-600" />
            <h2 className="font-bold text-slate-800 text-base">
              Novedades — v{entry.version}
            </h2>
            <span className="text-[11px] text-slate-400 ml-1">{entry.date}</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent px-6 py-4 space-y-5">

          {/* Dashboards nuevos para este usuario */}
          {myNewDashboards.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <LayoutDashboard size={14} className="text-brand-600" />
                <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wide">
                  Nuevos dashboards en tu cuenta
                </h3>
              </div>
              <ul className="space-y-1">
                {myNewDashboards.map((perm) => (
                  <li key={perm} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                    {entry.newDashboardNames[perm]}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Novedades */}
          {entry.features.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={14} className="text-emerald-600" />
                <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                  Novedades
                </h3>
              </div>
              <ul className="space-y-1.5">
                {entry.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Correcciones */}
          {entry.fixes.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Wrench size={14} className="text-amber-600" />
                <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                  Correcciones
                </h3>
              </div>
              <ul className="space-y-1.5">
                {entry.fixes.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100">
          <button
            onClick={handleClose}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
