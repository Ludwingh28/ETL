import { useEffect, useState, useCallback, useMemo, useRef, type ChangeEvent } from "react";
import {
  ClipboardList, RefreshCw, AlertCircle, Search, ArrowUpDown,
  Package, Calendar, ChevronLeft, ChevronRight, Wrench,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { setActiveFilters } from "../utils/filterStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpisData {
  total_pedidos:         number;
  total_importe:         number;
  ultima_actualizacion?: string | null;
}

interface CanalRow {
  grupo:   string;
  pedidos: number;
  monto:   number;
}

interface VendedorRow {
  vendedor:           string;
  ruta:               string;
  supervisor:         string | null;
  total_clientes:     number;
  pedidos:            number;
  pct_efectividad:    number | null;
  monto_total:        number;
  hora_inicio:        string | null;
  hora_ultimo:        string | null;
  minutos_trabajados: number | null;
}

type AgrupadoPor = "canal" | "supervisor" | "vendedor";
type Regional    = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";

// ─── Constants ────────────────────────────────────────────────────────────────

const REGIONALES: Regional[] = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];
const REGIONAL_KEY: Record<Regional, string> = {
  Nacional: "nacional", "Santa Cruz": "santa_cruz",
  Cochabamba: "cochabamba", "La Paz": "la_paz",
};

const ADMIN_CARGOS = new Set([
  "Administrador de Sistema", "Subadministrador de Sistemas",
  "Gerente General", "Gerente de Ventas", "Analista de Datos",
]);
const isAdminUser = (cargo?: string, is_staff?: boolean) =>
  is_staff === true || ADMIN_CARGOS.has(cargo ?? "");

// ─── Date helpers ─────────────────────────────────────────────────────────────

const toISO = (d: Date) => d.toISOString().slice(0, 10);

function fmtUltimaActualizacion(ua: string | null | undefined, fechaHasta: string): string | null {
  if (!ua) return null;
  // ua puede ser "2025-06-01 14:30:00", "2025-06-01T14:30:00", con o sin tz
  const dateOnly = ua.slice(0, 10);
  // extraer hora directamente del string para evitar conversión de timezone
  const timePart = ua.slice(11, 16); // "HH:MM"
  const hora = timePart.length === 5 ? timePart : "—";
  if (dateOnly === fechaHasta) return `Corte: ${hora}`;
  return `Datos al ${fmtFechaLarga(dateOnly)} ${hora}`;
}


// ─── Formatters ───────────────────────────────────────────────────────────────

const NUM = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const CUR = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const fmtN   = (n: number | null | undefined) => n != null ? NUM.format(Math.round(n)) : "—";
const fmtBs  = (n: number | null | undefined) => n != null ? CUR.format(n) : "—";
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : "—";
const fmtAbbrBs = (n: number) => {
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}Bs ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}Bs ${(abs / 1_000).toFixed(0)}K`;
  return CUR.format(n);
};

function fmtTrabajado(min: number | null) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const MESES_SHORT = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function fmtFechaLarga(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d} ${MESES_SHORT[parseInt(m)]} ${y}`;
}
function fmtRangoLabel(desde: string, hasta: string) {
  if (desde === hasta) return fmtFechaLarga(desde);
  return `${fmtFechaLarga(desde)} → ${fmtFechaLarga(hasta)}`;
}

// ─── Monto color helpers ──────────────────────────────────────────────────────

function montoRowCls(monto: number) {
  if (monto >= 1500) return "bg-emerald-50 hover:bg-emerald-100";
  if (monto >= 1000) return "bg-amber-50 hover:bg-amber-100";
  if (monto >= 500)  return "bg-orange-50 hover:bg-orange-100";
  return "bg-red-50 hover:bg-red-100";
}

function montoTextCls(monto: number) {
  if (monto >= 1500) return "text-emerald-700 font-bold";
  if (monto >= 1000) return "text-amber-700 font-semibold";
  if (monto >= 500)  return "text-orange-700";
  return "text-red-700";
}

// ─── Canal colors ─────────────────────────────────────────────────────────────

const CANAL_COLORS = [
  "#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6",
  "#8b5cf6","#14b8a6","#f97316","#ec4899","#84cc16",
];

// ─── Calendar Picker ──────────────────────────────────────────────────────────

const MESES_CAL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_CAL  = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];

interface DateRangePickerProps {
  desde: string; hasta: string;
  onChange: (d: string, h: string) => void;
}

