import { useState, useEffect, useRef, useMemo, type ChangeEvent } from "react";
import { MapPin, AlertCircle, Download, Search } from "lucide-react";

const API_BASE =
  import.meta.env.MODE === "production" ? "/sistemabi/api" : "http://localhost:8000/api";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../context/AuthContext";
import type { AuthContextValue } from "../types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RutaRow {
  ruta:               string;
  vendedor:           string | null;
  supervisor:         string | null;
  dia:                string | null;
  total_clientes:     number;
  clientes_con_compra: number;
  pct_cobertura:      number | null;
}

interface SemanaRow {
  semana:     number;
  pedidos:    number;
  venta_neta: number;
}

interface CategoriaRow {
  categoria:  string;
  pedidos:    number;
  venta_neta: number;
  pct:        number;
}

interface SkuRow {
  codigo:          string;
  producto:        string;
  pedidos:         number;
  venta_neta:      number;
  clientes_con_sku: number;
  total_clientes:  number;
  pct_cobertura:   number;
}

type Regional = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES     = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const REGIONALES: Regional[] = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];

const DIAS_OPTS = [
  { value: "1-LU", label: "Lunes" },
  { value: "2-MA", label: "Martes" },
  { value: "3-MI", label: "Miércoles" },
  { value: "4-JU", label: "Jueves" },
  { value: "5-VI", label: "Viernes" },
  { value: "6-SA", label: "Sábado" },
];

