import { HardHat, Clock, ChevronRight } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'

interface Props {
  titulo: string
  grupo:  string
}

export default function DashboardEnConstruccion({ titulo, grupo }: Props) {
  return (
    <DashboardLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-8">
        <NavLink to="/dashboard/nacional" className="hover:text-slate-600 transition-colors">
          Inicio
        </NavLink>
        <ChevronRight size={12} />
        <span className="text-slate-500">{grupo}</span>
        <ChevronRight size={12} />
        <span className="font-semibold text-slate-600">{titulo}</span>
      </div>

      {/* Card principal */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        {/* Ícono animado */}
        <div className="relative mb-8">
          <div className="w-28 h-28 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
            <HardHat size={52} className="text-amber-500" strokeWidth={1.5} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center shadow-sm">
            <Clock size={16} className="text-slate-500" />
          </div>
        </div>

        {/* Texto */}
        <span className="text-xs font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full mb-4">
          En construcción
        </span>

        <h1 className="text-3xl font-bold text-slate-800 mb-3">{titulo}</h1>

        <p className="text-slate-500 text-base max-w-md mb-2">
          Este dashboard está siendo desarrollado y estará disponible próximamente.
        </p>
        <p className="text-slate-400 text-sm max-w-sm">
          Grupo: <span className="font-semibold text-slate-500">{grupo}</span>
        </p>

        {/* Barra de progreso decorativa */}
        <div className="mt-10 w-64">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Progreso</span>
            <span className="font-semibold">En desarrollo</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-amber-400 to-amber-300 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Volver */}
        <NavLink
          to="/dashboard/nacional"
          className="mt-10 inline-flex items-center gap-2 text-sm text-brand-600 font-semibold hover:underline"
        >
          ← Volver al Dashboard Nacional
        </NavLink>
      </div>
    </DashboardLayout>
  )
}