function DateRangePicker({ desde, hasta, onChange }: DateRangePickerProps) {
  const [open, setOpen]  = useState(false);
  const [sel, setSel]    = useState<"desde"|"hasta"|null>(null);
  const [hov, setHov]    = useState<string|null>(null);
  const [nav, setNav]    = useState(() => {
    const d = new Date(desde + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref   = useRef<HTMLDivElement>(null);
  const today = toISO(new Date());

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function prevM() { setNav(n => n.month === 0 ? { year: n.year-1, month: 11 } : { ...n, month: n.month-1 }); }
  function nextM() { setNav(n => n.month === 11 ? { year: n.year+1, month: 0 }  : { ...n, month: n.month+1 }); }

  function days() {
    const arr: (string|null)[] = [];
    const first = new Date(nav.year, nav.month, 1).getDay();
    const off = first === 0 ? 6 : first - 1;
    for (let i = 0; i < off; i++) arr.push(null);
    const total = new Date(nav.year, nav.month+1, 0).getDate();
    for (let d = 1; d <= total; d++) {
      arr.push(`${nav.year}-${String(nav.month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    }
    return arr;
  }

  function click(day: string) {
    if (!sel || sel === "desde") { onChange(day, day); setSel("hasta"); }
    else { onChange(day < desde ? day : desde, day < desde ? desde : day); setSel(null); setOpen(false); }
  }

  function inRange(day: string) {
    if (sel === "hasta" && hov) {
      const [a, b] = hov < desde ? [hov, desde] : [desde, hov];
      return day > a && day < b;
    }
    return day > desde && day < hasta;
  }

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Período</label>
      <button onClick={() => { setOpen(o => !o); setSel("desde"); setNav(() => { const d = new Date(desde+"T00:00:00"); return { year: d.getFullYear(), month: d.getMonth() }; }); }}
        className="flex items-center gap-2 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-55 transition-all">
        <Calendar size={14} className="text-brand-500 shrink-0" />
        <span className="truncate">{fmtRangoLabel(desde, hasta)}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-[320px]">
          <p className="text-[11px] text-slate-400 mb-2 text-center">
            {sel === "hasta" ? `Desde ${fmtFechaLarga(desde)} — Selecciona la fecha fin` : "Selecciona la fecha de inicio"}
          </p>
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevM} className="p-1 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} className="text-slate-500" /></button>
            <span className="text-sm font-semibold text-slate-700">{MESES_CAL[nav.month]} {nav.year}</span>
            <button onClick={nextM} className="p-1 rounded-lg hover:bg-slate-100"><ChevronRight size={16} className="text-slate-500" /></button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DIAS_CAL.map(d => <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days().map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const isD = day === desde, isH = day === hasta;
              const inR = inRange(day), isT = day === today, isFut = day > today;
              return (
                <button key={day} disabled={isFut} onClick={() => click(day)}
                  onMouseEnter={() => sel === "hasta" && setHov(day)}
                  onMouseLeave={() => setHov(null)}
                  className={`text-[12px] font-medium h-8 w-full rounded-lg transition-all
                    ${isFut ? "text-slate-300 cursor-not-allowed" : "cursor-pointer"}
                    ${isD || isH ? "bg-brand-600 text-white font-bold z-10"
                      : inR ? "bg-brand-100 text-brand-700"
                      : isT ? "border border-brand-400 text-brand-600"
                      : "hover:bg-slate-100 text-slate-700"}`}>
                  {day.split("-")[2].replace(/^0/,"")}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Canal Tooltip ────────────────────────────────────────────────────────────

function CanalTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as CanalRow;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-47.5">
      <p className="font-bold text-slate-700 mb-2 truncate max-w-48" title={d.grupo}>{d.grupo}</p>
      <div className="flex justify-between gap-4"><span className="text-slate-500">Pedidos</span><span className="font-semibold">{fmtN(d.pedidos)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-brand-600">Monto</span><span className="font-semibold text-brand-700">{fmtBs(d.monto)}</span></div>
    </div>
  );
}

// ─── Chart title helper ───────────────────────────────────────────────────────

function chartTitle(agrupado: AgrupadoPor) {
  if (agrupado === "supervisor") return "Preventas por Supervisor";
  if (agrupado === "vendedor")   return "Preventas por Vendedor";
  return "Preventas por Canal";
}
function chartSubtitle(agrupado: AgrupadoPor) {
  if (agrupado === "supervisor") return "Desglose por supervisor del canal seleccionado";
  if (agrupado === "vendedor")   return "Ranking de vendedores del supervisor seleccionado";
  return "Selecciona un canal para ver el desglose por supervisor";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPreventas() {
  const { apiFetch, user } = useAuth();
  const isAdmin           = isAdminUser(user?.cargo, user?.is_staff);
  const isGerenteRegional = !isAdmin && user?.cargo === "Gerente Regional";
  const isSuperv          = !isAdmin && !isGerenteRegional && (user?.cargo?.toLowerCase().includes("supervisor") ?? false);

  const defaultDesde = () => toISO(new Date());
  const defaultHasta = () => toISO(new Date());

  // Filters
  const [regional,    setRegional]   = useState<Regional>("Santa Cruz");
  const [canal,       setCanal]      = useState("");
  const [canalList,   setCanalList]  = useState<string[]>([]);
  const [supervisor,  setSupervisor] = useState("");
  const [supList,     setSupList]    = useState<string[]>([]);
  const [fechaDesde,  setFechaDesde] = useState(defaultDesde);
  const [fechaHasta,  setFechaHasta] = useState(defaultHasta);

  const setRango = useCallback((d: string, h: string) => { setFechaDesde(d); setFechaHasta(h); }, []);

  // Data
  const [kpis,        setKpis]       = useState<KpisData | null>(null);
  const [canales,     setCanales]    = useState<CanalRow[]>([]);
  const [vendedores,  setVendedores] = useState<VendedorRow[]>([]);
  const [agrupadoPor, setAgrupadoPor]= useState<AgrupadoPor>("canal");

  // Loading
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingCan,  setLoadingCan]  = useState(true);
  const [loadingVend, setLoadingVend] = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // UI
  const [vendSearch, setVendSearch] = useState("");
  const [vendSort,   setVendSort]   = useState<"monto"|"efectividad">("monto");

  useEffect(() => {
    setActiveFilters({ regional, canal, supervisor, fechaDesde, fechaHasta });
  }, [regional, canal, supervisor, fechaDesde, fechaHasta]);

  // ── Init regional/canal/supervisor desde perfil para no-admin ─────────────
  useEffect(() => {
    if (!isAdmin) {
      if (user?.regional) setRegional(user.regional as Regional);
      if (user?.canal)    setCanal(user.canal);
      if (isSuperv && user?.full_name) setSupervisor(user.full_name);
    }
  }, [isAdmin, isSuperv, user?.regional, user?.canal, user?.full_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canales list ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin && !isGerenteRegional) return;
    apiFetch<{ success: boolean; data: string[] }>("/dashboard/canales/lista/")
      .then(j => { if (j.success) setCanalList(j.data); })
      .catch(() => setCanalList([]));
  }, [isAdmin, isGerenteRegional]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Supervisores list ─────────────────────────────────────────────────────
  const fetchSupList = useCallback(async () => {
    if (isSuperv) return;
    try {
      let url = `/dashboard/preventas/supervisores/?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`;
      if (isAdmin) url += `&regional=${REGIONAL_KEY[regional]}`;
      if (canal) url += `&canal=${encodeURIComponent(canal)}`;
      const j = await apiFetch<{ success: boolean; data: string[] }>(url);
      if (j.success) setSupList(j.data);
    } catch { setSupList([]); }
  }, [isAdmin, isSuperv, apiFetch, regional, canal, fechaDesde, fechaHasta]);

  useEffect(() => { void fetchSupList(); }, [fetchSupList]);

  // ── Build URL ─────────────────────────────────────────────────────────────
  const buildUrl = useCallback((path: string) => {
    let url = `${path}?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`;
    if (isAdmin || isGerenteRegional) {
      url += `&regional=${REGIONAL_KEY[regional]}`;
      if (canal)      url += `&canal=${encodeURIComponent(canal)}`;
      if (supervisor) url += `&supervisor=${encodeURIComponent(supervisor)}`;
    }
    return url;
  }, [isAdmin, isGerenteRegional, regional, canal, supervisor, fechaDesde, fechaHasta]);

  // ── Fetch all ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setError(null);
    setLoadingKpis(true); setLoadingCan(true); setLoadingVend(true);
    try {
      const [jKpis, jCan, jVend] = await Promise.all([
        apiFetch<{ success: boolean; error?: string } & KpisData>(buildUrl("/dashboard/preventas/kpis/")),
        apiFetch<{ success: boolean; error?: string; data: CanalRow[]; agrupado_por: string }>(buildUrl("/dashboard/preventas/por-canal/")),
        apiFetch<{ success: boolean; error?: string; data: VendedorRow[] }>(buildUrl("/dashboard/preventas/por-vendedor/")),
      ]);

      if (!jKpis.success) throw new Error(jKpis.error ?? "Error en KPIs");
      setKpis({ total_pedidos: jKpis.total_pedidos, total_importe: jKpis.total_importe });
      if (jCan.success) {
        setCanales(jCan.data);
        const ap = jCan.agrupado_por;
        setAgrupadoPor(ap === "supervisor" ? "supervisor" : ap === "vendedor" ? "vendedor" : "canal");
      }
      if (jVend.success) setVendedores(jVend.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingKpis(false); setLoadingCan(false); setLoadingVend(false);
    }
  }, [apiFetch, buildUrl]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredVend = useMemo(() => {
    const q = vendSearch.trim().toLowerCase();
    const rows = q
      ? vendedores.filter(v => v.vendedor.toLowerCase().includes(q) || v.ruta?.toLowerCase().includes(q))
      : [...vendedores];
    return rows.sort((a, b) =>
      vendSort === "monto"
        ? b.monto_total - a.monto_total
        : (b.pct_efectividad ?? -1) - (a.pct_efectividad ?? -1)
    );
  }, [vendedores, vendSearch, vendSort]);

  // ── Chart height ──────────────────────────────────────────────────────────
  const chartHeight = Math.max(canales.length > 8 ? 320 : 260, 200);
  const xAxisAngle  = canales.length > 7 ? -35 : 0;
  const xAxisBottom = canales.length > 7 ? 70  : 30;

  return (
    <DashboardLayout>
      {/* ── Header + Filters ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList size={20} className="text-brand-600" />
            <h1 className="text-2xl font-bold text-slate-800">Preventas Realizadas</h1>
          </div>
          <p className="text-slate-500 text-sm flex items-center flex-wrap gap-2">
            Seguimiento de pedidos ·{" "}
            <span className="font-semibold text-slate-700">{fmtRangoLabel(fechaDesde, fechaHasta)}</span>
            {!loadingKpis && fmtUltimaActualizacion(kpis?.ultima_actualizacion, fechaHasta) && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                {fmtUltimaActualizacion(kpis?.ultima_actualizacion, fechaHasta)}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {/* Regional */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
            {isAdmin ? (
              <div className="flex gap-1.5 flex-wrap">
                {REGIONALES.map(r => (
                  <button key={r} onClick={() => setRegional(r)}
                    className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                      regional === r
                        ? "bg-brand-100 text-brand-700 border-brand-200 shadow-sm"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                    {r}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm font-semibold px-3 py-2 rounded-lg bg-brand-50 text-brand-700 border border-brand-200">
                {regional}
              </span>
            )}
          </div>

          {/* Canal */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
            {(isAdmin || isGerenteRegional) ? (
              <select value={canal} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCanal(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-35">
                <option value="">Todos los canales</option>
                {canalList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <span className="text-sm font-semibold px-3 py-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                {canal || "Todos"}
              </span>
            )}
          </div>

          {/* Supervisor */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Supervisor</label>
            {isSuperv ? (
              <span className="text-sm font-semibold px-3 py-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                {user?.full_name || "—"}
              </span>
            ) : (
              <select value={supervisor} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSupervisor(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-40">
                <option value="">Todos los supervisores</option>
                {supList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>

          <DateRangePicker desde={fechaDesde} hasta={fechaHasta} onChange={setRango} />

          <button onClick={() => void fetchAll()} disabled={loadingKpis}
            className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40">
            <RefreshCw size={13} className={loadingKpis ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {loadingKpis ? (
          <>{[0,1].map(i => <div key={i} className="kpi-card animate-pulse bg-slate-50 rounded-xl h-24" />)}</>
        ) : (
          <>
            <div className="kpi-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-blue-50"><ClipboardList size={16} className="text-blue-600" /></div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Total Pedidos</p>
              </div>
              <p className="text-3xl font-bold text-slate-800">{fmtN(kpis?.total_pedidos)}</p>
              <p className="text-xs text-slate-400 mt-1">transacciones en el período</p>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-brand-50"><ClipboardList size={16} className="text-brand-600" /></div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Monto Total</p>
              </div>
              <p className="text-3xl font-bold text-brand-700">{fmtBs(kpis?.total_importe)}</p>
            </div>
          </>
        )}
      </div>

      {/* ── Gráfico por Canal / Supervisor / Vendedor ─────────────────────── */}
      <div className="card mb-4">
        <h2 className="text-base font-bold text-slate-800 mb-1">{chartTitle(agrupadoPor)}</h2>
        <p className="text-xs text-slate-400 mb-4">{chartSubtitle(agrupadoPor)}</p>
        {loadingCan ? (
          <div className="animate-pulse bg-slate-50 rounded-xl h-56" />
        ) : canales.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Sin datos para el período</div>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={canales} margin={{ top: 10, right: 20, left: 20, bottom: xAxisBottom }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="grupo"
                tick={{ fontSize: 10 }}
                angle={xAxisAngle}
                textAnchor={xAxisAngle !== 0 ? "end" : "middle"}
                interval={0}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAbbrBs} width={70} />
              <Tooltip content={(props: any) => <CanalTooltip {...props} />} />
              <Bar dataKey="monto" name="Monto Bs" radius={[4,4,0,0]}
                label={{ position: "top", fontSize: 9, formatter: (v: unknown) => fmtAbbrBs(Number(v)) }}>
                {canales.map((_, i) => <Cell key={i} fill={CANAL_COLORS[i % CANAL_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Tabla Detalle por Vendedor ────────────────────────────────────── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-800">Detalle por Vendedor</h2>
            {/* leyenda colores */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">≥ Bs 1.500</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100  text-amber-700">≥ Bs 1.000</span>
              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">≥ Bs 500</span>
              <span className="px-2 py-0.5 rounded-full bg-red-100    text-red-700">&lt; Bs 500</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setVendSort(s => s === "monto" ? "efectividad" : "monto")}
              className="btn-ghost flex items-center gap-1.5 text-xs">
              <ArrowUpDown size={12} />
              {vendSort === "monto" ? "Ordenado por Monto" : "Ordenado por Efectividad"}
            </button>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Vendedor o ruta..." value={vendSearch}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setVendSearch(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-44" />
            </div>
          </div>
        </div>

        {loadingVend ? (
          <div className="animate-pulse bg-slate-50 rounded-xl h-48" />
        ) : filteredVend.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Sin resultados</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 500 }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest min-w-36">Vendedor</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest min-w-20">Ruta</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest min-w-28">Supervisor</th>
                  <th className="text-center py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">H. Inicio</th>
                  <th className="text-center py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Últ. Mov.</th>
                  <th className="text-center py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">T. Trabajado</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Clientes Ruta</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Visitados</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Pedidos</th>
                  <th className="text-center py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">% Cumplimt.</th>
                  <th className="text-center py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">% Efectividad</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Monto Bs</th>
                </tr>
              </thead>
              <tbody>
                {filteredVend.map((v, i) => (
                  <tr key={i} className={`border-b border-slate-100 transition-colors ${montoRowCls(v.monto_total)}`}>
                    <td className="py-2 px-3 font-medium text-slate-700 wrap-break-word leading-snug">{v.vendedor}</td>
                    <td className="py-2 px-3 text-slate-600 text-xs font-mono wrap-break-word leading-snug">{v.ruta ?? "—"}</td>
                    <td className="py-2 px-3 text-slate-500 text-xs wrap-break-word leading-snug">{v.supervisor ?? "—"}</td>
                    <td className="py-2 px-3 text-center text-slate-600 text-xs tabular-nums">{v.hora_inicio ?? "—"}</td>
                    <td className="py-2 px-3 text-center text-slate-600 text-xs tabular-nums">{v.hora_ultimo ?? "—"}</td>
                    <td className="py-2 px-3 text-center text-slate-600 text-xs tabular-nums">{fmtTrabajado(v.minutos_trabajados)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtN(v.total_clientes)}</td>
                    <td className="py-2 px-3 text-center text-slate-300 text-xs">—</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700 font-medium">{fmtN(v.pedidos)}</td>
                    <td className="py-2 px-3 text-center text-slate-300 text-xs">—</td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-xs font-bold text-slate-700">{fmtPct(v.pct_efectividad)}</span>
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums font-semibold ${montoTextCls(v.monto_total)}`}>
                      {fmtBs(v.monto_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Top Productos Faltantes (En construcción) ─────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Package size={16} className="text-slate-400" />
          <h2 className="text-base font-bold text-slate-800">Top Productos Faltantes</h2>
          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">En construcción</span>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
          <Wrench size={36} className="text-amber-300" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-slate-500">Próximamente disponible</p>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            El panel de productos faltantes estará disponible una vez que se complete la integración de datos de motivo de no-compra.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
