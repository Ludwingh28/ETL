import {
  useEffect, useState, useCallback, useMemo, useRef,
  type ChangeEvent,
} from "react";
import {
  TrendingUp, RefreshCw, AlertCircle, FlaskConical,
  ChevronDown, Search, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
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
interface CanalRow     { canal: string; avance: number; cantidad: number; presupuesto: number; presupuesto_uds: number; porcentaje: number | null; porcentaje_uds: number | null; clientes: number; }
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
type SortKey     = "presupuesto" | "cumplimiento" | "crecimiento" | "ventas_bs";
type SortDir     = "desc" | "asc";
type VendSortKey  = "presupuesto" | "cumplimiento" | "ventas_bs";
type CliSortKey   = "ventas_bs" | "uds_vendidas";

interface VendedorRow {
  vendedor: string; venta_neta: number; cantidad: number;
  presupuesto_bs: number; presupuesto_uds: number; pct_cumpl: number | null;
}
interface ClienteRow {
  codigo: string; nombre: string; venta_neta: number; cantidad: number;
}
interface ClienteSkuRow {
  codigo: string; producto: string; cantidad: number; venta_neta: number;
}

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
  prods: string[] = [],
): string {
  const p = [
    `regional=${regional}`, `anho=${anho}`, `mes=${mes}`,
    ...(canal ? [`canal=${encodeURIComponent(canal)}`] : []),
    ...cats.map( c => `categoria=${encodeURIComponent(c)}`),
    ...provs.map(v => `proveedor=${encodeURIComponent(v)}`),
    ...subs.map( s => `subgrupo=${encodeURIComponent(s)}`),
    ...marcs.map(m => `marca=${encodeURIComponent(m)}`),
    ...prods.map(p => `producto=${encodeURIComponent(p)}`),
  ];
  return p.join("&");
}

// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({ label, value, options, onChange, placeholder = "Todos", searchable = false, loading = false }: {
  label: string; value: string[]; options: string[];
  onChange: (v: string[]) => void; placeholder?: string; searchable?: boolean; loading?: boolean;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 0 });
  const ref     = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recalcPos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    recalcPos();
    if (searchable) setTimeout(() => inputRef.current?.focus(), 50);
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll() { recalcPos(); }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

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
        ref={btnRef}
        onClick={() => !loading && setOpen((o) => !o)}
        disabled={!loading && options.length === 0}
        className={`text-xs rounded-lg px-3 py-2 text-left flex items-center justify-between gap-2 min-w-36 transition-all border
          ${loading ? "border-slate-200 bg-slate-50 text-slate-400 cursor-wait"
            : hasValue
              ? "border-brand-400 bg-brand-50 text-brand-700 font-semibold"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <span className="truncate max-w-36">{loading ? "Cargando…" : btnLabel}</span>
        {loading
          ? <RefreshCw size={12} className="shrink-0 text-slate-400 animate-spin" />
          : <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        }
      </button>

      {open && options.length > 0 && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
          className="w-max max-w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col">
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

// ─── SingleSelect ─────────────────────────────────────────────────────────────

function SingleSelect({ label, value, options, onChange, placeholder = "Todos", searchable = false, loading = false }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; placeholder?: string; searchable?: boolean; loading?: boolean;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 0 });
  const ref      = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recalcPos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    recalcPos();
    if (searchable) setTimeout(() => inputRef.current?.focus(), 50);
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll() { recalcPos(); }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = searchable && search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  const selected = options.find(o => o.value === value);
  const hasValue = value !== "";

  return (
    <div ref={ref} className="relative flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{label}</span>
      <button
        ref={btnRef}
        onClick={() => !loading && setOpen(o => !o)}
        disabled={!loading && options.length === 0}
        className={`text-xs rounded-lg px-3 py-2 text-left flex items-center justify-between gap-2 min-w-36 transition-all border
          ${loading ? "border-slate-200 bg-slate-50 text-slate-400 cursor-wait"
            : hasValue
              ? "border-brand-400 bg-brand-50 text-brand-700 font-semibold"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <span className="truncate max-w-36">{loading ? "Cargando…" : (selected?.label ?? placeholder)}</span>
        {loading
          ? <RefreshCw size={12} className="shrink-0 text-slate-400 animate-spin" />
          : <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        }
      </button>

      {open && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
          className="w-max max-w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col">
          {searchable && (
            <div className="px-2.5 pt-2.5 pb-1.5 border-b border-slate-100">
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={inputRef} type="text" value={search}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full text-xs pl-7 pr-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300"
                />
                {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">✕</button>}
              </div>
            </div>
          )}
          <div className="overflow-y-auto max-h-60 py-1">
            {hasValue && (
              <button onClick={() => { onChange(""); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 transition-colors border-b border-slate-100 mb-1">
                Limpiar selección ✕
              </button>
            )}
            {filtered.length === 0
              ? <p className="text-xs text-slate-400 px-3 py-2">Sin resultados</p>
              : filtered.map(opt => (
                <button key={opt.value}
                  onClick={() => { onChange(opt.value === value ? "" : opt.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex items-center gap-2.5
                    ${opt.value === value ? "font-semibold text-brand-700" : "text-slate-700"}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center
                    ${opt.value === value ? "border-brand-600 bg-brand-600" : "border-slate-300"}`}>
                    {opt.value === value && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  {opt.label}
                </button>
              ))
            }
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
  const [canal, setCanal] = useState<string>("");

  // Multi-select filters (cascada: Categoría → Sub-categoría → Proveedor → Marca → Productos)
  const [fCats,      setFCats]      = useState<string[]>([]);
  const [fProvs,     setFProvs]     = useState<string[]>([]);
  const [fSubs,      setFSubs]      = useState<string[]>([]);
  const [fMarcs,     setFMarcs]     = useState<string[]>([]);
  const [fProductos, setFProductos] = useState<string[]>([]);

  // Dynamic options
  const [opCanales,   setOpCanales]   = useState<string[]>([]);
  const [opProvs,     setOpProvs]     = useState<string[]>([]);
  const [opSubs,      setOpSubs]      = useState<string[]>([]);
  const [opMarcs,     setOpMarcs]     = useState<string[]>([]);
  const [opProductos, setOpProductos] = useState<string[]>([]);

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
  const [loadingOpciones, setLoadingOpciones] = useState(false);
  const [loadingNac,   setLoadingNac]   = useState(true);
  const [loadingCan,   setLoadingCan]   = useState(true);
  const [canalViewUds, setCanalViewUds] = useState(false);
  const [loadingComp,  setLoadingComp]  = useState(false);
  const [loadingSkus,  setLoadingSkus]  = useState(false);
  const [loadingVend,  setLoadingVend]  = useState(false);
  const [vendedores,   setVendedores]   = useState<VendedorRow[]>([]);
  const [vendSearch,   setVendSearch]   = useState("");
  const [vendSortKey,  setVendSortKey]  = useState<VendSortKey>("presupuesto");
  const [vendSortDir,  setVendSortDir]  = useState<SortDir>("desc");
  const [selectedVend, setSelectedVend] = useState<string | null>(null);
  const [compDrill,    setCompDrill]    = useState<{ field: string; value: string } | null>(null);
  const [selectedSku,  setSelectedSku]  = useState<SkuRow | null>(null);
  const [loadingCli,      setLoadingCli]      = useState(false);
  const [clientes,        setClientes]        = useState<ClienteRow[]>([]);
  const [cliSearch,       setCliSearch]       = useState("");
  const [cliSortKey,      setCliSortKey]      = useState<CliSortKey>("ventas_bs");
  const [cliSortDir,      setCliSortDir]      = useState<SortDir>("desc");
  const [selectedCli,     setSelectedCli]     = useState<ClienteRow | null>(null);
  const [cliSkus,         setCliSkus]         = useState<ClienteSkuRow[]>([]);
  const [loadingCliSkus,  setLoadingCliSkus]  = useState(false);
  const [cliSkuSearch,    setCliSkuSearch]    = useState("");
  const [nacError,     setNacError]     = useState<string | null>(null);

  // Active filters store
  useEffect(() => {
    setActiveFilters({ anho, mes, regional: selectedRegional, canal, categorias: fCats, proveedores: fProvs });
  }, [anho, mes, selectedRegional, canal, fCats, fProvs]);

  // Cascada: Categoría → Sub-categoría → Proveedor → Marca → Productos
  function resetDrill() { setCompDrill(null); setSelectedSku(null); setSelectedVend(null); setSelectedCli(null); }
  function onCats(v: string[])      { setFCats(v);  setFSubs([]); setFProvs([]); setFMarcs([]); setFProductos([]); resetDrill(); }
  function onSubs(v: string[])      { setFSubs(v);  setFProvs([]); setFMarcs([]); setFProductos([]); resetDrill(); }
  function onProvs(v: string[])     { setFProvs(v); setFMarcs([]); setFProductos([]); resetDrill(); }
  function onMarcs(v: string[])     { setFMarcs(v); setFProductos([]); resetDrill(); }
  function onProductos(v: string[]) { setFProductos(v); resetDrill(); }
  function clearAll() { onCats([]); setCanal(""); }

  function onCompDrillClick(row: ComparacionRow) {
    if (!groupBy || groupBy === "total") return;
    const isActive = compDrill?.field === groupBy && compDrill?.value === row.name;
    setCompDrill(isActive ? null : { field: groupBy, value: row.name });
    setSelectedSku(null); setSelectedVend(null); setSelectedCli(null);
  }
  function onSkuClick(sku: SkuRow) {
    const isActive = selectedSku?.codigo === sku.codigo;
    setSelectedSku(isActive ? null : sku);
    setSelectedVend(null); setSelectedCli(null);
  }

  const hasFilters = canal !== ""
    || fCats.length > 0 || fSubs.length > 0 || fProvs.length > 0
    || fMarcs.length > 0 || fProductos.length > 0;

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
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos);
      const [k, t] = await Promise.all([
        apiFetch<{ success: boolean; data: NacKpisData }>(`/dashboard/nacional/kpis/?${qs}`),
        apiFetch<{ success: boolean; data: TendenciaDia[]; es_periodo_actual: boolean }>(`/dashboard/nacional/tendencia/?${qs}`),
      ]);
      if (k.success) setNacKpis(k.data);
      if (t.success) { setTendencia(t.data); setEsPeriodoActual(t.es_periodo_actual); }
    } catch (e) { setNacError(e instanceof Error ? e.message : "Error al cargar KPIs"); }
    finally { setLoadingNac(false); }
  }, [apiFetch, anho, mes, selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, fProductos]);

  useEffect(() => { void fetchNacKpis(); }, [fetchNacKpis]);

  // ── Canales ───────────────────────────────────────────────────────────────────
  const fetchCanales = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingCan(true);
    try {
      const qs = buildQS(selectedRegional, "", anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos);
      const j = await apiFetch<{ success: boolean; data: CanalRow[] }>(
        `/dashboard/new-nacional/canales-mini/?${qs}`
      );
      if (j.success) setCanales(j.data); else setCanales([]);
    } catch { setCanales([]); }
    finally { setLoadingCan(false); }
  }, [apiFetch, selectedRegional, fCats, fProvs, fSubs, fMarcs, fProductos, anho, mes]);

  useEffect(() => { void fetchCanales(); }, [fetchCanales]);

  // ── Opciones en cascada ───────────────────────────────────────────────────────
  // Canal es filtro operacional — NO afecta el catálogo de productos
  const fetchOpciones = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingOpciones(true);
    try {
      const qs = buildQS(selectedRegional, "", anho, mes, fCats, fProvs, fSubs, fMarcs);
      const j = await apiFetchRef.current<{
        success: boolean;
        proveedores: string[]; subgrupos: string[]; marcas: string[];
        canales: string[]; productos: string[];
      }>(`/dashboard/new-nacional/opciones/?${qs}`);
      if (j.success) {
        setOpSubs(j.subgrupos     ?? []);
        setOpProvs(j.proveedores  ?? []);
        setOpMarcs(j.marcas       ?? []);
        setOpCanales(j.canales    ?? []);
        setOpProductos(j.productos ?? []);
      }
    } catch (err) {
      console.error("[fetchOpciones] Error al cargar opciones de filtros:", err);
    } finally {
      setLoadingOpciones(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegional, fCats, fSubs, fProvs, fMarcs, anho, mes]);

  useEffect(() => { void fetchOpciones(); }, [fetchOpciones]);

  // ── Comparación ───────────────────────────────────────────────────────────────
  const fetchComparacion = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingComp(true);
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos);
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
  }, [selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, fProductos, anho, mes]);

  useEffect(() => { void fetchComparacion(); }, [fetchComparacion]);

  // ── SKUs ──────────────────────────────────────────────────────────────────────
  const fetchSkus = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingSkus(true); setSkuSearch("");
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos);
      const drillParam = compDrill ? `&${compDrill.field}=${encodeURIComponent(compDrill.value)}` : "";
      const j = await apiFetchRef.current<{ success: boolean; data: SkuRow[]; prev_anho: number; prev_mes: number }>(
        `/dashboard/new-nacional/skus/?${qs}${drillParam}`
      );
      if (j.success) {
        setSkus(j.data);
        setPrevSkuLabel(`${MESES[j.prev_mes]} ${j.prev_anho}`);
      }
    } catch { setSkus([]); }
    finally { setLoadingSkus(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, fProductos, compDrill, anho, mes]);

  useEffect(() => { void fetchSkus(); }, [fetchSkus]);

  const fetchVendedores = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingVend(true);
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos);
      const drillParam = compDrill ? `&${compDrill.field}=${encodeURIComponent(compDrill.value)}` : "";
      const skuParam   = selectedSku ? `&sku_drill=${encodeURIComponent(selectedSku.producto)}` : "";
      const j = await apiFetchRef.current<{ success: boolean; data: VendedorRow[] }>(
        `/dashboard/new-nacional/vendedores/?${qs}${drillParam}${skuParam}`
      );
      if (j.success) setVendedores(j.data); else setVendedores([]);
    } catch { setVendedores([]); }
    finally { setLoadingVend(false); }
  }, [selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, fProductos, compDrill, selectedSku, anho, mes]);

  useEffect(() => { void fetchVendedores(); }, [fetchVendedores]);

  const fetchClientes = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingCli(true);
    setSelectedCli(null);
    try {
      const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos);
      const drillParam = compDrill ? `&${compDrill.field}=${encodeURIComponent(compDrill.value)}` : "";
      const skuParam   = selectedSku ? `&sku_drill=${encodeURIComponent(selectedSku.producto)}` : "";
      const vendParam  = selectedVend ? `&vendedor=${encodeURIComponent(selectedVend)}` : "";
      const j = await apiFetchRef.current<{ success: boolean; data: ClienteRow[] }>(
        `/dashboard/new-nacional/clientes/?${qs}${drillParam}${skuParam}${vendParam}`
      );
      if (j.success) setClientes(j.data); else setClientes([]);
    } catch { setClientes([]); }
    finally { setLoadingCli(false); }
  }, [selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, fProductos, compDrill, selectedSku, selectedVend, anho, mes]);

  useEffect(() => { void fetchClientes(); }, [fetchClientes]);

  useEffect(() => {
    if (!selectedCli) { setCliSkus([]); setCliSkuSearch(""); return; }
    setCliSkuSearch("");
    setLoadingCliSkus(true);
    const qs = buildQS(selectedRegional, canal, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos);
    apiFetchRef.current<{ success: boolean; data: ClienteSkuRow[] }>(
      `/dashboard/new-nacional/cliente-skus/?cliente_codigo=${encodeURIComponent(selectedCli.codigo)}&${qs}`
    ).then((j) => { if (j.success) setCliSkus(j.data); else setCliSkus([]); })
     .catch(() => setCliSkus([]))
     .finally(() => setLoadingCliSkus(false));
  }, [selectedCli, selectedRegional, canal, fCats, fProvs, fSubs, fMarcs, fProductos, anho, mes]);

  // ── Limpiar filtros operacionales al cambiar regional ─────────────────────────

  // ── Derivados ─────────────────────────────────────────────────────────────────

  const sortedSkus = useMemo(() => {
    const sorted = [...skus].sort((a, b) => {
      let diff: number;
      if      (sortKey === "cumplimiento") diff = (b.pct_cumpl ?? -Infinity) - (a.pct_cumpl ?? -Infinity);
      else if (sortKey === "crecimiento")  diff = (b.pct_camb_bs ?? -Infinity) - (a.pct_camb_bs ?? -Infinity);
      else if (sortKey === "ventas_bs")    diff = b.venta_neta - a.venta_neta;
      else                                 diff = b.presupuesto - a.presupuesto;
      return sortDir === "desc" ? diff : -diff;
    });
    return sorted;
  }, [skus, sortKey, sortDir]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return q ? sortedSkus.filter((s) => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)) : sortedSkus;
  }, [sortedSkus, skuSearch]);

  const sortedVendedores = useMemo(() => {
    return [...vendedores].sort((a, b) => {
      let diff: number;
      if      (vendSortKey === "cumplimiento") diff = (b.pct_cumpl ?? -Infinity) - (a.pct_cumpl ?? -Infinity);
      else if (vendSortKey === "ventas_bs")    diff = b.venta_neta - a.venta_neta;
      else                                     diff = b.presupuesto_bs - a.presupuesto_bs;
      return vendSortDir === "desc" ? diff : -diff;
    });
  }, [vendedores, vendSortKey, vendSortDir]);

  const filteredVendedores = useMemo(() => {
    const q = vendSearch.trim().toLowerCase();
    return q ? sortedVendedores.filter((v) => v.vendedor.toLowerCase().includes(q)) : sortedVendedores;
  }, [sortedVendedores, vendSearch]);

  const sortedClientes = useMemo(() => {
    return [...clientes].sort((a, b) => {
      const diff = cliSortKey === "uds_vendidas" ? b.cantidad - a.cantidad : b.venta_neta - a.venta_neta;
      return cliSortDir === "desc" ? diff : -diff;
    });
  }, [clientes, cliSortKey, cliSortDir]);

  const filteredClientes = useMemo(() => {
    const q = cliSearch.trim().toLowerCase();
    return q ? sortedClientes.filter((c) => c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)) : sortedClientes;
  }, [sortedClientes, cliSearch]);

  const filteredCliSkus = useMemo(() => {
    const q = cliSkuSearch.trim().toLowerCase();
    return q ? cliSkus.filter((s) => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)) : cliSkus;
  }, [cliSkus, cliSkuSearch]);

  const anhos = [...new Set(periodos.map((p) => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter((p) => p.anho === anho);

  const activeFilterChips = [
    ...(canal ? [{ label: `Canal: ${canal}`, color: "bg-amber-50 text-amber-700", clear: () => setCanal("") }] : []),
    ...fCats.map(v => ({ label: v, color: "bg-slate-100 text-slate-700", clear: () => onCats(fCats.filter(x => x !== v)) })),
    ...fSubs.map(v => ({ label: v, color: "bg-violet-50 text-violet-700", clear: () => onSubs(fSubs.filter(x => x !== v)) })),
    ...fProvs.map(v => ({ label: v, color: "bg-blue-50 text-blue-700", clear: () => onProvs(fProvs.filter(x => x !== v)) })),
    ...fMarcs.map(v => ({ label: v, color: "bg-emerald-50 text-emerald-700", clear: () => onMarcs(fMarcs.filter(x => x !== v)) })),
    ...fProductos.map(v => ({ label: v, color: "bg-teal-50 text-teal-700", clear: () => onProductos(fProductos.filter(x => x !== v)) })),
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
            onClick={() => { void fetchNacKpis(); void fetchCanales(); void fetchOpciones(); void fetchComparacion(); void fetchSkus(); void fetchVendedores(); void fetchClientes(); }}
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
      <div className="sticky top-16 z-30 bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-4 mb-5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          {/* Filtro operacional */}
          <SingleSelect
            label="Canal"
            value={canal}
            options={opCanales.map(c => ({ value: c, label: c }))}
            onChange={setCanal}
            loading={loadingOpciones}
          />
          {/* Divisor */}
          <div className="w-px h-9 bg-slate-200 self-end hidden sm:block" />
          {/* Cascada de producto */}
          <MultiSelect label="Categoría"     value={fCats}      options={CATEGORIAS_OPTS} onChange={onCats} />
          <MultiSelect label="Sub-categoría" value={fSubs}      options={opSubs}      onChange={onSubs}      searchable loading={loadingOpciones} />
          <MultiSelect label="Proveedor"     value={fProvs}     options={opProvs}     onChange={onProvs}     searchable loading={loadingOpciones} />
          <MultiSelect label="Marca"         value={fMarcs}     options={opMarcs}     onChange={onMarcs}     searchable loading={loadingOpciones} />
          <MultiSelect label="Productos"     value={fProductos} options={opProductos} onChange={onProductos} searchable loading={loadingOpciones} />
          {hasFilters && (
            <button
              onClick={clearAll}
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

      {/* ── Mini-cards por Canal ─────────────────────────────────────────────── */}
      {(loadingCan || (canal === "" && canales.length > 0)) && (
        <div className="mb-5">
          {loadingCan ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 w-36 bg-slate-100 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {/* Toggle Bs / Uds */}
              <div className="flex items-center gap-1 mb-2.5">
                <button
                  onClick={() => setCanalViewUds(false)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-all ${!canalViewUds ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"}`}
                >
                  Bs
                </button>
                <button
                  onClick={() => setCanalViewUds(true)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-all ${canalViewUds ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"}`}
                >
                  Unidades
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {canales.map((c) => {
                  const pct = canalViewUds ? c.porcentaje_uds : c.porcentaje;
                  const pctColor =
                    pct == null ? "text-slate-400"  :
                    pct >= 100  ? "text-emerald-600" :
                    pct >= 80   ? "text-amber-500"   :
                                  "text-red-500";
                  const hasPpto = canalViewUds ? c.presupuesto_uds > 0 : c.presupuesto > 0;

                  return (
                    <div
                      key={c.canal}
                      className="flex flex-col gap-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white min-w-32.5"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-30 text-slate-500">
                        {c.canal}
                      </span>
                      <span className={`text-xl font-black leading-none tabular-nums ${pctColor}`}>
                        {pct != null ? `${pct.toFixed(1)}%` : "—"}
                      </span>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400 tabular-nums">
                          {canalViewUds ? fmtN(c.cantidad) : fmt(c.avance)}
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{fmtN(c.clientes)} cli.</span>
                      </div>
                      {hasPpto && (
                        <div className="w-full bg-slate-100 rounded-full h-1 mt-0.5 overflow-hidden">
                          <div
                            className={`h-1 rounded-full ${pct != null && pct >= 100 ? "bg-emerald-500" : pct != null && pct >= 80 ? "bg-amber-400" : "bg-red-400"}`}
                            style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

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
          {compDrill && (
            <button onClick={() => { setCompDrill(null); setSelectedSku(null); }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors">
              {GROUP_BY_LABEL[compDrill.field] ?? compDrill.field}: {compDrill.value}
              <span className="opacity-60">✕</span>
            </button>
          )}
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
                {comparacion.map((row) => {
                  const isDrillActive = compDrill?.field === groupBy && compDrill?.value === row.name;
                  const isClickable   = groupBy !== "total";
                  return (
                  <tr key={row.name}
                    onClick={() => isClickable && onCompDrillClick(row)}
                    className={`transition-colors ${isClickable ? "cursor-pointer" : ""} ${isDrillActive ? "bg-violet-50" : "hover:bg-slate-50"}`}>
                    <td className={`py-3 font-semibold truncate max-w-40 ${isDrillActive ? "text-violet-700" : "text-slate-800"}`} title={row.name}>{row.name}</td>
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
                  );
                })}
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
            {selectedSku && (
              <button onClick={() => setSelectedSku(null)}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors">
                SKU: {selectedSku.producto} <span className="opacity-60">✕</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort key toggle */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
              {(["presupuesto", "cumplimiento", "crecimiento", "ventas_bs"] as SortKey[]).map((k) => (
                <button key={k} onClick={() => setSortKey(k)}
                  className={`px-2.5 py-1.5 transition-colors ${sortKey === k ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {k === "presupuesto" ? "Presupuesto" : k === "cumplimiento" ? "Cumplimiento" : k === "crecimiento" ? "Crecimiento" : "Ventas Bs"}
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
                {filteredSkus.map((s) => {
                  const isSkuActive = selectedSku?.codigo === s.codigo;
                  return (
                  <tr key={s.codigo}
                    onClick={() => onSkuClick(s)}
                    className={`cursor-pointer transition-colors ${isSkuActive ? "bg-teal-50" : "hover:bg-slate-50"}`}>
                    <td className="py-2.5 pl-3 w-72">
                      <span className="font-mono text-[10px] text-slate-400 block">{s.codigo}</span>
                      <span className={`font-medium leading-tight ${isSkuActive ? "text-teal-700" : "text-slate-700"}`}>{s.producto}</span>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tabla Vendedores ─────────────────────────────────────────────────── */}
      <div className="card mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-700 text-sm">Por Vendedor</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {MESES[mes]} {anho} · {REGIONALES.find(r => r.key === selectedRegional)?.label}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {compDrill && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                  {GROUP_BY_LABEL[compDrill.field]}: {compDrill.value}
                </span>
              )}
              {selectedSku && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-200">
                  SKU: {selectedSku.producto}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort key */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
              {(["presupuesto", "cumplimiento", "ventas_bs"] as VendSortKey[]).map((k) => (
                <button key={k} onClick={() => setVendSortKey(k)}
                  className={`px-2.5 py-1.5 transition-colors ${vendSortKey === k ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {k === "presupuesto" ? "Presupuesto" : k === "cumplimiento" ? "Cumplimiento" : "Ventas Bs"}
                </button>
              ))}
            </div>
            {/* Asc/Desc */}
            <button onClick={() => setVendSortDir((d) => d === "desc" ? "asc" : "desc")}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-all">
              {vendSortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              {vendSortDir === "desc" ? "Mayor → Menor" : "Menor → Mayor"}
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={vendSearch} onChange={(e) => setVendSearch(e.target.value)}
            placeholder="Buscar vendedor..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white" />
          {filteredVendedores.length !== vendedores.length && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
              {filteredVendedores.length}/{vendedores.length}
            </span>
          )}
        </div>

        {loadingVend ? (
          <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
        ) : filteredVendedores.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] uppercase tracking-wider">
                  <th className="text-left py-2 pb-3 font-semibold pl-1">Vendedor</th>
                  <th className="text-right py-2 pb-3 font-semibold">Bs. Vendidos</th>
                  <th className="text-right py-2 pb-3 font-semibold">Uds. Vendidas</th>
                  <th className="text-right py-2 pb-3 font-semibold">Presupuesto Bs.</th>
                  <th className="text-right py-2 pb-3 font-semibold">Presupuesto Uds.</th>
                  <th className="text-right py-2 pb-3 font-semibold pr-1">% Cumpl.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredVendedores.map((v) => {
                  const isActive = selectedVend === v.vendedor;
                  return (
                    <tr key={v.vendedor}
                      onClick={() => setSelectedVend(isActive ? null : v.vendedor)}
                      className={`cursor-pointer transition-colors ${isActive ? "bg-brand-50" : "hover:bg-slate-50/60"}`}>
                      <td className={`py-2.5 pl-1 font-medium ${isActive ? "text-brand-700" : "text-slate-700"}`}>{v.vendedor}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700 font-semibold">{fmt(v.venta_neta)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-600">{fmtN(v.cantidad)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-500">{fmt(v.presupuesto_bs)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-500">{fmtN(v.presupuesto_uds)}</td>
                      <td className={`py-2.5 text-right tabular-nums font-bold pr-1 ${cumplColor(v.pct_cumpl)}`}>{fmtPct(v.pct_cumpl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tabla Clientes ───────────────────────────────────────────────────── */}
      <div className={`mt-5 grid gap-4 ${selectedCli ? "grid-cols-[1fr_380px]" : "grid-cols-1"}`}>

        {/* Card tabla */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-slate-700 text-sm">Por Cliente</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {MESES[mes]} {anho} · {REGIONALES.find(r => r.key === selectedRegional)?.label}
                {selectedCli && <span className="ml-2 text-brand-500">· Clic en fila para ver SKUs</span>}
              </p>
              {selectedVend && (
                <button
                  onClick={() => setSelectedVend(null)}
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition-colors">
                  Vendedor: {selectedVend}
                  <span className="opacity-60">✕</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
                {(["ventas_bs", "uds_vendidas"] as CliSortKey[]).map((k) => (
                  <button key={k} onClick={() => setCliSortKey(k)}
                    className={`px-2.5 py-1.5 transition-colors ${cliSortKey === k ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    {k === "ventas_bs" ? "Ventas Bs" : "Uds. Vendidas"}
                  </button>
                ))}
              </div>
              <button onClick={() => setCliSortDir((d) => d === "desc" ? "asc" : "desc")}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-all">
                {cliSortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                {cliSortDir === "desc" ? "Mayor → Menor" : "Menor → Mayor"}
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" value={cliSearch} onChange={(e) => setCliSearch(e.target.value)}
              placeholder="Buscar por código o nombre..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white" />
            {filteredClientes.length !== clientes.length && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                {filteredClientes.length}/{clientes.length}
              </span>
            )}
          </div>

          {loadingCli ? (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
          ) : filteredClientes.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          ) : (
            <div className="overflow-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="text-left py-2 pb-3 font-semibold pl-1 w-24">Código</th>
                    <th className="text-left py-2 pb-3 font-semibold">Nombre</th>
                    <th className="text-right py-2 pb-3 font-semibold">Bs. Vendidos</th>
                    <th className="text-right py-2 pb-3 font-semibold pr-1">Uds. Vendidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredClientes.map((c) => {
                    const isActive = selectedCli?.codigo === c.codigo;
                    return (
                      <tr key={c.codigo}
                        onClick={() => setSelectedCli(isActive ? null : c)}
                        className={`cursor-pointer transition-colors ${isActive ? "bg-brand-50" : "hover:bg-slate-50/60"}`}>
                        <td className={`py-2.5 pl-1 font-mono text-[11px] ${isActive ? "text-brand-600" : "text-slate-500"}`}>{c.codigo}</td>
                        <td className={`py-2.5 font-medium ${isActive ? "text-brand-700" : "text-slate-700"}`}>{c.nombre}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-700 font-semibold">{fmt(c.venta_neta)}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600 pr-1">{fmtN(c.cantidad)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Card SKUs del cliente — aparece a la derecha al seleccionar */}
        {selectedCli && (
          <div className="card flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">SKUs vendidos</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5 leading-tight">{selectedCli.nombre}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{selectedCli.codigo}</p>
              </div>
              <button onClick={() => setSelectedCli(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none mt-0.5">✕</button>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" value={cliSkuSearch} onChange={(e) => setCliSkuSearch(e.target.value)}
                placeholder="Buscar SKU (nombre o código)..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white" />
              {filteredCliSkus.length !== cliSkus.length && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                  {filteredCliSkus.length}/{cliSkus.length}
                </span>
              )}
            </div>

            {loadingCliSkus ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
            ) : cliSkus.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
            ) : (
              <>
                <div className="overflow-auto max-h-80 flex-1">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-slate-400 text-[11px] uppercase tracking-wider">
                        <th className="text-left py-2 pb-3 font-semibold">Producto</th>
                        <th className="text-right py-2 pb-3 font-semibold">Uds.</th>
                        <th className="text-right py-2 pb-3 font-semibold">Bs.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredCliSkus.map((s) => (
                        <tr key={s.codigo} className="hover:bg-slate-50/60">
                          <td className="py-2.5 pr-2 text-slate-700 leading-tight">{s.producto}</td>
                          <td className="py-2.5 text-right tabular-nums text-slate-600 whitespace-nowrap">{fmtN(s.cantidad)}</td>
                          <td className="py-2.5 text-right tabular-nums text-slate-700 font-semibold whitespace-nowrap">{fmt(s.venta_neta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pt-3 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-700">
                  <span>Total</span>
                  <div className="flex gap-5">
                    <span>{fmtN(cliSkus.reduce((a, s) => a + s.cantidad, 0))} uds.</span>
                    <span>{fmt(cliSkus.reduce((a, s) => a + s.venta_neta, 0))}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Tendencia + Canal ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-10 gap-4 mt-5">

        {/* Tendencia */}
        <div className="card col-span-10">
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

      </div>

    </DashboardLayout>
  );
}
