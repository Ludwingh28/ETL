import { useEffect, useState, type ChangeEvent } from 'react'
import {
  DollarSign, ShoppingCart, Users2, MapPin,
  Download, RefreshCw, AlertCircle,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'
import DashboardLayout from '../components/DashboardLayout'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface KPIData {
  total:      number
  pedidos:    number
  clientes:   number
  regionales: { regional: string; total: number }[]
}

interface MarcaData {
  marca:    string | null
  total:    number
  cantidad: number
}

interface TablaRow {
  canal:              string | null
  ciudad:             string | null
  mes_nombre:         string | null
  proveedor:          string | null
  marca:              string | null
  numero_venta:       string | null
  fecha_completa:     string | null
  cliente_codigo_erp: string | null
  grupo_descripcion:  string | null
  clase_descripcion:  string | null
  producto_nombre:    string | null
  unidad_medida:      string | null
  cantidad:           number | null
  total:              number | null
  vendedor_nombre:    string | null
}

interface Periodo {
  anho:       number
  mes_numero: number
  mes_nombre: string
}

// ─── Mapeo perm → nombre DB ──────────────────────────────────────────────────

const PROV_DB: Record<string, string> = {
  pepsico: 'PEPSICO',
  softys:  'SOFTYS',
  dmujer:  'DMUJER',
  apego:   'APEGO',
  colher:  'COLHER',
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const CUR = new Intl.NumberFormat('es-BO', {
  style: 'currency', currency: 'BOB', maximumFractionDigits: 0,
})
const fmt    = (n: number | null | undefined) => n != null ? CUR.format(n) : '—'
const fmtNum = (n: number | null | undefined) => n != null ? n.toLocaleString('es-BO') : '—'

const COLORES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

// ─── KPI Card simple ─────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, icon: Icon, color, bg }: {
  title: string; value: string; sub?: string
  icon: typeof DollarSign; color: string; bg: string
}) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`p-2 rounded-lg shrink-0 ${bg}`}>
          <Icon size={15} className={color} />
        </div>
        <span className="text-sm font-semibold text-slate-700 leading-tight">{title}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Tooltip del gráfico ─────────────────────────────────────────────────────

