import { useEffect, useState } from 'react'
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
  'pepsico':               '/dashboard/pepsico',
  'softys':                '/dashboard/softys',
  'dmujer':                '/dashboard/dmujer',
  'apego':                 '/dashboard/apego',
  'colher':                '/dashboard/colher',
}

interface Props {
  perm: string
  children: ReactNode
}

/**
 * Protege una ruta de dashboard por permiso específico.
 * - Si no está autenticado → /login
 * - Si es admin → acceso total
 * - Si no tiene el permiso en caché → intenta refrescar desde el servidor una vez
 * - Si sigue sin permiso → redirige al primer dashboard permitido (silencioso)
 */
export default function DashboardRoute({ perm, children }: Props) {
  const { user, loading, refreshUser } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshed, setRefreshed] = useState(false)

  const isAdmin = user != null && (user.is_staff || ADMIN_CARGOS.includes(user.cargo ?? ''))
  const perms: string[] = user?.dashboard_permissions ?? []
  const hasPerm = isAdmin || perms.includes(perm)

  // Si el usuario está cargado, no tiene el permiso y aún no intentamos refrescar,
  // hacemos una consulta al servidor por si los permisos fueron actualizados recientemente.
  useEffect(() => {
    if (!loading && user && !hasPerm && !refreshed) {
      setRefreshing(true)
      void refreshUser().finally(() => {
        setRefreshing(false)
        setRefreshed(true)
      })
    }
  }, [loading, user, hasPerm, refreshed, refreshUser])

  if (loading || refreshing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (isAdmin) return <>{children}</>

  if (perms.includes(perm)) return <>{children}</>

  // No tiene acceso → redirigir silenciosamente al primer dashboard permitido
  const firstRoute = perms.map(p => PERM_TO_ROUTE[p]).find(Boolean)
  return <Navigate to={firstRoute ?? '/login'} replace />
}
