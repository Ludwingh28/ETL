import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { ReactNode } from 'react'

const ADMIN_CARGOS = ['Administrador de Sistema', 'Subadministrador de Sistemas']

const PERM_TO_ROUTE: Record<string, string> = {
  'nacional':                  '/dashboard/nacional',
  'regionales':                '/dashboard/regionales',
  'canales':                   '/dashboard/canales',
  'supervisores':              '/dashboard/supervisores',
  'preventas-realizadas':      '/dashboard/preventas-realizadas',
  'avances-ventas':            '/dashboard/avances-ventas',
  'unidades-vendidas':         '/dashboard/unidades-vendidas',
  'unidades-supervisores':     '/dashboard/unidades-supervisores',
  'informacion-rutas':         '/dashboard/informacion-rutas',
  'tendencia-estacional':      '/dashboard/tendencia-estacional',
  'ticket-promedio':           '/dashboard/ticket-promedio',
  'ficha-sku':                 '/dashboard/ficha-sku',
  'distribucion-rutas':        '/dashboard/distribucion-rutas',
  'comportamiento-productos':  '/dashboard/comportamiento-productos',
  'lista-precios':             '/dashboard/lista-precios',
  'inventario-almacen':        '/dashboard/inventario-almacen',
  'fechas-vencimiento':        '/dashboard/fechas-vencimiento',
  'margen-bruto':              '/dashboard/margen-bruto',
  'matriz':                    '/dashboard/matriz',
  'descargas':                 '/documentos/descargas',
  'pepsico':                   '/dashboard/pepsico',
  'softys':                    '/dashboard/softys',
  'softys-nuevo':              '/dashboard/softys-revision',
  'dmujer':                    '/dashboard/dmujer',
  'apego':                     '/dashboard/apego',
  'colher':                    '/dashboard/colher',
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

  // Sin permiso y aún no intentamos refrescar → esperar el refresh (effect en curso)
  if (!refreshed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Refresh ya hecho, sigue sin permiso → redirigir al primer dashboard permitido
  const firstRoute = perms.map(p => PERM_TO_ROUTE[p]).find(Boolean)
  if (firstRoute) return <Navigate to={firstRoute} replace />

  // Sin ningún dashboard asignado — mostrar pantalla de sin acceso en lugar de ciclar a /login
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm text-center">
        <p className="text-2xl mb-2">🔒</p>
        <p className="text-slate-800 font-semibold text-lg mb-1">Sin acceso</p>
        <p className="text-slate-500 text-sm">Tu cuenta no tiene dashboards asignados. Contactá al administrador.</p>
      </div>
    </div>
  )
}
