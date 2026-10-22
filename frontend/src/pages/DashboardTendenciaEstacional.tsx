import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertCircle, ChevronDown, X, SlidersHorizontal, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { setActiveFilters } from "../utils/filterStore";
import type { AuthContextValue } from "../types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PuntoBase   { anho: number; mes_numero: number; total: number; cantidad: number }
interface PuntoCat    extends PuntoBase { categoria: string }
interface PuntoCanal  extends PuntoBase { canal: string }
interface PuntoCadena extends PuntoBase { cadena: string }
interface Periodo     { anho: number; mes_numero: number; mes_nombre: string }

type CorteModo    = "completo" | "hoy" | "personalizado";
type Metrica      = "total" | "cantidad";
type ModoTemporal = "ultimos6" | "estacional" | "rango";

// ─── Constantes / paletas ─────────────────────────────────────────────────────

const REGIONALES = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"] as const;

const ADMIN_CARGOS = new Set([
  "Administrador de Sistema", "Subadministrador de Sistemas",
  "Gerente General", "Gerente de Ventas", "Analista de Datos",
]);

const REGIONAL_CONFIG: Record<string, { badge: string }> = {
  Nacional:     { badge: "bg-brand-100 text-brand-700 border-brand-200" },
  "Santa Cruz": { badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba:   { badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz":     { badge: "bg-amber-100 text-amber-700 border-amber-200" },
};
const MESES      = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
                    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const YEAR_PAL  = ["#94a3b8","#60a5fa","#16a34a","#f59e0b","#e11d48"];
const MONTH_PAL = ["#6366f1","#0ea5e9","#14b8a6","#84cc16","#f97316","#ec4899"];
const CANAL_PAL = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444",
                   "#06b6d4","#84cc16","#f97316","#ec4899","#6366f1","#14b8a6","#a3e635"];

const CADENA_NAMES = ["Hipermaxi","Farmahiper","MacroFidalga","SurFidalga","Fidasur","DeLicor","Farmacorp","Tia","IC Norte","Otros"] as const;

const CAT_COLORS: Record<string, string> = {
  "Alimentos":            "#3b82f6",
  "Apego":                "#f59e0b",
  "Licores":              "#8b5cf6",
  "Home & Personal Care": "#10b981",
  "Sin clasificar":       "#94a3b8",
};
const CAT_ORDER = ["Alimentos","Apego","Licores","Home & Personal Care","Sin clasificar"];

function yearColor(a: number, ref: number) {
  return YEAR_PAL[Math.min(ref - a, YEAR_PAL.length - 1)] ?? "#94a3b8";
}
function canalColor(i: number) { return CANAL_PAL[i % CANAL_PAL.length]; }

// ─── Formatos ─────────────────────────────────────────────────────────────────

const fmtBs = (v: number) =>
  `Bs ${v >= 1_000_000 ? (v/1_000_000).toFixed(2)+"M" : v >= 1_000 ? (v/1_000).toFixed(1)+"K" : v.toFixed(0)}`;
const fmtFull = (v: number) =>
  new Intl.NumberFormat("es-BO",{minimumFractionDigits:0}).format(Math.round(v));
const fmtVal  = (v: number, m: Metrica) => m === "total" ? fmtBs(v) : `${fmtFull(v)} uds`;

// ─── Pivot: rows → { _key, K1: val, K2: val } para recharts stacked ──────────

function pivotRows<T extends { anho: number; mes_numero: number; total: number; cantidad: number }>(
  rows: T[], keyFn: (r: T) => string, periodFn: (r: T) => string, metrica: Metrica,
): { _key: string; [k: string]: number | string }[] {
  const order: string[] = [];
  const map: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const period = periodFn(r);
    const key    = keyFn(r);
    if (!map[period]) { map[period] = {}; order.push(period); }
    map[period][key] = (map[period][key] ?? 0) + (metrica === "total" ? r.total : r.cantidad);
  }
  return order.map(p => ({ _key: p, ...map[p] }));
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, actual, anterior, metrica, vsLabel = "vs año anterior" }: {
  label: string; actual: number; anterior: number; metrica: Metrica; vsLabel?: string;
}) {
  const pct    = anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;
  const up     = pct !== null && pct > 0;
  const down   = pct !== null && pct < 0;
  const Icon   = up ? TrendingUp : down ? TrendingDown : Minus;
  const color  = up ? "text-green-600" : down ? "text-red-500" : "text-slate-400";
  const bgIcon = up ? "bg-green-50"    : down ? "bg-red-50"    : "bg-slate-50";
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-start gap-4">
      <div className={`w-9 h-9 rounded-lg ${bgIcon} flex items-center justify-center shrink-0`}>
        <Icon size={16} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-lg font-bold text-slate-800 mt-0.5">{fmtVal(actual, metrica)}</p>
        {pct !== null
          ? <p className={`text-xs font-semibold mt-0.5 ${color}`}>{up?"+":""}{pct.toFixed(1)}% {vsLabel}</p>
          : <p className="text-xs text-slate-400 mt-0.5">Sin dato anterior</p>}
      </div>
    </div>
  );
}

// ─── Toggle Bs / Uds ─────────────────────────────────────────────────────────

function MetricaToggle({ value, onChange }: { value: Metrica; onChange: (m: Metrica) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Ver en</label>
      <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
        {(["total","cantidad"] as Metrica[]).map(m => (
          <button key={m} onClick={() => onChange(m)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              value === m ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            {m === "total" ? "Bs" : "Uds"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tooltip genérico ─────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, metrica, pct = false }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; payload: Record<string,number> }[];
  label?: string;
  metrica: Metrica;
  pct?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs min-w-40">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(p => {
        const raw = pct ? (p.payload[`_raw_${p.name}`] ?? 0) : p.value;
        return (
          <div key={p.name} className="flex items-center justify-between gap-3 mb-1">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              <span className="text-slate-600 truncate">{p.name}</span>
            </span>
            <span className="font-semibold text-slate-800 shrink-0">
              {pct ? `${Number(p.value).toFixed(1)}% · ${fmtVal(raw, metrica)}` : fmtVal(p.value, metrica)}
            </span>
          </div>
        );
      })}
      {payload.length > 1 && (
        <div className="border-t border-slate-100 mt-1.5 pt-1.5 flex justify-between font-semibold text-slate-700">
          <span>Total</span>
          <span>{pct ? "100%" : fmtVal(total, metrica)}</span>
        </div>
      )}
    </div>
  );
}

