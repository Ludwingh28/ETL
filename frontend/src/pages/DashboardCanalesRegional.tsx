import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from "react";
import { DollarSign, ShoppingCart, Store, Building2, Wine, Truck, RefreshCw, UtensilsCrossed, BarChart2, Globe, Layers, Package, AlertCircle, Search } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface CanalKpiItem {
  nombre: string;
  avance: number;
  objetivo: number;
}

interface KpisData {
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

interface CategoriaRow {
  categoria: string;
  avance: number;
  presupuesto: number;
  porcentaje: number | null;
}

interface SkuRow {
  codigo: string;
  producto: string;
  categoria: string;
  subgrupo: string;
  cantidad: number;
  venta_neta: number;
  clientes: number;
  presupuesto: number;
  porcentaje: number | null;
}

type Regional = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";
const REGIONALES: Regional[] = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];

const CATEGORIAS = ["Alimentos", "Apego", "Licores", "Home & Personal Care"] as const;
type Categoria = (typeof CATEGORIAS)[number];

function toRegionalKey(r: Regional): string {
  const map: Record<Regional, string> = {
    Nacional: "nacional",
    "Santa Cruz": "santa_cruz",
    Cochabamba: "cochabamba",
    "La Paz": "la_paz",
  };
  return map[r];
}

// ─── Config visual ─────────────────────────────────────────────────────────────

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface Periodo { anho: number; mes_numero: number; }
const CUR  = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const NUM  = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmt  = (n: number | null | undefined) => (n != null ? CUR.format(Math.round(n)) : "—");
// fmtN: número con puntos de miles  → 812.481
const fmtN = (n: number | null | undefined) => (n != null ? NUM.format(Math.round(n)) : "—");
// fmtAbbr: abreviado para ejes de gráficas → 812K / 2.1M
const fmtAbbr = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return NUM.format(n);
};
const fmtPct = (n: number | null | undefined) => (n != null ? `${n.toFixed(1)}%` : "—");

