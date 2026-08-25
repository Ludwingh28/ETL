import {
  useEffect, useState, useCallback, useMemo, useRef, type ChangeEvent,
} from "react";
import {
  TrendingUp, RefreshCw, AlertCircle, Search, ArrowUp, ArrowDown, Lock, ChevronDown, Pin, PinOff,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Periodo    { anho: number; mes_numero: number; }
interface TendenciaDia { dia: number; avance_acumulado: number | null; presupuesto_acumulado: number | null; proyeccion_acumulada: number | null; }
interface ComparacionRow {
  name: string; cantidad: number; venta_neta: number;
  ppto_bs: number; ppto_uds: number; pct_cumpl: number | null;
  gap_bs: number | null; cantidad_ant: number; venta_neta_ant: number;
  pct_camb_bs: number | null; pct_camb_uds: number | null;
}
interface SkuRow {
  codigo: string; producto: string; linea: string; cantidad: number; venta_neta: number;
  presupuesto: number; presupuesto_uds: number; pct_cumpl: number | null; gap_pct: number | null;
  cantidad_ant: number; venta_neta_ant: number; pct_camb_bs: number | null; pct_camb_uds: number | null;
}
interface ClienteFechaFlat { codigo: string; nombre: string; fecha: string; venta_neta: number; cantidad: number; }
interface ClienteSkuRow { codigo: string; producto: string; cantidad: number; venta_neta: number; }

type SortDir     = "desc" | "asc";
type SkuSortKey  = "presupuesto" | "cumplimiento" | "crecimiento" | "ventas_bs";

// ─── Formatters ───────────────────────────────────────────────────────────────

const CUR = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-BO");
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const fmt    = (n: number | null | undefined) => n != null ? CUR.format(n) : "—";
const fmtN   = (n: number | null | undefined) => n != null ? NUM.format(Math.round(n)) : "—";
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : "—";
const cumplColor = (p: number | null | undefined) =>
  p == null ? "text-slate-400" : p >= 100 ? "text-emerald-600" : p >= 80 ? "text-yellow-600" : "text-red-500";

const REGIONAL_MAP: Record<string, string> = {
  "Santa Cruz": "santa_cruz",
  "Cochabamba": "cochabamba",
  "La Paz":     "la_paz",
  "Nacional":   "nacional",
};

// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({ label, value, options, onChange, placeholder = "Todos", searchable = false, loading = false }: {
  label: string; value: string[]; options: string[]; onChange: (v: string[]) => void;
  placeholder?: string; searchable?: boolean; loading?: boolean;
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
    ? options.filter(o => o.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  const btnLabel = value.length === 0 ? placeholder : value.length === 1 ? value[0] : `${value.length} seleccionados`;
  const hasValue = value.length > 0;

  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);

  return (
    <div ref={ref} className="relative flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{label}</span>
      <button
        ref={btnRef}
        onClick={() => !loading && setOpen(o => !o)}
        disabled={!loading && options.length === 0}
        className={`text-xs rounded-lg px-3 py-2 text-left flex items-center justify-between gap-2 min-w-36 transition-all border
          ${loading ? "border-slate-200 bg-slate-50 text-slate-400 cursor-wait"
            : hasValue ? "border-brand-400 bg-brand-50 text-brand-700 font-semibold"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <span className="truncate max-w-36">{loading ? "Cargando…" : btnLabel}</span>
        {loading
          ? <RefreshCw size={12} className="shrink-0 text-slate-400 animate-spin" />
          : <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && options.length > 0 && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
          className="w-max max-w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col">
          {searchable && (
            <div className="px-2.5 pt-2.5 pb-1.5 border-b border-slate-100">
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input ref={inputRef} type="text" value={search}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full text-xs pl-7 pr-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300" />
                {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">✕</button>}
              </div>
            </div>
          )}
          <div className="overflow-y-auto max-h-60 py-1">
            {hasValue && (
              <button onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 transition-colors border-b border-slate-100 mb-1">
                Limpiar selección ✕
              </button>
            )}
            {filtered.length === 0
              ? <p className="text-xs text-slate-400 px-3 py-2">Sin resultados</p>
              : filtered.map(opt => (
                <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
                  <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-brand-600 cursor-pointer" />
                  <span className="text-xs text-slate-700">{opt}</span>
                </label>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── buildQS ──────────────────────────────────────────────────────────────────

function buildQS(
  regional: string, canal: string, anho: number, mes: number,
  cats: string[], provs: string[], subs: string[], marcs: string[], prods: string[] = [],
  rutas: string[] = [],
): string {
  return [
    `regional=${regional}`, `anho=${anho}`, `mes=${mes}`,
    ...(canal ? [`canal=${encodeURIComponent(canal)}`] : []),
    ...cats.map( c => `categoria=${encodeURIComponent(c)}`),
    ...provs.map(v => `proveedor=${encodeURIComponent(v)}`),
    ...subs.map( s => `subgrupo=${encodeURIComponent(s)}`),
    ...marcs.map(m => `marca=${encodeURIComponent(m)}`),
    ...prods.map(p => `producto=${encodeURIComponent(p)}`),
    ...rutas.map(r => `ruta=${encodeURIComponent(r)}`),
  ].join("&");
}

function buildDrillQS(
  regional: string, canal: string, anho: number, mes: number,
  cats: string[], provs: string[], subs: string[], marcs: string[], prods: string[],
  drill: { field: string; value: string } | null,
  rutas: string[] = [],
): string {
  if (!drill) return buildQS(regional, canal, anho, mes, cats, provs, subs, marcs, prods, rutas);
  const ov = (f: string, list: string[]) => drill.field === f ? [drill.value] : list;
  return buildQS(regional, canal, anho, mes,
    ov('categoria', cats), ov('proveedor', provs), ov('subgrupo', subs), ov('marca', marcs), ov('producto', prods),
    rutas,
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, avance, ppto, pct, extra, pptoLabel = "ppto.", showGap = true }: {
  title: string; avance: number; ppto: number; pct: number | null;
  extra?: string; pptoLabel?: string; showGap?: boolean;
}) {
  const gap = avance - ppto;
  return (
    <div className="card flex-1 min-w-44">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-xl font-bold text-slate-800 leading-tight tabular-nums">{fmt(avance)}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{ppto > 0 ? `/ ${fmt(ppto)} ${pptoLabel}` : ""}</p>
      <div className="flex items-center gap-2 mt-1.5">
        {pct != null && <span className={`text-sm font-bold ${cumplColor(pct)}`}>{fmtPct(pct)}</span>}
        {showGap && ppto > 0 && <span className={`text-[10px] font-semibold ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {gap >= 0 ? "+" : ""}{fmt(gap)}
        </span>}
        {extra && <span className="text-[10px] text-slate-400 ml-auto">{extra}</span>}
      </div>
    </div>
  );
}

