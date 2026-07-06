export const PERM_TO_ROUTE: Record<string, string> = {
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

const ADMIN_CARGOS = new Set(['Administrador de Sistema', 'Subadministrador de Sistemas'])

export function getFirstDashboardRoute(user: {
  is_staff?: boolean
  cargo?: string | null
  dashboard_permissions?: string[]
}): string {
  const isAdmin = user.is_staff || ADMIN_CARGOS.has(user.cargo ?? '')
  if (isAdmin) return '/dashboard/nacional'
  const perms = user.dashboard_permissions ?? []
  return perms.map(p => PERM_TO_ROUTE[p]).find(Boolean) ?? '/dashboard/nacional'
}