const REGIONAL_CONFIG: Record<Regional, { badge: string }> = {
  Nacional:     { badge: "bg-brand-100 text-brand-700 border-brand-200" },
  "Santa Cruz": { badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba:   { badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz":     { badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

const CAT_COLORS: Record<string, string> = {
  "Alimentos":            "#22c55e",
  "Apego":                "#a855f7",
  "Licores":              "#f59e0b",
  "Home & Personal Care": "#3b82f6",
  "Sin clasificar":       "#94a3b8",
};
const catColor = (cat: string) => CAT_COLORS[cat] ?? "#64748b";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = new Date();
const NUM  = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmtN   = (n: number) => NUM.format(n);
const fmtBs  = (n: number) => {
  if (n >= 1_000_000) return `Bs ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `Bs ${(n / 1_000).toFixed(1)}K`;
  return `Bs ${n.toFixed(0)}`;
};
const fmtPct = (n: number | null) => n != null ? `${n.toFixed(1)}%` : "—";

function pctColor(n: number | null) {
  if (n == null) return "text-slate-300";
  if (n >= 100)  return "text-emerald-600";
  if (n >= 80)   return "text-amber-500";
  return "text-red-500";
}

const selCls = "text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer";

function SearchableSelect({
  value, onChange, options, placeholder = "Todas",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() =>
    options.filter(o => o.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className={`text-sm border rounded-lg px-3 py-2 bg-white text-left w-44 flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors ${
          value ? "border-brand-400 ring-1 ring-brand-300 text-slate-700" : "border-slate-200 text-slate-700"
        }`}
      >
        <span className="truncate">{value || placeholder}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar marca…"
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto text-sm">
            <li
              onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
              className={`px-3 py-2 cursor-pointer hover:bg-slate-50 ${!value ? "font-semibold text-brand-600 bg-brand-50" : "text-slate-500"}`}
            >
              {placeholder}
            </li>
            {filtered.map(o => (
              <li
                key={o}
                onClick={() => { onChange(o); setOpen(false); setQuery(""); }}
                className={`px-3 py-2 cursor-pointer hover:bg-slate-50 truncate ${value === o ? "font-semibold text-brand-600 bg-brand-50" : "text-slate-700"}`}
              >
                {o}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-slate-400 text-xs">Sin resultados</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const Spinner = () => (
  <div className="h-48 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Admin cargos ─────────────────────────────────────────────────────────────

const ADMIN_CARGOS = new Set([
  'Administrador de Sistema',
  'Subadministrador de Sistemas',
  'Analista de Datos',
  'Gerente General',
  'Gerente de Ventas',
]);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardInformacionRutas() {
  const { apiFetch, token, user } = useAuth() as AuthContextValue;

  const isAdmin           = !!(user && (user.is_staff || ADMIN_CARGOS.has(user.cargo ?? '')));
  const isGerenteRegional = !isAdmin && user?.cargo === "Gerente Regional";
  const isSuperv          = !isAdmin && !isGerenteRegional && (user?.cargo?.toLowerCase().includes("supervisor") ?? false);

  const [anho,        setAnho]        = useState(now.getFullYear());
  const [mes,         setMes]         = useState(now.getMonth() + 1);
  const [regional,    setRegional]    = useState<Regional>("Santa Cruz");
  const [canal,       setCanal]       = useState("Todos");
  const [dia,         setDia]         = useState("Todos");
  const [supervisor,  setSupervisor]  = useState("Todos");
  const [marca,       setMarca]       = useState("");
  const [canales,     setCanales]     = useState<string[]>([]);
  const [supervisores, setSupervisores] = useState<string[]>([]);
  const [marcas,      setMarcas]      = useState<string[]>([]);

  const [rutas,        setRutas]        = useState<RutaRow[]>([]);
  const [selectedRuta, setSelectedRuta] = useState<RutaRow | null>(null);
  const [detalle,      setDetalle]      = useState<SemanaRow[]>([]);

  const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null);
  const [categorias,        setCategorias]        = useState<CategoriaRow[]>([]);
  const [skus,              setSkus]              = useState<SkuRow[]>([]);
  const [loadingCat,        setLoadingCat]        = useState(false);
  const [loadingSku,        setLoadingSku]        = useState(false);

  const [searchQuery,    setSearchQuery]    = useState("");
  const [metricaDetalle, setMetricaDetalle] = useState<"bs" | "pedidos">("bs");
  const [downloading,    setDownloading]    = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // Cargar listas estáticas (canales + marcas)
  useEffect(() => {
    apiFetch<{ success: boolean; data: string[] }>("/dashboard/canales/lista/")
      .then(r => { if (r.success) setCanales(r.data); })
      .catch(() => undefined);
    apiFetch<{ success: boolean; data: string[] }>("/dashboard/informacion-rutas/marcas/")
      .then(r => { if (r.success) setMarcas(r.data); })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bloquear regional/canal para usuarios no-admin según su perfil
  useEffect(() => {
    if (!isAdmin) {
      if (user?.regional) setRegional(user.regional as Regional);
      if (user?.canal)    setCanal(user.canal);
    }
  }, [isAdmin, user?.regional, user?.canal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar tabla de rutas
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null); setSelectedRuta(null); setSearchQuery("");
      const qs = new URLSearchParams({
        regional:   regional.toLowerCase().replace(/ /g, "_"),
        canal, supervisor, dia, marca,
        anho: String(anho), mes: String(mes),
      });
      try {
        const r = await apiFetch<{
          success: boolean; data: RutaRow[]; supervisores: string[];
        }>(`/dashboard/informacion-rutas/?${qs}`);
        if (!r.success) throw new Error("Error al cargar rutas");
        setRutas(r.data ?? []);
        setSupervisores(r.supervisores ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [regional, canal, dia, supervisor, marca, anho, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar detalle semanal al seleccionar ruta
  useEffect(() => {
    if (!selectedRuta) { setDetalle([]); return; }
    const load = async () => {
      setLoadingDetalle(true);
      const r = await apiFetch<{ success: boolean; data: SemanaRow[] }>(
        `/dashboard/informacion-rutas/detalle/?ruta=${encodeURIComponent(selectedRuta.ruta)}&canal=${encodeURIComponent(canal === "Todos" ? "" : canal)}&marca=${encodeURIComponent(marca)}&anho=${anho}&mes=${mes}`
      ).catch(() => null);
      if (r?.success) setDetalle(r.data ?? []);
      setLoadingDetalle(false);
    };
    void load();
  }, [selectedRuta, anho, mes, marca]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar categorías al seleccionar ruta
  useEffect(() => {
    if (!selectedRuta) { setCategorias([]); setSelectedCategoria(null); return; }
    const load = async () => {
      setLoadingCat(true); setSelectedCategoria(null); setSkus([]);
      const r = await apiFetch<{ success: boolean; data: CategoriaRow[] }>(
        `/dashboard/informacion-rutas/categorias/?ruta=${encodeURIComponent(selectedRuta.ruta)}&canal=${encodeURIComponent(canal === "Todos" ? "" : canal)}&marca=${encodeURIComponent(marca)}&anho=${anho}&mes=${mes}`
      ).catch(() => null);
      if (r?.success) setCategorias(r.data ?? []);
      setLoadingCat(false);
    };
    void load();
  }, [selectedRuta, anho, mes, canal, marca]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar SKUs al seleccionar categoría
  useEffect(() => {
    if (!selectedRuta || !selectedCategoria) { setSkus([]); return; }
    const load = async () => {
      setLoadingSku(true);
      const r = await apiFetch<{ success: boolean; data: SkuRow[] }>(
        `/dashboard/informacion-rutas/skus/?ruta=${encodeURIComponent(selectedRuta.ruta)}&canal=${encodeURIComponent(canal === "Todos" ? "" : canal)}&marca=${encodeURIComponent(marca)}&categoria=${encodeURIComponent(selectedCategoria)}&anho=${anho}&mes=${mes}`
      ).catch(() => null);
      if (r?.success) setSkus(r.data ?? []);
      setLoadingSku(false);
    };
    void load();
  }, [selectedRuta, selectedCategoria, anho, mes, canal, marca]); // eslint-disable-line react-hooks/exhaustive-deps

  const anhos = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const rutasSinVendedor = useMemo(() => rutas.filter(r => !r.vendedor).length, [rutas]);

  const filteredRutas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rutas;
    return rutas.filter(r =>
      r.ruta.toLowerCase().includes(q) ||
      (r.vendedor ?? "").toLowerCase().includes(q)
    );
  }, [rutas, searchQuery]);

  const ALL_CATS = ["Alimentos", "Apego", "Licores", "Home & Personal Care", "Sin clasificar"];
  const chartCategorias = useMemo(() => {
    const byName = new Map(categorias.map(c => [c.categoria, c]));
    return ALL_CATS.map(cat => byName.get(cat) ?? { categoria: cat, pedidos: 0, venta_neta: 0, pct: 0 });
  }, [categorias]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDescargar = async () => {
    if (downloading) return;
    setDownloading(true);
    const qs = new URLSearchParams({
      regional: regional.toLowerCase().replace(/ /g, "_"),
      canal, dia, supervisor, marca,
      anho: String(anho), mes: String(mes),
    });
    const supSlug   = supervisor !== "Todos" ? supervisor.replace(/ /g, "_") : "todos";
    const marcaSlug = marca || "todas";
    const filename  = `clientes_sin_compra_${supSlug}_${marcaSlug}_${anho}_${String(mes).padStart(2,"0")}.xlsx`;
    window.dispatchEvent(new CustomEvent("dl:start", { detail: { name: filename, titulo: "Clientes sin compra" } }));
    try {
      const res = await fetch(`${API_BASE}/exportar/clientes-sin-compra/?${qs}`, {
        headers: { Authorization: `Token ${token ?? ""}` },
      });
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
      const reader = res.body!.getReader();
      const chunks: BlobPart[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      window.dispatchEvent(new CustomEvent("dl:done", { detail: { url: URL.createObjectURL(blob), name: filename } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent("dl:error"));
    } finally {
      setDownloading(false);
    }
  };

  // Datos semanales: siempre 4 semanas, vacías si no hay datos
  const semanaData = useMemo(() => {
    const bySem = new Map(detalle.map(d => [d.semana, d]));
    return [1, 2, 3, 4].map(sem => {
      const d = bySem.get(sem);
      return {
        semana:     sem,
        pedidos:    d?.pedidos    ?? 0,
        venta_neta: d?.venta_neta ?? 0,
        hasDatos:   !!d,
      };
    });
  }, [detalle]);

  // Gráfico de línea semanal (Sem 1..4)
  const chartData = semanaData.map(s => ({
    semana:     s.semana,
    pedidos:    s.pedidos,
    venta_neta: s.venta_neta,
  }));

  const coberturaMedia = useMemo(() => {
    const con = rutas.filter(r => r.pct_cobertura != null);
    if (!con.length) return null;
    return con.reduce((s, r) => s + (r.pct_cobertura ?? 0), 0) / con.length;
  }, [rutas]);


  return (
    <DashboardLayout>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Información Rutas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Cobertura por ruta ·&nbsp;
            <span className="font-semibold text-slate-700">{MESES[mes]} {anho}</span>
          </p>
        </div>

        {/* Filtros arriba derecha */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))} className={selCls}>
              {anhos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))} className={selCls}>
              {MESES.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
            {(isAdmin || isGerenteRegional) ? (
              <select value={canal} onChange={(e: ChangeEvent<HTMLSelectElement>) => { setCanal(e.target.value); setSupervisor("Todos"); }} className={selCls}>
                <option value="Todos">Todos</option>
                {canales.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <span className="inline-flex items-center text-sm font-semibold px-3 py-2 rounded-lg bg-brand-50 text-brand-700 border border-brand-200">
                {canal !== "Todos" ? canal : "—"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Día</label>
            <select value={dia} onChange={(e: ChangeEvent<HTMLSelectElement>) => setDia(e.target.value)} className={selCls}>
              <option value="Todos">Todos</option>
              {DIAS_OPTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Supervisor</label>
            {isSuperv ? (
              <span className="inline-flex items-center text-sm font-semibold px-3 py-2 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                {user?.full_name || user?.username || "—"}
              </span>
            ) : (
              <select value={supervisor} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSupervisor(e.target.value)} className={selCls}>
                <option value="Todos">Todos</option>
                {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              Marca{marca && <span className="ml-1 text-brand-500">·</span>}
            </label>
            <SearchableSelect value={marca} onChange={setMarca} options={marcas} />
          </div>
        </div>
      </div>

      {/* Regional */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mr-1">Regional</span>
        {isAdmin ? (
          REGIONALES.map(r => (
            <button key={r} onClick={() => { setRegional(r); setSupervisor("Todos"); }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                regional === r
                  ? `${REGIONAL_CONFIG[r].badge} shadow-sm`
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}>{r}</button>
          ))
        ) : (
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${REGIONAL_CONFIG[regional]?.badge ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
            {regional}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* ── KPIs resumen ────────────────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div className="card">
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Total rutas</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{fmtN(rutas.length)}</p>
          </div>
          <div className="card">
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Con vendedor asignado</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{fmtN(rutas.filter(r => r.vendedor).length)}</p>
          </div>
          <div className="card">
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Sin vendedor asignado</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{fmtN(rutasSinVendedor)}</p>
          </div>
          <div className="card">
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Cobertura promedio</p>
            <p className={`text-2xl font-bold mt-1 ${pctColor(coberturaMedia)}`}>{fmtPct(coberturaMedia)}</p>
          </div>
        </div>
      )}

      {/* ── Tabla de rutas ────────────────────────────────────────────────────── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <MapPin size={15} className="text-brand-500" />
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2 flex-wrap">
            Rutas — {regional}{supervisor !== "Todos" ? ` · Sup. ${supervisor}` : ""}
            {marca && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 border border-brand-200">
                {marca}
                <button onClick={() => setMarca("")} className="text-brand-400 hover:text-brand-700 leading-none">×</button>
              </span>
            )}
          </h2>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar ruta o vendedor…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-48"
              />
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">Clic en una ruta para ver el detalle</span>
            <button onClick={handleDescargar} disabled={downloading || loading}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <Download size={13} />
              {downloading ? "Generando…" : "Sin compra"}
            </button>
          </div>
        </div>

        {loading ? <Spinner /> : (
          <div className="overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" style={{ maxHeight: 440 }}>
            <table className="w-full text-xs min-w-175">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                <tr className="text-slate-500 text-left">
                  <th className="py-2 pr-4 font-semibold">Ruta</th>
                  <th className="py-2 pr-4 font-semibold">Vendedor</th>
                  <th className="py-2 pr-4 font-semibold">Supervisor</th>
                  <th className="py-2 pr-4 font-semibold">Día</th>
                  <th className="py-2 px-3 font-semibold text-right">Clientes</th>
                  <th className="py-2 px-3 font-semibold text-right">Con compra</th>
                  <th className="py-2 pl-3 font-semibold text-right">
                    {marca ? `% Cob. ${marca}` : "% Cobertura"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRutas.map(row => {
                  const isSel = selectedRuta?.ruta === row.ruta;
                  return (
                    <tr key={row.ruta}
                      onClick={() => setSelectedRuta(isSel ? null : row)}
                      className={`border-b cursor-pointer transition-colors ${
                        isSel
                          ? "bg-brand-600 border-brand-600"
                          : "border-slate-50 hover:bg-slate-50"
                      }`}>
                      <td className={`py-2 pr-4 font-mono font-bold text-[11px] ${isSel ? "text-white" : "text-slate-500"}`}>
                        {row.ruta}
                      </td>
                      <td className={`py-2 pr-4 font-semibold ${isSel ? "text-white" : "text-slate-700"}`}>
                        {row.vendedor ?? <span className={`${isSel ? "text-brand-200" : "text-slate-300"} italic font-normal`}>Sin asignar</span>}
                      </td>
                      <td className={`py-2 pr-4 ${isSel ? "text-brand-100" : "text-slate-600"}`}>
                        {row.supervisor ?? <span className={isSel ? "text-brand-300" : "text-slate-300"}>—</span>}
                      </td>
                      <td className={`py-2 pr-4 ${isSel ? "text-brand-100" : "text-slate-500"}`}>
                        {row.dia ?? <span className={isSel ? "text-brand-300" : "text-slate-300"}>—</span>}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums ${isSel ? "text-white" : "text-slate-700"}`}>{fmtN(row.total_clientes)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${isSel ? "text-white" : "text-slate-700"}`}>{fmtN(row.clientes_con_compra)}</td>
                      <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${isSel ? "text-white" : pctColor(row.pct_cobertura)}`}>
                        {fmtPct(row.pct_cobertura)}
                      </td>
                    </tr>
                  );
                })}
                {filteredRutas.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">
                    {searchQuery ? "Sin resultados para la búsqueda" : "Sin rutas para los filtros seleccionados"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detalle semanal ───────────────────────────────────────────────────── */}
      {selectedRuta ? (
        <div className="card">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-slate-700">
                Detalle — <span className="text-brand-600">{selectedRuta.ruta}</span>
                {selectedRuta.vendedor && <span className="text-slate-400 font-normal"> · {selectedRuta.vendedor}</span>}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{MESES[mes]} {anho} · tendencia semanal</p>
            </div>
            {/* Toggle Bs / Pedidos */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold shrink-0">
              <button onClick={() => setMetricaDetalle("bs")}
                className={`px-3 py-1.5 transition-colors ${metricaDetalle === "bs" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                Bs
              </button>
              <button onClick={() => setMetricaDetalle("pedidos")}
                className={`px-3 py-1.5 transition-colors ${metricaDetalle === "pedidos" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                Pedidos
              </button>
            </div>
          </div>

          {loadingDetalle ? <Spinner /> : semanaData.some(s => s.hasDatos) ? (
            <>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="semana"
                      type="number"
                      domain={[1, 4]}
                      ticks={[1, 2, 3, 4]}
                      tickFormatter={v => `Sem ${v}`}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                    />
                    <YAxis
                      tickFormatter={v => metricaDetalle === "bs" ? fmtBs(v) : fmtN(v)}
                      tick={{ fontSize: 10 }}
                      width={metricaDetalle === "bs" ? 72 : 44}
                    />
                    <Tooltip
                      labelFormatter={v => `Semana ${v}`}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                      formatter={(val) =>
                        metricaDetalle === "bs"
                          ? [fmtBs(Number(val)), "Bs"]
                          : [fmtN(Number(val)), "Pedidos"]
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey={metricaDetalle === "bs" ? "venta_neta" : "pedidos"}
                      stroke={metricaDetalle === "bs" ? "#3b82f6" : "#f59e0b"}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: metricaDetalle === "bs" ? "#3b82f6" : "#f59e0b", strokeWidth: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs min-w-80">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-2 pr-6 font-semibold w-24"></th>
                      {[1,2,3,4].map(sem => (
                        <th key={sem} className="text-right py-2 px-4 font-semibold text-slate-600">Sem {sem}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-100">
                      <td className="py-2 pr-6 font-bold text-slate-500 text-[11px] uppercase tracking-wide">Pedidos</td>
                      {semanaData.map(s => (
                        <td key={s.semana} className={`py-2 px-4 text-right font-semibold tabular-nums ${s.hasDatos ? "text-slate-800" : "text-slate-300"}`}>
                          {s.hasDatos ? fmtN(s.pedidos) : "—"}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="py-2 pr-6 font-bold text-slate-500 text-[11px] uppercase tracking-wide">Venta Bs</td>
                      {semanaData.map(s => (
                        <td key={s.semana} className={`py-2 px-4 text-right font-bold tabular-nums ${s.hasDatos ? "text-slate-800" : "text-slate-300"}`}>
                          {s.hasDatos ? fmtBs(s.venta_neta) : "—"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center text-slate-400 text-sm py-8">
              Sin ventas registradas para esta ruta en el período
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center text-slate-400 text-sm py-10 flex items-center justify-center gap-2">
          <MapPin size={14} />
          Seleccioná una ruta para ver su tendencia semanal
        </div>
      )}

      {/* ── Categorías + SKUs (side by side) ─────────────────────────────────── */}
      {selectedRuta && (
        <div className="flex flex-col lg:flex-row gap-4 mt-4 items-stretch">

          {/* Categorías */}
          <div className="card flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-semibold text-slate-700 text-sm">
                Categorías — <span className="text-brand-600">{selectedRuta.ruta}</span>
              </h2>
              <span className="ml-auto text-[11px] text-slate-400">Clic para ver SKUs</span>
            </div>
            {loadingCat ? <Spinner /> : (
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={chartCategorias} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="categoria"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickFormatter={v => v === "Home & Personal Care" ? "HPC" : v}
                    />
                    <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} tick={{ fontSize: 10 }} width={36} />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as CategoriaRow;
                        return (
                          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#1e293b" }}>
                            <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.categoria}</p>
                            {d.venta_neta === 0
                              ? <p>Sin ventas</p>
                              : <><p>{d.pct}% del total</p><p>{fmtBs(d.venta_neta)} · {fmtN(d.pedidos)} pedidos</p></>
                            }
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="pct"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      maxBarSize={72}
                      onClick={(data: unknown) => {
                        const d = data as CategoriaRow;
                        if (d.venta_neta === 0) return;
                        setSelectedCategoria(prev => prev === d.categoria ? null : d.categoria);
                      }}
                    >
                      {chartCategorias.map(c => (
                        <Cell
                          key={c.categoria}
                          fill={catColor(c.categoria)}
                          opacity={c.venta_neta === 0 ? 0.18 : (!selectedCategoria || selectedCategoria === c.categoria ? 1 : 0.35)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* SKUs */}
          <div className="card flex-1 min-w-0">
            {!selectedCategoria ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm py-16">
                Seleccioná una categoría para ver sus SKUs
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: catColor(selectedCategoria) }} />
                  <h2 className="font-semibold text-slate-700 text-sm">
                    SKUs <span style={{ color: catColor(selectedCategoria) }}>{selectedCategoria}</span>
                  </h2>
                  <span className="ml-auto text-[11px] text-slate-400">% clientes que compraron</span>
                </div>
                {loadingSku ? <Spinner /> : skus.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-8">Sin SKUs para esta categoría</div>
                ) : (
                  <div style={{ height: 220, overflowY: "auto" }}>
                    <div style={{ height: Math.max(220, skus.length * 28 + 24), minHeight: 220 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart
                          data={skus}
                          layout="vertical"
                          margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                          <YAxis
                            type="category"
                            dataKey="producto"
                            width={170}
                            tick={{ fontSize: 10, fill: "#475569" }}
                            tickFormatter={v => v.length > 26 ? v.slice(0, 25) + "…" : v}
                          />
                          <Tooltip
                            cursor={{ fill: "#f8fafc" }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload as SkuRow;
                              return (
                                <div style={{ maxWidth: 240, whiteSpace: "normal", wordBreak: "break-word", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#1e293b" }}>
                                  <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.producto}</p>
                                  <p>{d.pct_cobertura}% cob. ({d.clientes_con_sku}/{d.total_clientes})</p>
                                  <p>{fmtBs(d.venta_neta)} · {fmtN(d.pedidos)} pedidos</p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="pct_cobertura" radius={[0, 4, 4, 0]} maxBarSize={18}>
                            {skus.map(s => (
                              <Cell
                                key={s.codigo}
                                fill={catColor(selectedCategoria)}
                                fillOpacity={0.6 + (s.pct_cobertura / 100) * 0.4}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}

    </DashboardLayout>
  );
}