// ─── Tooltip tendencia ────────────────────────────────────────────────────────

interface TPayload { name: string; value: number; color: string; }
interface TProps { active?: boolean; payload?: TPayload[]; label?: string | number; }
function TendTip({ active, payload, label }: TProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-slate-600 mb-1">Día {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const GROUP_BY_LABEL: Record<string, string> = {
  categoria: "Categoría", proveedor: "Proveedor", subgrupo: "Sub-cat.", marca: "Marca", producto: "Producto", total: "Total",
};

const PRIVILEGED_CARGOS = new Set([
  "Administrador de Sistema",
  "Subadministrador de Sistemas",
  "Gerente General",
  "Gerente de Ventas",
  "Gerente Regional",
  "Supervisor",
  "Analista de Datos",
]);

export default function DashboardVendedores() {
  const { apiFetch, user } = useAuth();
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => { apiFetchRef.current = apiFetch; });

  const isPrivileged = !!(user?.is_staff || PRIVILEGED_CARGOS.has(user?.cargo ?? ""));

  // Para usuarios privilegiados: vendedor seleccionado manualmente
  const [adminVendedor, setAdminVendedor] = useState("");
  const [vendSearch,    setVendSearch]    = useState("");
  const [vendListOpen,  setVendListOpen]  = useState(false);
  const [allVendedores, setAllVendedores] = useState<string[]>([]);
  const vendListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (vendListRef.current && !vendListRef.current.contains(e.target as Node)) setVendListOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Perfil efectivo
  const vendedorNombre = isPrivileged ? adminVendedor : (user?.full_name ?? "");
  const regionalRaw    = isPrivileged ? "Nacional"    : (user?.regional  ?? "Nacional");
  const canalPerfil    = isPrivileged ? ""            : (user?.canal     ?? "");
  const regionalKey    = REGIONAL_MAP[regionalRaw] ?? "nacional";

  // ── Período ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const [anho, setAnho] = useState(now.getFullYear());
  const [mes,  setMes]  = useState(now.getMonth() + 1);
  const [mesesDisponibles, setMesesDisponibles] = useState<Periodo[]>([]);

  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then(j => { if (j.success) setMesesDisponibles(j.data); })
      .catch(() => {});
  }, [apiFetch]);

  // Para usuarios privilegiados: lista de todos los vendedores
  useEffect(() => {
    if (!isPrivileged) return;
    const now2 = new Date();
    apiFetch<{ success: boolean; data: { vendedor: string }[] }>(
      `/dashboard/new-nacional/vendedores/?regional=nacional&anho=${now2.getFullYear()}&mes=${now2.getMonth() + 1}`
    ).then(j => {
      if (j.success) setAllVendedores(j.data.map(r => r.vendedor).filter(Boolean).sort());
    }).catch(() => {});
  }, [isPrivileged, apiFetch]);

  // ── Filtros de panel ──────────────────────────────────────────────────────────
  const [fCats,      setFCats]      = useState<string[]>([]);
  const [fSubs,      setFSubs]      = useState<string[]>([]);
  const [fProvs,     setFProvs]     = useState<string[]>([]);
  const [fMarcs,     setFMarcs]     = useState<string[]>([]);
  const [fProductos, setFProductos] = useState<string[]>([]);

  // Filtro de rutas
  const [fRutas,  setFRutas]  = useState<string[]>([]);

  // Opciones de filtros
  const [opSubs,  setOpSubs]  = useState<string[]>([]);
  const [opProvs, setOpProvs] = useState<string[]>([]);
  const [opMarcs, setOpMarcs] = useState<string[]>([]);
  const [opProds, setOpProds] = useState<string[]>([]);
  const [opCats,  setOpCats]  = useState<string[]>([]);
  const [opRutas, setOpRutas] = useState<string[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(false);
  const [fechaCorte, setFechaCorte] = useState<string | null>(null);

  // ── Estados ───────────────────────────────────────────────────────────────────
  const [kpisData,    setKpisData]    = useState<Record<string, number>>({});
  const [tendencia,   setTendencia]   = useState<TendenciaDia[]>([]);
  const [esPeriodoAct, setEsPeriodoAct] = useState(true);
  const [comparacion, setComparacion] = useState<ComparacionRow[]>([]);
  const [groupBy,     setGroupBy]     = useState("categoria");
  const [prevLabel,   setPrevLabel]   = useState("");
  const [skus,        setSkus]        = useState<SkuRow[]>([]);
  const [prevSkuLabel, setPrevSkuLabel] = useState("");
  const [clientesFlat,     setClientesFlat]     = useState<ClienteFechaFlat[]>([]);
  const [loadingCliFechas, setLoadingCliFechas] = useState(false);
  const [selectedCliFecha, setSelectedCliFecha] = useState<string | null>(null);
  const [cliSkus,     setCliSkus]     = useState<ClienteSkuRow[]>([]);
  const [cliSkuSearch, setCliSkuSearch] = useState("");

  const [loadingKpis,  setLoadingKpis]  = useState(true);
  const [loadingTend,  setLoadingTend]  = useState(true);
  const [loadingComp,  setLoadingComp]  = useState(false);
  const [loadingSkus,  setLoadingSkus]  = useState(false);
  const [loadingCliSku, setLoadingCliSku] = useState(false);

  // Drill / selección
  const [compDrill,    setCompDrill]    = useState<{ field: string; value: string } | null>(null);
  const [selectedSku,  setSelectedSku]  = useState<SkuRow | null>(null);
  const [selectedCli,  setSelectedCli]  = useState<{ codigo: string; nombre: string } | null>(null);

  // Panel de filtros
  const [filterPinned, setFilterPinned] = useState(false);

  // Búsqueda + sort
  const [skuSearch,   setSkuSearch]   = useState("");
  const [skuSortKey,  setSkuSortKey]  = useState<SkuSortKey>("presupuesto");
  const [skuSortDir,  setSkuSortDir]  = useState<SortDir>("desc");
  const [cliSearch,   setCliSearch]   = useState("");

  // ── Reset drills cuando cambian filtros base ──────────────────────────────────
  function resetDrill() { setCompDrill(null); setSelectedSku(null); setSelectedCli(null); setSelectedCliFecha(null); }
  function onCats(v: string[])      { setFCats(v);  setFSubs([]); setFProvs([]); setFMarcs([]); setFProductos([]); resetDrill(); }
  function onSubs(v: string[])      { setFSubs(v);  setFProvs([]); setFMarcs([]); setFProductos([]); resetDrill(); }
  function onProvs(v: string[])     { setFProvs(v); setFMarcs([]); setFProductos([]); resetDrill(); }
  function onMarcs(v: string[])     { setFMarcs(v); setFProductos([]); resetDrill(); }
  function onProductos(v: string[]) { setFProductos(v); resetDrill(); }
  function onRutas(v: string[])     { setFRutas(v); resetDrill(); }

  // ── Fetch opciones ────────────────────────────────────────────────────────────
  const fetchOpciones = useCallback(async () => {
    if (!anho || !mes || !vendedorNombre) return;
    setLoadingOpts(true);
    try {
      const qs = `regional=${regionalKey}&anho=${anho}&mes=${mes}&vendedor=${encodeURIComponent(vendedorNombre)}${fCats.map(c => `&categoria=${encodeURIComponent(c)}`).join("")}${fSubs.map(s => `&subgrupo=${encodeURIComponent(s)}`).join("")}${fProvs.map(p => `&proveedor=${encodeURIComponent(p)}`).join("")}${fMarcs.map(m => `&marca=${encodeURIComponent(m)}`).join("")}`;
      const j = await apiFetchRef.current<{
        success: boolean; subgrupos: string[]; proveedores: string[]; marcas: string[]; productos: string[]; canales: string[]; rutas?: string[];
      }>(`/dashboard/new-nacional/opciones/?${qs}`);
      if (j.success) {
        setOpSubs(j.subgrupos); setOpProvs(j.proveedores); setOpMarcs(j.marcas); setOpProds(j.productos);
        setOpRutas(j.rutas ?? []);
        setOpCats(["Alimentos", "Apego", "Licores", "Home & Personal Care", "Sin Clasificar"]);
      }
    } catch { /* silencioso */ }
    finally { setLoadingOpts(false); }
  }, [anho, mes, vendedorNombre, regionalKey, fCats, fSubs, fProvs, fMarcs]);

  useEffect(() => { void fetchOpciones(); }, [fetchOpciones]);

  // ── Fetch KPIs + Tendencia (juntos) ──────────────────────────────────────────
  const fetchKpisYTend = useCallback(async () => {
    if (!anho || !mes || !vendedorNombre) return;
    setLoadingKpis(true); setLoadingTend(true);
    try {
      const qs = buildQS(regionalKey, canalPerfil, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos, fRutas)
        + `&vendedor=${encodeURIComponent(vendedorNombre)}`;
      const [kRes, tRes] = await Promise.all([
        apiFetchRef.current<{ success: boolean; data: Record<string, number | string | Record<string, number>> }>(
          `/dashboard/nacional/kpis/?${qs}`),
        apiFetchRef.current<{ success: boolean; data: TendenciaDia[]; es_periodo_actual: boolean }>(
          `/dashboard/nacional/tendencia/?${qs}`),
      ]);
      if (kRes.success) {
        const d = kRes.data as Record<string, number | string | Record<string, number>>;
        const p = (d.presupuesto as Record<string, number>) ?? {};
        const fc = d.fecha_corte as string | undefined;
        setKpisData({ ...(d as Record<string, number>), ppto_total: p.total ?? 0, ppto_uds_total: p.total_uds ?? 0 });
        if (fc) setFechaCorte(fc);
      }
      if (tRes.success) { setTendencia(tRes.data); setEsPeriodoAct(tRes.es_periodo_actual); }
    } catch { /* silencioso */ }
    finally { setLoadingKpis(false); setLoadingTend(false); }
  }, [anho, mes, vendedorNombre, regionalKey, canalPerfil, fCats, fProvs, fSubs, fMarcs, fProductos, fRutas]);

  useEffect(() => { void fetchKpisYTend(); }, [fetchKpisYTend]);

  // ── Fetch Comparación ─────────────────────────────────────────────────────────
  const fetchComparacion = useCallback(async () => {
    if (!anho || !mes || !vendedorNombre) return;
    setLoadingComp(true);
    try {
      const qs = buildDrillQS(regionalKey, canalPerfil, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos, compDrill, fRutas)
        + `&vendedor=${encodeURIComponent(vendedorNombre)}`;
      const j = await apiFetchRef.current<{ success: boolean; data: ComparacionRow[]; group_by: string; prev_anho: number; prev_mes: number }>(
        `/dashboard/new-nacional/comparacion/?${qs}`);
      if (j.success) { setComparacion(j.data); setGroupBy(j.group_by); setPrevLabel(`${MESES[j.prev_mes]} ${j.prev_anho}`); }
    } catch { setComparacion([]); }
    finally { setLoadingComp(false); }
  }, [anho, mes, vendedorNombre, regionalKey, canalPerfil, fCats, fProvs, fSubs, fMarcs, fProductos, fRutas, compDrill]);

  useEffect(() => { void fetchComparacion(); }, [fetchComparacion]);

  // ── Fetch SKUs ────────────────────────────────────────────────────────────────
  const fetchSkus = useCallback(async () => {
    if (!anho || !mes || !vendedorNombre) return;
    setLoadingSkus(true); setSkuSearch("");
    try {
      const qs = buildDrillQS(regionalKey, canalPerfil, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos, compDrill, fRutas)
        + `&vendedor=${encodeURIComponent(vendedorNombre)}`;
      const j = await apiFetchRef.current<{ success: boolean; data: SkuRow[]; prev_anho: number; prev_mes: number }>(
        `/dashboard/new-nacional/skus/?${qs}`);
      if (j.success) { setSkus(j.data); setPrevSkuLabel(`${MESES[j.prev_mes]} ${j.prev_anho}`); }
    } catch { setSkus([]); }
    finally { setLoadingSkus(false); }
  }, [anho, mes, vendedorNombre, regionalKey, canalPerfil, fCats, fProvs, fSubs, fMarcs, fProductos, fRutas, compDrill]);

  useEffect(() => { void fetchSkus(); }, [fetchSkus]);

  // ── Fetch Clientes por fecha ──────────────────────────────────────────────────
  const fetchClientesFechas = useCallback(async () => {
    if (!anho || !mes || !vendedorNombre) return;
    setLoadingCliFechas(true); setSelectedCli(null); setSelectedCliFecha(null);
    try {
      const qs = buildDrillQS(regionalKey, canalPerfil, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos, compDrill, fRutas)
        + `&vendedor=${encodeURIComponent(vendedorNombre)}`
        + (selectedSku ? `&sku_drill=${encodeURIComponent(selectedSku.producto)}` : "");
      const j = await apiFetchRef.current<{ success: boolean; data: ClienteFechaFlat[] }>(
        `/dashboard/new-nacional/cliente-fechas/?${qs}`);
      if (j.success) setClientesFlat(j.data); else setClientesFlat([]);
    } catch { setClientesFlat([]); }
    finally { setLoadingCliFechas(false); }
  }, [anho, mes, vendedorNombre, regionalKey, canalPerfil, fCats, fProvs, fSubs, fMarcs, fProductos, fRutas, compDrill, selectedSku]);

  useEffect(() => { void fetchClientesFechas(); }, [fetchClientesFechas]);

  // ── Fetch SKUs del cliente ────────────────────────────────────────────────────
  useEffect(() => {
    setCliSkuSearch("");
    if (!selectedCli || !anho || !mes || !vendedorNombre) { setCliSkus([]); return; }
    setLoadingCliSku(true);
    const qs = buildQS(regionalKey, canalPerfil, anho, mes, fCats, fProvs, fSubs, fMarcs, fProductos, fRutas);
    apiFetchRef.current<{ success: boolean; data: ClienteSkuRow[] }>(
      `/dashboard/new-nacional/cliente-skus/?${qs}&cliente_codigo=${encodeURIComponent(selectedCli.codigo)}&vendedor=${encodeURIComponent(vendedorNombre)}`
        + (selectedCliFecha ? `&fecha=${encodeURIComponent(selectedCliFecha)}` : "")
    ).then(j => { if (j.success) setCliSkus(j.data); }).catch(() => setCliSkus([]))
     .finally(() => setLoadingCliSku(false));
  }, [selectedCli, selectedCliFecha, anho, mes, vendedorNombre, regionalKey, canalPerfil, fCats, fProvs, fSubs, fMarcs, fProductos, fRutas]);

  // ── Handlers de drill ─────────────────────────────────────────────────────────
  function onCompDrillClick(row: ComparacionRow) {
    if (!groupBy || groupBy === "total") return;
    const isActive = compDrill?.field === groupBy && compDrill?.value === row.name;
    setCompDrill(isActive ? null : { field: groupBy, value: row.name });
    setSelectedSku(null); setSelectedCli(null);
  }
  function onSkuClick(sku: SkuRow) {
    const isActive = selectedSku?.codigo === sku.codigo;
    setSelectedSku(isActive ? null : sku);
    setSelectedCli(null);
  }

  // ── KPIs derivados ────────────────────────────────────────────────────────────
  const ventaTotal     = (kpisData.total_nacional as number) ?? 0;
  const pptoTotal      = (kpisData.ppto_total as number)     ?? 0;
  const cantTotal      = (kpisData.cantidad_total as number)  ?? 0;
  const pptoUdsTotal   = (kpisData.ppto_uds_total as number) ?? 0;
  const cobertura      = (kpisData.cobertura_total as number) ?? 0;
  const carteraAnho    = kpisData.cartera_anho   != null ? (kpisData.cartera_anho   as number) : null;
  const totalAnterior  = kpisData.total_anterior != null ? (kpisData.total_anterior  as number) : null;
  const totalVendedor  = kpisData.total_vendedor != null ? (kpisData.total_vendedor  as number) : null;
  const rutaActiva     = fRutas.length > 0;
  const pctCumpl       = pptoTotal > 0 ? ventaTotal / pptoTotal * 100 : null;
  const pctParticip    = totalVendedor != null && totalVendedor > 0
    ? ventaTotal / totalVendedor * 100 : null;
  const pctCambMes     = totalAnterior != null && totalAnterior > 0
    ? (ventaTotal - totalAnterior) / totalAnterior * 100 : null;
  const pctCobertura   = carteraAnho != null && carteraAnho > 0
    ? cobertura / carteraAnho * 100 : null;

  // ── Sorted/filtered SKUs ──────────────────────────────────────────────────────
  const sortedSkus = useMemo(() => {
    return [...skus].sort((a, b) => {
      let diff: number;
      if      (skuSortKey === "presupuesto")  diff = b.presupuesto - a.presupuesto;
      else if (skuSortKey === "cumplimiento") diff = (b.pct_cumpl ?? -Infinity) - (a.pct_cumpl ?? -Infinity);
      else if (skuSortKey === "crecimiento")  diff = (b.pct_camb_bs ?? -Infinity) - (a.pct_camb_bs ?? -Infinity);
      else                                    diff = b.venta_neta - a.venta_neta;
      return skuSortDir === "desc" ? diff : -diff;
    });
  }, [skus, skuSortKey, skuSortDir]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return q ? sortedSkus.filter(s => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)) : sortedSkus;
  }, [sortedSkus, skuSearch]);

  // ── Pivot clientes por fecha ──────────────────────────────────────────────────
  const clienteMap = useMemo(() => {
    const m    = new Map<string, Map<string, { venta_neta: number; cantidad: number }>>();
    const info = new Map<string, string>();
    for (const r of clientesFlat) {
      if (!m.has(r.codigo)) m.set(r.codigo, new Map());
      m.get(r.codigo)!.set(r.fecha, { venta_neta: r.venta_neta, cantidad: r.cantidad });
      info.set(r.codigo, r.nombre);
    }
    return { m, info };
  }, [clientesFlat]);

  const uniqueFechas = useMemo(() => {
    const s = new Set<string>();
    for (const r of clientesFlat) s.add(r.fecha);
    return [...s].sort();
  }, [clientesFlat]);

  const filteredCliRows = useMemo(() => {
    const q = cliSearch.trim().toLowerCase();
    const entries = [...clienteMap.m.entries()].filter(([cod]) => {
      const nom = clienteMap.info.get(cod) ?? "";
      return !q || nom.toLowerCase().includes(q) || cod.toLowerCase().includes(q);
    });
    return entries.sort((a, b) => {
      const totA = [...a[1].values()].reduce((s, v) => s + v.venta_neta, 0);
      const totB = [...b[1].values()].reduce((s, v) => s + v.venta_neta, 0);
      return totB - totA;
    });
  }, [clienteMap, cliSearch]);

  const filteredCliSkus = useMemo(() => {
    const q = cliSkuSearch.trim().toLowerCase();
    return q ? cliSkus.filter(s => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)) : cliSkus;
  }, [cliSkus, cliSkuSearch]);

  // Tendencia chart data
  const tendData = useMemo(() => tendencia.map(d => ({
    dia: d.dia,
    avance: d.avance_acumulado,
    ppto:   d.presupuesto_acumulado,
    proy:   d.proyeccion_acumulada,
  })), [tendencia]);

  const avanceTend = tendencia.findLast(d => d.avance_acumulado != null)?.avance_acumulado ?? 0;
  const pptoTend   = tendencia.findLast(d => d.presupuesto_acumulado != null)?.presupuesto_acumulado ?? 0;
  const proyTend   = tendencia.findLast(d => d.proyeccion_acumulada != null)?.proyeccion_acumulada ?? null;

  function refreshAll() {
    void fetchKpisYTend(); void fetchOpciones(); void fetchComparacion(); void fetchSkus(); void fetchClientesFechas();
  }

  if (!isPrivileged && !vendedorNombre) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-slate-400">
          <AlertCircle size={20} className="mr-2" /> Perfil de vendedor no configurado.
        </div>
      </DashboardLayout>
    );
  }

  const vendFiltrados = vendSearch.trim()
    ? allVendedores.filter(v => v.toLowerCase().includes(vendSearch.toLowerCase()))
    : allVendedores;

  const activeFilterChips = [
    ...fCats.map( v => ({ label: v, color: "bg-slate-100 text-slate-700",    clear: () => onCats(fCats.filter(x => x !== v)) })),
    ...fSubs.map( v => ({ label: v, color: "bg-violet-50 text-violet-700",   clear: () => onSubs(fSubs.filter(x => x !== v)) })),
    ...fProvs.map(v => ({ label: v, color: "bg-blue-50 text-blue-700",       clear: () => onProvs(fProvs.filter(x => x !== v)) })),
    ...fMarcs.map(v => ({ label: v, color: "bg-emerald-50 text-emerald-700", clear: () => onMarcs(fMarcs.filter(x => x !== v)) })),
    ...fProductos.map(v => ({ label: v, color: "bg-teal-50 text-teal-700",   clear: () => onProductos(fProductos.filter(x => x !== v)) })),
    ...fRutas.map(v => ({ label: v, color: "bg-orange-50 text-orange-700",   clear: () => onRutas(fRutas.filter(x => x !== v)) })),
  ];
  const hasFilters = activeFilterChips.length > 0;

  return (
    <DashboardLayout>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        {/* Izquierda: título + fecha corte */}
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Vendedor</h1>
          {fechaCorte && (
            <p className="text-[11px] text-slate-400">
              Datos al {new Date(fechaCorte + "T00:00:00").toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          )}
          {!isPrivileged && (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-base font-semibold text-brand-700">{vendedorNombre}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                <Lock size={9} /> {regionalRaw}
              </span>
              {canalPerfil && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  <Lock size={9} /> {canalPerfil}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Derecha: Vendedor (privileged) + Gestión + Mes + Actualizar */}
        <div className="flex items-end gap-3 flex-wrap">
          {isPrivileged && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Vendedor</span>
              <div ref={vendListRef} className="relative">
                <button
                  onClick={() => setVendListOpen(o => !o)}
                  className={`flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border transition-all min-w-48 ${vendedorNombre ? "border-brand-400 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-400 hover:border-brand-300"}`}>
                  <span className="flex-1 text-left truncate">{vendedorNombre || "Seleccionar vendedor…"}</span>
                  <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${vendListOpen ? "rotate-180" : ""}`} />
                </button>
                {vendListOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 sm:left-auto sm:right-0 bg-white border border-slate-200 rounded-xl shadow-xl w-80 max-w-[calc(100vw-1rem)]">
                    <div className="p-2 border-b border-slate-100">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input autoFocus type="text" value={vendSearch}
                          onChange={e => setVendSearch(e.target.value)}
                          placeholder="Buscar vendedor…"
                          className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400" />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {vendFiltrados.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-4">Sin resultados</p>
                        : vendFiltrados.map(v => (
                          <button key={v} onClick={() => { setAdminVendedor(v); setVendListOpen(false); setVendSearch(""); setFRutas([]); }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${v === vendedorNombre ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                            {v}
                          </button>
                        ))}
                    </div>
                    {vendedorNombre && (
                      <div className="border-t border-slate-100 p-1.5">
                        <button onClick={() => { setAdminVendedor(""); setVendListOpen(false); setVendSearch(""); setFRutas([]); }}
                          className="w-full text-left px-2 py-1 text-[11px] text-red-500 hover:bg-red-50 rounded">
                          Limpiar selección
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(+e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(+e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              {mesesDisponibles.length
                ? mesesDisponibles.map(p => <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>)
                : MESES.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
            </select>
          </div>
          <button onClick={refreshAll}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-all">
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {/* ── Panel de Filtros ─────────────────────────────────────────────────── */}
      <div className={`${filterPinned ? "sticky top-16 z-20" : ""} bg-white border border-slate-200 rounded-2xl shadow-sm px-4 sm:px-6 py-4 mb-5`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            onClick={() => setFilterPinned(p => !p)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
              filterPinned
                ? "bg-brand-50 text-brand-600 border-brand-200 hover:bg-brand-100"
                : "bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300"
            }`}>
            {filterPinned ? <Pin size={11} /> : <PinOff size={11} />}
            {filterPinned ? "Fijado" : "Fijar"}
          </button>
          {hasFilters && (
            <button onClick={() => { setFCats([]); setFSubs([]); setFProvs([]); setFMarcs([]); setFProductos([]); setFRutas([]); resetDrill(); }}
              className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50">
              Limpiar todo ✕
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3 md:flex md:flex-wrap md:items-end">
          <MultiSelect label="Categoría"     value={fCats}      options={opCats}  onChange={onCats}      loading={loadingOpts} />
          <MultiSelect label="Sub-categoría" value={fSubs}      options={opSubs}  onChange={onSubs}      searchable loading={loadingOpts} />
          <MultiSelect label="Proveedor"     value={fProvs}     options={opProvs} onChange={onProvs}     searchable loading={loadingOpts} />
          <MultiSelect label="Marca"         value={fMarcs}     options={opMarcs} onChange={onMarcs}     searchable loading={loadingOpts} />
          <MultiSelect label="Productos"     value={fProductos} options={opProds} onChange={onProductos} searchable loading={loadingOpts} />
          <MultiSelect label="Rutas"         value={fRutas}     options={opRutas} onChange={onRutas}     searchable loading={loadingOpts} />
        </div>
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
            {activeFilterChips.map(({ label, color, clear }, i) => (
              <button key={i} onClick={clear}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-transparent hover:opacity-80 transition-opacity ${color}`}>
                {label}<span className="opacity-60">✕</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Prompt de selección (solo cuando privilegiado sin vendedor) ───── */}
      {isPrivileged && !vendedorNombre && (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
          <Search size={32} className="opacity-30" />
          <p className="text-sm font-semibold">Seleccioná un vendedor para ver sus datos</p>
          <p className="text-xs">{allVendedores.length > 0 ? `${allVendedores.length} vendedores disponibles` : "Cargando lista…"}</p>
        </div>
      )}

      {/* ── Contenido principal (oculto hasta tener vendedor seleccionado) ── */}
      {(!isPrivileged || vendedorNombre) && (<>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      {loadingKpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-24 animate-pulse bg-slate-50" />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 mb-5">
          <KpiCard
            title={rutaActiva ? `Ventas Ruta${fRutas.length > 1 ? "s" : ""}` : "Ventas del Mes"}
            avance={ventaTotal}
            ppto={rutaActiva ? (totalVendedor ?? 0) : pptoTotal}
            pct={rutaActiva ? pctParticip : pctCumpl}
            pptoLabel={rutaActiva ? "total vendedor" : "ppto."}
            showGap={!rutaActiva}
          />
          <div className="card flex-1 min-w-44">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Unidades Vendidas</p>
            <p className="text-xl font-bold text-slate-800 leading-tight">{fmtN(cantTotal)}</p>
            {pptoUdsTotal > 0 && (
              <p className="text-[11px] text-slate-400 mt-0.5">/ {fmtN(pptoUdsTotal)} ppto.</p>
            )}
          </div>
          <div className="card flex-1 min-w-44">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Clientes Activos</p>
            <p className="text-xl font-bold text-slate-800 leading-tight">{fmtN(cobertura)}</p>
            {carteraAnho != null && carteraAnho > 0 && (
              <p className="text-[11px] text-slate-400 mt-0.5">de {fmtN(carteraAnho)} en cartera</p>
            )}
            {pctCobertura != null && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-sm font-bold ${pctCobertura >= 80 ? "text-emerald-600" : pctCobertura >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                  {fmtPct(pctCobertura)}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">cobertura</span>
              </div>
            )}
          </div>
          <div className="card flex-1 min-w-44">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">vs Mes Anterior</p>
            <p className={`text-xl font-bold leading-tight ${pctCambMes == null ? "text-slate-400" : pctCambMes >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {pctCambMes != null ? `${pctCambMes >= 0 ? "+" : ""}${pctCambMes.toFixed(1)}%` : "—"}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {totalAnterior != null && totalAnterior > 0 ? `Ant: ${fmt(totalAnterior)}` : MESES[mes > 1 ? mes - 1 : 12]}
            </p>
          </div>
        </div>
      )}

      {/* ── Tendencia ──────────────────────────────────────────────────────── */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
              <TrendingUp size={14} className="text-brand-500" /> Tendencia {esPeriodoAct ? "(mes en curso)" : ""}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{MESES[mes]} {anho} · {vendedorNombre}</p>
          </div>
          <div className="text-right text-[11px] text-slate-500 space-y-0.5">
            <div>Avance: <span className="font-semibold text-slate-700">{fmt(avanceTend)}</span></div>
            <div>Ppto.: <span className="font-semibold">{fmt(pptoTend)}</span></div>
            {proyTend != null && <div>Proy.: <span className="font-semibold text-orange-500">{fmt(proyTend)}</span></div>}
          </div>
        </div>
        {loadingTend ? (
          <div className="h-52 flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={tendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v/1000)}k`} width={48} />
                <Tooltip content={<TendTip />} />
                <Line type="monotone" dataKey="ppto"   name="Presupuesto" stroke="#22c55e" strokeDasharray="6 4" dot={false} strokeWidth={2}   connectNulls />
                <Line type="monotone" dataKey="avance" name="Avance"      stroke="#3b82f6"                      dot={false} strokeWidth={2.5} connectNulls />
                <Line type="monotone" dataKey="proy"   name="Proyección"  stroke="#f97316" strokeDasharray="6 3" dot={false} strokeWidth={2}   connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 justify-center text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#22c55e" strokeWidth="2" strokeDasharray="5 3" /></svg>
                Presupuesto
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#3b82f6" strokeWidth="2.5" /></svg>
                Avance
              </span>
              {esPeriodoAct && (
                <span className="flex items-center gap-1.5">
                  <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#f97316" strokeWidth="2" strokeDasharray="6 3" /></svg>
                  Proyección
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Comparación ────────────────────────────────────────────────────── */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-slate-700 text-sm">
              Comparación por {GROUP_BY_LABEL[groupBy] ?? groupBy}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{MESES[mes]} {anho} vs {prevLabel}</p>
            {compDrill && (
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                {GROUP_BY_LABEL[compDrill.field]}: {compDrill.value}
                <button className="opacity-60 hover:opacity-100" onClick={() => setCompDrill(null)}>✕</button>
              </span>
            )}
          </div>
        </div>
        {loadingComp ? (
          <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-wider">
                  <th className="text-left py-2 font-semibold pl-1">{GROUP_BY_LABEL[groupBy] ?? "Grupo"}</th>
                  <th className="text-right py-2 font-semibold">Bs. Vendidos</th>
                  <th className="text-right py-2 font-semibold">Ppto. Bs.</th>
                  <th className="text-right py-2 font-semibold">% Cumpl.</th>
                  <th className="text-right py-2 font-semibold">vs {prevLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {comparacion.map(row => {
                  const isDrillActive = compDrill?.field === groupBy && compDrill?.value === row.name;
                  return (
                    <tr key={row.name}
                      onClick={() => onCompDrillClick(row)}
                      className={`transition-colors ${groupBy !== "total" ? "cursor-pointer" : ""} ${isDrillActive ? "bg-violet-50 ring-1 ring-inset ring-violet-300" : "hover:bg-slate-50/60"}`}>
                      <td className={`py-2.5 pl-1 font-semibold ${isDrillActive ? "text-violet-700" : "text-slate-700"}`}>{row.name}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">{fmt(row.venta_neta)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-500">{fmt(row.ppto_bs)}</td>
                      <td className={`py-2.5 text-right tabular-nums font-bold ${cumplColor(row.pct_cumpl)}`}>{fmtPct(row.pct_cumpl)}</td>
                      <td className={`py-2.5 text-right tabular-nums text-[11px] font-semibold ${row.pct_camb_bs == null ? "text-slate-400" : row.pct_camb_bs >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {row.pct_camb_bs != null ? `${row.pct_camb_bs >= 0 ? "+" : ""}${row.pct_camb_bs.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SKUs ───────────────────────────────────────────────────────────── */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-700 text-sm">SKUs</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{MESES[mes]} {anho} vs {prevSkuLabel}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {compDrill && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                  {GROUP_BY_LABEL[compDrill.field]}: {compDrill.value}
                </span>
              )}
              {selectedSku && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-200 cursor-pointer"
                  onClick={() => setSelectedSku(null)}>
                  SKU: {selectedSku.producto} <span className="opacity-60">✕</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
              {(["presupuesto", "cumplimiento", "crecimiento", "ventas_bs"] as SkuSortKey[]).map(k => (
                <button key={k} onClick={() => setSkuSortKey(k)}
                  className={`px-2.5 py-1.5 transition-colors ${skuSortKey === k ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {k === "presupuesto" ? "Ppto." : k === "cumplimiento" ? "Cumpl." : k === "crecimiento" ? "Crec." : "Ventas"}
                </button>
              ))}
            </div>
            <button onClick={() => setSkuSortDir(d => d === "desc" ? "asc" : "desc")}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-all">
              {skuSortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
            placeholder="Buscar SKU..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white" />
        </div>

        {loadingSkus ? (
          <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
        ) : filteredSkus.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-wider">
                  <th className="text-left py-2 pb-3 font-semibold pl-1">Producto</th>
                  <th className="text-right py-2 pb-3 font-semibold">Bs. Vendidos</th>
                  <th className="text-right py-2 pb-3 font-semibold">Uds.</th>
                  <th className="text-right py-2 pb-3 font-semibold">Ppto. Bs.</th>
                  <th className="text-right py-2 pb-3 font-semibold">% Cumpl.</th>
                  <th className="text-right py-2 pb-3 font-semibold">vs {prevSkuLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredSkus.map(s => {
                  const isActive = selectedSku?.codigo === s.codigo;
                  return (
                    <tr key={s.codigo}
                      onClick={() => onSkuClick(s)}
                      className={`cursor-pointer transition-colors ${isActive ? "bg-teal-50 ring-1 ring-inset ring-teal-300" : "hover:bg-slate-50/60"}`}>
                      <td className={`py-2.5 pl-1 ${isActive ? "text-teal-700" : "text-slate-700"}`}>
                        <span className="block font-medium leading-snug">{s.producto}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{s.codigo}</span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700 font-semibold">{fmt(s.venta_neta)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-600">{fmtN(s.cantidad)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-500">{fmt(s.presupuesto)}</td>
                      <td className={`py-2.5 text-right tabular-nums font-bold ${cumplColor(s.pct_cumpl)}`}>{fmtPct(s.pct_cumpl)}</td>
                      <td className={`py-2.5 text-right tabular-nums text-[11px] font-semibold ${s.pct_camb_bs == null ? "text-slate-400" : s.pct_camb_bs >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {s.pct_camb_bs != null ? `${s.pct_camb_bs >= 0 ? "+" : ""}${s.pct_camb_bs.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Clientes ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-slate-700 text-sm">Clientes por fecha de compra</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{MESES[mes]} {anho}
                {selectedSku && <span className="ml-2 text-teal-500">· {selectedSku.producto}</span>}
              </p>
              {compDrill && (
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                  {GROUP_BY_LABEL[compDrill.field]}: {compDrill.value}
                </span>
              )}
            </div>
          </div>

          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" value={cliSearch} onChange={e => setCliSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white" />
          </div>

          {loadingCliFechas ? (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
          ) : filteredCliRows.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 420 }}>
              <table className="text-xs border-collapse"
                style={{ minWidth: `${Math.max(400, uniqueFechas.length * 80 + 280)}px` }}>
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="sticky left-0 z-30 bg-white text-left py-2 pr-4 font-semibold text-slate-400 uppercase tracking-wider shadow-[1px_0_0_0_#f1f5f9] min-w-48 border-b border-slate-100 pl-1">
                      Cliente
                    </th>
                    {uniqueFechas.map(f => (
                      <th key={f} className="bg-white py-2 px-2 font-semibold text-center text-slate-400 uppercase tracking-wider min-w-20 border-b border-slate-100 whitespace-nowrap">
                        {f.slice(8, 10)}/{f.slice(5, 7)}
                      </th>
                    ))}
                    <th className="sticky right-0 z-30 bg-white py-2 pl-3 pr-3 font-semibold text-right text-slate-400 uppercase tracking-wider shadow-[-1px_0_0_0_#f1f5f9] min-w-24 border-b border-slate-100 whitespace-nowrap">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCliRows.map(([cod, fechaMap]) => {
                    const nombre     = clienteMap.info.get(cod) ?? cod;
                    const isActive   = selectedCli?.codigo === cod;
                    const totalVenta = [...fechaMap.values()].reduce((s, v) => s + v.venta_neta, 0);
                    return (
                      <tr key={cod} className={`border-b border-slate-50 transition-colors ${isActive ? "bg-brand-50" : "hover:bg-slate-50/60"}`}>
                        <td
                          className={`sticky left-0 z-10 py-2 pr-4 pl-1 shadow-[1px_0_0_0_#f1f5f9] cursor-pointer ${isActive ? "bg-brand-50" : "bg-white hover:bg-slate-50"}`}
                          onClick={() => {
                            if (isActive && selectedCliFecha == null) { setSelectedCli(null); }
                            else { setSelectedCli({ codigo: cod, nombre }); setSelectedCliFecha(null); }
                          }}>
                          <span className={`block font-semibold leading-snug ${isActive && !selectedCliFecha ? "text-brand-700" : "text-slate-700"}`}>{nombre}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{cod}</span>
                        </td>
                        {uniqueFechas.map(f => {
                          const cell       = fechaMap.get(f);
                          const isCellActive = isActive && selectedCliFecha === f;
                          return (
                            <td key={f}
                              onClick={() => {
                                if (!cell) return;
                                if (isCellActive) { setSelectedCliFecha(null); setSelectedCli({ codigo: cod, nombre }); }
                                else { setSelectedCli({ codigo: cod, nombre }); setSelectedCliFecha(f); }
                              }}
                              className={`py-1.5 px-2 text-center tabular-nums transition-colors text-[11px] ${
                                isCellActive ? "bg-brand-500 text-white font-bold rounded"
                                : cell       ? "text-slate-700 cursor-pointer hover:bg-brand-50 hover:text-brand-700"
                                :              "text-slate-200"
                              }`}>
                              {cell ? fmtN(cell.venta_neta) : "—"}
                            </td>
                          );
                        })}
                        <td className={`sticky right-0 z-10 py-2 pl-3 pr-3 text-right tabular-nums font-bold shadow-[-1px_0_0_0_#f1f5f9] ${isActive && !selectedCliFecha ? "bg-brand-50 text-brand-700" : "bg-white text-slate-700"}`}>
                          {fmtN(totalVenta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="border-t border-slate-200">
                    <td className="sticky left-0 z-30 py-2 pr-4 pl-1 font-bold text-slate-700 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]">
                      Total
                    </td>
                    {uniqueFechas.map(f => {
                      const colTotal = filteredCliRows.reduce((s, [, fm]) => s + (fm.get(f)?.venta_neta ?? 0), 0);
                      return (
                        <td key={f} className="py-2 px-2 text-center tabular-nums font-bold text-slate-700 bg-slate-50 text-[11px]">
                          {colTotal > 0 ? fmtN(colTotal) : "—"}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-30 py-2 pl-3 pr-3 text-right tabular-nums font-bold text-brand-700 bg-slate-50 shadow-[-1px_0_0_0_#e2e8f0]">
                      {fmtN(filteredCliRows.reduce((s, [, fm]) => s + [...fm.values()].reduce((ss, v) => ss + v.venta_neta, 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Panel SKUs del cliente */}
        {selectedCli && (
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-slate-700 text-sm">{selectedCli.nombre}</p>
                <p className="text-[10px] text-slate-400">
                  {selectedCli.codigo} ·{" "}
                  {selectedCliFecha
                    ? new Date(selectedCliFecha + "T00:00:00").toLocaleDateString("es-BO", { day: "2-digit", month: "long" })
                    : "Acumulado del mes"}
                </p>
              </div>
              <button onClick={() => { setSelectedCli(null); setSelectedCliFecha(null); }} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            {loadingCliSku ? (
              <div className="h-20 flex items-center justify-center text-slate-400 text-xs">Cargando…</div>
            ) : cliSkus.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Sin datos</p>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="text" value={cliSkuSearch} onChange={e => setCliSkuSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white" />
                </div>
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase">
                        <th className="text-left py-1.5 font-semibold">Producto</th>
                        <th className="text-right py-1.5 font-semibold">Bs.</th>
                        <th className="text-right py-1.5 font-semibold">Uds.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredCliSkus.map(s => (
                        <tr key={s.codigo} className="hover:bg-slate-50">
                          <td className="py-1.5 text-slate-700">
                            <span className="block font-medium leading-snug">{s.producto}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{s.codigo}</span>
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-slate-700">{fmt(s.venta_neta)}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-600">{fmtN(s.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td className="py-1.5 font-bold text-slate-700">
                          Total{filteredCliSkus.length !== cliSkus.length ? ` (${filteredCliSkus.length}/${cliSkus.length})` : ""}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-bold text-slate-700">
                          {fmt(filteredCliSkus.reduce((s, r) => s + r.venta_neta, 0))}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-bold text-slate-600">
                          {fmtN(filteredCliSkus.reduce((s, r) => s + r.cantidad, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      </>)}
    </DashboardLayout>
  );
}