function iconForCanal(nombre: string): { icon: LucideIcon; color: string; bg: string } {
  const n = nombre.toUpperCase();
  if (n.startsWith("WHS-LIC")) return { icon: Wine, color: "text-rose-600", bg: "bg-rose-50" };
  if (n.startsWith("WHS")) return { icon: Store, color: "text-indigo-600", bg: "bg-indigo-50" };
  if (n.startsWith("DTS")) return { icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50" };
  if (n === "CODIS") return { icon: Layers, color: "text-violet-600", bg: "bg-violet-50" };
  if (n === "HORECA") return { icon: UtensilsCrossed, color: "text-amber-600", bg: "bg-amber-50" };
  if (n === "SPM") return { icon: Building2, color: "text-teal-600", bg: "bg-teal-50" };
  if (n === "CORP") return { icon: BarChart2, color: "text-cyan-600", bg: "bg-cyan-50" };
  if (n === "ECOM") return { icon: Globe, color: "text-emerald-600", bg: "bg-emerald-50" };
  if (n === "PROV") return { icon: Truck, color: "text-orange-600", bg: "bg-orange-50" };
  return { icon: BarChart2, color: "text-slate-600", bg: "bg-slate-100" };
}

const REGIONAL_CONFIG: Record<Regional, { color: string; bg: string; badge: string }> = {
  Nacional:     { color: "text-brand-600",   bg: "bg-brand-50",   badge: "bg-brand-100 text-brand-700 border-brand-200" },
  "Santa Cruz": { color: "text-emerald-600", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba:   { color: "text-violet-600",  bg: "bg-violet-50",  badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz":     { color: "text-amber-600",   bg: "bg-amber-50",   badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

const CAT_CONFIG: Record<Categoria, { color: string; bg: string; active: string }> = {
  Alimentos:            { color: "text-green-700", bg: "bg-green-50", active: "bg-green-500  text-white" },
  Apego:                { color: "text-pink-700",  bg: "bg-pink-50",  active: "bg-pink-500   text-white" },
  Licores:              { color: "text-rose-700",  bg: "bg-rose-50",  active: "bg-rose-500   text-white" },
  "Home & Personal Care": { color: "text-sky-700", bg: "bg-sky-50",   active: "bg-sky-500    text-white" },
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────────

function CanalCard({ nombre, avance, objetivo, selected, onClick }: { nombre: string; avance: number; objetivo: number; selected: boolean; onClick: () => void }) {
  const { icon: Icon, color, bg } = iconForCanal(nombre);
  const gap = Math.round(avance - objetivo);
  const pct = objetivo > 0 ? (avance / objetivo) * 100 : null;

  return (
    <button
      onClick={onClick}
      className={`
        kpi-card gap-0 text-left w-full transition-all duration-200 cursor-pointer
        hover:shadow-md hover:-translate-y-0.5
        ${selected ? "ring-2 ring-brand-500 shadow-md bg-brand-50/40 -translate-y-0.5" : "ring-1 ring-slate-200 hover:ring-brand-300"}
      `}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg shrink-0 ${selected ? "bg-brand-100" : bg}`}>
          <Icon size={14} className={selected ? "text-brand-600" : color} />
        </div>
        <span className={`text-sm font-semibold leading-tight ${selected ? "text-brand-700" : "text-slate-700"}`}>{nombre}</span>
        {selected && <span className="ml-auto text-[9px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">✓</span>}
      </div>

      <p className={`text-xl font-bold leading-tight ${selected ? "text-brand-800" : "text-slate-800"}`}>{fmt(avance)}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">/ {fmt(objetivo)}</p>

      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className={`text-[11px] font-bold flex items-center gap-0.5 ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {gap >= 0 ? "▲" : "▼"} {gap >= 0 ? "+" : ""}
          {fmtN(gap)}
        </span>
        {pct != null && <span className={`text-[11px] font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"}`}>{pct.toFixed(1)}%</span>}
      </div>
    </button>
  );
}

function TotalCard({ regional, avance, objetivo, selected, onClick }: { regional: Regional; avance: number; objetivo: number; selected: boolean; onClick: () => void }) {
  const cfg = REGIONAL_CONFIG[regional];
  const gap = Math.round(avance - objetivo);
  const pct = objetivo > 0 ? (avance / objetivo) * 100 : null;

  return (
    <button
      onClick={onClick}
      className={`
        kpi-card w-full text-left flex flex-row items-center justify-between gap-6
        transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5
        ${selected ? "ring-2 ring-brand-500 shadow-md bg-brand-50/40" : "ring-1 ring-slate-200 hover:ring-brand-300"}
      `}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl shrink-0 ${selected ? "bg-brand-100" : cfg.bg}`}>
          <DollarSign size={18} className={selected ? "text-brand-600" : cfg.color} />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-2">
            Total {regional}
            {selected && <span className="text-[9px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-bold">VIENDO TOTAL</span>}
          </p>
          <p className="text-2xl font-bold text-slate-800">{fmt(avance)}</p>
          <p className="text-xs text-slate-400 mt-0.5">/ {fmt(objetivo)}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {pct != null && <span className={`text-xl font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"}`}>{pct.toFixed(1)}%</span>}
        <span className={`text-xs font-semibold flex items-center gap-1 ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {gap >= 0 ? "▲" : "▼"} {gap >= 0 ? "+" : ""}
          {fmt(gap)}
        </span>
      </div>
    </button>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

type TooltipPayload = { dataKey?: string; name?: string; value?: number; color?: string };
interface CustomTooltipProps { active?: boolean; payload?: TooltipPayload[]; label?: string | number }

function TooltipTendencia({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">Día {label as number}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{fmt(p.value as number)}</span>
        </div>
      ))}
    </div>
  );
}

function TooltipCat({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const avance = payload.find((p) => p.dataKey === "avance")?.value as number | undefined;
  const ppto   = payload.find((p) => p.dataKey === "presupuesto")?.value as number | undefined;
  const pct    = ppto && avance ? ((avance / ppto) * 100).toFixed(1) : null;
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

function LeyendaLineas({ esPeriodoActual }: { esPeriodoActual: boolean }) {
  return (
    <div className="flex flex-wrap gap-5 text-xs text-slate-500 pt-3 border-t border-slate-100 mt-3">
      <span className="flex items-center gap-2">
        <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#22c55e" strokeWidth="2" strokeDasharray="5 3" /></svg>
        Presupuesto
      </span>
      <span className="flex items-center gap-2">
        <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#3b82f6" strokeWidth="2.5" /></svg>
        Avance
      </span>
      {esPeriodoActual && (
        <span className="flex items-center gap-2">
          <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          Proyección
        </span>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardCanalesRegional() {
  const { apiFetch } = useAuth();
  const now = new Date();

  const [regional, setRegional] = useState<Regional>("Nacional");
  const [anho, setAnho]         = useState(now.getFullYear());
  const [mes, setMes]           = useState(now.getMonth() + 1);
  const [canal, setCanal]       = useState<string | null>(null);
  const [categoria, setCategoria] = useState<Categoria>("Alimentos");

  const [pptoDir, setPptoDir]           = useState<"desc" | "asc">("desc");
  const [selectedSkuCode, setSelectedSkuCode] = useState<string | null>(null);
  const [skuSearch, setSkuSearch]       = useState("");

  const [kpis, setKpis]             = useState<KpisData | null>(null);
  const [tendencia, setTendencia]   = useState<TendenciaDia[]>([]);
  const [esPeriodoActual, setEsPA]  = useState(false);
  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);
  const [skus, setSkus]             = useState<SkuRow[]>([]);

  const [loadingKpis, setLoadingKpis]   = useState(true);
  const [loadingTend, setLoadingTend]   = useState(true);
  const [loadingCat, setLoadingCat]     = useState(true);
  const [loadingSku, setLoadingSku]     = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then(r => { if (r.success) setPeriodos(r.data); })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rKey = toRegionalKey(regional);

  const sortedSkus = useMemo(() => {
    return [...skus].sort((a, b) =>
      pptoDir === "desc" ? b.presupuesto - a.presupuesto : a.presupuesto - b.presupuesto
    );
  }, [skus, pptoDir]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    if (!q) return sortedSkus;
    return sortedSkus.filter(
      (s) => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)
    );
  }, [sortedSkus, skuSearch]);

  // ── Fetch KPIs (cambia al cambiar regional/año/mes) ────────────────────────
  const fetchKpis = useCallback(async () => {
    setLoadingKpis(true);
    setError(null);
    try {
      const j = await apiFetch<{ success: boolean; error?: string; data: Array<{ canal: string; avance: number; presupuesto: number; fecha_corte?: string }> }>(
        `/dashboard/canales/kpis/?regional=${rKey}&anho=${anho}&mes=${mes}`
      );
      if (!j.success) throw new Error(j.error);
      const canales: CanalKpiItem[] = j.data.map((c) => ({
        nombre: c.canal,
        avance: c.avance,
        objetivo: c.presupuesto,
      }));
      const total     = canales.reduce((s, c) => s + c.avance, 0);
      const obj_total = canales.reduce((s, c) => s + c.objetivo, 0);
      const fecha_corte = j.data[0]?.fecha_corte ?? null;
      setKpis({ total, objetivo_total: obj_total, canales, fecha_corte: fecha_corte ?? null });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingKpis(false);
    }
  }, [apiFetch, rKey, anho, mes]);

  // ── Fetch Tendencia ────────────────────────────────────────────────────────
  const fetchTendencia = useCallback(async () => {
    setLoadingTend(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; data: TendenciaDia[]; es_periodo_actual: boolean }>(
        `/dashboard/canales/tendencia/?regional=${rKey}&anho=${anho}&mes=${mes}${canalParam}`
      );
      if (!j.success) throw new Error(j.error);
      setTendencia(j.data);
      setEsPA(j.es_periodo_actual);
    } catch {
      setTendencia([]);
    } finally {
      setLoadingTend(false);
    }
  }, [apiFetch, rKey, canal, anho, mes]);

  // ── Fetch Categorías ───────────────────────────────────────────────────────
  const fetchCategorias = useCallback(async () => {
    setLoadingCat(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; data: CategoriaRow[] }>(
        `/dashboard/canales/por-categoria/?regional=${rKey}&anho=${anho}&mes=${mes}${canalParam}`
      );
      if (!j.success) throw new Error(j.error);
      setCategorias(j.data);
    } catch {
      setCategorias([]);
    } finally {
      setLoadingCat(false);
    }
  }, [apiFetch, rKey, canal, anho, mes]);

  // ── Fetch SKUs ─────────────────────────────────────────────────────────────
  const fetchSkus = useCallback(async () => {
    setLoadingSku(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; data: SkuRow[] }>(
        `/dashboard/canales/por-sku/?regional=${rKey}&anho=${anho}&mes=${mes}&categoria=${encodeURIComponent(categoria)}${canalParam}`
      );
      if (!j.success) throw new Error(j.error);
      setSkus(j.data);
    } catch {
      setSkus([]);
    } finally {
      setLoadingSku(false);
    }
  }, [apiFetch, rKey, canal, categoria, anho, mes]);

  // Al cambiar regional: resetear canal
  useEffect(() => { setCanal(null); }, [regional]);
  // Al cambiar SKUs: resetear búsqueda y selección
  useEffect(() => { setSkuSearch(""); setSelectedSkuCode(null); }, [skus]);

  useEffect(() => { void fetchKpis(); }, [fetchKpis]);
  useEffect(() => { void fetchTendencia(); }, [fetchTendencia]);
  useEffect(() => { void fetchCategorias(); }, [fetchCategorias]);
  useEffect(() => { void fetchSkus(); }, [fetchSkus]);

  // ── Helpers UI ─────────────────────────────────────────────────────────────
  const cfg = REGIONAL_CONFIG[regional];
  const loading = loadingKpis || loadingTend || loadingCat || loadingSku;

  const canalItem  = kpis?.canales.find((c) => c.nombre === canal);
  const avanceActual = canal ? (canalItem?.avance ?? 0) : (kpis?.total ?? 0);
  const objActual    = canal ? (canalItem?.objetivo ?? 0) : (kpis?.objetivo_total ?? 0);
  const canalLabel   = canal ?? `Total ${regional}`;

  const fechaCorte = kpis?.fecha_corte
    ? new Date(kpis.fecha_corte + "T00:00:00").toLocaleDateString("es-BO", { year: "numeric", month: "2-digit", day: "2-digit" })
    : `${anho}/${String(mes).padStart(2, "0")}/??`;

  const anhos = [...new Set(periodos.map(p => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter(p => p.anho === anho);

  return (
    <DashboardLayout>
      {/* ── Header + Segmentadores ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Canales / Regional</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Detalle por canal y SKU hasta el&nbsp;
            <span className="font-semibold text-slate-700">{fechaCorte}</span>
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {/* Selector Regional */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
            <div className="flex gap-1.5 flex-wrap">
              {REGIONALES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegional(r)}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                    regional === r
                      ? `${REGIONAL_CONFIG[r].badge} shadow-sm`
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
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
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))}
              disabled={loading}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-60"
            >
              {anhos.length > 0 ? anhos.map(a => <option key={a} value={a}>{a}</option>) : [2026, 2025, 2024].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select
              value={mes}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))}
              disabled={loading}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-60"
            >
              {mesesDisponibles.length > 0 ? mesesDisponibles.map(p => <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>) : MESES.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>

          <button
            onClick={() => setCanal(null)}
            disabled={canal === null}
            className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-30"
          >
            <RefreshCw size={13} />
            Limpiar selección
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Hint interactividad ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-2.5 mb-4 text-xs">
        <BarChart2 size={14} className="shrink-0" />
        <span>
          Haz clic en cualquier card para ver el detalle de ese canal.
          {canal ? <> Viendo: <strong>{canal}</strong>.</> : " Actualmente mostrando el total."}
        </span>
      </div>

      {/* ── Card Total ─────────────────────────────────────────────────────── */}
      <div className="mb-3">
        {loadingKpis ? (
          <div className="kpi-card animate-pulse bg-slate-50 h-20" />
        ) : (
          <TotalCard
            regional={regional}
            avance={avanceActual}
            objetivo={objActual}
            selected={canal === null}
            onClick={() => setCanal(null)}
          />
        )}
      </div>

      {/* ── Canal cards (grid uniforme) ────────────────────────────────────── */}
      {loadingKpis ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kpi-card animate-pulse bg-slate-50 h-28" />
          ))}
        </div>
      ) : (
        kpis && kpis.canales.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {kpis.canales.map((c) => (
              <CanalCard
                key={c.nombre}
                nombre={c.nombre}
                avance={c.avance}
                objetivo={c.objetivo}
                selected={canal === c.nombre}
                onClick={() => setCanal((prev) => (prev === c.nombre ? null : c.nombre))}
              />
            ))}
          </div>
        )
      )}

      {/* ── Gráficas 1 + 2 ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-10 gap-4 mb-4">
        {/* Tendencia */}
        <div className="card col-span-10 xl:col-span-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-700">
                Tendencia — <span className={cfg.color}>{canalLabel}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{MESES[mes]} {anho}</p>
            </div>
            {canal && <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${cfg.badge}`}>{canal}</span>}
          </div>

          {loadingTend ? (
            <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={tendencia} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={3} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtAbbr} width={56} />
                <Tooltip content={<TooltipTendencia />} />
                <Line dataKey="presupuesto_acumulado" name="Presupuesto" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                <Line dataKey="avance_acumulado" name="Avance" stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls />
                <Line dataKey="proyeccion_acumulada" name="Proyección" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
          <LeyendaLineas esPeriodoActual={esPeriodoActual} />
        </div>

        {/* Ventas por Categoría */}
        <div className="card col-span-10 xl:col-span-4">
          <h2 className="font-semibold text-slate-700 text-sm mb-1">Ventas por Categoría</h2>
          <p className="text-[11px] text-slate-400 mb-4">{canalLabel} · {MESES[mes]} {anho}</p>

          {loadingCat ? (
            <div className="h-48 bg-slate-50 animate-pulse rounded-xl mb-3" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart layout="vertical" data={categorias} margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                <YAxis dataKey="categoria" type="category" tick={{ fontSize: 10, fontWeight: 700 }} width={100} />
                <Tooltip content={<TooltipCat />} />
                <Bar
                  dataKey="avance"
                  name="Avance"
                  fill="#3b82f6"
                  radius={[0, 3, 3, 0]}
                  barSize={9}
                  label={{ position: "right", fontSize: 10, fill: "#64748b", formatter: ((_v: unknown, _e: unknown, idx: number) => fmtPct(categorias[idx]?.porcentaje)) as any }}
                />
                <Bar dataKey="presupuesto" name="Presupuesto" fill="#22c55e" radius={[0, 3, 3, 0]} barSize={9} />
              </BarChart>
            </ResponsiveContainer>
          )}

          <table className="w-full text-xs mt-3 border-t border-slate-100 pt-2">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left py-1.5 font-semibold">Categoría</th>
                <th className="text-right py-1.5 font-semibold">Avance</th>
                <th className="text-right py-1.5 font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.categoria} className="border-t border-slate-50">
                  <td className="py-1 font-semibold text-slate-700">{c.categoria}</td>
                  <td className="py-1 text-right text-slate-600">{fmtN(c.avance)}</td>
                  <td className={`py-1 text-right font-bold ${
                    c.porcentaje == null ? "text-slate-400" : c.porcentaje >= 100 ? "text-emerald-600" : c.porcentaje >= 80 ? "text-amber-500" : "text-red-500"
                  }`}>
                    {fmtPct(c.porcentaje)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SKUs por categoría ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-semibold text-slate-700">
              SKUs por Categoría — <span className={cfg.color}>{canalLabel}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{MESES[mes]} {anho}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Categoría</label>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIAS.map((cat) => {
                const cc = CAT_CONFIG[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoria(cat)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      categoria === cat ? `${cc.active} border-transparent shadow-sm` : `${cc.color} ${cc.bg} border-transparent hover:opacity-80`
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Botón ordenar por presupuesto */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Ordenar</label>
            <button
              onClick={() => setPptoDir((d) => d === "desc" ? "asc" : "desc")}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600 transition-all flex items-center gap-1.5"
            >
              Presupuesto {pptoDir === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          {/* Barra horizontal SKUs — con scroll */}
          <div className="xl:col-span-3">
            {loadingSku ? (
              <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />
            ) : (
              <div className="overflow-y-auto rounded-xl border border-slate-100" style={{ maxHeight: 560 }}>
                <div style={{ height: Math.max(filteredSkus.length * 36 + 20, 100) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={filteredSkus} margin={{ top: 4, right: 64, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                      <YAxis dataKey="codigo" type="category" tick={{ fontSize: 9, fontWeight: 700, fill: "#64748b" }} width={70} />
                      <Tooltip
                        content={(props: any) => {
                          if (!props.active || !props.payload?.length) return null;
                          const row = filteredSkus.find((s) => s.codigo === props.payload[0]?.payload?.codigo);
                          if (!row) return null;
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm max-w-72">
                              <p className="font-bold text-slate-800 mb-0.5">{row.codigo}</p>
                              <p className="text-slate-500 text-xs mb-2 leading-tight">{row.producto}</p>
                              <div className="flex gap-3 flex-wrap">
                                <div>
                                  <p className="text-[10px] text-slate-400">Venta Neta</p>
                                  <p className="font-semibold text-blue-600">{fmt(row.venta_neta)}</p>
                                </div>
                                {row.presupuesto > 0 && (
                                  <div>
                                    <p className="text-[10px] text-slate-400">Presupuesto</p>
                                    <p className="font-semibold text-emerald-600">{fmt(row.presupuesto)}</p>
                                  </div>
                                )}
                                {row.porcentaje != null && (
                                  <div>
                                    <p className="text-[10px] text-slate-400">Cumpl.</p>
                                    <p className={`font-bold ${row.porcentaje >= 100 ? "text-emerald-600" : row.porcentaje >= 80 ? "text-amber-500" : "text-red-500"}`}>{row.porcentaje.toFixed(1)}%</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] text-slate-400">Unidades</p>
                                  <p className="font-semibold text-slate-700">{row.cantidad.toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="venta_neta"
                        name="Venta Neta"
                        radius={[0, 3, 3, 0]}
                        barSize={10}
                        label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((v: number) => fmtN(v)) as any }}
                      >
                        {filteredSkus.map((entry) => (
                          <Cell key={entry.codigo} fill={entry.codigo === selectedSkuCode ? "#1d4ed8" : "#3b82f6"} />
                        ))}
                      </Bar>
                      <Bar dataKey="presupuesto" name="Presupuesto" radius={[0, 3, 3, 0]} barSize={10}>
                        {filteredSkus.map((entry) => (
                          <Cell key={entry.codigo} fill={entry.codigo === selectedSkuCode ? "#15803d" : "#22c55e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Tabla detalle SKU */}
          <div className="xl:col-span-2">
            {/* Cabecera tabla + buscador */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Package size={14} className={CAT_CONFIG[categoria].color} />
                <span className="text-xs font-bold text-slate-600">
                  {categoria} — {filteredSkus.length}{filteredSkus.length !== skus.length ? `/${skus.length}` : ""} SKUs
                </span>
              </div>
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Buscar producto o código…"
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300"
              />
            </div>
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pr-1" style={{ maxHeight: 560 }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                  <tr className="text-slate-400">
                    <th className="text-left py-2 font-semibold">Código</th>
                    <th className="text-left py-2 font-semibold">Producto</th>
                    <th className="text-right py-2 font-semibold">Venta Neta</th>
                    <th className="text-right py-2 font-semibold">Uds.</th>
                    <th className="text-right py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSkus.map((s) => {
                    const isSelected = s.codigo === selectedSkuCode;
                    return (
                      <tr
                        key={s.codigo}
                        onClick={() => setSelectedSkuCode((prev) => prev === s.codigo ? null : s.codigo)}
                        className={`border-b border-slate-50 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-brand-50 ring-1 ring-inset ring-brand-300"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className={`py-1.5 font-mono font-bold text-[10px] ${isSelected ? "text-brand-600" : "text-slate-500"}`}>{s.codigo}</td>
                        <td className={`py-1.5 max-w-32 truncate ${isSelected ? "text-brand-700 font-semibold" : "text-slate-700"}`} title={s.producto}>{s.producto}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-800">{fmtN(s.venta_neta)}</td>
                        <td className="py-1.5 text-right text-slate-500">{s.cantidad.toLocaleString()}</td>
                        <td className={`py-1.5 text-right font-bold ${
                          s.porcentaje == null ? "text-slate-300" : s.porcentaje >= 100 ? "text-emerald-600" : s.porcentaje >= 80 ? "text-amber-500" : "text-red-500"
                        }`}>{fmtPct(s.porcentaje)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
