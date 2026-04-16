// ── Catálogos ─────────────────────────────────────────────────────────────────

export const CARGOS = [
  'Gerente General',
  'Gerente de Ventas',
  'Gerente Regional',
  'Supervisor',
  'Vendedor',
  'Proveedor',
  'Analista de Datos',
  'Administrador de Sistema',
  'Subadministrador de Sistemas',
] as const

export type Cargo = (typeof CARGOS)[number]

export const REGIONALES = ['Santa Cruz', 'Cochabamba', 'La Paz', 'Nacional'] as const

export type Regional = (typeof REGIONALES)[number]

// ── Árbol de dashboards ────────────────────────────────────────────────────────

export interface DashboardItem {
  id:    string
  label: string
}

export interface DashboardGroup {
  grupo: string
  items: DashboardItem[]
}

export const DASHBOARD_GROUPS: DashboardGroup[] = [
  {
    grupo: 'Seguimiento General',
    items: [
      { id: 'nacional',      label: 'Dashboard Nacional'           },
      { id: 'regionales',    label: 'Dashboard Regionales'         },
      { id: 'canales',       label: 'Dashboard Canales / Regional' },
      { id: 'supervisores',  label: 'Dashboard Supervisores'       },
    ],
  },
  {
    grupo: 'Seguimiento Día (DUAL+POD)',
    items: [
      { id: 'preventas-realizadas', label: 'Preventas Realizadas' },
      { id: 'avances-ventas',       label: 'Avances de Ventas'    },
    ],
  },
  {
    grupo: 'Evolución Mes',
    items: [
      { id: 'unidades-vendidas',    label: 'Unidades Vendidas'              },
      { id: 'unidades-supervisores',label: 'Unidades Vendidas Supervisores' },
      { id: 'informacion-rutas',    label: 'Información Rutas'              },
      { id: 'ticket-promedio',      label: 'Ticket Promedio'                },
    ],
  },
  {
    grupo: 'Varios',
    items: [
      { id: 'lista-precios',      label: 'Lista de Precios'       },
      { id: 'inventario-almacen', label: 'Inventario por Almacén' },
      { id: 'fechas-vencimiento', label: 'Fechas de Vencimiento'  },
    ],
  },
  {
    grupo: 'Finanzas',
    items: [
      { id: 'margen-bruto', label: 'Margen Bruto' },
    ],
  },
  {
    grupo: 'Tabla Dinámica',
    items: [
      { id: 'matriz', label: 'Dashboard Matriz' },
    ],
  },
  {
    grupo: 'Proveedores',
    items: [
      { id: 'pepsico', label: 'Dashboard Pepsico' },
      { id: 'softys',  label: 'Dashboard Softys'  },
      { id: 'dmujer',  label: 'Dashboard DMujer'  },
      { id: 'apego',   label: 'Dashboard Apego'   },
      { id: 'colher',  label: 'Dashboard COLHER'  },
    ],
  },
]

export const ALL_DASHBOARD_IDS = DASHBOARD_GROUPS.flatMap(g => g.items.map(i => i.id))

// ── Permisos predeterminados por cargo ────────────────────────────────────────

export const PERMISOS_POR_CARGO: Record<Cargo, string[]> = {
  'Gerente General':            ALL_DASHBOARD_IDS,
  'Gerente de Ventas':          ['nacional', 'regionales', 'canales', 'supervisores', 'unidades-vendidas', 'unidades-supervisores', 'informacion-rutas', 'ticket-promedio', 'margen-bruto'],
  'Gerente Regional':           ['regionales', 'canales', 'supervisores', 'preventas-realizadas', 'avances-ventas', 'unidades-vendidas', 'unidades-supervisores', 'informacion-rutas'],
  'Supervisor':                  ['canales', 'supervisores', 'preventas-realizadas', 'avances-ventas', 'unidades-supervisores', 'informacion-rutas'],
  'Vendedor':                    ['preventas-realizadas', 'avances-ventas'],
  'Proveedor':                   ['lista-precios', 'pepsico', 'softys', 'dmujer', 'apego', 'colher'],
  'Analista de Datos':          ['nacional', 'regionales', 'canales', 'supervisores', 'preventas-realizadas', 'avances-ventas', 'unidades-vendidas', 'unidades-supervisores', 'informacion-rutas', 'ticket-promedio', 'margen-bruto', 'matriz'],
  'Administrador de Sistema':   ALL_DASHBOARD_IDS,
  'Subadministrador de Sistemas': ALL_DASHBOARD_IDS,
}

// ── Color de badge por cargo ──────────────────────────────────────────────────

export const CARGO_COLOR: Record<string, string> = {
  'Gerente General':            'bg-purple-100 text-purple-700',
  'Gerente de Ventas':          'bg-blue-100 text-blue-700',
  'Gerente Regional':           'bg-indigo-100 text-indigo-700',
  'Supervisor':                  'bg-cyan-100 text-cyan-700',
  'Vendedor':                    'bg-green-100 text-green-700',
  'Proveedor':                   'bg-orange-100 text-orange-700',
  'Analista de Datos':          'bg-rose-100 text-rose-700',
  'Administrador de Sistema':   'bg-red-100 text-red-700',
  'Subadministrador de Sistemas': 'bg-pink-100 text-pink-700',
}
