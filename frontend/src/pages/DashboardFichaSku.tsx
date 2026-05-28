import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, X, Package, TrendingUp, AlertTriangle, ChevronDown } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../context/AuthContext";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SkuInfo {
  codigo: string;
  nombre: string;
  linea:  string;
  marca:  string;
  ul:     number;
}

interface VentaDia {
  fecha:    string;
  unidades: number;
  bs:       number;
  vol:      number;
}

interface PrecioRow {
  lista:      string;
  precio:     number;
  precio_ice: number | null;
  fecha_desde: string;
  fecha_hasta: string | null;
  es_actual:  boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ANHOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

const TRIMESTRES = [
  { value: "1", label: "Q1 — Ene·Feb·Mar" },
  { value: "2", label: "Q2 — Abr·May·Jun" },
  { value: "3", label: "Q3 — Jul·Ago·Sep" },
  { value: "4", label: "Q4 — Oct·Nov·Dic" },
];

const REGIONALES = [
  { value: "nacional",    label: "Nacional"    },
  { value: "santa_cruz",  label: "Santa Cruz"  },
  { value: "cochabamba",  label: "Cochabamba"  },
  { value: "la_paz",      label: "La Paz"      },
];

const ALMACENES = ["Todos", "Almacén Central SC", "Almacén Central CBB", "Almacén Central LP"];

const CANALES = [
  { value: "",        label: "Todos los canales" },
  { value: "DTS",     label: "DTS"     },
  { value: "DTS-NOC", label: "DTS-NOC" },
  { value: "WHS",     label: "WHS"     },
  { value: "SPM",     label: "SPM"     },
  { value: "HORECA",  label: "HORECA"  },
  { value: "CORP",    label: "CORP"    },
  { value: "PROV",    label: "PROV"    },
];

const CATEGORIAS = [
  { value: "",                  label: "Todas las categorías"  },
  { value: "Alimentos",         label: "Alimentos"             },
  { value: "Licores",           label: "Licores"               },
  { value: "Home & Personal Care", label: "Home & Personal Care" },
  { value: "Apego",             label: "Apego"                 },
  { value: "Sin Clasificar",    label: "Sin Clasificar"        },
];

const LISTA_COLORS: Record<string, string> = {
  "Gerente":       "#3b82f6",
  "Supermercado":  "#10b981",
  "Mayorista":     "#f59e0b",
  "Minorista":     "#ef4444",
  "Distribuidor":  "#8b5cf6",
};
function listaColor(lista: string) {
  for (const [k, v] of Object.entries(LISTA_COLORS)) {
    if (lista.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "#94a3b8";
}

// ─── Mock inventario ──────────────────────────────────────────────────────────
// Genera un stock inicial determinístico por código para que sea consistente.
function mockStock(codigo: string): number {
  let h = 5381;
  for (const c of codigo) h = (((h << 5) + h) ^ c.charCodeAt(0)) >>> 0;
  return Math.round(300 + (h % 4700));  // 300–5000 unidades
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

const BS_FMT = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const N_FMT  = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const fmtBs  = (n: number) => `Bs ${BS_FMT.format(n)}`;
const fmtN   = (n: number) => N_FMT.format(n);
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const fmtFechaLarga = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function currentTrimestre(): string {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return "1";
  if (m <= 6) return "2";
  if (m <= 9) return "3";
  return "4";
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardFichaSku() {
  const { user, apiFetch } = useAuth();

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [anho,      setAnho]      = useState(new Date().getFullYear());
  const [trimestre, setTrimestre] = useState(currentTrimestre());
  const [regional,  setRegional]  = useState("santa_cruz");
  const [almacen,   setAlmacen]   = useState("Todos");
  const [canal,     setCanal]     = useState("");

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  const [searchCategoria, setSearchCategoria] = useState("");
  const [searchQ,         setSearchQ]         = useState("");
  const [searchResults,   setSearchResults]   = useState<SkuInfo[]>([]);
  const [loadingSearch,   setLoadingSearch]   = useState(false);
  const [showDropdown,    setShowDropdown]     = useState(false);
  const [selectedSku,     setSelectedSku]     = useState<SkuInfo | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [ventas,        setVentas]        = useState<VentaDia[]>([]);
  const [esLicor,       setEsLicor]       = useState(false);
  const [precios,       setPrecios]       = useState<PrecioRow[]>([]);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [loadingPrecios,setLoadingPrecios]= useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [metrica, setMetrica] = useState<"uds" | "vol">("uds");

  // ── Búsqueda con debounce ─────────────────────────────────────────────────
  useEffect(() => {
    if (searchQ.length < 2) { setSearchResults([]); setShowDropdown(false); setLoadingSearch(false); return; }
    // Mostrar dropdown inmediatamente con indicador de carga
    setShowDropdown(true);
    setLoadingSearch(true);
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ q: searchQ, ...(searchCategoria ? { categoria: searchCategoria } : {}) });
        const j = await apiFetch<{ success: boolean; data: SkuInfo[] }>(`/dashboard/ficha-sku/buscar/?${p}`);
        if (j.success) setSearchResults(j.data);
      } finally {
        setLoadingSearch(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchQ, searchCategoria, apiFetch]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Fetch ventas cuando cambia SKU o filtros ──────────────────────────────
  const fetchVentas = useCallback(async (sku: SkuInfo) => {
    setLoadingVentas(true);
    setEsLicor(false);
    try {
      const p = new URLSearchParams({
        codigo: sku.codigo, anho: String(anho), trimestre, regional,
        ...(canal ? { canal } : {}),
      });
      const j = await apiFetch<{ success: boolean; data: VentaDia[]; es_licor: boolean }>(`/dashboard/ficha-sku/ventas/?${p}`);
      if (j.success) { setVentas(j.data); setEsLicor(j.es_licor); }
    } finally {
      setLoadingVentas(false);
    }
  }, [anho, trimestre, regional, canal, apiFetch]);

  // ── Fetch precios (solo cuando cambia el SKU) ─────────────────────────────
  const fetchPrecios = useCallback(async (sku: SkuInfo) => {
    setLoadingPrecios(true);
    try {
      const j = await apiFetch<{ success: boolean; data: PrecioRow[] }>(`/dashboard/ficha-sku/precios/?codigo=${sku.codigo}`);
      if (j.success) setPrecios(j.data);
    } finally {
      setLoadingPrecios(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (selectedSku) { fetchVentas(selectedSku); }
    else { setVentas([]); setEsLicor(false); }
  }, [selectedSku, anho, trimestre, regional, canal]);

  useEffect(() => {
    if (selectedSku) fetchPrecios(selectedSku);
    else setPrecios([]);
  }, [selectedSku]);

  function selectSku(sku: SkuInfo) {
    setSelectedSku(sku);
    setSearchQ(sku.nombre);
    setShowDropdown(false);
    setMetrica("uds");
  }

  function clearSku() {
    setSelectedSku(null);
    setSearchQ("");
    setSearchResults([]);
    setVentas([]);
    setPrecios([]);
  }

  // ── Proyecciones ──────────────────────────────────────────────────────────
  const proj = useMemo(() => {
    if (!selectedSku || ventas.length === 0) return null;

    const totalUds = ventas.reduce((s, d) => s + d.unidades, 0);
    const totalBs  = ventas.reduce((s, d) => s + d.bs, 0);
    const totalVol = ventas.reduce((s, d) => s + d.vol, 0);
    const n        = ventas.filter(d => d.unidades > 0).length || 1;

    const avgUds = totalUds / n;
    const avgBs  = totalBs  / n;
    const avgVol = totalVol / n;

    const stock      = mockStock(selectedSku.codigo);
    const diasHasta0 = avgUds > 0 ? Math.round(stock / avgUds) : Infinity;

    const lastFecha  = new Date(ventas[ventas.length - 1].fecha + "T00:00:00");
    const stockout   = isFinite(diasHasta0)
      ? new Date(lastFecha.getTime() + diasHasta0 * 86_400_000)
      : null;

    // Proyectar inventario hasta quiebre de stock (máx 120 días), sin proyectar ventas
    const projDays = isFinite(diasHasta0) ? Math.min(diasHasta0 + 2, 120) : 0;
    const projData: { fecha: string; stock_proj: number }[] = [];
    let stockRem = stock - ventas.reduce((s, d) => s + d.unidades, 0);
    if (stockRem < 0) stockRem = 0;
    for (let i = 1; i <= projDays; i++) {
      const d = new Date(lastFecha.getTime() + i * 86_400_000);
      const fecha = d.toISOString().slice(0, 10);
      stockRem = Math.max(0, stockRem - avgUds);
      projData.push({ fecha, stock_proj: stockRem });
      if (stockRem === 0) break;
    }

    return { stock, diasHasta0, stockout, avgUds, avgBs, avgVol, projData, totalUds, totalBs };
  }, [selectedSku, ventas]);

  // ── Datos para gráficos ───────────────────────────────────────────────────
  const chartVentasData = useMemo(() => {
    if (!selectedSku) return [];
    const stock0 = mockStock(selectedSku.codigo);
    let stockRem = stock0;

    const actual = ventas.map(d => {
      stockRem = Math.max(0, stockRem - d.unidades);
      return {
        fecha:      d.fecha,
        uds:        d.unidades,
        bs:         d.bs,
        vol:        d.vol,
        stock:      stockRem,
        stock_proj: null as number | null,
      };
    });

    const projected = (proj?.projData ?? []).map(p => ({
      fecha:      p.fecha,
      uds:        null as number | null,
      bs:         null as number | null,
      vol:        null as number | null,
      stock:      null as number | null,
      stock_proj: p.stock_proj,
    }));

    return [...actual, ...projected];
  }, [ventas, proj, selectedSku]);

  const chartPreciosData = useMemo(() => {
    if (!precios.length) return { data: [], listas: [] as string[] };
    const listas = [...new Set(precios.map(p => p.lista))];
    // Pivot: por fecha_desde, precio por lista
    const byFecha = new Map<string, Record<string, number>>();
    for (const p of precios) {
      if (!p.fecha_desde) continue;
      if (!byFecha.has(p.fecha_desde)) byFecha.set(p.fecha_desde, {});
      byFecha.get(p.fecha_desde)![p.lista] = p.precio;
    }
    const data = Array.from(byFecha.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, vals]) => ({ fecha, ...vals }));
    return { data, listas };
  }, [precios]);

  const stockout0Fecha = proj?.stockout?.toISOString().slice(0, 10);

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const kpis = proj
    ? [
        { label: "Stock actual (est.)", value: fmtN(proj.stock), sub: "unidades · estimado" },
        { label: "Ventas promedio/día",  value: fmtN(+proj.avgUds.toFixed(1)), sub: "unidades" },
        { label: "Ingresos promedio/día",value: fmtBs(proj.avgBs), sub: "ventas netas" },
        {
          label: "Cobertura estimada",
          value: isFinite(proj.diasHasta0) ? `${proj.diasHasta0} días` : "∞",
          sub: proj.stockout ? `Sin stock ~${fmtFechaLarga(proj.stockout.toISOString().slice(0,10))}` : "stock suficiente",
          warn: isFinite(proj.diasHasta0) && proj.diasHasta0 < 30,
        },
      ]
    : [];

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Ficha de SKU</h1>
            <p className="text-xs text-slate-400 mt-0.5">Ventas, precios e inventario estimado por producto</p>
          </div>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-wrap gap-3">

            {/* Gestión */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gestión</label>
              <select value={anho} onChange={e => setAnho(+e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {ANHOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Trimestre */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Trimestre</label>
              <select value={trimestre} onChange={e => setTrimestre(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {TRIMESTRES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Regional */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Regional</label>
              <select value={regional} onChange={e => setRegional(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {REGIONALES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Almacén */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Almacén <span className="text-slate-300 font-normal">(próximamente)</span>
              </label>
              <select value={almacen} onChange={e => setAlmacen(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {ALMACENES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Canal */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Canal</label>
              <select value={canal} onChange={e => setCanal(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {CANALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

          </div>
        </div>

        {/* ── Búsqueda de SKU ─────────────────────────────────────────────── */}
        <div className="card">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Seleccionar producto</p>
          <div className="flex flex-wrap gap-3 items-end">

            {/* Categoría */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Categoría</label>
              <select value={searchCategoria} onChange={e => setSearchCategoria(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-44">
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Buscador */}
            <div className="flex-1 min-w-56 relative" ref={searchRef}>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block mb-1">
                Código / Artículo
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => { setSearchQ(e.target.value); if (selectedSku) setSelectedSku(null); }}
                  onFocus={() => { if (searchQ.length >= 2 && searchResults.length > 0) setShowDropdown(true); }}
                  placeholder="Buscar por nombre o código…"
                  className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoComplete="off"
                />
                {(searchQ || selectedSku) && (
                  <button onClick={clearSku} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Dropdown resultados */}
              {showDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  {loadingSearch ? (
                    <div className="flex items-center gap-2 justify-center py-3 text-xs text-slate-400">
                      <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                      Buscando…
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="py-3 text-center text-xs text-slate-400">Sin resultados para "{searchQ}"</div>
                  ) : (
                    <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                      {searchResults.map(s => (
                        <li key={s.codigo}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-brand-50 transition-colors"
                          onMouseDown={() => selectSku(s)}>
                          <span className="shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {s.codigo}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{s.nombre}</p>
                            <p className="text-[10px] text-slate-400">{s.linea} · {s.marca}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* SKU seleccionado */}
          {selectedSku && (
            <div className="mt-3 flex items-center gap-3 px-3 py-2 bg-brand-50 rounded-xl border border-brand-100">
              <Package size={16} className="text-brand-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-brand-700">{selectedSku.nombre}</p>
                <p className="text-[11px] text-brand-500">
                  {selectedSku.codigo} · {selectedSku.linea} · {selectedSku.marca}
                  {selectedSku.ul > 0 && ` · ${selectedSku.ul} mL`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Sin SKU seleccionado ─────────────────────────────────────────── */}
        {!selectedSku && (
          <div className="card text-center py-16 text-slate-400 text-sm flex flex-col items-center gap-2">
            <Package size={32} className="text-slate-300" />
            Buscá y seleccioná un producto para ver su análisis
          </div>
        )}

        {/* ── KPIs ────────────────────────────────────────────────────────── */}
        {selectedSku && !loadingVentas && proj && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map(kpi => (
              <div key={kpi.label} className={`card ${kpi.warn ? "border border-amber-200 bg-amber-50" : ""}`}>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{kpi.label}</p>
                <p className={`text-xl font-bold mt-1 ${kpi.warn ? "text-amber-600" : "text-slate-800"}`}>
                  {kpi.warn && <AlertTriangle size={14} className="inline mr-1 mb-0.5" />}
                  {kpi.value}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>
        )}

        {selectedSku && loadingVentas && <Spinner />}

        {/* ── Gráfico 1: Unidades / Volumen + Inventario ──────────────────── */}
        {selectedSku && !loadingVentas && ventas.length > 0 && (
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-slate-700">
                  {metrica === "uds" ? "Unidades vendidas" : (esLicor ? "Volumen (Cajas 9L)" : "Volumen vendido")}
                  {" + "}
                  <span className="text-amber-600">inventario estimado</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {TRIMESTRES.find(t => t.value === trimestre)?.label} · {anho}
                  {" · "}
                  <span className="text-slate-300 italic">Inventario inicial es estimado</span>
                </p>
              </div>
              {esLicor && (
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold shrink-0">
                  <button onClick={() => setMetrica("uds")}
                    className={`px-3 py-1.5 transition-colors ${metrica === "uds" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    Uds
                  </button>
                  <button onClick={() => setMetrica("vol")}
                    className={`px-3 py-1.5 transition-colors ${metrica === "vol" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    Vol
                  </button>
                </div>
              )}
            </div>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartVentasData} margin={{ top: 8, right: 56, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={fmtFecha}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => fmtN(v)} width={52} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => fmtN(v)} width={52} />
                  <Tooltip
                    labelFormatter={v => fmtFechaLarga(String(v))}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" dataKey={metrica === "uds" ? "uds" : "vol"} name={metrica === "uds" ? "Unidades" : "Volumen"}
                    stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="right" dataKey="stock" name="Inventario estimado"
                    stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="right" dataKey="stock_proj" name="Proyección inventario"
                    stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                  {stockout0Fecha && (
                    <ReferenceLine x={stockout0Fecha} yAxisId="right" stroke="#ef4444" strokeDasharray="4 2"
                      label={{ value: "Quiebre", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Gráfico 2: Ventas en Bs ──────────────────────────────────────── */}
        {selectedSku && !loadingVentas && ventas.length > 0 && (
          <div className="card">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-700">Ventas en Bs</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {TRIMESTRES.find(t => t.value === trimestre)?.label} · {anho}
              </p>
            </div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartVentasData} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={fmtFecha}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `Bs ${fmtN(v)}`} width={72} />
                  <Tooltip
                    labelFormatter={v => fmtFechaLarga(String(v))}
                    formatter={(val, name) => [fmtBs(Number(val)), name]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="bs" name="Venta Bs"
                    stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Gráfico 3: Historial de precios ──────────────────────────────── */}
        {selectedSku && (
          <div className="card">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-700">Historia de precios</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Precios por lista — fuente: fact_precio_producto</p>
            </div>

            {loadingPrecios ? <Spinner /> : precios.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">Sin historial de precios para este producto</div>
            ) : (
              <>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartPreciosData.data} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tickFormatter={fmtFechaLarga}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `Bs ${fmtN(v)}`} width={72} />
                      <Tooltip
                        labelFormatter={v => fmtFechaLarga(String(v))}
                        formatter={(val, name) => [fmtBs(Number(val)), name]}
                        contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {chartPreciosData.listas.map(lista => (
                        <Line
                          key={lista}
                          type="stepAfter"
                          dataKey={lista}
                          name={lista}
                          stroke={listaColor(lista)}
                          strokeWidth={2}
                          dot={{ r: 3, fill: listaColor(lista), strokeWidth: 0 }}
                          connectNulls
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Tabla de precios actuales */}
                <div className="mt-4 overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400">
                        <th className="text-left py-2 pr-4 font-semibold">Lista</th>
                        <th className="text-right py-2 px-3 font-semibold">Precio</th>
                        <th className="text-right py-2 px-3 font-semibold">Con ICE</th>
                        <th className="text-right py-2 px-3 font-semibold">Desde</th>
                        <th className="text-right py-2 pl-3 font-semibold">Hasta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {precios.map((p, i) => (
                        <tr key={i} className={`border-b border-slate-50 ${p.es_actual ? "bg-green-50" : ""}`}>
                          <td className="py-1.5 pr-4">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: listaColor(p.lista) }} />
                              <span className={`font-semibold ${p.es_actual ? "text-green-700" : "text-slate-600"}`}>{p.lista}</span>
                              {p.es_actual && <span className="text-[10px] text-green-600 font-semibold">Actual</span>}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-slate-700">{fmtBs(p.precio)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-slate-500">
                            {p.precio_ice != null ? fmtBs(p.precio_ice) : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-500">{p.fecha_desde ? fmtFechaLarga(p.fecha_desde) : "—"}</td>
                          <td className="py-1.5 pl-3 text-right text-slate-500">{p.fecha_hasta ? fmtFechaLarga(p.fecha_hasta) : "Vigente"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Sin ventas en el período */}
        {selectedSku && !loadingVentas && ventas.length === 0 && (
          <div className="card text-center text-slate-400 text-sm py-10 flex items-center justify-center gap-2">
            <TrendingUp size={16} />
            Sin ventas registradas para este SKU en {TRIMESTRES.find(t => t.value === trimestre)?.label} {anho}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
