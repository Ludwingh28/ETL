import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Package, TrendingUp, AlertTriangle, ChevronDown, Search } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import DashboardLayout from "../components/DashboardLayout";
import { setActiveFilters } from "../utils/filterStore";
import { useAuth } from "../context/AuthContext";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AlmacenOption {
  codigo: string;
  nombre: string;
  ciudad: string;
}

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
  lista:       string;
  precio:      number;
  precio_ice:  number | null;
  fecha_desde: string;
  fecha_hasta: string | null;
  es_actual:   boolean;
}

interface InventarioSnap {
  fecha:        string;
  stock_buenos: number;
  stock_total:  number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ANHOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const TRIMESTRES = [
  { value: "1", label: "Q1 — Ene·Feb·Mar" },
  { value: "2", label: "Q2 — Abr·May·Jun" },
  { value: "3", label: "Q3 — Jul·Ago·Sep" },
  { value: "4", label: "Q4 — Oct·Nov·Dic" },
];

const REGIONALES = [
  { value: "nacional",   label: "Nacional"   },
  { value: "santa_cruz", label: "Santa Cruz" },
  { value: "cochabamba", label: "Cochabamba" },
  { value: "la_paz",     label: "La Paz"     },
];

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
  { value: "",                     label: "Todas las categorías"  },
  { value: "Alimentos",            label: "Alimentos"             },
  { value: "Licores",              label: "Licores"               },
  { value: "Home & Personal Care", label: "Home & Personal Care"  },
  { value: "Apego",                label: "Apego"                 },
  { value: "Sin Clasificar",       label: "Sin Clasificar"        },
];

