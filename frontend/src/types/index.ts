// ─── Auth ───────────────────────────────────────────────────────────────────

export interface User {
  id:        number
  username:  string
  full_name: string
  first_name?: string
  last_name?:  string
  email:     string
  cargo?:    string
  regional?: string
  canal?:    string
  groups:                string[]
  is_staff:              boolean
  is_active?:            boolean
  dashboard_permissions: string[]
}

export interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  logout: () => void
  apiFetch: <T = unknown>(path: string, options?: RequestInit) => Promise<T>
  refreshUser: () => Promise<void>
}

// ─── Admin – Usuario gestionado ─────────────────────────────────────────────

export interface ManagedUser {
  id:                    number
  username:              string
  first_name:            string
  last_name:             string
  email:                 string
  cargo:                 string
  regional:              string
  canal:                 string
  is_active:             boolean
  dashboard_permissions: string[]
  date_joined?:          string
  last_seen?:            string | null
}

export type ReporteTipo     = 'BUG' | 'ERROR' | 'SOLICITUD'
export type ReporteEstado   = 'PENDIENTE' | 'EN_CURSO' | 'ATENDIDA'
export type ReportePrioridad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'

export interface Reporte {
  id:          number
  tipo:        ReporteTipo
  subtipo:     string
  descripcion: string
  estado:      ReporteEstado
  prioridad:   ReportePrioridad
  context:     Record<string, unknown>
  created_at:  string
  updated_at:  string
  user: {
    id:        number
    username:  string
    full_name: string
  }
}

// ─── API response wrapper ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

// ─── Dashboard – Ventas ──────────────────────────────────────────────────────

export interface VentasKpis {
  total_pedidos: number
  total_venta_neta: number
  ticket_promedio: number
  clientes_activos: number
}

export interface VentasPorMes {
  periodo: string
  mes: string
  anho: number
  total_venta_neta: number
  total_pedidos: number
}

export interface VentasPorCanal {
  canal: string
  total_venta_neta: number
  total_pedidos: number
  vendedores: number
}

// ─── Dashboard – Vendedores ──────────────────────────────────────────────────

export interface VendedorRanking {
  vendedor: string
  canal: string | null
  ciudad: string | null
  total_venta_neta: number
  total_pedidos: number
  clientes_atendidos: number
}

// ─── Dashboard – Productos ───────────────────────────────────────────────────

export interface ProductoTop {
  producto: string
  grupo: string | null
  subgrupo: string | null
  total_cantidad: number
  total_venta_neta: number
}

export interface ProductoPorGrupo {
  grupo: string
  productos: number
  total_cantidad: number
  total_venta_neta: number
}
