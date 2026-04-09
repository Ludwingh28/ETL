import { useEffect, useState } from 'react'
import { Users, RefreshCw, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import type { VendedorRanking, ApiResponse } from '../types'

const CURRENCY = new Intl.NumberFormat('es-BO', {
  style: 'currency', currency: 'BOB', maximumFractionDigits: 0,
})
const fmt = (n: number | null | undefined) => n != null ? CURRENCY.format(n) : '—'

export default function DashboardVendedores() {
  const { apiFetch } = useAuth()

  const [ranking, setRanking] = useState<VendedorRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<ApiResponse<VendedorRanking[]>>('/dashboard/vendedores/ranking/?limit=20')
      if (r.success) setRanking(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const topVenta = ranking[0]?.total_venta_neta ?? 1

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rendimiento de Vendedores</h1>
          <p className="text-slate-500 text-sm mt-0.5">Top 20 – mes actual</p>
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

      <div className="card">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Cargando datos...</p>
          </div>
        ) : ranking.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-2 text-slate-400">
            <Users size={32} />
            <p className="text-sm">Sin datos para el período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 pr-4 font-semibold text-slate-500 w-8">#</th>
                  <th className="text-left py-3 pr-4 font-semibold text-slate-500">Vendedor</th>
                  <th className="text-left py-3 pr-4 font-semibold text-slate-500">Canal</th>
                  <th className="text-left py-3 pr-4 font-semibold text-slate-500">Ciudad</th>
                  <th className="text-right py-3 pr-4 font-semibold text-slate-500">Venta Neta</th>
                  <th className="text-right py-3 pr-4 font-semibold text-slate-500">Pedidos</th>
                  <th className="text-right py-3 font-semibold text-slate-500">Clientes</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((v, i) => {
                  const pct = (v.total_venta_neta / topVenta) * 100
                  return (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-800">{v.vendedor}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100 w-32">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-500">{v.canal ?? '—'}</td>
                      <td className="py-3 pr-4 text-slate-500">{v.ciudad ?? '—'}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-slate-800">{fmt(v.total_venta_neta)}</td>
                      <td className="py-3 pr-4 text-right text-slate-600">{v.total_pedidos}</td>
                      <td className="py-3 text-right text-slate-600">{v.clientes_atendidos}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
