import {
  useEffect, useState, useCallback, useMemo, useRef,
  type ChangeEvent,
} from "react";
import {
  TrendingUp, RefreshCw, AlertCircle, FlaskConical,
  ChevronDown, Search, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { setActiveFilters } from "../utils/filterStore";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Periodo    { anho: number; mes_numero: number; }
interface NacPresupuesto { total: number; santa_cruz: number; cochabamba: number; la_paz: number; }
interface NacKpisData {
  total_nacional: number; santa_cruz: number; cochabamba: number; la_paz: number;
  cantidad_total: number; cantidad_santa_cruz: number; cantidad_cochabamba: number; cantidad_la_paz: number;
  cobertura_total: number; cobertura_santa_cruz: number; cobertura_cochabamba: number; cobertura_la_paz: number;
  fecha_corte: string | null; presupuesto: NacPresupuesto;
}
interface TendenciaDia { dia: number; avance_acumulado: number | null; presupuesto_acumulado: number | null; proyeccion_acumulada: number | null; }
interface CanalRow     { canal: string; avance: number; presupuesto: number; porcentaje: number | null; }
interface ComparacionRow {
  name: string; cantidad: number; venta_neta: number; ppto_bs: number; ppto_uds: number;
  pct_cumpl: number | null; gap_bs: number | null;
  cantidad_ant: number; venta_neta_ant: number;
  pct_camb_bs: number | null; pct_camb_uds: number | null;
}
interface SkuRow {
  codigo: string; producto: string; cantidad: number; venta_neta: number;
  presupuesto: number; presupuesto_uds: number; pct_cumpl: number | null; gap_pct: number | null;
  cantidad_ant: number; venta_neta_ant: number; pct_camb_bs: number | null; pct_camb_uds: number | null;
}

// ─── Config regional ──────────────────────────────────────────────────────────

type RegionalKey = "nacional" | "santa_cruz" | "cochabamba" | "la_paz";
type SortKey     = "presupuesto" | "cumplimiento" | "crecimiento";
type SortDir     = "desc" | "asc";

interface RegionalDef { key: RegionalKey; label: string; barColor: string; }
const REGIONALES: RegionalDef[] = [
  { key: "nacional",   label: "Nacional",   barColor: "#3b82f6" },
  { key: "santa_cruz", label: "Santa Cruz", barColor: "#10b981" },
  { key: "cochabamba", label: "Cochabamba", barColor: "#8b5cf6" },
  { key: "la_paz",     label: "La Paz",     barColor: "#f59e0b" },
];

const CATEGORIAS_OPTS = ["Alimentos", "Apego", "Licores", "Home & Personal Care", "Sin Clasificar"];
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const GROUP_BY_LABEL: Record<string, string> = {
  marca: "Marca", subgrupo: "Sub-categoría", proveedor: "Proveedor",
  categoria: "Categoría", total: "Total",
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const CUR    = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const NUM    = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmt    = (n: number | null | undefined) => n != null ? CUR.format(n) : "—";
const fmtN   = (n: number | null | undefined) => n != null ? NUM.format(Math.round(n)) : "—";
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : "—";
const fmtAbbr = (n: number) => {
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return NUM.format(n);
};
const pctColor = (p: number | null | undefined, invert = false) => {
  if (p == null) return "text-slate-300";
  const good = invert ? p <= 0 : p >= 0;
  return p >= (invert ? 0 : 100) || (!invert && p >= 100)
    ? "text-emerald-600"
    : p >= (invert ? -10 : 80)
      ? "text-amber-500"
      : "text-red-500";
};
const cumplColor = (p: number | null | undefined) =>
  p == null ? "text-slate-300" : p >= 100 ? "text-emerald-600" : p >= 80 ? "text-amber-500" : "text-red-500";
const deltaColor = (p: number | null | undefined) =>
  p == null ? "text-slate-300" : p > 0 ? "text-emerald-600" : p < 0 ? "text-red-500" : "text-slate-500";

function getVenta(key: RegionalKey, d: NacKpisData | null) {
  if (!d) return undefined;
  return key === "nacional" ? d.total_nacional : key === "santa_cruz" ? d.santa_cruz : key === "cochabamba" ? d.cochabamba : d.la_paz;
}
function getPpto(key: RegionalKey, d: NacKpisData | null): number {
  if (!d) return 0;
  return key === "nacional" ? d.presupuesto.total : key === "santa_cruz" ? d.presupuesto.santa_cruz : key === "cochabamba" ? d.presupuesto.cochabamba : d.presupuesto.la_paz;
}
function getCobertura(key: RegionalKey, d: NacKpisData | null): number | undefined {
  if (!d) return undefined;
  return key === "nacional" ? d.cobertura_total : key === "santa_cruz" ? d.cobertura_santa_cruz : key === "cochabamba" ? d.cobertura_cochabamba : d.cobertura_la_paz;
}
function getUnidades(key: RegionalKey, d: NacKpisData | null): number | undefined {
  if (!d) return undefined;
  return key === "nacional" ? d.cantidad_total : key === "santa_cruz" ? d.cantidad_santa_cruz : key === "cochabamba" ? d.cantidad_cochabamba : d.cantidad_la_paz;
}
function fmtFechaCorte(fc: string | null | undefined): string {
  if (!fc) return "—";
  const [y, m, day] = fc.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function buildQS(
  regional: string, canal: string, anho: number, mes: number,
  cats: string[], provs: string[], subs: string[], marcs: string[],
): string {
  const p = [
    `regional=${regional}`, `anho=${anho}`, `mes=${mes}`,
    ...(canal ? [`canal=${encodeURIComponent(canal)}`] : []),
    ...cats.map( c => `categoria=${encodeURIComponent(c)}`),
    ...provs.map(p => `proveedor=${encodeURIComponent(p)}`),
    ...subs.map( s => `subgrupo=${encodeURIComponent(s)}`),
    ...marcs.map(m => `marca=${encodeURIComponent(m)}`),
  ];
  return p.join("&");
}

// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({ label, value, options, onChange, placeholder = "Todos", searchable = false }: {
  label: string; value: string[]; options: string[];
  onChange: (v: string[]) => void; placeholder?: string; searchable?: boolean;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref     = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    if (searchable) setTimeout(() => inputRef.current?.focus(), 50);
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, searchable]);

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  const filtered = searchable && search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  const btnLabel =
    value.length === 0 ? placeholder
    : value.length === 1 ? value[0]
    : `${value.length} seleccionados`;

  const hasValue = value.length > 0;

  return (
    <div ref={ref} className="relative flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{label}</span>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={options.length === 0}
        className={`text-xs rounded-lg px-3 py-2 text-left flex items-center justify-between gap-2 min-w-36 transition-all border
          ${hasValue
            ? "border-brand-400 bg-brand-50 text-brand-700 font-semibold"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <span className="truncate max-w-36">{btnLabel}</span>
        <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && options.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1.5 min-w-full w-max max-w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col">
          {/* Buscador interno */}
          {searchable && (
            <div className="px-2.5 pt-2.5 pb-1.5 border-b border-slate-100">
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full text-xs pl-7 pr-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300"
                />
                {search && (
                  <button onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Lista de opciones */}
          <div className="overflow-y-auto max-h-60 py-1">
            {value.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 transition-colors border-b border-slate-100 mb-1">
                Limpiar selección ✕
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 px-3 py-2">Sin resultados</p>
            ) : (
              filtered.map((opt) => (
                <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={value.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-brand-600 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Regional Card ────────────────────────────────────────────────────────────

function RegionalCard({ def, nacKpis, loading, isSelected, onClick }: {
  def: RegionalDef; nacKpis: NacKpisData | null; loading: boolean;
  isSelected: boolean; onClick: () => void;
}) {
  const avance    = getVenta(def.key, nacKpis);
  const ppto      = getPpto(def.key, nacKpis);
  const cobertura = getCobertura(def.key, nacKpis);
  const unidades  = getUnidades(def.key, nacKpis);
  const pct       = ppto > 0 && avance != null ? (avance / ppto * 100) : null;
  const gap       = ppto > 0 && avance != null ? avance - ppto : null;

  return (
    <button onClick={onClick}
      className={`flex-1 min-w-0 text-left p-4 rounded-2xl border-2 transition-all cursor-pointer
        ${isSelected ? "bg-white border-slate-300 shadow-xl ring-2 ring-offset-1 ring-brand-400"
                     : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-md"}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-xs font-bold ${isSelected ? "text-slate-800" : "text-slate-500"}`}>{def.label}</span>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? def.barColor : "#e2e8f0" }} />
      </div>

      {loading ? <div className="h-6 bg-slate-100 animate-pulse rounded mb-1" /> : (
        <>
          <p className="text-xl font-bold text-slate-800 leading-tight tabular-nums">{fmt(avance)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{ppto > 0 ? `/ ${fmt(ppto)} ppto.` : ""}</p>
        </>
      )}

      <div className="flex items-center justify-between mt-2.5">
        <span className={`text-sm font-bold ${cumplColor(pct)}`}>{fmtPct(pct)}</span>
        {gap != null && (
          <span className={`text-[11px] font-semibold ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {gap >= 0 ? "+" : ""}{fmt(gap)}
          </span>
        )}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Cobertura</p>
          {loading ? <div className="h-4 bg-slate-100 animate-pulse rounded mt-0.5" /> : (
            <p className="text-sm font-bold text-slate-700 mt-0.5">{cobertura != null ? fmtN(cobertura) : "—"}</p>
          )}
          <p className="text-[10px] text-slate-400">clientes</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Unidades</p>
          {loading ? <div className="h-4 bg-slate-100 animate-pulse rounded mt-0.5" /> : (
            <p className="text-sm font-bold text-slate-700 mt-0.5">{unidades != null ? fmtN(unidades) : "—"}</p>
          )}
          <p className="text-[10px] text-slate-400">uds. vendidas</p>
        </div>
      </div>
    </button>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

type TPayload = { dataKey?: string; name?: string; value?: number; color?: string; };
interface TProps { active?: boolean; payload?: TPayload[]; label?: string | number; }

function TooltipTendencia({ active, payload, label }: TProps) {
  if (!active || !payload?.length) return null;
  const avance = payload.find((p) => p.dataKey === "avance_acumulado")?.value as number | null;
  const ppto   = payload.find((p) => p.dataKey === "presupuesto_acumulado")?.value as number | null;
  const proy   = payload.find((p) => p.dataKey === "proyeccion_acumulada")?.value as number | null;
  const pct    = avance != null && ppto != null && ppto > 0 ? (avance / ppto) * 100 : null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm min-w-50">
      <p className="font-semibold text-slate-700 mb-2">Día {label as number}</p>
      {avance != null && (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-500" />
          <span className="text-slate-500">Avance:</span>
          <span className="font-semibold ml-auto pl-4">{fmt(avance)}</span>
        </div>
      )}
      {ppto != null && (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
          <span className="text-slate-500">Presupuesto:</span>
          <span className="font-semibold ml-auto pl-4">{fmt(ppto)}</span>
        </div>
      )}
      {proy != null && (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-orange-500" />
          <span className="text-slate-500">Proyección:</span>
          <span className="font-semibold ml-auto pl-4">{fmt(proy)}</span>
        </div>
      )}
      {pct != null && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-xs flex justify-between">
          <span className="text-slate-400">Cumplimiento</span>
          <span className={`font-bold ${cumplColor(pct)}`}>{pct.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

function TooltipCanal({ active, payload, label }: TProps) {
  if (!active || !payload?.length) return null;
  const avance = payload.find((p) => p.dataKey === "avance")?.value as number | undefined;
  const ppto   = payload.find((p) => p.dataKey === "presupuesto")?.value as number | undefined;
  const pct    = ppto && avance ? (avance / ppto) * 100 : null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label as string}</p>
      {avance != null && <div className="flex gap-2 items-center mb-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" /><span className="text-slate-500">Avance:</span><span className="font-semibold">{fmt(avance)}</span></div>}
      {ppto != null && ppto > 0 && <div className="flex gap-2 items-center mb-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" /><span className="text-slate-500">Presupuesto:</span><span className="font-semibold">{fmt(ppto)}</span></div>}
      {pct != null && <div className="mt-2 pt-2 border-t border-slate-100 text-xs"><span className="text-slate-400">Cumplimiento: </span><span className={`font-bold ${cumplColor(pct)}`}>{pct.toFixed(1)}%</span></div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardNewNacional() {
  const { apiFetch } = useAuth();
  // Ref para que apiFetch nunca sea dep de useCallback (AuthProvider la recrea en cada render)
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => { apiFetchRef.current = apiFetch; }); // sin deps = se sincroniza cada render

  const now = new Date();

  const [periodos,   setPeriodos]   = useState<Periodo[]>([]);
  const [anho,       setAnho]       = useState(0);
  const [mes,        setMes]        = useState(0);
  const [selectedRegional, setSelectedRegional] = useState<RegionalKey>("nacional");
  const [canal,      setCanal]      = useState<string>("");

  // Multi-select filters
  const [fCats,  setFCats]  = useState<string[]>([]);
  const [fProvs, setFProvs] = useState<string[]>([]);
  const [fSubs,  setFSubs]  = useState<string[]>([]);
  const [fMarcs, setFMarcs] = useState<string[]>([]);

  // Dynamic options
  const [opProvs, setOpProvs] = useState<string[]>([]);
  const [opSubs,  setOpSubs]  = useState<string[]>([]);
  const [opMarcs, setOpMarcs] = useState<string[]>([]);

  // SKU table controls
  const [sortKey, setSortKey] = useState<SortKey>("presupuesto");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [skuSearch, setSkuSearch] = useState("");

  // Data
  const [nacKpis,         setNacKpis]         = useState<NacKpisData | null>(null);
  const [tendencia,       setTendencia]       = useState<TendenciaDia[]>([]);
  const [esPeriodoActual, setEsPeriodoActual] = useState(true);
  const [canales,         setCanales]         = useState<CanalRow[]>([]);
  const [comparacion,     setComparacion]     = useState<ComparacionRow[]>([]);
  const [groupBy,         setGroupBy]         = useState("total");
  const [prevLabel,       setPrevLabel]       = useState("");
  const [skus,            setSkus]            = useState<SkuRow[]>([]);
  const [prevSkuLabel,    setPrevSkuLabel]    = useState("");

  // Loading
  const [loadingNac,   setLoadingNac]   = useState(true);
  const [loadingCan,   setLoadingCan]   = useState(true);
  const [loadingComp,  setLoadingComp]  = useState(false);
  const [loadingSkus,  setLoadingSkus]  = useState(false);
  const [nacError,     setNacError]     = useState<string | null>(null);

  // Active filters store
  useEffect(() => {
    setActiveFilters({ anho, mes, regional: selectedRegional, canal, categorias: fCats, proveedores: fProvs });
  }, [anho, mes, selectedRegional, canal, fCats, fProvs]);

  // Cascading reset handlers
  function onCats(v: string[]) { setFCats(v); setFProvs([]); setFSubs([]); setFMarcs([]); }
  function onProvs(v: string[]) { setFProvs(v); setFSubs([]); setFMarcs([]); }
  function onSubs(v: string[])  { setFSubs(v);  setFMarcs([]); }
  function onMarcs(v: string[]) { setFMarcs(v); }

  const hasFilters = fCats.length > 0 || fProvs.length > 0 || fSubs.length > 0 || fMarcs.length > 0;

  // ── Periodos ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then((r) => {
        if (r.success && r.data.length > 0) {
          setPeriodos(r.data);
          setAnho(r.data[0].anho);
          setMes(r.data[0].mes_numero);
        }
      })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── KPIs nacionales ───────────────────────────────────────────────────────────
  const fetchNacKpis = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingNac(true); setNacError(null);
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs);
      const [k, t] = await Promise.all([
        apiFetch<{ success: boolean; data: NacKpisData }>(`/dashboard/nacional/kpis/?${qs}`),
        apiFetch<{ success: boolean; data: TendenciaDia[]; es_periodo_actual: boolean }>(`/dashboard/nacional/tendencia/?${qs}`),
      ]);
      if (k.success) setNacKpis(k.data);
      if (t.success) { setTendencia(t.data); setEsPeriodoActual(t.es_periodo_actual); }
    } catch (e) { setNacError(e instanceof Error ? e.message : "Error al cargar KPIs"); }
    finally { setLoadingNac(false); }
  }, [apiFetch, anho, mes, selectedRegional, canal, fCats, fProvs, fSubs, fMarcs]);

  useEffect(() => { void fetchNacKpis(); }, [fetchNacKpis]);

  // ── Canales ───────────────────────────────────────────────────────────────────
  const fetchCanales = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingCan(true);
    try {
      const j = await apiFetch<{ success: boolean; data: CanalRow[] }>(
        `/dashboard/canales/kpis/?regional=${selectedRegional}&anho=${anho}&mes=${mes}`
      );
      if (j.success) setCanales(j.data); else setCanales([]);
    } catch { setCanales([]); }
    finally { setLoadingCan(false); }
  }, [apiFetch, selectedRegional, anho, mes]);

  useEffect(() => { void fetchCanales(); }, [fetchCanales]);

  // ── Opciones en cascada ───────────────────────────────────────────────────────
  const fetchOpciones = useCallback(async () => {
    if (!anho || !mes) return;
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, []);
      const j = await apiFetchRef.current<{ success: boolean; proveedores: string[]; subgrupos: string[]; marcas: string[] }>(
        `/dashboard/new-nacional/opciones/?${qs}`
      );
      if (j.success) {
        setOpProvs(j.proveedores);
        setOpSubs(j.subgrupos);
        setOpMarcs(j.marcas);
      }
    } catch { /* silencioso */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegional, canal, fCats, fProvs, fSubs, anho, mes]);

  useEffect(() => { void fetchOpciones(); }, [fetchOpciones]);

  // ── Comparación ───────────────────────────────────────────────────────────────
  const fetchComparacion = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingComp(true);
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs);
      const j = await apiFetchRef.current<{ success: boolean; data: ComparacionRow[]; group_by: string; prev_anho: number; prev_mes: number }>(
        `/dashboard/new-nacional/comparacion/?${qs}`
      );
      if (j.success) {
        setComparacion(j.data);
        setGroupBy(j.group_by);
        setPrevLabel(`${MESES[j.prev_mes]} ${j.prev_anho}`);
      }
    } catch { setComparacion([]); }
    finally { setLoadingComp(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, anho, mes]);

  useEffect(() => { void fetchComparacion(); }, [fetchComparacion]);

  // ── SKUs ──────────────────────────────────────────────────────────────────────
  const fetchSkus = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingSkus(true); setSkuSearch("");
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs);
      const j = await apiFetchRef.current<{ success: boolean; data: SkuRow[]; prev_anho: number; prev_mes: number }>(
        `/dashboard/new-nacional/skus/?${qs}`
      );
      if (j.success) {
        setSkus(j.data);
        setPrevSkuLabel(`${MESES[j.prev_mes]} ${j.prev_anho}`);
      }
    } catch { setSkus([]); }
    finally { setLoadingSkus(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, anho, mes]);

  useEffect(() => { void fetchSkus(); }, [fetchSkus]);

  // ── Limpiar canal al cambiar regional ─────────────────────────────────────────
  useEffect(() => { setCanal(""); }, [selectedRegional]);

  // ── Derivados ─────────────────────────────────────────────────────────────────
  const canalList = useMemo(() => canales.map((c) => c.canal), [canales]);

  const sortedSkus = useMemo(() => {
    const sorted = [...skus].sort((a, b) => {
      let diff: number;
      if      (sortKey === "cumplimiento") diff = (b.pct_cumpl ?? -Infinity) - (a.pct_cumpl ?? -Infinity);
      else if (sortKey === "crecimiento")  diff = (b.pct_camb_bs ?? -Infinity) - (a.pct_camb_bs ?? -Infinity);
      else                                 diff = b.presupuesto - a.presupuesto;
      return sortDir === "desc" ? diff : -diff;
    });
    return sorted;
  }, [skus, sortKey, sortDir]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return q ? sortedSkus.filter((s) => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)) : sortedSkus;
  }, [sortedSkus, skuSearch]);

  const anhos = [...new Set(periodos.map((p) => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter((p) => p.anho === anho);

  const activeFilterChips = [
    ...fCats.map(v => ({ label: v, color: "bg-slate-100 text-slate-700", clear: () => onCats(fCats.filter(x => x !== v)) })),
    ...fProvs.map(v => ({ label: v, color: "bg-blue-50 text-blue-700", clear: () => onProvs(fProvs.filter(x => x !== v)) })),
    ...fSubs.map(v => ({ label: v, color: "bg-violet-50 text-violet-700", clear: () => onSubs(fSubs.filter(x => x !== v)) })),
    ...fMarcs.map(v => ({ label: v, color: "bg-emerald-50 text-emerald-700", clear: () => onMarcs(fMarcs.filter(x => x !== v)) })),
    ...(canal ? [{ label: `Canal: ${canal}`, color: "bg-amber-50 text-amber-700", clear: () => setCanal("") }] : []),
  ];

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-800">Ventas Nacional</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 border border-violet-200">
              <FlaskConical size={11} />Mock-up
            </span>
          </div>
          {nacKpis?.fecha_corte && (
            <p className="text-[11px] text-slate-400 font-medium">
              Datos al <span className="text-slate-600 font-semibold">{fmtFechaCorte(nacKpis.fecha_corte)}</span>
            </p>
          )}
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select value={anho} disabled={loadingNac}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50">
              {anhos.length > 0 ? anhos.map((a) => <option key={a} value={a}>{a}</option>) : <option value={now.getFullYear()}>{now.getFullYear()}</option>}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select value={mes} disabled={loadingNac}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50">
              {mesesDisponibles.length > 0
                ? mesesDisponibles.map((p) => <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>)
                : MESES.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <button
            onClick={() => { void fetchNacKpis(); void fetchCanales(); void fetchOpciones(); void fetchComparacion(); void fetchSkus(); }}
            disabled={loadingNac}
            className="btn-ghost flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} className={loadingNac ? "animate-spin" : ""} />Actualizar
          </button>
        </div>
      </div>

      {nacError && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm">
          <AlertCircle size={16} className="shrink-0" />{nacError}
        </div>
      )}

      {/* ── Panel de Filtros ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-4 mb-5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <MultiSelect label="Categoría"    value={fCats}  options={CATEGORIAS_OPTS} onChange={onCats} />
          <div className="w-px h-9 bg-slate-100 self-end hidden sm:block" />
          <MultiSelect label="Proveedor"    value={fProvs} options={opProvs} onChange={onProvs} searchable />
          <MultiSelect label="Sub-categoría" value={fSubs} options={opSubs}  onChange={onSubs}  />
          <MultiSelect label="Marca"        value={fMarcs} options={opMarcs} onChange={onMarcs} searchable />
          {hasFilters && (
            <button
              onClick={() => { onCats([]); }}
              className="self-end text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors px-2 py-2 rounded-lg hover:bg-red-50">
              Limpiar todo ✕
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
            {activeFilterChips.map(({ label, color, clear }, i) => (
              <button key={i} onClick={clear}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-transparent hover:opacity-80 transition-opacity ${color}`}>
                {label}
                <span className="opacity-60">✕</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 4 Regional Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {REGIONALES.map((def) => (
          <RegionalCard
            key={def.key} def={def} nacKpis={nacKpis} loading={loadingNac}
            isSelected={selectedRegional === def.key}
            onClick={() => setSelectedRegional(def.key)}
          />
        ))}
      </div>

      {/* ── Tendencia + Canal ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-10 gap-4 mb-5">

        {/* Tendencia */}
        <div className="card col-span-10 xl:col-span-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 text-sm">Tendencia de Ventas</h2>
            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">{REGIONALES.find(r => r.key === selectedRegional)?.label ?? "Nacional"} · {MESES[mes]} {anho}</span>
          </div>
          {loadingNac ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
          ) : tendencia.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
              <div className="text-center"><TrendingUp size={28} className="mx-auto mb-2 opacity-30" /><p>Sin datos</p></div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tendencia} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={3} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1_000_000).toFixed(1)}M`} width={48} />
                  <Tooltip content={<TooltipTendencia />} />
                  <Line dataKey="avance_acumulado" name="Avance" stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls />
                  {esPeriodoActual && <Line dataKey="proyeccion_acumulada" name="Proyección" stroke="#f97316" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />}
                  <Line dataKey="presupuesto_acumulado" name="Presupuesto" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-5 text-xs text-slate-400 pt-2 border-t border-slate-100 mt-2">
                <span className="flex items-center gap-2"><svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#22c55e" strokeWidth="2" strokeDasharray="5 3" /></svg>Presupuesto</span>
                <span className="flex items-center gap-2"><svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#3b82f6" strokeWidth="2.5" /></svg>Avance</span>
                {esPeriodoActual && <span className="flex items-center gap-2"><svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#f97316" strokeWidth="2" strokeDasharray="6 3" /></svg>Proyección</span>}
              </div>
            </>
          )}
        </div>

        {/* Canal */}
        <div className="card col-span-10 xl:col-span-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-700 text-sm">Por Canal</h2>
            <span className="text-[11px] text-slate-400">{REGIONALES.find(r => r.key === selectedRegional)?.label} · {MESES[mes]} {anho}</span>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">Clic en un canal para filtrar la tabla</p>
          {loadingCan ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-xs">Cargando...</div>
          ) : canales.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-xs">Sin datos</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(160, canales.length * 34)}>
                <BarChart layout="vertical" data={canales} margin={{ top: 2, right: 48, left: 4, bottom: 2 }}
                  onClick={(d) => { if (d?.activePayload?.[0]) { const c = (d.activePayload[0].payload as CanalRow).canal; setCanal((prev) => prev === c ? "" : c); } }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                  <YAxis dataKey="canal" type="category" tick={{ fontSize: 10, fontWeight: 700 }} width={60} />
                  <Tooltip content={<TooltipCanal />} />
                  <Bar dataKey="avance" name="Avance" radius={[0, 3, 3, 0]} barSize={9}
                    label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((_v: unknown, _e: unknown, i: number) => fmtPct(canales[i]?.porcentaje)) as any }}>
                    {canales.map((c) => <Cell key={c.canal} fill={canal === c.canal ? "#1d4ed8" : "#3b82f6"} cursor="pointer" />)}
                  </Bar>
                  <Bar dataKey="presupuesto" name="Presupuesto" radius={[0, 3, 3, 0]} barSize={9}>
                    {canales.map((c) => <Cell key={c.canal} fill={canal === c.canal ? "#15803d" : "#22c55e"} cursor="pointer" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {canal && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Canal activo:</span>
                  <button onClick={() => setCanal("")}
                    className="flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-semibold hover:bg-blue-100 transition-colors">
                    {canal} ✕
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Comparación por filtro ───────────────────────────────────────────── */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-700 text-sm">
              Comparación por {GROUP_BY_LABEL[groupBy] ?? groupBy}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {MESES[mes]} {anho} vs {prevLabel || "mes anterior"} · {REGIONALES.find(r => r.key === selectedRegional)?.label}
            </p>
          </div>
        </div>

        {loadingComp ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-xl" />)}</div>
        ) : comparacion.length === 0 ? (
          <p className="text-slate-400 text-sm py-4 text-center">Sin datos para los filtros actuales.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-180">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="text-left py-2 pb-3 font-semibold w-40">{GROUP_BY_LABEL[groupBy]}</th>
                  <th className="text-right py-2 pb-3 font-semibold">Uds. vendidas</th>
                  <th className="text-right py-2 pb-3 font-semibold">Bs. vendidos</th>
                  <th className="text-right py-2 pb-3 font-semibold">Presupuesto</th>
                  <th className="text-right py-2 pb-3 font-semibold">% Cumpl.</th>
                  <th className="text-right py-2 pb-3 font-semibold">Gap Bs.</th>
                  <th className="text-right py-2 pb-3 font-semibold pr-1">vs {prevLabel || "Mes ant."}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {comparacion.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-semibold text-slate-800 truncate max-w-40" title={row.name}>{row.name}</td>
                    <td className="py-3 text-right tabular-nums text-slate-700">{fmtN(row.cantidad)}</td>
                    <td className="py-3 text-right tabular-nums text-slate-700 font-semibold">{fmt(row.venta_neta)}</td>
                    <td className="py-3 text-right tabular-nums text-slate-500">{fmt(row.ppto_bs)}</td>
                    <td className={`py-3 text-right tabular-nums font-bold ${cumplColor(row.pct_cumpl)}`}>{fmtPct(row.pct_cumpl)}</td>
                    <td className={`py-3 text-right tabular-nums font-semibold ${row.gap_bs != null ? (row.gap_bs >= 0 ? "text-emerald-600" : "text-red-500") : "text-slate-300"}`}>
                      {row.gap_bs != null ? `${row.gap_bs >= 0 ? "+" : ""}${fmt(row.gap_bs)}` : "—"}
                    </td>
                    <td className={`py-3 text-right tabular-nums font-semibold pr-1 ${deltaColor(row.pct_camb_bs)}`}>
                      {row.pct_camb_bs != null ? `${row.pct_camb_bs >= 0 ? "+" : ""}${fmtPct(row.pct_camb_bs)}` : "—"}
                      {row.cantidad_ant > 0 && (
                        <span className="block text-[10px] font-normal text-slate-400">{fmtN(row.cantidad_ant)} uds.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SKUs ────────────────────────────────────────────────────────────── */}
      <div className="card">
        {/* Toolbar */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-700 text-sm">SKUs</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {MESES[mes]} {anho} · {REGIONALES.find(r => r.key === selectedRegional)?.label}
              {activeFilterChips.length > 0 && ` · ${activeFilterChips.map(c => c.label).join(", ")}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort key toggle */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
              {(["presupuesto", "cumplimiento", "crecimiento"] as SortKey[]).map((k) => (
                <button key={k} onClick={() => setSortKey(k)}
                  className={`px-2.5 py-1.5 capitalize transition-colors ${sortKey === k ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {k === "presupuesto" ? "Presupuesto" : k === "cumplimiento" ? "Cumplimiento" : "Crecimiento"}
                </button>
              ))}
            </div>

            {/* Asc/Desc */}
            <button onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-all">
              {sortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              {sortDir === "desc" ? "Mayor → Menor" : "Menor → Mayor"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={skuSearch}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSkuSearch(e.target.value)}
            placeholder="Buscar por nombre o código de producto…"
            className="w-full text-xs pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300" />
          {filteredSkus.length !== skus.length && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold">
              {filteredSkus.length}/{skus.length}
            </span>
          )}
        </div>

        {/* Table */}
        {loadingSkus ? (
          <div className="space-y-1.5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-slate-50 animate-pulse rounded-lg" />)}</div>
        ) : filteredSkus.length === 0 ? (
          <p className="text-slate-400 text-sm py-6 text-center">Sin datos para los filtros actuales.</p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-100" style={{ maxHeight: 560 }}>
            <table className="w-full text-xs min-w-225">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#f1f5f9]">
                <tr className="text-[10px] text-slate-400 uppercase tracking-widest">
                  <th className="text-left py-2.5 pl-3 font-semibold w-72">SKU</th>
                  <th className="text-right py-2.5 font-semibold">Bs. vendidos</th>
                  <th className="text-right py-2.5 font-semibold">Uds. vendidas</th>
                  <th className="text-right py-2.5 font-semibold">Presupuesto</th>
                  <th className="text-right py-2.5 font-semibold">% Cumpl.</th>
                  <th className="text-right py-2.5 font-semibold">% Gap</th>
                  <th className="text-right py-2.5 pr-3 font-semibold">vs {prevSkuLabel || "Mes ant."}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredSkus.map((s) => (
                  <tr key={s.codigo} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 pl-3 w-72">
                      <span className="font-mono text-[10px] text-slate-400 block">{s.codigo}</span>
                      <span className="text-slate-700 font-medium leading-tight">{s.producto}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700 font-semibold">{fmt(s.venta_neta)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{fmtN(s.cantidad)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-500">{fmt(s.presupuesto)}</td>
                    <td className={`py-2.5 text-right tabular-nums font-bold ${cumplColor(s.pct_cumpl)}`}>{fmtPct(s.pct_cumpl)}</td>
                    <td className={`py-2.5 text-right tabular-nums font-semibold ${s.gap_pct != null ? (s.gap_pct >= 0 ? "text-emerald-600" : "text-red-500") : "text-slate-300"}`}>
                      {s.gap_pct != null ? `${s.gap_pct >= 0 ? "+" : ""}${fmtPct(s.gap_pct)}` : "—"}
                    </td>
                    <td className={`py-2.5 text-right tabular-nums font-semibold pr-3 ${deltaColor(s.pct_camb_bs)}`}>
                      {s.pct_camb_bs != null ? `${s.pct_camb_bs >= 0 ? "+" : ""}${fmtPct(s.pct_camb_bs)}` : "—"}
                      {s.venta_neta_ant > 0 && (
                        <span className="block text-[10px] font-normal text-slate-400">{fmt(s.venta_neta_ant)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </DashboardLayout>
  );
}
