import { useEffect, useState, type ChangeEvent } from "react";
import { TrendingUp, DollarSign, ShoppingCart, Store, Building2, Wine, Truck, RefreshCw, AlertCircle, UtensilsCrossed, BarChart2, Globe, Layers } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CanalKpiItem {
  nombre: string;
  avance: number;
  objetivo: number;
}

interface KpisRegional {
  total: number;
  objetivo_total: number;
  canales: CanalKpiItem[];
  fecha_corte: string | null;
}

interface TendenciaDia {
  dia: number;
  avance_acumulado: number | null;
  presupuesto_acumulado: number | null;
  proyeccion_acumulada: number | null;
}

interface CanalRow {
  canal: string;
  avance: number;
  presupuesto: number;
  porcentaje: number | null;
}

interface CategoriaRow {
  categoria: string;
  avance: number;
  presupuesto: number;
  porcentaje: number | null;
}

interface Periodo {
  anho: number;
  mes_numero: number;
  mes_nombre: string;
}

type Regional = "Santa Cruz" | "Cochabamba" | "La Paz";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function toRegionalKey(r: Regional): string {
  return r.toLowerCase().replace(/ /g, "_");
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const CUR = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const fmt = (n: number | null | undefined) => (n != null ? CUR.format(n) : "—");
const fmtM = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
const fmtPct = (n: number | null | undefined) => (n != null ? `${n.toFixed(1)}%` : "—");

// ─── Icono por canal ──────────────────────────────────────────────────────────

function iconForCanal(nombre: string): { icon: LucideIcon; color: string; bg: string } {
  const n = nombre.toUpperCase();
  if (n.includes("LICOR") || n.includes("ALCOHOL")) return { icon: Wine, color: "text-rose-600", bg: "bg-rose-50" };
  if (n.startsWith("WHS") || n.startsWith("MAYORIST")) return { icon: Store, color: "text-indigo-600", bg: "bg-indigo-50" };
  if (n.startsWith("TRADICION") || n.startsWith("DTS")) return { icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50" };
  if (n === "CODIS" || n.includes("CODIS")) return { icon: Layers, color: "text-violet-600", bg: "bg-violet-50" };
  if (n.includes("PREMISE") || n === "HORECA") return { icon: UtensilsCrossed, color: "text-amber-600", bg: "bg-amber-50" };
  if (n === "SPM" || n.includes("SUPER")) return { icon: Building2, color: "text-teal-600", bg: "bg-teal-50" };
  if (n === "CORP" || n.includes("CORP")) return { icon: BarChart2, color: "text-cyan-600", bg: "bg-cyan-50" };
  if (n.includes("ECOM") || n.includes("DIGIT")) return { icon: Globe, color: "text-emerald-600", bg: "bg-emerald-50" };
  if (n.includes("PROV") || n.includes("PROVIN")) return { icon: Truck, color: "text-orange-600", bg: "bg-orange-50" };
  return { icon: BarChart2, color: "text-slate-600", bg: "bg-slate-100" };
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, avance, objetivo, icon: Icon, color, iconBg }: { title: string; avance: number | undefined; objetivo: number; icon: LucideIcon; color: string; iconBg: string }) {
  const gap = objetivo > 0 && avance != null ? avance - objetivo : null;
  const gapPos = gap != null && gap >= 0;
  const gapColor = gap == null ? "text-slate-300" : gapPos ? "text-emerald-600" : "text-red-500";

  return (
    <div className="kpi-card gap-0">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>
          <Icon size={15} className={color} />
        </div>
        <span className="text-sm font-semibold text-slate-700 leading-tight">{title}</span>
      </div>

      <p className="text-2xl font-bold text-slate-800 leading-tight">{fmt(avance)}</p>
      <p className="text-xs text-slate-400 mt-0.5">{objetivo > 0 ? `/ ${fmt(objetivo)}` : ""}</p>

      <div className={`mt-3 pt-2.5 border-t border-slate-100 text-xs font-semibold flex items-center gap-1 ${gapColor}`}>
        {gap == null ? (
          <span className="font-normal text-slate-300">—</span>
        ) : (
          <>
            <span>{gapPos ? "▲" : "▼"}</span>
            <span>
              {gap >= 0 ? "+" : ""}
              {fmt(gap)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card Total (ancho) ────────────────────────────────────────────────────

function KpiCardTotal({ regional, avance, objetivo, color, iconBg }: { regional: string; avance: number | undefined; objetivo: number; color: string; iconBg: string }) {
  const gap = objetivo > 0 && avance != null ? avance - objetivo : null;
  const gapPos = gap != null && gap >= 0;
  const pct = objetivo > 0 && avance != null ? (avance / objetivo) * 100 : null;

  return (
    <div className="kpi-card flex flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl shrink-0 ${iconBg}`}>
          <DollarSign size={18} className={color} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Total {regional}</p>
          <p className="text-3xl font-bold text-slate-800 leading-tight">{fmt(avance)}</p>
          <p className="text-xs text-slate-400 mt-0.5">/ {fmt(objetivo)}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        {pct != null && <span className={`text-2xl font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"}`}>{pct.toFixed(1)}%</span>}
        {gap != null && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${gapPos ? "text-emerald-600" : "text-red-500"}`}>
            <span>{gapPos ? "▲" : "▼"}</span>
            <span>
              {gap >= 0 ? "+" : ""}
              {fmt(gap)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

type CustomTooltipPayloadItem = {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: unknown;
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string | number;
}

function TooltipTendencia({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">Día {label as number}</p>
      {payload.map((p) => (
        <div key={p.dataKey as string} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{fmt(p.value as number)}</span>
        </div>
      ))}
    </div>
  );
}

function TooltipPresAvance({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const avance = payload.find((p) => p.dataKey === "avance")?.value as number | undefined;
  const ppto = payload.find((p) => p.dataKey === "presupuesto")?.value as number | undefined;
  const pct = ppto && avance ? ((avance / ppto) * 100).toFixed(1) : null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label as string}</p>
      {avance != null && (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
          <span className="text-slate-500">Avance:</span>
          <span className="font-semibold">{fmt(avance)}</span>
        </div>
      )}
      {ppto != null && ppto > 0 && (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-slate-500">Presupuesto:</span>
          <span className="font-semibold">{fmt(ppto)}</span>
        </div>
      )}
      {pct && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400">Cumplimiento: </span>
          <span className={`font-bold ${parseFloat(pct) >= 100 ? "text-emerald-600" : parseFloat(pct) >= 80 ? "text-amber-500" : "text-red-500"}`}>{pct}%</span>
        </div>
      )}
    </div>
  );
}

// ─── Leyenda líneas ───────────────────────────────────────────────────────────

function LeyendaLineas({ esPeriodoActual }: { esPeriodoActual: boolean }) {
  return (
    <div className="flex flex-wrap gap-5 text-xs text-slate-500 pt-3 border-t border-slate-100 mt-3">
      <span className="flex items-center gap-2">
        <svg width="28" height="8">
          <line x1="0" y1="4" x2="28" y2="4" stroke="#22c55e" strokeWidth="2" strokeDasharray="5 3" />
        </svg>
        Presupuesto
      </span>
      <span className="flex items-center gap-2">
        <svg width="28" height="8">
          <line x1="0" y1="4" x2="28" y2="4" stroke="#3b82f6" strokeWidth="2.5" />
        </svg>
        Avance
      </span>
      {esPeriodoActual && (
        <span className="flex items-center gap-2">
          <svg width="28" height="8">
            <line x1="0" y1="4" x2="28" y2="4" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          Proyección
        </span>
      )}
    </div>
  );
}

// ─── Config colores por regional ──────────────────────────────────────────────

const REGIONAL_CONFIG: Record<Regional, { color: string; bg: string; badge: string }> = {
  "Santa Cruz": { color: "text-emerald-600", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba: { color: "text-violet-600", bg: "bg-violet-50", badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz": { color: "text-amber-600", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

const REGIONALES: Regional[] = ["Santa Cruz", "Cochabamba", "La Paz"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardRegionales() {
  const { apiFetch } = useAuth();
  const now = new Date();

  const [regional, setRegional] = useState<Regional>("Santa Cruz");
  const [anho, setAnho] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [kpis, setKpis] = useState<KpisRegional | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaDia[]>([]);
  const [canales, setCanales] = useState<CanalRow[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);
  const [esPeriodoActual, setEsPeriodoActual] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then((r) => {
        if (r.success) setPeriodos(r.data);
      })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const qs = `?anho=${anho}&mes=${mes}&regional=${toRegionalKey(regional)}`;
    try {
      const [k, t, c, cat] = await Promise.all([
        apiFetch<{ success: boolean; data: KpisRegional }>(`/dashboard/regionales/kpis/${qs}`),
        apiFetch<{ success: boolean; data: TendenciaDia[]; es_periodo_actual: boolean }>(`/dashboard/regionales/tendencia/${qs}`),
        apiFetch<{ success: boolean; data: CanalRow[] }>(`/dashboard/regionales/por-canal/${qs}`),
        apiFetch<{ success: boolean; data: CategoriaRow[] }>(`/dashboard/regionales/por-categoria/${qs}`),
      ]);
      if (k.success) setKpis(k.data);
      if (t.success) {
        setTendencia(t.data);
        setEsPeriodoActual(t.es_periodo_actual);
      }
      if (c.success) setCanales(c.data);
      if (cat.success) setCategorias(cat.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [anho, mes, regional]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechaCorte = kpis?.fecha_corte
    ? new Date(kpis.fecha_corte + "T00:00:00").toLocaleDateString("es-BO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : `${anho}/${String(mes).padStart(2, "0")}/??`;

  const anhos = [...new Set(periodos.map((p) => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter((p) => p.anho === anho);
  const cfg = REGIONAL_CONFIG[regional];

  const canalesKpi = kpis?.canales ?? [];

  return (
    <DashboardLayout>
      {/* ── Header + Segmentadores ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Regionales</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Resumen de ventas por regional hasta la fecha&nbsp;
            <span className="font-semibold text-slate-700">{fechaCorte}</span>
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {/* Segmentador Regional */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
            <div className="flex gap-1.5">
              {REGIONALES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegional(r)}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                    regional === r ? `${REGIONAL_CONFIG[r].badge} shadow-sm` : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select
              value={anho}
              disabled={loading}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700
                         focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
            >
              {anhos.length > 0 ? (
                anhos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))
              ) : (
                <option value={now.getFullYear()}>{now.getFullYear()}</option>
              )}
            </select>
          </div>

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
                ? mesesDisponibles.map((p) => (
                    <option key={p.mes_numero} value={p.mes_numero}>
                      {MESES[p.mes_numero]}
                    </option>
                  ))
                : MESES.slice(1).map((n, i) => (
                    <option key={i + 1} value={i + 1}>
                      {n}
                    </option>
                  ))}
            </select>
          </div>

          <button onClick={() => void loadData()} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Card Total Regional (fila propia) ── */}
      <div className="mb-3">
        <KpiCardTotal regional={regional} avance={kpis?.total} objetivo={kpis?.objetivo_total ?? 0} color={cfg.color} iconBg={cfg.bg} />
      </div>

      {/* ── KPI Cards Canales ── */}
      {loading && canalesKpi.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card animate-pulse bg-slate-50" />
          ))}
        </div>
      ) : canalesKpi.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-5">
          {canalesKpi.map((c) => {
            const { icon, color, bg } = iconForCanal(c.nombre);
            return <KpiCard key={c.nombre} title={c.nombre} avance={c.avance} objetivo={c.objetivo} icon={icon} color={color} iconBg={bg} />;
          })}
        </div>
      ) : null}

      {/* ── Fila Gráficas: Tendencia (70%) + Avance por Canal (30%) ── */}
      <div className="grid grid-cols-10 gap-4 mb-4">
        {/* Gráfica 1: Tendencia */}
        <div className="card col-span-10 xl:col-span-7">
          <h2 className="font-semibold text-slate-700 mb-4">
            Tendencia de Ventas — {regional} &middot; {MESES[mes]} {anho}
          </h2>

          {loading ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
          ) : tendencia.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
              <div className="text-center">
                <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
                <p>Sin datos</p>
              </div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={290}>
                <LineChart data={tendencia} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={3} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtM} width={52} />
                  <Tooltip content={<TooltipTendencia />} />
                  <Line dataKey="presupuesto_acumulado" name="Presupuesto" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                  <Line dataKey="avance_acumulado" name="Avance" stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls />
                  {esPeriodoActual && <Line dataKey="proyeccion_acumulada" name="Proyección" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />}
                </LineChart>
              </ResponsiveContainer>
              <LeyendaLineas esPeriodoActual={esPeriodoActual} />
            </>
          )}
        </div>

        {/* Gráfica 2: Avance por Canal */}
        <div className="card col-span-10 xl:col-span-3">
          <h2 className="font-semibold text-slate-700 text-sm mb-1">Avance por Canal</h2>
          <p className="text-[11px] text-slate-400 mb-4">
            {regional} &middot; {MESES[mes]} {anho}
          </p>

          {loading ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-xs">Cargando...</div>
          ) : canales.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-xs">Sin datos</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart layout="vertical" data={canales} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtM} />
                  <YAxis dataKey="canal" type="category" tick={{ fontSize: 10, fontWeight: 700 }} width={80} />
                  <Tooltip content={<TooltipPresAvance />} />
                  <Bar dataKey="avance" name="Avance" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={9} />
                  <Bar dataKey="presupuesto" name="Presupuesto" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={9} />
                </BarChart>
              </ResponsiveContainer>

              <table className="w-full text-xs mt-3 border-t border-slate-100 pt-2">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left py-1.5 font-semibold">Canal</th>
                    <th className="text-right py-1.5 font-semibold">Avance</th>
                    <th className="text-right py-1.5 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {canales.map((c) => (
                    <tr key={c.canal} className="border-t border-slate-50">
                      <td className="py-1 font-bold text-slate-700">{c.canal}</td>
                      <td className="py-1 text-right text-slate-600">{fmtM(c.avance)}</td>
                      <td
                        className={`py-1 text-right font-bold ${
                          c.porcentaje == null ? "text-slate-400" : c.porcentaje >= 100 ? "text-emerald-600" : c.porcentaje >= 80 ? "text-amber-500" : "text-red-500"
                        }`}
                      >
                        {fmtPct(c.porcentaje)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* ── Gráfica 3: Ventas por Categoría (100%) ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-slate-700">Ventas por Categoría — {regional}</h2>
          <span className="text-xs text-slate-400">
            {MESES[mes]} {anho}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Presupuesto vs Avance en Bs.</p>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
        ) : categorias.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <div className="xl:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart layout="vertical" data={categorias} margin={{ top: 4, right: 60, left: 16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtM} />
                  <YAxis dataKey="categoria" type="category" tick={{ fontSize: 11, fontWeight: 700 }} width={130} />
                  <Tooltip content={<TooltipPresAvance />} />
                  <Bar
                    dataKey="avance"
                    name="Avance"
                    fill="#3b82f6"
                    radius={[0, 3, 3, 0]}
                    barSize={10}
                    label={{
                      position: "right",
                      fontSize: 10,
                      fill: "#64748b",
                      formatter: ((_v: unknown, _e: unknown, index: number) => {
                        const row = categorias[index];
                        return row ? fmtPct(row.porcentaje) : "";
                      }) as any,
                    }}
                  />
                  <Bar dataKey="presupuesto" name="Presupuesto" fill="#22c55e" radius={[0, 3, 3, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="xl:col-span-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs border-b border-slate-100">
                    <th className="text-left py-2 font-semibold">Categoría</th>
                    <th className="text-right py-2 font-semibold">Presup.</th>
                    <th className="text-right py-2 font-semibold">Avance</th>
                    <th className="text-right py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((cat) => (
                    <tr key={cat.categoria} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-2 font-bold text-slate-700 text-xs">{cat.categoria}</td>
                      <td className="py-2 text-right text-slate-400 text-xs">{fmtM(cat.presupuesto)}</td>
                      <td className="py-2 text-right font-semibold text-slate-800 text-xs">{fmtM(cat.avance)}</td>
                      <td
                        className={`py-2 text-right font-bold text-xs ${
                          cat.porcentaje == null ? "text-slate-400" : cat.porcentaje >= 100 ? "text-emerald-600" : cat.porcentaje >= 80 ? "text-amber-500" : "text-red-500"
                        }`}
                      >
                        {fmtPct(cat.porcentaje)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
