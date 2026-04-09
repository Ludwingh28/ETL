import { useEffect, useState, type ChangeEvent } from "react";
import { TrendingUp, DollarSign, MapPin, RefreshCw, AlertCircle } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Presupuesto {
  total: number;
  santa_cruz: number;
  cochabamba: number;
  la_paz: number;
}

interface KpisData {
  total_nacional: number;
  santa_cruz: number;
  cochabamba: number;
  la_paz: number;
  fecha_corte: string | null;
  presupuesto: Presupuesto;
}

interface TendenciaDia {
  dia: number;
  avance_acumulado: number | null;
  presupuesto_acumulado: number | null;
  proyeccion_acumulada: number | null;
}

interface RegionalRow {
  regional: string;
  avance: number;
  presupuesto: number;
  porcentaje: number | null;
}

interface CanalRow {
  canal: string;
  avance: number;
  presupuesto: number;
  porcentaje: number | null;
}

interface CategoriaRow {
  categoria: string;
  venta_neta: number;
  cantidad: number;
  productos: number;
}

interface Periodo {
  anho: number;
  mes_numero: number;
  mes_nombre: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const USE_MOCK = false;

const MOCK_KPIS: KpisData = {
  total_nacional: 8_450_320,
  santa_cruz: 4_120_150,
  cochabamba: 2_380_090,
  la_paz: 1_950_080,
  fecha_corte: "2026-03-23",
  presupuesto: {
    total: 12_400_000,
    santa_cruz: 5_000_000,
    cochabamba: 3_000_000,
    la_paz: 2_500_000,
  },
};

const _buildTendencia = (): TendenciaDia[] => {
  const dias = 31;
  const hoy = 23;
  const pptoMes = 12_400_000;
  const pptoDaily = pptoMes / dias;
  const avanceAcum = [
    0, 350_000, 740_000, 1_100_000, 1_520_000, 1_890_000, 2_200_000, 2_600_000, 2_980_000, 3_310_000, 3_700_000, 3_960_000, 4_210_000, 4_580_000, 4_910_000, 5_300_000, 5_660_000, 5_980_000, 6_320_000,
    6_710_000, 7_050_000, 7_380_000, 7_890_000, 8_450_320,
  ];
  const tasa = avanceAcum[hoy]! / hoy;
  return Array.from({ length: dias }, (_, i) => {
    const dia = i + 1;
    return {
      dia,
      avance_acumulado: dia <= hoy ? (avanceAcum[dia] ?? null) : null,
      presupuesto_acumulado: Math.round(pptoDaily * dia),
      proyeccion_acumulada: dia > hoy ? Math.round(avanceAcum[hoy]! + tasa * (dia - hoy)) : null,
    };
  });
};
const MOCK_TENDENCIA = _buildTendencia();

const MOCK_REGIONALES: RegionalRow[] = [
  { regional: "Santa Cruz", avance: 4_120_150, presupuesto: 5_000_000, porcentaje: 82.4 },
  { regional: "Cochabamba", avance: 2_380_090, presupuesto: 3_000_000, porcentaje: 79.3 },
  { regional: "La Paz", avance: 1_950_080, presupuesto: 2_500_000, porcentaje: 78.0 },
];

const MOCK_CANALES: CanalRow[] = [
  // DTS unificado Nacional: DTS (SCZ) + DTS-LP (LPZ) + DTS-EA (LPZ)
  { canal: "DTS", avance: 2_620_000, presupuesto: 3_120_000, porcentaje: 84.0 },
  // WHS unificado Nacional: WHS (SCZ+CBB) + WHS-LP (LPZ) + WHS-EA (LPZ) — sin WHS-LICORES
  { canal: "WHS", avance: 1_580_000, presupuesto: 1_900_000, porcentaje: 83.2 },
  { canal: "HORECA", avance: 850_000, presupuesto: 1_020_000, porcentaje: 83.3 },
  { canal: "SPM", avance: 670_000, presupuesto: 800_000, porcentaje: 83.8 },
  { canal: "CORP", avance: 410_000, presupuesto: 480_000, porcentaje: 85.4 },
  { canal: "ECOM", avance: 150_000, presupuesto: 180_000, porcentaje: 83.3 },
  { canal: "WHS-LICORES", avance: 670_170, presupuesto: 630_000, porcentaje: 106.4 },
  { canal: "PROV", avance: 1_020_150, presupuesto: 1_190_000, porcentaje: 85.7 },
  { canal: "CODIS", avance: 480_000, presupuesto: 550_000, porcentaje: 87.3 },
];

const MOCK_CATEGORIAS: CategoriaRow[] = [
  { categoria: "Alimentos", venta_neta: 3_750_000, cantidad: 12_000, productos: 45 },
  { categoria: "Apego", venta_neta: 2_020_170, cantidad: 8_500, productos: 30 },
  { categoria: "Licores", venta_neta: 1_520_150, cantidad: 4_200, productos: 22 },
  { categoria: "Home & Personal Care", venta_neta: 1_160_000, cantidad: 6_800, productos: 18 },
];

// ─── Formatters ──────────────────────────────────────────────────────────────

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const CUR = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const fmt = (n: number | null | undefined) => (n != null ? CUR.format(n) : "—");
const fmtM = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
const fmtPct = (n: number | null | undefined) => (n != null ? `${n.toFixed(1)}%` : "—");

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ title, avance, objetivo, icon: Icon, color, iconBg }: { title: string; avance: number | undefined; objetivo: number; icon: LucideIcon; color: string; iconBg: string }) {
  const gap = objetivo > 0 && avance != null ? avance - objetivo : null;
  const gapPos = gap != null && gap >= 0;
  const gapColor = gap == null ? "text-slate-300" : gapPos ? "text-emerald-600" : "text-red-500";

  return (
    <div className="kpi-card gap-0">
      {/* Icon + Nombre */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>
          <Icon size={15} className={color} />
        </div>
        <span className="text-sm font-semibold text-slate-700 leading-tight">{title}</span>
      </div>

      {/* Avance / Objetivo */}
      <p className="text-2xl font-bold text-slate-800 leading-tight">{fmt(avance)}</p>
      <p className="text-xs text-slate-400 mt-0.5">{objetivo > 0 ? `/ ${fmt(objetivo)}` : ""}</p>

      {/* GAP */}
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

// ─── Tooltips ────────────────────────────────────────────────────────────────

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardNacional() {
  const { apiFetch } = useAuth();
  const now = new Date();

  const [anho, setAnho] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [kpis, setKpis] = useState<KpisData | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaDia[]>([]);
  const [regionales, setRegionales] = useState<RegionalRow[]>([]);
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
    const qs = `?anho=${anho}&mes=${mes}`;
    try {
      const [k, t, r, c, cat] = await Promise.all([
        apiFetch<{ success: boolean; data: KpisData }>(`/dashboard/nacional/kpis/${qs}`),
        apiFetch<{ success: boolean; data: TendenciaDia[]; es_periodo_actual: boolean }>(`/dashboard/nacional/tendencia/${qs}`),
        apiFetch<{ success: boolean; data: RegionalRow[] }>(`/dashboard/nacional/por-regional/${qs}`),
        apiFetch<{ success: boolean; data: CanalRow[] }>(`/dashboard/nacional/por-canal/${qs}`),
        apiFetch<{ success: boolean; data: CategoriaRow[] }>(`/dashboard/nacional/por-categoria/${qs}`),
      ]);
      if (k.success) setKpis(k.data);
      if (t.success) {
        setTendencia(t.data);
        setEsPeriodoActual(t.es_periodo_actual);
      }
      if (r.success) setRegionales(r.data);
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
  }, [anho, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechaCorte = kpis?.fecha_corte
    ? new Date(kpis.fecha_corte + "T00:00:00").toLocaleDateString("es-BO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : `${anho}/${String(mes).padStart(2, "0")}/??`;

  const anhos = [...new Set(periodos.map((p) => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter((p) => p.anho === anho);

  return (
    <DashboardLayout>
      {/* ── Header + Segmentadores ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ventas Nacionales</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Resumen General de Ventas del Mes hasta la fecha&nbsp;
            <span className="font-semibold text-slate-700">{fechaCorte}</span>
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
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

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard title="Total Ventas" avance={kpis?.total_nacional} objetivo={kpis?.presupuesto.total ?? 0} icon={DollarSign} color="text-blue-600" iconBg="bg-blue-50" />
        <KpiCard title="Santa Cruz" avance={kpis?.santa_cruz} objetivo={kpis?.presupuesto.santa_cruz ?? 0} icon={MapPin} color="text-emerald-600" iconBg="bg-emerald-50" />
        <KpiCard title="Cochabamba" avance={kpis?.cochabamba} objetivo={kpis?.presupuesto.cochabamba ?? 0} icon={MapPin} color="text-violet-600" iconBg="bg-violet-50" />
        <KpiCard title="La Paz" avance={kpis?.la_paz} objetivo={kpis?.presupuesto.la_paz ?? 0} icon={MapPin} color="text-amber-600" iconBg="bg-amber-50" />
      </div>

      {/* ── Fila 1: Gráfica 1 (70%) + Gráfica 2 (30%) ── */}
      <div className="grid grid-cols-10 gap-4 mb-4">
        {/* Gráfica 1: Tendencia (70%) */}
        <div className="card col-span-10 xl:col-span-7">
          <h2 className="font-semibold text-slate-700 mb-4">
            Tendencia de Ventas — {MESES[mes]} {anho}
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

        {/* Gráfica 2: Por Regional en barras horizontales (30%) */}
        {/* Orden de barras: presupuesto abajo → se declara último */}
        <div className="card col-span-10 xl:col-span-3">
          <h2 className="font-semibold text-slate-700 text-sm mb-1">Por Regional</h2>
          <p className="text-[11px] text-slate-400 mb-4">
            {MESES[mes]} {anho}
          </p>

          {loading ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-xs">Cargando...</div>
          ) : regionales.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-slate-400 text-xs">Sin datos</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart layout="vertical" data={regionales} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtM} />
                  <YAxis dataKey="regional" type="category" tick={{ fontSize: 10, fontWeight: 600 }} width={68} tickFormatter={(r) => r as string} />
                  <Tooltip content={<TooltipPresAvance />} />
                  {/* Avance arriba → declarado primero */}
                  <Bar dataKey="avance" name="Avance" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={12} />
                  {/* Presupuesto abajo → declarado segundo */}
                  <Bar dataKey="presupuesto" name="Presupuesto" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>

              {/* Tabla resumen */}
              <table className="w-full text-xs mt-3 border-t border-slate-100 pt-2">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left py-1.5 font-semibold">Regional</th>
                    <th className="text-right py-1.5 font-semibold">Avance</th>
                    <th className="text-right py-1.5 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {regionales.map((r) => (
                    <tr key={r.regional} className="border-t border-slate-50">
                      <td className="py-1.5 font-medium text-slate-700">{r.regional}</td>
                      <td className="py-1.5 text-right text-slate-600">{fmtM(r.avance)}</td>
                      <td
                        className={`py-1.5 text-right font-bold ${
                          r.porcentaje == null ? "text-slate-400" : r.porcentaje >= 100 ? "text-emerald-600" : r.porcentaje >= 80 ? "text-amber-500" : "text-red-500"
                        }`}
                      >
                        {fmtPct(r.porcentaje)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* ── Gráfica 3: Por Canal Nacional ── */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-slate-700">Ventas por Canal — Nacional</h2>
          <span className="text-xs text-slate-400">
            {MESES[mes]} {anho}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Presupuesto vs Avance en Bs.</p>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
        ) : canales.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <div className="xl:col-span-2">
              {/* Altura dinámica: 40px por canal para que entren cómodamente todas las barras */}
              <ResponsiveContainer width="100%" height={Math.max(300, canales.length * 40)}>
                <BarChart layout="vertical" data={canales} margin={{ top: 4, right: 64, left: 16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtM} />
                  <YAxis dataKey="canal" type="category" tick={{ fontSize: 11, fontWeight: 700 }} width={78} />
                  <Tooltip content={<TooltipPresAvance />} />
                  <Bar
                    dataKey="avance"
                    name="Avance"
                    fill="#3b82f6"
                    radius={[0, 3, 3, 0]}
                    barSize={9}
                    label={{
                      position: "right",
                      fontSize: 10,
                      fill: "#64748b",
                      formatter: ((_v: unknown, _e: unknown, index: number) => {
                        const row = canales[index];
                        return row ? fmtPct(row.porcentaje) : "";
                      }) as any,
                    }}
                  />
                  <Bar dataKey="presupuesto" name="Presupuesto" fill="#22c55e" radius={[0, 3, 3, 0]} barSize={9} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="xl:col-span-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs border-b border-slate-100">
                    <th className="text-left py-2 font-semibold">Canal</th>
                    <th className="text-right py-2 font-semibold">Presup.</th>
                    <th className="text-right py-2 font-semibold">Avance</th>
                    <th className="text-right py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {canales.map((c) => (
                    <tr key={c.canal} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-1.5 font-bold text-slate-700 text-xs">{c.canal}</td>
                      <td className="py-1.5 text-right text-slate-400 text-xs">{fmtM(c.presupuesto)}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-800 text-xs">{fmtM(c.avance)}</td>
                      <td
                        className={`py-1.5 text-right font-bold text-xs ${
                          c.porcentaje == null ? "text-slate-400" : c.porcentaje >= 100 ? "text-emerald-600" : c.porcentaje >= 80 ? "text-amber-500" : "text-red-500"
                        }`}
                      >
                        {fmtPct(c.porcentaje)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Gráfica 4: Ventas por Categoría — Nacional ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-slate-700">Ventas por Categoría — Nacional</h2>
          <span className="text-xs text-slate-400">
            {MESES[mes]} {anho}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Presupuesto vs Venta Neta en Bs.</p>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
        ) : categorias.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <div className="xl:col-span-2">
              {/* Altura dinámica: 40px por categoría para que entren cómodamente todas las barras */}
              <ResponsiveContainer width="100%" height={Math.max(300, categorias.length * 40)}>
                <BarChart layout="vertical" data={categorias} margin={{ top: 4, right: 64, left: 16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtM} />
                  <YAxis dataKey="categoria" type="category" tick={{ fontSize: 11, fontWeight: 700 }} width={130} />
                  <Tooltip content={<TooltipPresAvance />} />
                  <Bar
                    dataKey="venta_neta"
                    name="Venta Neta"
                    fill="#6366f1"
                    radius={[0, 3, 3, 0]}
                    barSize={9}
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
                  <Bar dataKey="presupuesto" name="Presupuesto" fill="#22c55e" radius={[0, 3, 3, 0]} barSize={9} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="xl:col-span-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs border-b border-slate-100">
                    <th className="text-left py-2 font-semibold">Categoría</th>
                    <th className="text-right py-2 font-semibold">Presup.</th>
                    <th className="text-right py-2 font-semibold">Venta</th>
                    <th className="text-right py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((cat) => (
                    <tr key={cat.categoria} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-1.5 font-bold text-slate-700 text-xs">{cat.categoria}</td>
                      <td className="py-1.5 text-right text-slate-400 text-xs">{fmtM(cat.presupuesto)}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-800 text-xs">{fmtM(cat.venta_neta)}</td>
                      <td
                        className={`py-1.5 text-right font-bold text-xs ${
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