const Spinner = () => (
  <div className="h-64 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardTendenciaEstacional() {
  const { apiFetch, user } = useAuth() as AuthContextValue;
  const now = new Date();

  const isAdmin           = !!(user && (user.is_staff || ADMIN_CARGOS.has(user.cargo ?? "")));
  const isGerenteRegional = !isAdmin && user?.cargo === "Gerente Regional";
  const isSuperv          = !isAdmin && !isGerenteRegional && (user?.cargo?.toLowerCase().includes("supervisor") ?? false);

  // Filtros principales
  const [regional,      setRegional]      = useState<string>("Nacional");
  const [canal,         setCanal]         = useState<string>("Todos");
  const [canales,       setCanales]       = useState<string[]>([]);
  const [supervisor,    setSupervisor]    = useState<string>("");
  const [supervisorList,setSupervisorList]= useState<string[]>([]);
  const [anho,      setAnho]      = useState<number>(0);
  const [mes,       setMes]       = useState<number>(0);
  const [mesInicio, setMesInicio] = useState<number>(1);
  const [metrica,   setMetrica]   = useState<Metrica>("total");
  const [modoTemporal,       setModoTemporal]       = useState<ModoTemporal>("estacional");
  const [corteModo,          setCorteModo]          = useState<CorteModo>("hoy");
  const [cortePersonalizado, setCortePersonalizado] = useState<number>(now.getDate());

  // Filtros de sección
  const [fLineas,      setFLineas]      = useState<string[]>([]);
  const [fProveedores, setFProveedores] = useState<string[]>([]);
  const [fCadenas,     setFCadenas]     = useState<string[]>([]);
  const [fCliente,     setFCliente]     = useState<string>("");
  const [opLineas,     setOpLineas]     = useState<string[]>([]);
  const [opProveedores,setOpProveedores]= useState<string[]>([]);
  const [opClientes,   setOpClientes]   = useState<string[]>([]);
  const [opRutas,      setOpRutas]      = useState<string[]>([]);
  const [fRuta,        setFRuta]        = useState<string>("");
  const [showSecFiltros, setShowSecFiltros] = useState<boolean>(false);
  const secOpLoaded   = useRef(false);
  const cliOpLoaded   = useRef(false);
  // Dropdown states
  const [showProvDrop, setShowProvDrop] = useState(false);
  const [provSearch,   setProvSearch]   = useState("");
  const [showLinDrop,  setShowLinDrop]  = useState(false);
  const [linSearch,    setLinSearch]    = useState("");
  const [showCadDrop,  setShowCadDrop]  = useState(false);
  const [cadSearch,    setCadSearch]    = useState("");
  const [showCliDrop,  setShowCliDrop]  = useState(false);
  const [cliSearch,    setCliSearch]    = useState("");
  const [showRutaDrop, setShowRutaDrop] = useState(false);
  const [rutaSearch,   setRutaSearch]   = useState("");
  const provRef = useRef<HTMLDivElement>(null);
  const linRef  = useRef<HTMLDivElement>(null);
  const cadRef  = useRef<HTMLDivElement>(null);
  const cliRef  = useRef<HTMLDivElement>(null);
  const rutaRef = useRef<HTMLDivElement>(null);

  // Datos
  const [dataMain,     setDataMain]     = useState<PuntoBase[]>([]);
  const [dataCat,      setDataCat]      = useState<PuntoCat[]>([]);
  const [dataCanalDsg, setDataCanalDsg] = useState<PuntoCanal[]>([]);
  const [dataCadena,   setDataCadena]   = useState<PuntoCadena[]>([]);
  const [periodos,     setPeriodos]     = useState<Periodo[]>([]);
  const [loading,      setLoading]      = useState<boolean>(true);
  const [error,        setError]        = useState<string | null>(null);

  const esAnual = modoTemporal === "estacional" || modoTemporal === "rango";

  const diaCorte = corteModo === "completo" ? 0
    : corteModo === "hoy" ? now.getDate()
    : cortePersonalizado;

  useEffect(() => {
    setActiveFilters({ regional, canal, supervisor, anho, mes, mesInicio, metrica, modoTemporal, corteModo, cortePersonalizado });
  }, [regional, canal, supervisor, anho, mes, mesInicio, metrica, modoTemporal, corteModo, cortePersonalizado]);

  // Init regional/canal desde perfil para no-admin
  useEffect(() => {
    if (!isAdmin) {
      if (user?.regional) setRegional(user.regional);
      if (user?.canal)    setCanal(user.canal);
    }
  }, [isAdmin, user?.regional, user?.canal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar canales
  useEffect(() => {
    apiFetch<{ success: boolean; data: string[] }>("/dashboard/canales/lista/")
      .then(r => { if (r.success) setCanales(r.data); })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar supervisores — se re-ejecuta cuando cambia regional, canal o período
  const fetchSupervisores = useCallback(async () => {
    if (isSuperv || !anho || !mes) return;
    const regionalKey = regional.toLowerCase().replace(/ /g, "_");
    const canalParam  = canal && canal !== "Todos" ? `&canal=${encodeURIComponent(canal)}` : "";
    try {
      const j = await apiFetch<{ success: boolean; data: string[] }>(
        `/dashboard/supervisores/supervisor-lista/?regional=${regionalKey}&anho=${anho}&mes=${mes}${canalParam}`
      );
      if (j.success) {
        setSupervisorList(j.data.filter(Boolean));
        setSupervisor(s => j.data.includes(s) ? s : "");
      }
    } catch { setSupervisorList([]); }
  }, [isSuperv, regional, canal, anho, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchSupervisores(); }, [fetchSupervisores]);

  // Cargar períodos
  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then(r => {
        if (r.success && r.data.length > 0) {
          setPeriodos(r.data);
          setAnho(r.data[0].anho); setMes(r.data[0].mes_numero);
        }
      })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar opciones de sección (lazy: solo cuando se abre el panel)
  const fetchOpciones = useCallback(async () => {
    if (secOpLoaded.current || !anho || !mes) return;
    const qs = new URLSearchParams({
      regional: regional.toLowerCase().replace(/ /g, "_"),
      canal, anho: String(anho), mes: String(mes),
    });
    try {
      const r = await apiFetch<{ success: boolean; proveedores: string[]; lineas: string[]; rutas: string[] }>(
        `/dashboard/tendencia-estacional/opciones/?${qs}`
      );
      if (r.success) {
        setOpProveedores(r.proveedores ?? []);
        setOpLineas(r.lineas ?? []);
        setOpRutas(r.rutas ?? []);
        secOpLoaded.current = true;
      }
    } catch { /* silencioso */ }
  }, [regional, canal, anho, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showSecFiltros) void fetchOpciones();
  }, [showSecFiltros, fetchOpciones]);

  // Resetear opciones cargadas cuando cambian los filtros base
  useEffect(() => {
    secOpLoaded.current = false;
    cliOpLoaded.current = false;
    setOpClientes([]);
    setOpRutas([]);
    setFCadenas([]);
    setFCliente("");
    setFRuta("");
  }, [regional, canal, anho, mes]);

  // Cargar clientes (lazy, filtrado por cadenas seleccionadas)
  const fetchClientes = useCallback(async () => {
    if (!anho || !mes) return;
    const qs = new URLSearchParams({
      regional: regional.toLowerCase().replace(/ /g, "_"),
      canal, anho: String(anho), mes: String(mes),
    });
    fCadenas.forEach(c => qs.append("cadena", c));
    if (fRuta) qs.set("ruta", fRuta);
    try {
      const r = await apiFetch<{ success: boolean; clientes: string[] }>(
        `/dashboard/tendencia-estacional/opciones/?${qs}`
      );
      if (r.success) setOpClientes(r.clientes ?? []);
    } catch { /* silencioso */ }
  }, [regional, canal, anho, mes, fCadenas, fRuta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recargar clientes cuando cambia fCadenas o fRuta, y limpiar cliente seleccionado
  useEffect(() => {
    if (!showSecFiltros) return;
    cliOpLoaded.current = false;
    setFCliente("");
    setCliSearch("");
    void fetchClientes();
  }, [fCadenas, fRuta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar clientes cuando se abre el dropdown de cliente (si aún no cargaron)
  useEffect(() => {
    if (showCliDrop && !cliOpLoaded.current) {
      cliOpLoaded.current = true;
      void fetchClientes();
    }
  }, [showCliDrop, fetchClientes]);

  // Cerrar dropdowns al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (provRef.current && !provRef.current.contains(e.target as Node)) setShowProvDrop(false);
      if (linRef.current  && !linRef.current.contains(e.target as Node))  setShowLinDrop(false);
      if (cadRef.current  && !cadRef.current.contains(e.target as Node))  setShowCadDrop(false);
      if (cliRef.current  && !cliRef.current.contains(e.target as Node))  setShowCliDrop(false);
      if (rutaRef.current && !rutaRef.current.contains(e.target as Node)) setShowRutaDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cargar datos
  useEffect(() => {
    if (!anho || !mes) return;
    const load = async () => {
      setLoading(true); setError(null);
      setDataMain([]); setDataCat([]); setDataCanalDsg([]); setDataCadena([]);
      const qs = new URLSearchParams({
        regional:  regional.toLowerCase().replace(/ /g,"_"),
        canal,
        anho:      String(anho),
        mes:       String(mes),
        modo:      modoTemporal,
        dia_corte: String(diaCorte),
      });
      if (modoTemporal === "rango") qs.set("mes_inicio", String(mesInicio));
      if (supervisor) qs.set("supervisor", supervisor);
      fLineas.forEach(l => qs.append("linea", l));
      fProveedores.forEach(p => qs.append("proveedor", p));
      fCadenas.forEach(c => qs.append("cadena", c));
      if (fCliente.trim()) qs.set("cliente", fCliente.trim());
      if (fRuta.trim())    qs.set("ruta",    fRuta.trim());
      try {
        const r = await apiFetch<{
          success: boolean; data: PuntoBase[];
          data_categoria: PuntoCat[]; data_canal: PuntoCanal[];
          data_cadena: PuntoCadena[];
        }>(`/dashboard/tendencia-estacional/?${qs}`);
        if (!r.success) throw new Error("Error al cargar datos");
        setDataMain(r.data ?? []);
        setDataCat(r.data_categoria ?? []);
        setDataCanalDsg(r.data_canal ?? []);
        setDataCadena(r.data_cadena ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [regional, canal, supervisor, anho, mes, mesInicio, modoTemporal, diaCorte, fLineas, fProveedores, fCadenas, fCliente, fRuta]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  const periodLabel = (a: number, m: number) =>
    esAnual ? String(a) : `${(MESES[m] ?? "").slice(0,3)} ${a}`;

  // KPIs globales
  const kpiActual   = esAnual
    ? (dataMain.find(d => d.anho === anho)?.[metrica] ?? 0)
    : (dataMain.at(-1)?.[metrica] ?? 0);
  const kpiAnterior = esAnual
    ? (dataMain.find(d => d.anho === anho - 1)?.[metrica] ?? 0)
    : (dataMain.at(-2)?.[metrica] ?? 0);

  // Gráfico principal — canal, cadena (SPM) o barra simple
  const canalKeys = useMemo(
    () => [...new Set(dataCanalDsg.map(d => d.canal))].sort(),
    [dataCanalDsg],
  );
  const cadenaKeys = useMemo(
    () => [...new Set(dataCadena.map(d => d.cadena))].sort(),
    [dataCadena],
  );
  const isSPM = canal === "SPM";
  const chartMainData = useMemo(() => {
    if (isSPM && dataCadena.length > 0) {
      return pivotRows(dataCadena, d => d.cadena, d => periodLabel(d.anho, d.mes_numero), metrica);
    }
    if (canal !== "Todos") {
      return dataMain.map((d, i) => ({
        _key: periodLabel(d.anho, d.mes_numero), _idx: i, _anho: d.anho,
        valor: d[metrica],
      }));
    }
    return pivotRows(dataCanalDsg, d => d.canal, d => periodLabel(d.anho, d.mes_numero), metrica);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal, isSPM, dataMain, dataCanalDsg, dataCadena, metrica, esAnual]);

  // Categorías — orden y colores
  const catKeys = useMemo(
    () => [...new Set(dataCat.map(d => d.categoria))].sort(
      (a,b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b),
    ),
    [dataCat],
  );
  const chartCatRaw = useMemo(
    () => pivotRows(dataCat, d => d.categoria, d => periodLabel(d.anho, d.mes_numero), metrica),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataCat, metrica, esAnual],
  );
  // Normalizar a porcentaje para el gráfico de categorías
  const chartCatPct = useMemo(() =>
    chartCatRaw.map(row => {
      const total = catKeys.reduce((s, k) => s + ((row[k] as number) || 0), 0);
      const out: Record<string, number | string> = { _key: row._key };
      catKeys.forEach(k => {
        out[k]          = total > 0 ? +((((row[k] as number)||0) / total * 100).toFixed(2)) : 0;
        out[`_raw_${k}`] = (row[k] as number) || 0;
      });
      out._total = total;
      return out;
    }),
    [chartCatRaw, catKeys],
  );

  // KPI por categoría
  const catKpiData = useMemo(() => {
    // En modos anuales (estacional/rango) la query principal no incluye mes_numero, usar `mes` directamente
    const periods = dataMain.map(d => ({ anho: d.anho, mes: esAnual ? mes : d.mes_numero }));
    const curr = periods.at(-1);
    const prev = periods.at(-2);
    if (!curr) return [];
    return catKeys.map(cat => {
      const getVal = (a: number, m: number) =>
        dataCat.filter(d => d.categoria === cat && d.anho === a && d.mes_numero === m)
               .reduce((s, d) => s + d[metrica], 0);
      const actual   = getVal(curr.anho, curr.mes);
      const anterior = prev ? getVal(prev.anho, prev.mes) : 0;
      return { cat, actual, anterior };
    });
  }, [dataCat, dataMain, metrica, catKeys, esAnual, mes]);

  const anhos        = [...new Set(periodos.map(p => p.anho))].sort((a,b)=>b-a);
  const mesesDelAnho = periodos.filter(p => p.anho === anho);
  const selectCls    = "text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 cursor-pointer";

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Tendencia Estacional</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {modoTemporal === "rango"
                ? `Acumulado ${MESES[mesInicio]}–${MESES[mes]} entre gestiones${diaCorte>0?` — primeros ${diaCorte} días en ${MESES[mes]}`:""}`
                : modoTemporal === "estacional"
                ? `Comparación de ${MESES[mes]} entre gestiones${diaCorte>0?` — primeros ${diaCorte} días`:""}`
                : `Últimos 6 meses${diaCorte>0?` — primeros ${diaCorte} días`:""}`}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(["ultimos6","estacional","rango"] as ModoTemporal[]).map(m => (
              <button key={m} onClick={() => setModoTemporal(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  modoTemporal===m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                {m === "ultimos6" ? "Últimos 6 meses" : m === "estacional" ? "Mes puntual" : "Acumulado año"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Regional */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
              {isAdmin ? (
                <select value={regional} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRegional(e.target.value)} className={selectCls}>
                  {REGIONALES.map(r => <option key={r}>{r}</option>)}
                </select>
              ) : (
                <span className={`text-sm font-semibold px-3 py-2 rounded-lg border ${REGIONAL_CONFIG[regional]?.badge ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                  {regional}
                </span>
              )}
            </div>
            {/* Canal */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
              {(isAdmin || isGerenteRegional) ? (
                <select value={canal} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCanal(e.target.value)} className={selectCls}>
                  <option value="Todos">Todos</option>
                  {canales.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <span className="text-sm font-semibold px-3 py-2 rounded-lg border bg-slate-100 text-slate-600 border-slate-200">
                  {canal && canal !== "Todos" ? canal : "Todos"}
                </span>
              )}
            </div>
            {/* Supervisor */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Supervisor</label>
              {isSuperv ? (
                <span className="text-sm font-semibold px-3 py-2 rounded-lg border bg-slate-100 text-slate-600 border-slate-200">
                  {user?.full_name || user?.username || "—"}
                </span>
              ) : (
                <select value={supervisor} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSupervisor(e.target.value)} className={selectCls}>
                  <option value="">Todos</option>
                  {supervisorList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
              <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))} className={selectCls}>
                {anhos.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {modoTemporal === "rango" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Desde</label>
                <select value={mesInicio} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMesInicio(Number(e.target.value))} className={selectCls}>
                  {MESES.slice(1).map((nombre, i) => (
                    <option key={i+1} value={i+1}>{nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                {modoTemporal === "rango" ? "Hasta" : "Mes"}
              </label>
              <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))} className={selectCls}>
                {mesesDelAnho.map(p => (
                  <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>
                ))}
              </select>
            </div>
            <MetricaToggle value={metrica} onChange={setMetrica} />
            <div className="flex flex-col gap-1 ml-auto">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Corte de días</label>
              <div className="flex items-center gap-2">
                <select value={corteModo} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCorteModo(e.target.value as CorteModo)} className={selectCls}>
                  <option value="completo">Mes completo</option>
                  <option value="hoy">Hasta hoy (día {now.getDate()})</option>
                  <option value="personalizado">Personalizado</option>
                </select>
                {corteModo === "personalizado" && (
                  <input type="number" min={1} max={31} value={cortePersonalizado}
                    onChange={e => setCortePersonalizado(Math.max(1,Math.min(31,Number(e.target.value))))}
                    className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-brand-500" />
                )}
                <span className="text-xs text-slate-400">
                  {corteModo !== "completo" ? `Primeros ${diaCorte} días` : "Mes completo"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filtros de sección ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <button onClick={() => setShowSecFiltros(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-xl">
            <span className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-slate-400" />
              Filtros de sección
              {(fLineas.length + fProveedores.length + fCadenas.length + (fCliente ? 1 : 0)) > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {fLineas.length + fProveedores.length + fCadenas.length + (fCliente ? 1 : 0)}
                </span>
              )}
            </span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${showSecFiltros ? "rotate-180" : ""}`} />
          </button>
          {/* Chips de filtros activos visibles cuando el panel está colapsado */}
          {!showSecFiltros && (fLineas.length + fProveedores.length + fCadenas.length + (fCliente ? 1 : 0) + (fRuta ? 1 : 0)) > 0 && (
            <div className="px-5 pb-3 flex flex-wrap gap-1.5">
              {fProveedores.map(p => (
                <span key={p} className="flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                  {p}<button onClick={() => setFProveedores(prev => prev.filter(x => x !== p))}><X size={10} /></button>
                </span>
              ))}
              {fLineas.map(l => (
                <span key={l} className="flex items-center gap-1 text-[11px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium">
                  {l}<button onClick={() => setFLineas(prev => prev.filter(x => x !== l))}><X size={10} /></button>
                </span>
              ))}
              {fCadenas.map(c => (
                <span key={c} className="flex items-center gap-1 text-[11px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">
                  {c}<button onClick={() => setFCadenas(prev => prev.filter(x => x !== c))}><X size={10} /></button>
                </span>
              ))}
              {fRuta && (
                <span className="flex items-center gap-1 text-[11px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                  {fRuta}<button onClick={() => { setFRuta(""); setRutaSearch(""); }}><X size={10} /></button>
                </span>
              )}
              {fCliente && (
                <span className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                  {fCliente.length > 28 ? fCliente.slice(0,28)+"…" : fCliente}<button onClick={() => { setFCliente(""); setCliSearch(""); }}><X size={10} /></button>
                </span>
              )}
            </div>
          )}
          {showSecFiltros && (
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="flex flex-wrap gap-4 items-start">

                {/* ── Proveedor combobox ── */}
                <div className="flex flex-col gap-1 min-w-56" ref={provRef}>
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1.5">
                    Proveedor
                    {fProveedores.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] font-bold">{fProveedores.length}</span>
                    )}
                  </label>
                  <div className="relative">
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-text transition-colors ${
                        showProvDrop ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => { setShowProvDrop(true); void fetchOpciones(); }}
                    >
                      <Search size={13} className="text-slate-400 shrink-0" />
                      <input
                        type="text"
                        placeholder={fProveedores.length ? `${fProveedores.length} seleccionado(s)` : "Buscar proveedor…"}
                        value={provSearch}
                        onChange={e => { setProvSearch(e.target.value); setShowProvDrop(true); }}
                        onFocus={() => { setShowProvDrop(true); void fetchOpciones(); }}
                        className="flex-1 outline-none bg-transparent text-slate-700 placeholder-slate-400 text-sm min-w-0"
                      />
                      {fProveedores.length > 0 && (
                        <button className="text-slate-400 hover:text-slate-600 shrink-0"
                          onMouseDown={e => { e.stopPropagation(); setFProveedores([]); setProvSearch(""); }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {showProvDrop && (
                      <div className="absolute z-50 top-full mt-1 left-0 w-full min-w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        {fProveedores.length > 0 && (
                          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                            {fProveedores.map(p => (
                              <span key={p} className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                {p.length > 20 ? p.slice(0,20)+"…" : p}
                                <button onMouseDown={e => { e.stopPropagation(); setFProveedores(prev => prev.filter(x => x !== p)); }}>
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="max-h-52 overflow-y-auto">
                          {opProveedores.length === 0 ? (
                            <p className="text-xs text-slate-400 px-4 py-3 italic">
                              {secOpLoaded.current ? "Sin opciones disponibles" : "Cargando opciones…"}
                            </p>
                          ) : opProveedores
                              .filter(p => !provSearch || p.toLowerCase().includes(provSearch.toLowerCase()))
                              .map(p => {
                                const sel = fProveedores.includes(p);
                                return (
                                  <button key={p}
                                    className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2.5 ${sel ? "bg-blue-50" : "hover:bg-slate-50"}`}
                                    onMouseDown={e => { e.preventDefault(); setFProveedores(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]); }}>
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                                      {sel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                                    </span>
                                    <span className={`text-xs ${sel ? "text-blue-700 font-medium" : "text-slate-700"}`}>{p}</span>
                                  </button>
                                );
                              })
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Línea de producto combobox ── */}
                <div className="flex flex-col gap-1 min-w-56" ref={linRef}>
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1.5">
                    Línea de producto
                    {fLineas.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full text-[9px] font-bold">{fLineas.length}</span>
                    )}
                  </label>
                  <div className="relative">
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-text transition-colors ${
                        showLinDrop ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => { setShowLinDrop(true); void fetchOpciones(); }}
                    >
                      <Search size={13} className="text-slate-400 shrink-0" />
                      <input
                        type="text"
                        placeholder={fLineas.length ? `${fLineas.length} seleccionada(s)` : "Buscar línea…"}
                        value={linSearch}
                        onChange={e => { setLinSearch(e.target.value); setShowLinDrop(true); }}
                        onFocus={() => { setShowLinDrop(true); void fetchOpciones(); }}
                        className="flex-1 outline-none bg-transparent text-slate-700 placeholder-slate-400 text-sm min-w-0"
                      />
                      {fLineas.length > 0 && (
                        <button className="text-slate-400 hover:text-slate-600 shrink-0"
                          onMouseDown={e => { e.stopPropagation(); setFLineas([]); setLinSearch(""); }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {showLinDrop && (
                      <div className="absolute z-50 top-full mt-1 left-0 w-full min-w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        {fLineas.length > 0 && (
                          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                            {fLineas.map(l => (
                              <span key={l} className="flex items-center gap-1 bg-violet-100 text-violet-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                {l.length > 20 ? l.slice(0,20)+"…" : l}
                                <button onMouseDown={e => { e.stopPropagation(); setFLineas(prev => prev.filter(x => x !== l)); }}>
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="max-h-52 overflow-y-auto">
                          {opLineas.length === 0 ? (
                            <p className="text-xs text-slate-400 px-4 py-3 italic">
                              {secOpLoaded.current ? "Sin opciones disponibles" : "Cargando opciones…"}
                            </p>
                          ) : opLineas
                              .filter(l => !linSearch || l.toLowerCase().includes(linSearch.toLowerCase()))
                              .map(l => {
                                const sel = fLineas.includes(l);
                                return (
                                  <button key={l}
                                    className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2.5 ${sel ? "bg-violet-50" : "hover:bg-slate-50"}`}
                                    onMouseDown={e => { e.preventDefault(); setFLineas(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]); }}>
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-violet-600 border-violet-600" : "border-slate-300"}`}>
                                      {sel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                                    </span>
                                    <span className={`text-xs ${sel ? "text-violet-700 font-medium" : "text-slate-700"}`}>{l}</span>
                                  </button>
                                );
                              })
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Cadenas (solo canal SPM) ── */}
                {canal === "SPM" && (
                  <div className="flex flex-col gap-1 min-w-56" ref={cadRef}>
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1.5">
                      Cadena
                      {fCadenas.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-[9px] font-bold">{fCadenas.length}</span>
                      )}
                    </label>
                    <div className="relative">
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-text transition-colors ${
                          showCadDrop ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300"
                        }`}
                        onClick={() => setShowCadDrop(true)}
                      >
                        <Search size={13} className="text-slate-400 shrink-0" />
                        <input
                          type="text"
                          placeholder={fCadenas.length ? `${fCadenas.length} seleccionada(s)` : "Buscar cadena…"}
                          value={cadSearch}
                          onChange={e => { setCadSearch(e.target.value); setShowCadDrop(true); }}
                          onFocus={() => setShowCadDrop(true)}
                          className="flex-1 outline-none bg-transparent text-slate-700 placeholder-slate-400 text-sm min-w-0"
                        />
                        {fCadenas.length > 0 && (
                          <button className="text-slate-400 hover:text-slate-600 shrink-0"
                            onMouseDown={e => { e.stopPropagation(); setFCadenas([]); setCadSearch(""); }}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      {showCadDrop && (
                        <div className="absolute z-50 top-full mt-1 left-0 w-full min-w-56 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                          {fCadenas.length > 0 && (
                            <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                              {fCadenas.map(c => (
                                <span key={c} className="flex items-center gap-1 bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                  {c}
                                  <button onMouseDown={e => { e.stopPropagation(); setFCadenas(prev => prev.filter(x => x !== c)); }}>
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="max-h-52 overflow-y-auto">
                            {(CADENA_NAMES as readonly string[])
                              .filter(c => !cadSearch || c.toLowerCase().includes(cadSearch.toLowerCase()))
                              .map(c => {
                                const sel = fCadenas.includes(c);
                                return (
                                  <button key={c}
                                    className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2.5 ${sel ? "bg-teal-50" : "hover:bg-slate-50"}`}
                                    onMouseDown={e => { e.preventDefault(); setFCadenas(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]); }}>
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-teal-600 border-teal-600" : "border-slate-300"}`}>
                                      {sel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                                    </span>
                                    <span className={`text-xs ${sel ? "text-teal-700 font-medium" : "text-slate-700"}`}>{c}</span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Ruta combobox (visible cuando hay canal seleccionado) ── */}
                {canal !== "Todos" && (
                  <div className="flex flex-col gap-1 min-w-56" ref={rutaRef}>
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1.5">
                      Ruta
                      {fRuta && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[9px] font-bold">1</span>}
                    </label>
                    <div className="relative">
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-text transition-colors ${
                          showRutaDrop ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300"
                        }`}
                        onClick={() => { setShowRutaDrop(true); void fetchOpciones(); }}
                      >
                        <Search size={13} className="text-slate-400 shrink-0" />
                        <input
                          type="text"
                          placeholder={fRuta || "Buscar ruta…"}
                          value={rutaSearch}
                          onChange={e => { setRutaSearch(e.target.value); setShowRutaDrop(true); }}
                          onFocus={() => { setShowRutaDrop(true); void fetchOpciones(); }}
                          className="flex-1 outline-none bg-transparent text-slate-700 placeholder-slate-400 text-sm min-w-0"
                        />
                        {fRuta && (
                          <button className="text-slate-400 hover:text-slate-600 shrink-0"
                            onMouseDown={e => { e.stopPropagation(); setFRuta(""); setRutaSearch(""); }}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      {showRutaDrop && (
                        <div className="absolute z-50 top-full mt-1 left-0 w-full min-w-56 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                          {fRuta && (
                            <div className="px-3 py-2 border-b border-slate-100">
                              <span className="flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium w-fit">
                                {fRuta}
                                <button onMouseDown={e => { e.stopPropagation(); setFRuta(""); setRutaSearch(""); }}>
                                  <X size={10} />
                                </button>
                              </span>
                            </div>
                          )}
                          <div className="max-h-52 overflow-y-auto">
                            {opRutas.length === 0 ? (
                              <p className="text-xs text-slate-400 px-4 py-3 italic">
                                {secOpLoaded.current ? "Sin rutas disponibles" : "Cargando rutas…"}
                              </p>
                            ) : opRutas
                                .filter(r => !rutaSearch || r.toLowerCase().includes(rutaSearch.toLowerCase()))
                                .map(r => {
                                  const sel = fRuta === r;
                                  return (
                                    <button key={r}
                                      className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2.5 ${sel ? "bg-orange-50" : "hover:bg-slate-50"}`}
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        setFRuta(sel ? "" : r);
                                        setRutaSearch("");
                                        setShowRutaDrop(false);
                                      }}>
                                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-orange-600 border-orange-600" : "border-slate-300"}`}>
                                        {sel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                                      </span>
                                      <span className={`text-xs ${sel ? "text-orange-700 font-medium" : "text-slate-700"}`}>{r}</span>
                                    </button>
                                  );
                                })
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Cliente combobox (visible cuando hay canal seleccionado) ── */}
                {canal !== "Todos" && (
                <div className="flex flex-col gap-1 min-w-56" ref={cliRef}>
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1.5">
                    Cliente
                    {fCliente && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold">1</span>}
                  </label>
                  <div className="relative">
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-text transition-colors ${
                        showCliDrop ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => setShowCliDrop(true)}
                    >
                      <Search size={13} className="text-slate-400 shrink-0" />
                      <input
                        type="text"
                        placeholder={fCliente || "Buscar cliente…"}
                        value={cliSearch}
                        onChange={e => { setCliSearch(e.target.value); setShowCliDrop(true); }}
                        onFocus={() => { setShowCliDrop(true); }}
                        className="flex-1 outline-none bg-transparent text-slate-700 placeholder-slate-400 text-sm min-w-0"
                      />
                      {fCliente && (
                        <button className="text-slate-400 hover:text-slate-600 shrink-0"
                          onMouseDown={e => { e.stopPropagation(); setFCliente(""); setCliSearch(""); }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {showCliDrop && (
                      <div className="absolute z-50 top-full mt-1 left-0 w-full min-w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        {fCliente && (
                          <div className="px-3 py-2 border-b border-slate-100">
                            <span className="flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-medium w-fit">
                              {fCliente.length > 30 ? fCliente.slice(0,30)+"…" : fCliente}
                              <button onMouseDown={e => { e.stopPropagation(); setFCliente(""); setCliSearch(""); }}>
                                <X size={10} />
                              </button>
                            </span>
                          </div>
                        )}
                        <div className="max-h-52 overflow-y-auto">
                          {opClientes.length === 0 ? (
                            <p className="text-xs text-slate-400 px-4 py-3 italic">
                              {cliOpLoaded.current ? "Sin clientes disponibles" : "Abriendo lista de clientes…"}
                            </p>
                          ) : opClientes
                              .filter(c => !cliSearch || c.toLowerCase().includes(cliSearch.toLowerCase()))
                              .map(c => {
                                const sel = fCliente === c;
                                return (
                                  <button key={c}
                                    className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2.5 ${sel ? "bg-slate-100" : "hover:bg-slate-50"}`}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      setFCliente(sel ? "" : c);
                                      setCliSearch("");
                                      setShowCliDrop(false);
                                    }}>
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-slate-600 border-slate-600" : "border-slate-300"}`}>
                                      {sel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                                    </span>
                                    <span className={`text-xs ${sel ? "text-slate-800 font-medium" : "text-slate-700"}`}>{c}</span>
                                  </button>
                                );
                              })
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}

              </div>

              {/* ── Resumen de filtros activos ── */}
              {(fLineas.length + fProveedores.length + fCadenas.length + (fCliente ? 1 : 0) + (fRuta ? 1 : 0)) > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mr-1">Activos:</span>
                  {fProveedores.map(p => (
                    <span key={p} className="flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                      {p}<button onClick={() => setFProveedores(prev => prev.filter(x => x !== p))}><X size={10} /></button>
                    </span>
                  ))}
                  {fLineas.map(l => (
                    <span key={l} className="flex items-center gap-1 text-[11px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium">
                      {l}<button onClick={() => setFLineas(prev => prev.filter(x => x !== l))}><X size={10} /></button>
                    </span>
                  ))}
                  {fCadenas.map(c => (
                    <span key={c} className="flex items-center gap-1 text-[11px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">
                      {c}<button onClick={() => setFCadenas(prev => prev.filter(x => x !== c))}><X size={10} /></button>
                    </span>
                  ))}
                  {fRuta && (
                    <span className="flex items-center gap-1 text-[11px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                      {fRuta}<button onClick={() => { setFRuta(""); setRutaSearch(""); }}><X size={10} /></button>
                    </span>
                  )}
                  {fCliente && (
                    <span className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                      {fCliente.length > 28 ? fCliente.slice(0,28)+"…" : fCliente}<button onClick={() => { setFCliente(""); setCliSearch(""); }}><X size={10} /></button>
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setFLineas([]); setFProveedores([]); setFCadenas([]); setFCliente(""); setFRuta("");
                      setProvSearch(""); setLinSearch(""); setCadSearch(""); setCliSearch(""); setRutaSearch("");
                    }}
                    className="text-[11px] text-slate-400 hover:text-red-500 transition-colors ml-1">
                    Limpiar todo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}

        {/* ── KPIs globales ───────────────────────────────────────────────── */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label={esAnual
                ? modoTemporal === "rango"
                  ? `${MESES[mesInicio]}–${MESES[mes]} ${anho}${diaCorte>0?` (prim. ${diaCorte}d en ${MESES[mes].slice(0,3)})`:""}`
                  : `${MESES[mes]} ${anho}${diaCorte>0?` (primeros ${diaCorte} días)`:""}`
                : `${MESES[dataMain.at(-1)?.mes_numero??mes]} ${dataMain.at(-1)?.anho??anho}`}
              actual={kpiActual} anterior={kpiAnterior} metrica={metrica}
              vsLabel={esAnual ? "vs año anterior" : "vs mes anterior"}
            />
            {esAnual
              ? dataMain.map(d => (
                  <div key={d.anho} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: yearColor(d.anho,anho) }} />
                      {modoTemporal === "rango" ? `${MESES[mesInicio].slice(0,3)}–${MESES[mes].slice(0,3)} ` : `${MESES[mes]} `}{d.anho}
                    </p>
                    <p className="text-lg font-bold text-slate-800 mt-0.5">{fmtVal(d[metrica],metrica)}</p>
                  </div>
                ))
              : dataMain.slice(-3).map((d,i) => (
                  <div key={`${d.anho}-${d.mes_numero}`} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: MONTH_PAL[(dataMain.length-3+i)%MONTH_PAL.length] }} />
                      {MESES[d.mes_numero]} {d.anho}
                    </p>
                    <p className="text-lg font-bold text-slate-800 mt-0.5">{fmtVal(d[metrica],metrica)}</p>
                  </div>
                ))
            }
          </div>
        )}

        {/* ── Gráfico principal + Tabla (lado a lado) ──────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">

          {/* Gráfico principal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 min-w-0">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-800">
                {canal === "Todos"
                  ? esAnual ? `${MESES[mes]} — desglose por canal` : "Evolución por canal — últimos 6 meses"
                  : isSPM && dataCadena.length > 0
                  ? esAnual ? `${MESES[mes]} — SPM por cadena` : "SPM por cadena — últimos 6 meses"
                  : esAnual ? `${MESES[mes]} — comparación por gestión` : `Evolución de ${canal} — últimos 6 meses`}
                {diaCorte > 0 ? ` (primeros ${diaCorte} días)` : ""}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{regional} · {metrica === "total" ? "Venta Bs" : "Unidades"}</p>
            </div>
            {loading ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <BarChart data={chartMainData} barCategoryGap="25%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="_key" tick={{ fontSize: 12, fontWeight: 600 }} />
                  <YAxis tickFormatter={v => fmtVal(v, metrica)} tick={{ fontSize: 11 }} width={85} />
                  <Tooltip content={<CustomTooltip metrica={metrica} />} />
                  {canal === "Todos" ? (
                    <>
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {canalKeys.map((c, i) => (
                        <Bar key={c} dataKey={c} name={c} stackId="canal"
                          fill={canalColor(i)}
                          radius={i === canalKeys.length-1 ? [4,4,0,0] : [0,0,0,0]} />
                      ))}
                    </>
                  ) : isSPM && cadenaKeys.length > 0 ? (
                    <>
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {cadenaKeys.map((c, i) => (
                        <Bar key={c} dataKey={c} name={c} stackId="cadena"
                          fill={canalColor(i)}
                          radius={i === cadenaKeys.length-1 ? [4,4,0,0] : [0,0,0,0]} />
                      ))}
                    </>
                  ) : (
                    <Bar dataKey="valor" name={metrica==="total"?"Venta Bs":"Unidades"} radius={[6,6,0,0]}>
                      {chartMainData.map((d, i) => (
                        <Cell key={i} fill={
                          esAnual
                            ? yearColor(d._anho as number, anho)
                            : "#3b82f6"
                        } />
                      ))}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Tabla resumen — a la derecha */}
          {!loading && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full lg:w-72 shrink-0 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100 shrink-0">
                <h2 className="text-sm font-semibold text-slate-700">
                  {esAnual ? "Resumen por gestión" : "Detalle mensual"}
                </h2>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {esAnual ? "Gestión" : "Período"}
                      </th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                        {metrica === "total" ? "Venta Bs" : "Unidades"}
                      </th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                        {esAnual ? "% vs año ant." : "% vs mes ant."}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dataMain.map((d, i) => {
                      const prev   = dataMain[i-1];
                      const varPct = prev && prev[metrica] > 0
                        ? ((d[metrica]-prev[metrica])/prev[metrica])*100 : null;
                      const dot = (
                        <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                          style={{ background: esAnual ? yearColor(d.anho,anho) : "#3b82f6" }} />
                      );
                      return (
                        <tr key={`${d.anho}-${d.mes_numero}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 font-semibold text-slate-800 text-xs whitespace-nowrap">
                            {dot}{esAnual ? d.anho : `${(MESES[d.mes_numero] ?? "").slice(0,3)} ${d.anho}`}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700 text-xs whitespace-nowrap">{fmtVal(d[metrica],metrica)}</td>
                          <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap">
                            {varPct !== null
                              ? <span className={`font-semibold ${varPct>=0?"text-green-600":"text-red-500"}`}>
                                  {varPct>=0?"+":""}{varPct.toFixed(1)}%
                                </span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Gráfico por Categoría + Tabla (lado a lado) ─────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">

          {/* Gráfico categorías */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 min-w-0">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-800">
                Desglose por categoría{diaCorte>0?` — primeros ${diaCorte} días`:""}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {regional}{canal!=="Todos"?` · ${canal}`:""} · participación % por categoría
              </p>
            </div>
            {loading ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <BarChart data={chartCatPct} barCategoryGap="0%" barGap={0}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="_key" tick={{ fontSize: 12, fontWeight: 600 }} />
                  <YAxis tickFormatter={v => `${v.toFixed(0)}%`} domain={[0,100]} tick={{ fontSize: 11 }} width={45} />
                  <Tooltip content={<CustomTooltip metrica={metrica} pct />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {catKeys.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} name={cat} stackId="cat"
                      fill={CAT_COLORS[cat] ?? CANAL_PAL[i]}
                      radius={i===catKeys.length-1?[4,4,0,0]:[0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Tabla categorías — a la derecha */}
          {!loading && dataCat.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full lg:w-72 shrink-0 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100 shrink-0">
                <h2 className="text-sm font-semibold text-slate-700">Detalle por categoría</h2>
                <p className="text-xs text-slate-400 mt-0.5">período más reciente vs anterior</p>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                        {metrica === "total" ? "Venta Bs" : "Unidades"}
                      </th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                        {esAnual ? "% vs año ant." : "% vs mes ant."}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {catKpiData.map(({ cat, actual, anterior }) => {
                      const varPct = anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;
                      return (
                        <tr key={cat} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 font-semibold text-slate-800 text-xs">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{ background: CAT_COLORS[cat] ?? "#94a3b8" }} />
                              {cat}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700 text-xs whitespace-nowrap">{fmtVal(actual, metrica)}</td>
                          <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap">
                            {varPct !== null
                              ? <span className={`font-semibold ${varPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                                  {varPct >= 0 ? "+" : ""}{varPct.toFixed(1)}%
                                </span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