interface TipPayload { value?: number; name?: string }
function TooltipMarca({ active, payload, label }: {
  active?: boolean; payload?: TipPayload[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-slate-600">Ventas: <span className="font-bold text-slate-800">{fmt(payload[0]?.value)}</span></p>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

interface Props { perm: string; nombre: string }

export default function DashboardProveedor({ perm, nombre }: Props) {
  const { apiFetch } = useAuth()
  const provDB = PROV_DB[perm] ?? perm.toUpperCase()

  const now = new Date()
  const [anho, setAnho] = useState(now.getFullYear())
  const [mes,  setMes]  = useState(now.getMonth() + 1)

  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [kpis,     setKpis]     = useState<KPIData | null>(null)
  const [marcas,   setMarcas]   = useState<MarcaData[]>([])
  const [tabla,    setTabla]    = useState<TablaRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // Cargar periodos disponibles (reutiliza el endpoint del nacional)
  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>('/dashboard/nacional/periodos/')
      .then(r => { if (r.success) setPeriodos(r.data) })
      .catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const qs = `?proveedor=${provDB}&anho=${anho}&mes=${mes}`
    try {
      const [k, m, t] = await Promise.all([
        apiFetch<{ success: boolean; data: KPIData }>(`/dashboard/proveedor/kpis/${qs}`),
        apiFetch<{ success: boolean; data: MarcaData[] }>(`/dashboard/proveedor/por-marca/${qs}`),
        apiFetch<{ success: boolean; data: TablaRow[] }>(`/dashboard/proveedor/tabla/${qs}`),
      ])
      if (k.success) setKpis(k.data)
      if (m.success) setMarcas(m.data)
      if (t.success) setTabla(t.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [anho, mes, provDB]) // eslint-disable-line react-hooks/exhaustive-deps

  const anhos           = [...new Set(periodos.map(p => p.anho))].sort((a, b) => b - a)
  const mesesDisponibles = periodos.filter(p => p.anho === anho)

  // ─── Exportar a Excel ────────────────────────────────────────────────────

  const exportExcel = () => {
    const cols: (keyof TablaRow)[] = [
      'canal', 'ciudad', 'mes_nombre', 'proveedor', 'marca',
      'numero_venta', 'fecha_completa', 'cliente_codigo_erp',
      'clase_descripcion', 'producto_nombre', 'unidad_medida',
      'cantidad', 'total', 'vendedor_nombre',
    ]
    const headers: Record<keyof TablaRow, string> = {
      canal:              'CANAL',
      ciudad:             'CIUDAD ING',
      mes_nombre:         'MES',
      proveedor:          'PROVEEDOR',
      marca:              'MARCA',
      numero_venta:       'NRO VENTA',
      fecha_completa:     'FECHA',
      cliente_codigo_erp: 'COD CLIENTE',
      grupo_descripcion:  'GRUPO',
      clase_descripcion:  'DESC CLASE',
      producto_nombre:    'DESC ARTICULO',
      unidad_medida:      'U/M',
      cantidad:           'CANTIDAD',
      total:              'TOTAL',
      vendedor_nombre:    'VENDEDOR',
    }

    const data = tabla.map(r =>
      Object.fromEntries(cols.map(c => [headers[c], r[c] ?? '']))
    )

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, nombre)
    XLSX.writeFile(wb, `${nombre}_${anho}_${String(mes).padStart(2, '0')}.xlsx`)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>

      {/* Header + selectores */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard {nombre}</h1>
          <p className="text-slate-500 text-sm mt-0.5">Ventas del proveedor por período</p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {/* Gestión */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select
              value={anho}
              disabled={loading}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700
                         focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
            >
              {anhos.length > 0
                ? anhos.map(a => <option key={a} value={a}>{a}</option>)
                : <option value={anho}>{anho}</option>}
            </select>
          </div>

          {/* Mes */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select
              value={mes}
              disabled={loading}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700
                         focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
            >
              {mesesDisponibles.length > 0
                ? mesesDisponibles.map(p => (
                    <option key={p.mes_numero} value={p.mes_numero}>{p.mes_nombre}</option>
                  ))
                : <option value={mes}>{mes}</option>}
            </select>
          </div>

          {/* Refresh */}
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200
                       bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-5">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <KpiCard
              title="Total Ventas"
              value={fmt(kpis?.total)}
              icon={DollarSign}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            <KpiCard
              title="Pedidos"
              value={fmtNum(kpis?.pedidos)}
              icon={ShoppingCart}
              color="text-emerald-600"
              bg="bg-emerald-50"
            />
            <KpiCard
              title="Clientes"
              value={fmtNum(kpis?.clientes)}
              icon={Users2}
              color="text-purple-600"
              bg="bg-purple-50"
            />
          </div>

          {/* ── Cards por Regional ── */}
          {(kpis?.regionales?.length ?? 0) > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {kpis!.regionales.map(r => (
                <div key={r.regional} className="card flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50 shrink-0">
                    <MapPin size={16} className="text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{r.regional}</p>
                    <p className="text-lg font-bold text-slate-800 leading-tight">{fmt(r.total)}</p>
                    {kpis!.total > 0 && (
                      <p className="text-xs text-slate-400">
                        {((r.total / kpis!.total) * 100).toFixed(1)}% del total
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Gráfico de barras por marca ── */}
          {marcas.length > 0 && (
            <div className="card mb-6">
              <h2 className="text-base font-semibold text-slate-700 mb-4">Ventas por Canal</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={marcas} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="marca"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={v => `${(Number(v) / 1_000).toFixed(0)}K`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={60}
                  />
                  <Tooltip content={<TooltipMarca />} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {marcas.map((_, i) => (
                      <Cell key={i} fill={COLORES[i % COLORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Tabla detallada ── */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-700">Detalle de Ventas</h2>
                <p className="text-xs text-slate-400 mt-0.5">{tabla.length.toLocaleString('es-BO')} registros</p>
              </div>
              <button
                onClick={exportExcel}
                disabled={tabla.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm
                           font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={15} />
                Exportar .xlsx
              </button>
            </div>

            {tabla.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                Sin datos para el período seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="border-b border-slate-200">
                      {[
                        'CANAL', 'CIUDAD ING', 'MES', 'PROVEEDOR', 'NRO VENTA',
                        'COD CLIENTE', 'DESC CLASE', 'DESC ARTICULO',
                        'U/M', 'CANTIDAD', 'TOTAL', 'VENDEDOR',
                      ].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tabla.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-2 text-slate-700">{r.canal ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.ciudad ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.mes_nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.proveedor ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{r.numero_venta ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{r.cliente_codigo_erp ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-36 truncate">{r.clase_descripcion ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-48 truncate font-medium">{r.producto_nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{r.unidad_medida ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtNum(r.cantidad)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(r.total)}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-36 truncate">{r.vendedor_nombre ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
