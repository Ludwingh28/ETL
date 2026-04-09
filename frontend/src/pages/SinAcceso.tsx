import { useNavigate } from 'react-router-dom'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ADMIN_CARGOS = ['Administrador de Sistema', 'Subadministrador de Sistemas']

export default function SinAcceso() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  // Redirigir al primer dashboard al que sí tiene acceso
  const perms: string[] = user?.dashboard_permissions ?? []
  const isAdmin = user?.is_staff || ADMIN_CARGOS.includes(user?.cargo ?? '')

  const handleBack = () => {
    if (isAdmin || perms.length === 0) {
      navigate('/dashboard/nacional')
      return
    }
    // Mapeo de perm → ruta
    const PERM_ROUTE: Record<string, string> = {
      'nacional':             '/dashboard/nacional',
      'regionales':           '/dashboard/regionales',
      'canales':              '/dashboard/canales',
      'supervisores':         '/dashboard/supervisores',
      'preventas-realizadas': '/dashboard/preventas-realizadas',
      'avances-ventas':       '/dashboard/avances-ventas',
      'unidades-vendidas':    '/dashboard/unidades-vendidas',
      'unidades-supervisores':'/dashboard/unidades-supervisores',
      'informacion-rutas':    '/dashboard/informacion-rutas',
      'ticket-promedio':      '/dashboard/ticket-promedio',
      'lista-precios':        '/dashboard/lista-precios',
      'inventario-almacen':   '/dashboard/inventario-almacen',
      'fechas-vencimiento':   '/dashboard/fechas-vencimiento',
      'margen-bruto':         '/dashboard/margen-bruto',
      'matriz':               '/dashboard/matriz',
    }
    const first = perms.find(p => PERM_ROUTE[p])
    navigate(first ? PERM_ROUTE[first] : '/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/20 mb-6">
          <ShieldOff size={40} className="text-red-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Sin Acceso</h1>
        <p className="text-slate-400 mb-8">
          No tenés permiso para ver este dashboard.<br />
          Contactá al administrador si creés que es un error.
        </p>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors"
        >
          <ArrowLeft size={16} />
          Volver al inicio
        </button>
      </div>
    </div>
  )
}
