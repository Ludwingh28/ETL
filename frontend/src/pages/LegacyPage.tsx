import { useNavigate } from "react-router-dom";
import { History, ExternalLink } from "lucide-react";
import { PersonStanding } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import type { LucideIcon } from "lucide-react";

interface LegacyDash {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

const LEGACY_DASHBOARDS: LegacyDash[] = [
  {
    to: "/dashboard/softys",
    icon: PersonStanding,
    label: "Dashboard Softys",
    description: "Versión original del dashboard Softys para acceso del proveedor.",
  },
];

export default function LegacyPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
          <History size={18} className="text-slate-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Accesos Legacy</h1>
          <p className="text-xs text-slate-400 mt-0.5">Dashboards de versiones anteriores — solo visibles para administradores</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LEGACY_DASHBOARDS.map(({ to, icon: Icon, label, description }) => (
          <div key={to} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-slate-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
              </div>
            </div>
            <button
              onClick={() => navigate(to)}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors"
            >
              <ExternalLink size={14} />
              Abrir Dashboard
            </button>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
