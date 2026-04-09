import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { ReactNode } from 'react'

const ADMIN_CARGOS = ['Administrador de Sistema', 'Subadministrador de Sistemas']

const PERM_TO_ROUTE: Record<string, string> = {
  'nacional':              '/dashboard/nacional',
  'regionales':            '/dashboard/regionales',
  'canales':               '/dashboard/canales',
  'supervisores':          '/dashboard/supervisores',
  'preventas-realizadas':  '/dashboard/preventas-realizadas',
  'avances-ventas':        '/dashboard/avances-ventas',
  'unidades-vendidas':     '/dashboard/unidades-vendidas',
  'unidades-supervisores': '/dashboard/unidades-supervisores',
  'informacion-rutas':     '/dashboard/informacion-rutas',
  'ticket-promedio':       '/dashboard/ticket-promedio',
  'lista-precios':         '/dashboard/lista-precios',
  'inventario-almacen':    '/dashboard/inventario-almacen',
  'fechas-vencimiento':    '/dashboard/fechas-vencimiento',
  'margen-bruto':          '/dashboard/margen-bruto',
  'matriz':                '/dashboard/matriz',
}

interface Props {
  perm: string
  children: ReactNode
}

/**
 * Protege una ruta de dashboard por permiso específico.
 * - Si no está autenticado → /login
 * - Si es admin → acceso total
 * - Si no tiene el permiso → redirige al primer dashboard permitido (silencioso)
 */
export default function DashboardRoute({ perm, children }: Props) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  const isAdmin = user.is_staff || ADMIN_CARGOS.includes(user.cargo ?? '')
  if (isAdmin) return <>{children}</>

  const perms: string[] = user.dashboard_permissions ?? []
  if (perms.includes(perm)) return <>{children}</>

  // No tiene acceso → redirigir silenciosamente al primer dashboard permitido
  const firstRoute = perms.map(p => PERM_TO_ROUTE[p]).find(Boolean)
  return <Navigate to={firstRoute ?? '/login'} replace />
}
