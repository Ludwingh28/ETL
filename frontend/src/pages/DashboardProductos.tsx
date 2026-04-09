import { useEffect, useState } from "react";
import { Package, RefreshCw, AlertCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import type { ProductoTop, ProductoPorGrupo, ApiResponse } from "../types";

const CURRENCY = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 0,
});
const fmt = (n: number | null | undefined) => (n != null ? CURRENCY.format(n) : "—");

export default function DashboardProductos() {
  const { apiFetch } = useAuth();

  const [topProductos, setTopProductos] = useState<ProductoTop[]>([]);
  const [porGrupo, setPorGrupo] = useState<ProductoPorGrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, g] = await Promise.all([apiFetch<ApiResponse<ProductoTop[]>>("/dashboard/productos/top/?limit=15"), apiFetch<ApiResponse<ProductoPorGrupo[]>>("/dashboard/productos/por-grupo/")]);
      if (t.success) setTopProductos(t.data);
      if (g.success) setPorGrupo(g.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Análisis de Productos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Mes actual</p>
        </div>
        <button onClick={() => void loadData()} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Barras horizontales – por grupo */}
        <div className="card">
          <h2 className="font-semibold text-slate-700 mb-4">Venta Neta por Grupo</h2>
          {loading ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
          ) : porGrupo.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart layout="vertical" data={porGrupo} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
                <YAxis dataKey="grupo" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v) => (v != null ? fmt(Number(v)) : "—")} />
                <Bar dataKey="total_venta_neta" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Venta Neta" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabla – top 15 productos */}
        <div className="card">
          <h2 className="font-semibold text-slate-700 mb-4">Top 15 Productos</h2>
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
              <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Cargando...</p>
            </div>
          ) : topProductos.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
              <Package size={28} />
              <p className="text-sm">Sin datos</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-75">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-3 font-semibold text-slate-500">Producto</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-500">Grupo</th>
                    <th className="text-right py-2 font-semibold text-slate-500">Venta Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {topProductos.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-3 font-medium text-slate-800 leading-tight">{p.producto}</td>
                      <td className="py-2 pr-3 text-slate-400 text-xs">{p.grupo ?? "—"}</td>
                      <td className="py-2 text-right font-semibold text-slate-700">{fmt(p.total_venta_neta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