const LISTA_COLORS: Record<string, string> = {
  "Gerente":      "#3b82f6",
  "Supermercado": "#10b981",
  "Mayorista":    "#f59e0b",
  "Minorista":    "#ef4444",
  "Distribuidor": "#8b5cf6",
};
function listaColor(lista: string) {
  for (const [k, v] of Object.entries(LISTA_COLORS)) {
    if (lista.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "#94a3b8";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BS_FMT = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const N_FMT  = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const fmtBs  = (n: number) => `Bs ${BS_FMT.format(n)}`;
const fmtN   = (n: number) => N_FMT.format(n);
const fmtFecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtFechaLarga = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

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

// ─── Dropdown que siempre abre hacia abajo ───────────────────────────────────

function DropdownSelect({
  value, onChange, options, placeholder, className,
}: {
  value:       string;
  onChange:    (v: string) => void;
  options:     { value: string; label: string }[];
  placeholder?: string;
  className?:  string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 flex items-center justify-between gap-2"
      >
        <span className="truncate">{selected?.label ?? placeholder ?? "Seleccionar…"}</span>
        <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul className="absolute z-50 top-[calc(100%+4px)] left-0 w-full min-w-max bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto py-1">
          {options.map(o => (
            <li
              key={o.value}
              onMouseDown={() => { onChange(o.value); setOpen(false); }}
              className={`px-3 py-2 text-xs cursor-pointer transition-colors
                ${o.value === value ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Combobox de productos ────────────────────────────────────────────────────

function SkuCombobox({
  value, onSelect, onClear, categoria, marca,
}: {
  value:     SkuInfo | null;
  onSelect:  (s: SkuInfo) => void;
  onClear:   () => void;
  categoria: string;
  marca:     string;
}) {
  const { apiFetch } = useAuth();
  const [open,     setOpen]     = useState(false);
  const [query,    setQuery]    = useState("");
  const [products, setProducts] = useState<SkuInfo[]>([]);
  const [loading,  setLoading]  = useState(false);
  const ref      = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Cargar productos al abrir o al cambiar query/categoria/marca
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (categoria)         params.set("categoria", categoria);
    if (marca)             params.set("marca", marca);
    if (query.length >= 2) params.set("q", query);

    // Sin categoría, sin marca y sin query suficiente → no buscar
    if (!categoria && !marca && query.length < 2) { setProducts([]); setLoading(false); return; }

    const delay = query.length >= 2 ? 200 : 0;
    const t = setTimeout(async () => {
      try {
        const j = await apiFetch<{ success: boolean; data: SkuInfo[] }>(
          `/dashboard/ficha-sku/buscar/?${params}`
        );
        if (j.success) setProducts(j.data);
      } finally {
        setLoading(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [open, categoria, marca, query]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpen() {
    setOpen(o => !o);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelect(s: SkuInfo) {
    onSelect(s);
    setOpen(false);
    setQuery("");
  }

  const selCls = "text-sm border rounded-lg px-3 py-2 bg-white text-left w-full flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors";

  return (
    <div ref={ref} className="relative flex-1 min-w-64">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block mb-1">
        Producto
      </label>

      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={`${selCls} ${value ? "border-brand-400 ring-1 ring-brand-300 text-slate-700" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}
      >
        <span className="truncate flex items-center gap-2">
          {value ? (
            <>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-600 shrink-0">
                {value.codigo}
              </span>
              <span className="text-slate-700">{value.nombre}</span>
            </>
          ) : "Seleccionar producto…"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onClear(); }}
              className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-80 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {/* Buscador interno */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filtrar por nombre o código…"
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {!categoria && !marca && query.length < 2 && (
              <p className="text-[10px] text-slate-400 mt-1.5 pl-1">
                Seleccioná una categoría, marca o escribí 2+ caracteres para buscar
              </p>
            )}
          </div>

          {/* Resultados */}
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              <li className="flex items-center gap-2 justify-center py-4 text-xs text-slate-400">
                <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                Cargando productos…
              </li>
            ) : products.length === 0 && (categoria || query.length >= 2) ? (
              <li className="py-4 text-center text-xs text-slate-400">
                {query.length > 0 ? `Sin resultados para "${query}"` : "Sin productos para esta categoría"}
              </li>
            ) : (
              products.map(s => (
                <li
                  key={s.codigo}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-brand-50 ${
                    value?.codigo === s.codigo ? "bg-brand-50" : ""
                  }`}
                  onMouseDown={() => handleSelect(s)}
                >
                  <span className="shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    {s.codigo}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{s.nombre}</p>
                    <p className="text-[10px] text-slate-400">{s.linea} · {s.marca}</p>
                  </div>
                  {value?.codigo === s.codigo && (
                    <span className="ml-auto text-brand-500 text-[10px] font-bold shrink-0">✓</span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardFichaSku() {
  const { apiFetch } = useAuth();

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [anho,         setAnho]         = useState(new Date().getFullYear());
  const [mes,          setMes]          = useState(new Date().getMonth() + 1);
  const [verTrimestre, setVerTrimestre] = useState(false);
  const [trimestre,    setTrimestre]    = useState(currentTrimestre());
  const [regional,     setRegional]     = useState("santa_cruz");
  const [almacen,      setAlmacen]      = useState("");
  const [almacenes,    setAlmacenes]    = useState<AlmacenOption[]>([]);
  const [canal,        setCanal]        = useState("");
  const [searchCategoria, setSearchCategoria] = useState("");

  // ── Marca ─────────────────────────────────────────────────────────────────
  const [marca,          setMarca]          = useState("");
  const [marcas,         setMarcas]         = useState<string[]>([]);

  // ── SKU ───────────────────────────────────────────────────────────────────
  const [selectedSku,    setSelectedSku]    = useState<SkuInfo | null>(null);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [ventas,          setVentas]          = useState<VentaDia[]>([]);
  const [esLicor,         setEsLicor]         = useState(false);
  const [precios,         setPrecios]         = useState<PrecioRow[]>([]);
  const [invSnaps,        setInvSnaps]        = useState<InventarioSnap[]>([]);
  const [stockActual,     setStockActual]     = useState<number | null>(null);
  const [fechaStock,      setFechaStock]      = useState<string | null>(null);
  const [loadingVentas,   setLoadingVentas]   = useState(false);
  const [loadingPrecios,  setLoadingPrecios]  = useState(false);
  const [loadingInv,      setLoadingInv]      = useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [metrica, setMetrica] = useState<"uds" | "vol">("uds");

  useEffect(() => {
    setActiveFilters({ anho, mes, verTrimestre, trimestre, regional, almacen: almacen || "Todos", canal: canal || "Todos", searchCategoria, marca, metrica });
  }, [anho, mes, verTrimestre, trimestre, regional, almacen, canal, searchCategoria, marca, metrica]);

  // ── Cargar marcas cuando cambia la categoría (o al montar) ───────────────
  useEffect(() => {
    setMarca("");
    clearSku();
    const qs = new URLSearchParams();
    if (searchCategoria) qs.set("categoria", searchCategoria);
    apiFetch<{ success: boolean; data: string[] }>(
      `/dashboard/ficha-sku/marcas/?${qs}`
    ).then(j => { if (j.success) setMarcas(j.data); }).catch(() => undefined);
  }, [searchCategoria]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cargar almacenes cuando cambia la regional ────────────────────────────
  useEffect(() => {
    setAlmacen("");
    setAlmacenes([]);
    const qs = new URLSearchParams({ regional });
    apiFetch<{ success: boolean; data: AlmacenOption[]; error?: string }>(
      `/dashboard/almacenes/lista/?${qs}`
    ).then(j => {
      if (j.success) setAlmacenes(j.data);
      else console.error("almacenes error:", j.error);
    }).catch(e => console.error("almacenes fetch failed:", e));
  }, [regional]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch ventas ──────────────────────────────────────────────────────────
  const fetchVentas = useCallback(async (sku: SkuInfo) => {
    setLoadingVentas(true);
    setEsLicor(false);
    try {
      const p = new URLSearchParams({ codigo: sku.codigo, anho: String(anho), regional });
      if (verTrimestre) p.set("trimestre", trimestre);
      else              p.set("mes", String(mes));
      if (canal)        p.set("canal", canal);
      const j = await apiFetch<{ success: boolean; data: VentaDia[]; es_licor: boolean }>(
        `/dashboard/ficha-sku/ventas/?${p}`
      );
      if (j.success) { setVentas(j.data); setEsLicor(j.es_licor); }
    } finally {
      setLoadingVentas(false);
    }
  }, [anho, mes, verTrimestre, trimestre, regional, canal, apiFetch]);

  // ── Fetch precios ─────────────────────────────────────────────────────────
  const fetchPrecios = useCallback(async (sku: SkuInfo) => {
    setLoadingPrecios(true);
    try {
      const j = await apiFetch<{ success: boolean; data: PrecioRow[] }>(
        `/dashboard/ficha-sku/precios/?codigo=${sku.codigo}`
      );
      if (j.success) setPrecios(j.data);
    } finally {
      setLoadingPrecios(false);
    }
  }, [apiFetch]);

  // ── Fetch inventario ──────────────────────────────────────────────────────
  const fetchInventario = useCallback(async (sku: SkuInfo) => {
    setLoadingInv(true);
    try {
      const p = new URLSearchParams({ codigo: sku.codigo, anho: String(anho) });
      if (verTrimestre) p.set("trimestre", trimestre);
      else              p.set("mes", String(mes));
      if (almacen)      p.set("almacen", almacen);
      const j = await apiFetch<{
        success: boolean;
        stock_actual: number;
        fecha_stock: string | null;
        data: InventarioSnap[];
      }>(`/dashboard/ficha-sku/inventario/?${p}`);
      if (j.success) {
        setStockActual(j.stock_actual);
        setFechaStock(j.fecha_stock);
        setInvSnaps(j.data);
      }
    } finally {
      setLoadingInv(false);
    }
  }, [anho, mes, verTrimestre, trimestre, almacen, apiFetch]);

  useEffect(() => {
    if (selectedSku) fetchVentas(selectedSku);
    else { setVentas([]); setEsLicor(false); }
  }, [selectedSku, anho, mes, verTrimestre, trimestre, regional, canal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedSku) fetchInventario(selectedSku);
    else { setInvSnaps([]); setStockActual(null); setFechaStock(null); }
  }, [selectedSku, anho, mes, verTrimestre, trimestre, almacen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedSku) fetchPrecios(selectedSku);
    else setPrecios([]);
  }, [selectedSku]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectSku(sku: SkuInfo) { setSelectedSku(sku); setMetrica("uds"); }
  function clearSku() {
    setSelectedSku(null);
    setVentas([]); setPrecios([]);
    setInvSnaps([]); setStockActual(null); setFechaStock(null);
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

    const stock      = stockActual ?? 0;
    const hasStock   = stockActual != null;
    const diasHasta0 = hasStock && avgUds > 0 ? Math.round(stock / avgUds) : Infinity;

    const lastFecha = new Date(ventas[ventas.length - 1].fecha + "T00:00:00");
    const stockout  = isFinite(diasHasta0)
      ? new Date(lastFecha.getTime() + diasHasta0 * 86_400_000)
      : null;

    // Proyección limitada al fin del período seleccionado (no hasta agotar el stock)
    let periodEndMs: number;
    if (verTrimestre) {
      const lastMes = parseInt(trimestre) * 3;
      periodEndMs = new Date(anho, lastMes, 0).getTime();
    } else {
      periodEndMs = new Date(anho, mes, 0).getTime();
    }
    const daysToEnd = Math.max(1, Math.round((periodEndMs - lastFecha.getTime()) / 86_400_000));
    const projDays  = Math.min(daysToEnd, 60);

    const projData: { fecha: string; stock_proj: number; uds_proj: number }[] = [];
    let stockRem = stock;
    for (let i = 1; i <= projDays; i++) {
      const d = new Date(lastFecha.getTime() + i * 86_400_000);
      stockRem = Math.max(0, stockRem - avgUds);
      projData.push({ fecha: d.toISOString().slice(0, 10), stock_proj: stockRem, uds_proj: avgUds });
      if (stockRem === 0) break;
    }

    return { stock, hasStock, diasHasta0, stockout, avgUds, avgBs, avgVol, projData, totalUds, totalBs };
  }, [selectedSku, ventas, stockActual, anho, mes, verTrimestre, trimestre]);

  // ── Datos combinados para gráficos ────────────────────────────────────────
  // El eje derecho muestra "días de cobertura" (stock ÷ promedio diario)
  // Así el valor es directamente interpretable: cuando llega a 0 = quiebre de stock
  const chartData = useMemo(() => {
    if (!selectedSku || ventas.length === 0) return [];
    const avgUds      = proj?.avgUds ?? 0;
    const avgUdsSafe  = avgUds > 0 ? avgUds : 1;
    const toCoverage  = (s: number | null) => s != null ? Math.round(s / avgUdsSafe) : null;
    const invMap      = new Map(invSnaps.map(s => [s.fecha, s.stock_buenos]));
    const lastVenta   = ventas[ventas.length - 1].fecha;

    const actual = ventas.map((d, i) => {
      const isLast        = i === ventas.length - 1;
      const stockSnap     = invMap.get(d.fecha) ?? null;
      const isBridgeStock = isLast && stockSnap !== null;
      return {
        fecha:      d.fecha,
        uds:        d.unidades as number | null,
        vol:        d.vol as number | null,
        bs:         d.bs as number | null,
        stock:      toCoverage(stockSnap),
        uds_proj:   isLast ? avgUds : null as number | null,
        stock_proj: isBridgeStock ? toCoverage(stockSnap) : null as number | null,
      };
    });

    const extraBridge: typeof actual = [];
    if (stockActual != null && fechaStock && fechaStock > lastVenta) {
      extraBridge.push({
        fecha: fechaStock, uds: null, vol: null, bs: null,
        stock:      toCoverage(stockActual),
        uds_proj:   null,
        stock_proj: toCoverage(stockActual),
      });
    }

    const projected = (proj?.projData ?? []).map(p => ({
      fecha:      p.fecha,
      uds:        null as number | null,
      vol:        null as number | null,
      bs:         null as number | null,
      stock:      null as number | null,
      uds_proj:   p.uds_proj,
      stock_proj: toCoverage(p.stock_proj),
    }));

    return [...actual, ...extraBridge, ...projected];
  }, [ventas, proj, selectedSku, invSnaps, stockActual, fechaStock]);

  const chartPreciosData = useMemo(() => {
    if (!precios.length) return { data: [], listas: [] as string[] };
    const listas = [...new Set(precios.map(p => p.lista))];
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

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = proj ? [
    {
      label: proj.hasStock ? "Stock actual" : "Stock actual (sin datos)",
      value: proj.hasStock ? fmtN(proj.stock) : "—",
      sub: fechaStock ? `al ${fmtFechaLarga(fechaStock)}` : "sin registro en inventario",
    },
    { label: "Ventas promedio/día",   value: fmtN(+proj.avgUds.toFixed(1)), sub: "días con ventas" },
    { label: "Ingresos promedio/día", value: fmtBs(proj.avgBs),            sub: "ventas netas" },
    {
      label: "Cobertura estimada",
      value: proj.hasStock && isFinite(proj.diasHasta0) ? `${proj.diasHasta0} días` : proj.hasStock ? "∞" : "—",
      sub: proj.stockout
        ? `Sin stock ~${fmtFechaLarga(proj.stockout.toISOString().slice(0, 10))}`
        : proj.hasStock ? "stock suficiente" : "sin datos de inventario",
      warn: proj.hasStock && isFinite(proj.diasHasta0) && proj.diasHasta0 < 30,
    },
  ] : [];

  // ── Etiqueta de período activo ────────────────────────────────────────────
  const periodoLabel = verTrimestre
    ? `${TRIMESTRES.find(t => t.value === trimestre)?.label} ${anho}`
    : `${MESES[mes]} ${anho}`;

  const selCls = "text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500";

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-slate-800">Ficha de SKU</h1>
          <p className="text-xs text-slate-400 mt-0.5">Ventas, precios e inventario estimado por producto</p>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Gestión */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gestión</label>
              <select value={anho} onChange={e => setAnho(+e.target.value)} className={selCls}>
                {ANHOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Mes (por defecto) */}
            {!verTrimestre && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mes</label>
                <select value={mes} onChange={e => setMes(+e.target.value)} className={selCls}>
                  {MESES.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
                </select>
              </div>
            )}

            {/* Trimestre (solo si checkbox activo) */}
            {verTrimestre && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Trimestre</label>
                <select value={trimestre} onChange={e => setTrimestre(e.target.value)} className={selCls}>
                  {TRIMESTRES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}

            {/* Checkbox ver trimestre */}
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none pb-2">
              <input
                type="checkbox"
                checked={verTrimestre}
                onChange={e => setVerTrimestre(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              Ver trimestre
            </label>

            {/* Regional */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Regional</label>
              <select value={regional} onChange={e => setRegional(e.target.value)} className={selCls}>
                {REGIONALES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Almacén */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Almacén</label>
              <select value={almacen} onChange={e => setAlmacen(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                {almacenes.map(a => <option key={a.codigo} value={a.codigo}>{a.nombre}</option>)}
              </select>
            </div>

            {/* Canal */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Canal</label>
              <select value={canal} onChange={e => setCanal(e.target.value)} className={selCls}>
                {CANALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

          </div>
        </div>

        {/* ── Selector de producto ─────────────────────────────────────────── */}
        <div className="card">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Seleccionar producto</p>
          <div className="flex flex-wrap gap-3 items-end">

            {/* Categoría */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Categoría</label>
              <select value={searchCategoria}
                onChange={e => setSearchCategoria(e.target.value)}
                className={`${selCls} w-44`}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Marca */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Marca</label>
              <DropdownSelect
                value={marca}
                onChange={v => { setMarca(v); clearSku(); }}
                options={[
                  { value: "", label: "Todas las marcas" },
                  ...marcas.map(m => ({ value: m, label: m })),
                ]}
                className="w-48"
              />
            </div>

            {/* Combobox */}
            <SkuCombobox
              value={selectedSku}
              onSelect={selectSku}
              onClear={clearSku}
              categoria={searchCategoria}
              marca={marca}
            />
          </div>

          {/* Chip del SKU seleccionado */}
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

        {/* ── Sin SKU ──────────────────────────────────────────────────────── */}
        {!selectedSku && (
          <div className="card text-center py-16 text-slate-400 text-sm flex flex-col items-center gap-2">
            <Package size={32} className="text-slate-300" />
            Seleccioná una categoría y elegí un producto para ver su análisis
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

        {/* ── Gráfico 1: Tendencia ventas + inventario (mismo gráfico) ─── */}
        {selectedSku && !loadingVentas && !loadingInv && ventas.length > 0 && (
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-slate-700">
                  {metrica === "uds" ? "Unidades" : (esLicor ? "Cajas 9L" : "Volumen")}
                  {" · Tendencia diaria + Inventario"}
                  {proj?.hasStock && isFinite(proj.diasHasta0) && (
                    <span className={`ml-2 text-sm font-medium ${proj.diasHasta0 < 30 ? "text-amber-500" : "text-slate-400"}`}>
                      {proj.diasHasta0 < 30 && <AlertTriangle size={12} className="inline mr-1 mb-0.5" />}
                      {proj.diasHasta0} días de stock
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{periodoLabel}</p>
                {/* Leyenda personalizada */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#3b82f6" strokeWidth="2"/><circle cx="12" cy="5" r="2.5" fill="#3b82f6"/></svg>
                    Uds/día
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="6 3"/></svg>
                    Proy. ventas
                  </span>
                  {proj?.hasStock && <>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#ef4444" strokeWidth="2"/><circle cx="12" cy="5" r="3.5" fill="#ef4444"/></svg>
                      Inventario (días)
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3"/></svg>
                      Proy. inventario
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 2"/></svg>
                      Alerta 30 días
                    </span>
                  </>}
                </div>
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
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 60, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="fecha" tickFormatter={fmtFecha}
                    tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
                  {/* Eje izquierdo: ventas */}
                  <YAxis yAxisId="ventas" orientation="left"
                    tick={{ fontSize: 10 }} tickFormatter={v => fmtN(v)} width={52} />
                  {/* Eje derecho: cobertura en días */}
                  <YAxis yAxisId="stock" orientation="right"
                    tick={{ fontSize: 10, fill: "#ef4444" }} tickFormatter={v => `${Math.round(v)}d`} width={44} />
                  <Tooltip
                    labelFormatter={v => fmtFechaLarga(String(v))}
                    formatter={(val, name) => {
                      if (name === "Inventario (días)" || name === "Proy. inventario")
                        return [`${Math.round(Number(val))} días`, name];
                      return [fmtN(Number(val)), name];
                    }}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />

                  {/* ── Ventas reales (línea sólida azul) */}
                  <Line yAxisId="ventas"
                    dataKey={metrica === "uds" ? "uds" : "vol"}
                    name={metrica === "uds" ? "Uds/día" : "Vol/día"}
                    stroke="#3b82f6" strokeWidth={2}
                    dot={{ r: 2.5, fill: "#3b82f6", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false} legendType="none" />

                  {/* ── Proyección ventas (línea punteada azul) */}
                  <Line yAxisId="ventas"
                    dataKey="uds_proj"
                    name="Proy. ventas"
                    stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} connectNulls legendType="none" />

                  {/* ── Inventario real (línea sólida roja, puntos en cada snapshot) */}
                  <Line yAxisId="stock"
                    dataKey="stock"
                    name="Inventario (días)"
                    stroke="#ef4444" strokeWidth={2}
                    dot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    connectNulls legendType="none" />

                  {/* ── Proyección inventario (línea punteada roja) */}
                  <Line yAxisId="stock"
                    dataKey="stock_proj"
                    name="Proy. inventario"
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} connectNulls legendType="none" />

                  {/* Línea de advertencia: 30 días de cobertura */}
                  {proj?.hasStock && (
                    <ReferenceLine yAxisId="stock" y={30}
                      stroke="#f59e0b" strokeOpacity={0.6} strokeDasharray="4 2"
                      label={{ value: "30d", position: "insideTopRight", fontSize: 9, fill: "#f59e0b" }} />
                  )}
                  {/* Línea de quiebre de stock */}
                  {stockout0Fecha && (
                    <ReferenceLine x={stockout0Fecha} yAxisId="stock"
                      stroke="#ef4444" strokeOpacity={0.5} strokeDasharray="4 2"
                      label={{ value: "Quiebre", position: "insideTopRight", fontSize: 9, fill: "#ef4444" }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Gráfico 2: Ventas en Bs ───────────────────────────────────── */}
        {selectedSku && !loadingVentas && ventas.length > 0 && (
          <div className="card">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-700">Ventas en Bs — tendencia diaria</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{periodoLabel}</p>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="fecha" tickFormatter={fmtFecha}
                    tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `Bs ${fmtN(v)}`} width={72} />
                  <Tooltip
                    labelFormatter={v => fmtFechaLarga(String(v))}
                    formatter={(val, name) => [fmtBs(Number(val)), name]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="bs" name="Bs/día"
                    stroke="#10b981" strokeWidth={2}
                    dot={{ r: 2.5, fill: "#10b981", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Gráfico 4: Historial de precios ──────────────────────────────── */}
        {selectedSku && (
          <div className="card">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-700">Historia de precios</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Por lista — fuente: fact_precio_producto</p>
            </div>

            {loadingPrecios ? <Spinner /> : precios.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">Sin historial de precios para este producto</div>
            ) : (
              <>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartPreciosData.data} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="fecha" tickFormatter={fmtFechaLarga}
                        tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `Bs ${fmtN(v)}`} width={72} />
                      <Tooltip
                        labelFormatter={v => fmtFechaLarga(String(v))}
                        formatter={(val, name) => [fmtBs(Number(val)), name]}
                        contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {chartPreciosData.listas.map(lista => (
                        <Line key={lista} type="stepAfter" dataKey={lista} name={lista}
                          stroke={listaColor(lista)} strokeWidth={2}
                          dot={{ r: 3, fill: listaColor(lista), strokeWidth: 0 }}
                          connectNulls />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

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
            Sin ventas registradas para este SKU en {periodoLabel}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
