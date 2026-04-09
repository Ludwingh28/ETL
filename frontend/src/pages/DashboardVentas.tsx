import { useEffect, useState } from 'react'
import { TrendingUp, ShoppingCart, Users, DollarSign, RefreshCw, AlertCircle } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import type { VentasKpis, VentasPorMes, VentasPorCanal, ApiResponse } from '../types'

const PIE_COLORS = ['#3b82f6', '#0ea5e9', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b']

const CURRENCY = new Intl.NumberFormat('es-BO', {
  style: 'currency', currency: 'BOB', maximumFractionDigits: 0,
})
const fmt    = (n: number | null | undefined) => n != null ? CURRENCY.format(n) : '—'
const fmtNum = (n: number | null | undefined) => n != null ? new Intl.NumberFormat('es-BO').format(n) : '—'

interface KpiCardProps {
  title:    string
  value:    string
  icon:     LucideIcon
  color:    'blue' | 'green' | 'purple' | 'orange'
}

const COLOR_MAP: Record<KpiCardProps['color'], string> = {
  blue:   'bg-blue-50 text-blue-600',
  green:  'bg-emerald-50 text-emerald-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
}

function KpiCard({ title, value, icon: Icon, color }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${COLOR_MAP[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

export default function DashboardVentas() {
  const { apiFetch } = useAuth()

  const [kpis,     setKpis]     = useState<VentasKpis | null>(null)
  const [porMes,   setPorMes]   = useState<VentasPorMes[]>([])
  const [porCanal, setPorCanal] = useState<VentasPorCanal[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [k, m, c] = await Promise.all([
        apiFetch<ApiResponse<VentasKpis>>('/dashboard/ventas/kpis/'),
        apiFetch<ApiResponse<VentasPorMes[]>>('/dashboard/ventas/por-mes/'),
        apiFetch<ApiResponse<VentasPorCanal[]>>('/dashboard/ventas/por-canal/'),
      ])
      if (k.success) setKpis(k.data)
      if (m.success) setPorMes(m.data)
      if (c.success) setPorCanal(c.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Ventas</h1>
          <p className="text-slate-500 text-sm mt-0.5">Resumen del mes actual</p>
        </div>
        <button onClick={() => void loadData()} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Venta Neta (mes)"  value={fmt(kpis?.total_venta_neta)}    icon={DollarSign}   color="blue"   />
        <KpiCard title="Total Pedidos"      value={fmtNum(kpis?.total_pedidos)}    icon={ShoppingCart} color="green"  />
        <KpiCard title="Ticket Promedio"    value={fmt(kpis?.ticket_promedio)}     icon={TrendingUp}   color="purple" />
        <KpiCard title="Clientes Activos"   value={fmtNum(kpis?.clientes_activos)} icon={Users}        color="orange" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Barras – últimos 12 meses */}
        <div className="card xl:col-span-2">
          <h2 className="font-semibold text-slate-700 mb-4">Venta Neta – Últimos 12 meses</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
          ) : porMes.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porMes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l: string) => `Mes: ${l}`} />
                <Bar dataKey="total_venta_neta" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Venta Neta" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut – por canal */}
        <div className="card">
          <h2 className="font-semibold text-slate-700 mb-4">Ventas por Canal</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
          ) : porCanal.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={porCanal}
                  dataKey="total_venta_neta"
                  nameKey="canal"
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={3}
                >
                  {porCanal.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
