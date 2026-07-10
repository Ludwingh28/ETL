import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from "react";
import { DollarSign, ShoppingCart, Store, Building2, Wine, Truck, RefreshCw, UtensilsCrossed, BarChart2, Globe, Layers, Package, AlertCircle, Search, TrendingUp, Download } from "lucide-react";
import ExcelJS from "exceljs";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { setActiveFilters } from "../utils/filterStore";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface CanalKpiItem {
  nombre: string;
  avance: number;
  objetivo: number;
  clientes: number;
  pedidos: number;
  universo: number;
  cobertura: number | null;
}

interface KpisData {
  total: number;
  objetivo_total: number;
  canales: CanalKpiItem[];
  fecha_corte: string | null;
  universo_total: number;
  cobertura_total: number | null;
}

interface TendenciaDia {
  dia: number;
  avance_acumulado: number | null;
  presupuesto_acumulado: number | null;
  proyeccion_acumulada: number | null;
}

interface DesgloseRow {
  nombre: string;
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
  presupuesto_uds: number;
  porcentaje: number | null;
  porcentaje_uds: number | null;
}

interface PeriodoMes   { anho: number; mes: number; label: string }
interface SerieMes     { nombre: string; valores: number[] }
interface HistoricoSeries { periodos: PeriodoMes[]; series: SerieMes[] }
interface SkuMes       { codigo: string; producto: string; total: number; valores: number[] }
interface HistoricoSkus   { periodos: PeriodoMes[]; skus: SkuMes[] }

type SubVistaComp = "canales" | "skus";

type ModoVista = "skus_canal" | "clientes_vendedor";

interface VendedorItem { vendedor: string; clientes: number; total: number; }

interface ClienteSemana {
  codigo: string; nombre: string;
  sem1: number; sem2: number; sem3: number; sem4: number; sem5: number; total: number;
}
interface ClientesSemanaData {
  clientes: ClienteSemana[];
  totales: { sem1: number; sem2: number; sem3: number; sem4: number; sem5: number; total: number };
  tiene_sem5: boolean;
}

interface SkuClienteRow { codigo: string; producto: string; cantidad: number; venta_neta: number; }
interface SkuPorClienteData {
  cliente_nombre: string; semana: number;
  skus: SkuClienteRow[]; total_uds: number; total_bs: number;
}

interface ClienteMesRow { codigo: string; nombre: string; total: number; valores: number[]; }
interface ClientesMesData { periodos: PeriodoMes[]; clientes: ClienteMesRow[]; }

type ModoTiempo = "mes_actual" | "comparativo";
type ModoMesesComp = "3" | "6" | "12" | "custom";
type ModoDiaComp = "completo" | "mismo_dia" | "personalizado";

type Regional = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";
const REGIONALES: Regional[] = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];

// ─── Grupos Softys ─────────────────────────────────────────────────────────────

const SOFTYS_GRUPOS = [
  "Todos",
  "Pañales",
  "Pañales para Adultos",
  "Papel Higiénico",
  "Toallas Femeninas",
  "Pañuelos",
  "Toallas de Papel",
  "Servilletas",
] as const;

const PANALES_SUBGRUPOS = ["Pañales Babysec", "Pañales Packeton"] as const;
type PanalesSubgrupo = (typeof PANALES_SUBGRUPOS)[number];
type SoftysGrupo = (typeof SOFTYS_GRUPOS)[number] | PanalesSubgrupo;

const SOFTYS_GRUPO_CONFIG: Record<SoftysGrupo, { color: string; bg: string; active: string }> = {
  "Todos":                { color: "text-slate-600",  bg: "bg-slate-100", active: "bg-slate-700  text-white" },
  "Pañales":              { color: "text-sky-700",    bg: "bg-sky-50",    active: "bg-sky-500    text-white" },
  "Pañales Babysec":      { color: "text-sky-700",    bg: "bg-sky-50",    active: "bg-sky-600    text-white" },
  "Pañales Packeton":     { color: "text-cyan-700",   bg: "bg-cyan-50",   active: "bg-cyan-600   text-white" },
  "Pañales para Adultos": { color: "text-teal-700",   bg: "bg-teal-50",   active: "bg-teal-500   text-white" },
  "Papel Higiénico":      { color: "text-slate-700",  bg: "bg-slate-100", active: "bg-slate-500  text-white" },
  "Toallas Femeninas":    { color: "text-pink-700",   bg: "bg-pink-50",   active: "bg-pink-500   text-white" },
  "Pañuelos":             { color: "text-violet-700", bg: "bg-violet-50", active: "bg-violet-500 text-white" },
  "Toallas de Papel":     { color: "text-amber-700",  bg: "bg-amber-50",  active: "bg-amber-500  text-white" },
  "Servilletas":          { color: "text-orange-700", bg: "bg-orange-50", active: "bg-orange-500 text-white" },
};

// Conversion rates (pending confirmation)
const CAJA_SIZE: number | null = null;
const JAVA_SIZE: number | null = null;

const CHART_COLORS = [
  "#3b82f6","#22c55e","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#10b981","#ec4899","#64748b",
];

// ─── Config visual ─────────────────────────────────────────────────────────────

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface Periodo { anho: number; mes_numero: number; }
const CUR  = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const NUM  = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmt  = (n: number | null | undefined) => (n != null ? CUR.format(Math.round(n)) : "—");
const fmtN = (n: number | null | undefined) => (n != null ? NUM.format(Math.round(n)) : "—");
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
  if (n.startsWith("WHS-LIC")) return { icon: Wine,           color: "text-rose-600",    bg: "bg-rose-50" };
  if (n.startsWith("WHS"))     return { icon: Store,          color: "text-indigo-600",  bg: "bg-indigo-50" };
  if (n.startsWith("DTS"))     return { icon: ShoppingCart,   color: "text-blue-600",    bg: "bg-blue-50" };
  if (n === "CODIS")           return { icon: Layers,         color: "text-violet-600",  bg: "bg-violet-50" };
  if (n === "HORECA")          return { icon: UtensilsCrossed,color: "text-amber-600",   bg: "bg-amber-50" };
  if (n === "SPM")             return { icon: Building2,      color: "text-teal-600",    bg: "bg-teal-50" };
  if (n === "CORP")            return { icon: BarChart2,      color: "text-cyan-600",    bg: "bg-cyan-50" };
  if (n === "ECOM")            return { icon: Globe,          color: "text-emerald-600", bg: "bg-emerald-50" };
  if (n === "PROV")            return { icon: Truck,          color: "text-orange-600",  bg: "bg-orange-50" };
  return { icon: BarChart2, color: "text-slate-600", bg: "bg-slate-100" };
}

const REGIONAL_CONFIG: Record<Regional, { color: string; bg: string; badge: string }> = {
  Nacional:     { color: "text-brand-600",   bg: "bg-brand-50",   badge: "bg-brand-100 text-brand-700 border-brand-200" },
  "Santa Cruz": { color: "text-emerald-600", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba:   { color: "text-violet-600",  bg: "bg-violet-50",  badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz":     { color: "text-amber-600",   bg: "bg-amber-50",   badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

const isPanalesGrupo = (g: SoftysGrupo): boolean =>
  g === "Pañales" || g === "Pañales Babysec" || g === "Pañales Packeton";

function GrupoBotones({ value, onChange, size = "sm" }: {
  value: SoftysGrupo;
  onChange: (g: SoftysGrupo) => void;
  size?: "sm" | "md";
}) {
  const px = size === "md" ? "px-3 py-1.5" : "px-2.5 py-1.5";
  const isPanales = isPanalesGrupo(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 flex-wrap items-center">
        {SOFTYS_GRUPOS.map(g => {
          const gc = SOFTYS_GRUPO_CONFIG[g];
          const isActive = g === "Pañales" ? isPanales : value === g;
          return (
            <button key={g} onClick={() => onChange(g)}
              className={`text-xs font-semibold ${px} rounded-lg border transition-all ${
                isActive ? `${gc.active} border-transparent shadow-sm` : `${gc.color} ${gc.bg} border-transparent hover:opacity-80`
              }`}>
              {g}
            </button>
          );
        })}
      </div>
      {isPanales && (
        <div className="flex gap-1.5 items-center pl-2 ml-0.5 border-l-2 border-sky-200">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide select-none">Tipo</span>
          {PANALES_SUBGRUPOS.map(sg => {
            const gc = SOFTYS_GRUPO_CONFIG[sg];
            return (
              <button key={sg} onClick={() => onChange(value === sg ? "Pañales" : sg)}
                className={`text-xs font-semibold ${px} rounded-lg border transition-all ${
                  value === sg ? `${gc.active} border-transparent shadow-sm` : `${gc.color} ${gc.bg} border-transparent hover:opacity-80`
                }`}>
                {sg.replace("Pañales ", "")}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Métricas secundarias (shared between CanalCard and TotalCard) ─────────────

function MetricasSecundarias({ ticketPromedio, clientes }: {
  ticketPromedio: number | null;
  cobertura: number | null;
  universo: number;
  clientes: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider leading-none mb-1">Ticket Prom.</p>
        <p className={`text-sm font-bold leading-none ${ticketPromedio != null ? "text-slate-800" : "text-slate-300"}`}>
          {ticketPromedio != null ? fmtN(ticketPromedio) : "—"}
        </p>
        <p className="text-[9px] text-slate-400 leading-none mt-0.5">Bs / cliente</p>
      </div>
      <div className="border-t border-slate-100 pt-2">
        <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider leading-none mb-1">Drop Size</p>
        <p className="text-sm font-bold leading-none text-slate-300">—</p>
      </div>
      <div className="border-t border-slate-100 pt-2">
        <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider leading-none mb-1">Cobertura</p>
        <p className={`text-sm font-bold leading-none ${clientes > 0 ? "text-slate-800" : "text-slate-300"}`}>
          {clientes > 0 ? fmtN(clientes) : "—"}
        </p>
        <p className="text-[9px] text-slate-400 leading-none mt-0.5">clientes</p>
      </div>
    </div>
  );
}

// ─── CanalCard: layout 70/30 ───────────────────────────────────────────────────

function CanalCard({ nombre, avance, objetivo, clientes, universo, cobertura, selected, onClick }: {
  nombre: string; avance: number; objetivo: number; clientes: number;
  universo: number; cobertura: number | null;
  selected: boolean; onClick: () => void;
}) {
  const { icon: Icon, color, bg } = iconForCanal(nombre);
  const gap = Math.round(avance - objetivo);
  const pct = objetivo > 0 ? (avance / objetivo) * 100 : null;
  const ticketPromedio = clientes > 0 ? avance / clientes : null;

  return (
    <button
      onClick={onClick}
      className={`
        kpi-card gap-0 text-left w-full transition-all duration-200 cursor-pointer
        hover:shadow-md hover:-translate-y-0.5
        ${selected ? "ring-2 ring-brand-500 shadow-md bg-brand-50/40 -translate-y-0.5" : "ring-1 ring-slate-200 hover:ring-brand-300"}
      `}
    >
      {/* Canal header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg shrink-0 ${selected ? "bg-brand-100" : bg}`}>
          <Icon size={13} className={selected ? "text-brand-600" : color} />
        </div>
        <span className={`text-xs font-semibold leading-tight truncate ${selected ? "text-brand-700" : "text-slate-700"}`}>{nombre}</span>
        {selected && <span className="ml-auto shrink-0 text-[9px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">✓</span>}
      </div>

      {/* 70 / 30 split */}
      <div className="flex gap-3 items-stretch">
        {/* Left ~65%: ventas, presupuesto, gap + % */}
        <div className="flex-7 min-w-0">
          <p className={`text-lg font-bold leading-tight ${selected ? "text-brand-800" : "text-slate-800"}`}>{fmt(avance)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 mb-2">/ {fmt(objetivo)}</p>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className={`text-[10px] font-bold ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {gap >= 0 ? "▲" : "▼"} {fmtN(Math.abs(gap))}
            </span>
            {pct != null && (
              <span className={`text-[10px] font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"}`}>
                {pct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-slate-100 shrink-0 self-stretch" />

        {/* Right ~35%: métricas secundarias */}
        <div className="flex-3 min-w-0">
          <MetricasSecundarias ticketPromedio={ticketPromedio} cobertura={cobertura} universo={universo} clientes={clientes} />
        </div>
      </div>
    </button>
  );
}

function TotalCard({ regional, avance, objetivo, clientes, universo, cobertura, canalNombre, selected, onClick }: {
  regional: Regional; avance: number; objetivo: number; clientes: number;
  universo: number; cobertura: number | null;
  canalNombre: string | null; selected: boolean; onClick: () => void;
}) {
  const cfg = REGIONAL_CONFIG[regional];
  const gap = Math.round(avance - objetivo);
  const pct = objetivo > 0 ? (avance / objetivo) * 100 : null;
  const ticketPromedio = clientes > 0 ? avance / clientes : null;
  const label = canalNombre ? `Canal ${canalNombre}` : `Total Softys · ${regional}`;

  return (
    <button
      onClick={onClick}
      className={`
        kpi-card w-full text-left transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5
        ${selected ? "ring-2 ring-brand-500 shadow-md bg-brand-50/40" : "ring-1 ring-slate-200 hover:ring-brand-300"}
      `}
    >
      <div className="flex items-stretch gap-6">
        {/* Izquierda: ventas + gap */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`p-2.5 rounded-xl shrink-0 ${selected ? "bg-brand-100" : cfg.bg}`}>
            <DollarSign size={18} className={selected ? "text-brand-600" : cfg.color} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-2 flex-wrap">
              {label}
              {canalNombre && <span className="text-[9px] bg-sky-500 text-white px-1.5 py-0.5 rounded-full font-bold">CANAL</span>}
              {!canalNombre && selected && <span className="text-[9px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-bold">TOTAL</span>}
            </p>
            <p className="text-2xl font-bold text-slate-800">{fmt(avance)}</p>
            <p className="text-xs text-slate-400 mt-0.5">/ {fmt(objetivo)}</p>
            <div className="mt-2 flex items-center gap-3">
              {pct != null && (
                <span className={`text-sm font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"}`}>
                  {pct.toFixed(1)}%
                </span>
              )}
              <span className={`text-xs font-semibold ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {gap >= 0 ? "▲" : "▼"} {gap >= 0 ? "+" : ""}{fmt(gap)}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-slate-100 shrink-0 self-stretch" />

        {/* Métricas secundarias */}
        <div className="shrink-0 w-36">
          <MetricasSecundarias ticketPromedio={ticketPromedio} cobertura={cobertura} universo={universo} clientes={clientes} />
        </div>
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

function TooltipDesglose({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const avance = payload.find((p) => p.dataKey === "avance")?.value as number | undefined;
  const ppto   = payload.find((p) => p.dataKey === "presupuesto")?.value as number | undefined;
  const pct    = ppto && avance ? ((avance / ppto) * 100).toFixed(1) : null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label as string}</p>
      {avance != null && (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
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

function TooltipHistorico({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label as string}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500 text-xs">{p.name}:</span>
          <span className="font-semibold text-slate-800 ml-1">{fmt(p.value as number)}</span>
        </div>
      ))}
    </div>
  );
}

function TooltipHistSkus({ active, payload, label, skus }: CustomTooltipProps & { skus: SkuMes[] }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + ((p.value as number) ?? 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm max-w-80">
      <p className="font-semibold text-slate-700 mb-0.5">{label as string}</p>
      <p className="text-xs text-slate-400 mb-2">Total: <span className="font-bold text-slate-700">{fmt(total)}</span></p>
      {[...payload].reverse().map((p) => {
        const sku = skus.find(s => s.codigo === p.dataKey);
        const nombre = sku?.producto ?? String(p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-slate-500 text-[10px] truncate">{nombre.length > 28 ? nombre.slice(0, 28) + "…" : nombre}:</span>
            <span className="font-semibold text-slate-800 ml-auto shrink-0">{fmt(p.value as number)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardSoftysCanales() {
  const { apiFetch, user } = useAuth();
  const ADMIN_CARGOS_C = new Set(["Administrador de Sistema","Subadministrador de Sistemas","Gerente General","Gerente de Ventas","Analista de Datos"]);
  const isAdmin = user?.is_staff === true || ADMIN_CARGOS_C.has(user?.cargo ?? "");
  const isGerenteRegional = !isAdmin && user?.cargo === "Gerente Regional";
  const isProveedor = !isAdmin && !isGerenteRegional && user?.cargo === "Proveedor";

  const [regional, setRegional] = useState<Regional>("Santa Cruz");
  const [anho, setAnho]         = useState(0);
  const [mes, setMes]           = useState(0);
  const [canal, setCanal]       = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      if (isProveedor) {
        setRegional("Nacional");
      } else if (user?.regional) {
        setRegional(user.regional as Regional);
      }
      if (!isGerenteRegional && user?.canal) setCanal(user.canal);
    }
  }, [isAdmin, isGerenteRegional, isProveedor, user?.regional, user?.canal]); // eslint-disable-line react-hooks/exhaustive-deps

  const [grupo, setGrupo] = useState<SoftysGrupo>("Todos");

  // Uds / Caja / Java toggle — only affects bar chart
  const [unidadVista, setUnidadVista] = useState<"uds" | "caja" | "java">("uds");

  const [selectedSkuCode, setSelectedSkuCode]   = useState<string | null>(null);
  const [skuSearch, setSkuSearch]               = useState("");

  const [kpis, setKpis]             = useState<KpisData | null>(null);
  const [tendencia, setTendencia]   = useState<TendenciaDia[]>([]);
  const [esPeriodoActual, setEsPA]  = useState(false);
  // Desglose: regional rows when Nacional, canal rows when regional
  const [regionalDesglose, setRegionalDesglose] = useState<DesgloseRow[]>([]);
  const [skus, setSkus]             = useState<SkuRow[]>([]);

  const [loadingKpis, setLoadingKpis]         = useState(true);
  const [loadingTend, setLoadingTend]         = useState(true);
  const [loadingDesglose, setLoadingDesglose] = useState(true);
  const [loadingSku, setLoadingSku]           = useState(true);
  const [loadingExport, setLoadingExport]     = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // ── Filtro de día ─────────────────────────────────────────────────────────
  const [dia, setDia]       = useState(0);   // 0 = sin filtro
  const [maxDia, setMaxDia] = useState(0);

  // Reset dia when month changes
  useEffect(() => { setDia(0); }, [anho, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active filters to filterStore so ReportButton can capture them
  useEffect(() => {
    setActiveFilters({ regional, anho, mes, dia, canal: canal ?? 'Todos', grupo });
  }, [regional, anho, mes, dia, canal, grupo]);

  // ── Modo Vista ────────────────────────────────────────────────────────────
  const [modoVista, setModoVista] = useState<ModoVista>("skus_canal");

  // ── Modo Tiempo ───────────────────────────────────────────────────────────
  const [modoTiempo, setModoTiempo]   = useState<ModoTiempo>("mes_actual");
  const vistaComparativa = modoTiempo === "comparativo";

  // ── Filtros Comparativo ───────────────────────────────────────────────────
  const [modoMesesComp, setModoMesesComp]           = useState<ModoMesesComp>("6");
  const [mesesCompCustom, setMesesCompCustom]       = useState(6);
  const [modoDiaComp, setModoDiaComp]               = useState<ModoDiaComp>("mismo_dia");
  const [diaCompPersonalizado, setDiaCompPersonalizado] = useState(15);
  const mesesComp = modoMesesComp === "custom" ? mesesCompCustom : parseInt(modoMesesComp);

  // ── Vista Comparativa ──────────────────────────────────────────────────────
  const [subVista, setSubVista]       = useState<SubVistaComp>("canales");
  const [grupoComp, setGrupoComp]     = useState<SoftysGrupo>("Todos");
  const [histCanales, setHistCanales] = useState<HistoricoSeries | null>(null);
  const [histSkus,    setHistSkus]    = useState<HistoricoSkus   | null>(null);
  const [loadingHistCanales, setLoadingHistCanales] = useState(false);
  const [loadingHistSkus,    setLoadingHistSkus]    = useState(false);

  // ── SKU tendencia diaria (vista mensual) + secciones comparativo ─────────
  const [skuTend, setSkuTend]               = useState<{ data: TendenciaDia[]; productoNombre: string; presupuestoTotal: number; esPeriodoActual: boolean } | null>(null);
  const [loadingSkuTend, setLoadingSkuTend] = useState(false);
  const [selectedSkuComp, setSelectedSkuComp] = useState<string | null>(null);
  const [histGruposComp, setHistGruposComp] = useState<HistoricoSeries | null>(null);
  const [loadingGruposComp, setLoadingGruposComp] = useState(false);
  const [histSkuSingle, setHistSkuSingle] = useState<HistoricoSkus | null>(null);
  const [loadingSkuSingle, setLoadingSkuSingle] = useState(false);

  // ── Clientes x Vendedor ───────────────────────────────────────────────────
  const [vendedores, setVendedores]               = useState<VendedorItem[]>([]);
  const [loadingVendedores, setLoadingVendedores] = useState(false);
  const [vendedorSearch, setVendedorSearch]       = useState("");
  const [vendedorFocused, setVendedorFocused]     = useState(false);
  const [selectedVendedor, setSelectedVendedor]   = useState<string | null>(null);
  const [grupoVendedor, setGrupoVendedor]         = useState<SoftysGrupo>("Todos");
  const [clientesSemana, setClientesSemana]       = useState<ClientesSemanaData | null>(null);
  const [loadingClientes, setLoadingClientes]     = useState(false);
  const [selectedClienteCodigo, setSelectedClienteCodigo] = useState<string | null>(null);
  const [selectedSemana, setSelectedSemana]       = useState<number>(0); // 0=todo, 1-5
  const [skuPorCliente, setSkuPorCliente]         = useState<SkuPorClienteData | null>(null);
  const [loadingSkuCliente, setLoadingSkuCliente] = useState(false);
  const [skuClienteSearch, setSkuClienteSearch]   = useState("");

  // ── Clientes x Mes (comparativo) ─────────────────────────────────────────
  const [vendedorComp, setVendedorComp]               = useState<string | null>(null);
  const [vendedorCompSearch, setVendedorCompSearch]   = useState("");
  const [vendedorCompFocused, setVendedorCompFocused] = useState(false);
  const [clientesMesComp, setClientesMesComp]         = useState<ClientesMesData | null>(null);
  const [loadingClientesMesComp, setLoadingClientesMesComp] = useState(false);
  const [selectedMesComp, setSelectedMesComp]         = useState<{anho: number; mes: number} | null>(null);

  const [periodos, setPeriodos] = useState<Periodo[]>([]);

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

  const esNacional = regional === "Nacional";
  const rKey = useMemo(() => {
    const map: Record<Regional, string> = {
      Nacional: "nacional", "Santa Cruz": "santa_cruz", Cochabamba: "cochabamba", "La Paz": "la_paz",
    };
    return map[regional];
  }, [regional]);

  // Derived day value — must be before fetch functions that use it as a dep
  const diaActivo = dia > 0 ? dia : maxDia;

  // When kpis loads and we're NOT nacional, derive desglose from canales
  useEffect(() => {
    if (!esNacional && kpis) {
      setLoadingDesglose(false);
      setRegionalDesglose(
        kpis.canales.map(c => ({
          nombre: c.nombre,
          avance: c.avance,
          presupuesto: c.objetivo,
          porcentaje: c.objetivo > 0 ? Math.round((c.avance / c.objetivo) * 1000) / 10 : null,
        }))
      );
    }
  }, [esNacional, kpis]);

  // Convert quantity based on current unit view
  const convertCantidad = useCallback((cant: number): number => {
    if (unidadVista === "caja" && CAJA_SIZE) return Math.round(cant / CAJA_SIZE);
    if (unidadVista === "java" && JAVA_SIZE) return Math.round(cant / JAVA_SIZE);
    return cant;
  }, [unidadVista]);

  const sortedSkus = useMemo(() => {
    return [...skus].sort((a, b) => convertCantidad(b.cantidad) - convertCantidad(a.cantidad));
  }, [skus, convertCantidad]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    if (!q) return sortedSkus;
    return sortedSkus.filter(
      (s) => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)
    );
  }, [sortedSkus, skuSearch]);

  // ── Export Excel ────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!anho || !mes || loadingExport) return;
    const regionLabel = regional.replace(" ", "_");
    const mesLabel    = String(mes).padStart(2, "0");
    const filename    = `Softys_${regionLabel}_${anho}_${mesLabel}${canal ? `_${canal}` : ""}.xlsx`;

    setLoadingExport(true);
    window.dispatchEvent(new CustomEvent("dl:start", { detail: { name: filename } }));
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const grupoParam = grupo !== "Todos" ? `&grupo=${encodeURIComponent(grupo)}` : "";
      const diaParam   = dia > 0 ? `&dia=${dia}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; data: Record<string, unknown>[]; total: number; presupuesto_por_sku?: Record<string, unknown>[] }>(
        `/dashboard/softys-canales/export/?regional=${rKey}&anho=${anho}&mes=${mes}${canalParam}${grupoParam}${diaParam}`
      );
      if (!j.success) throw new Error(j.error ?? "Error al exportar");

      const wb = new ExcelJS.Workbook();
      wb.creator = "Cruzimex Dashboard";
      wb.created = new Date();

      // ── Hoja 1: Ventas ────────────────────────────────────────────────────
      const ws = wb.addWorksheet("Ventas Softys");

      const cols: { header: string; key: string; width: number; numFmt?: string }[] = [
        { header: "Fecha",           key: "fecha",         width: 13 },
        { header: "Año",             key: "anho",          width: 7  },
        { header: "Mes",             key: "mes_nombre",    width: 12 },
        { header: "Día",             key: "dia",           width: 6  },
        { header: "Regional",        key: "regional",      width: 14 },
        { header: "Canal",           key: "canal",         width: 14 },
        { header: "Supervisor",      key: "supervisor",    width: 26 },
        { header: "Vendedor",        key: "vendedor",      width: 26 },
        { header: "Cód. Cliente",    key: "cod_cliente",   width: 14 },
        { header: "Cliente",         key: "cliente",       width: 34 },
        { header: "Cód. Producto",   key: "cod_producto",  width: 14 },
        { header: "Producto",        key: "producto",      width: 42 },
        { header: "Línea Softys",    key: "linea_softys",  width: 22 },
        { header: "Subcategoría",    key: "subcategoria",  width: 22 },
        { header: "Cantidad (Uds)",  key: "cantidad",      width: 14, numFmt: "#,##0" },
        { header: "Venta Neta (Bs)", key: "venta_neta",   width: 16, numFmt: "#,##0.00" },
        { header: "Nro. Pedido",     key: "nro_pedido",   width: 14 },
      ];

      ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width }));

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
        cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border    = { bottom: { style: "thin", color: { argb: "FF7DD3FC" } } };
      });
      headerRow.height = 22;
      ws.views     = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + cols.length)}1` };

      for (const row of j.data) {
        const added = ws.addRow(cols.map(c => row[c.key] ?? ""));
        cols.forEach((c, i) => { if (c.numFmt) added.getCell(i + 1).numFmt = c.numFmt; });
      }

      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const bg = rowNum % 2 === 0 ? "FFF0F9FF" : "FFFFFFFF";
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          cell.font = { size: 9 };
        });
      });

      const buf  = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      window.dispatchEvent(new CustomEvent("dl:done", { detail: { url, name: filename } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent("dl:error"));
      console.error("Export error:", e);
    } finally {
      setLoadingExport(false);
    }
  }, [apiFetch, rKey, regional, canal, grupo, anho, mes, dia, loadingExport]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetches ────────────────────────────────────────────────────────────────

  const fetchKpis = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingKpis(true);
    setError(null);
    try {
      const diaParam = dia > 0 ? `&dia=${dia}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; max_dia: number; universo_total: number; cobertura_total: number | null; data: Array<{ canal: string; avance: number; presupuesto: number; clientes: number; pedidos: number; universo: number; cobertura: number | null }> }>(
        `/dashboard/softys-canales/kpis/?regional=${rKey}&anho=${anho}&mes=${mes}${diaParam}`
      );
      if (!j.success) throw new Error(j.error);
      if (j.max_dia) setMaxDia(j.max_dia);
      const canales: CanalKpiItem[] = j.data.map((c) => ({
        nombre:    c.canal,
        avance:    c.avance,
        objetivo:  c.presupuesto,
        clientes:  c.clientes  ?? 0,
        pedidos:   c.pedidos   ?? 0,
        universo:  c.universo  ?? 0,
        cobertura: c.cobertura ?? null,
      }));
      const total     = canales.reduce((s, c) => s + c.avance, 0);
      const obj_total = canales.reduce((s, c) => s + c.objetivo, 0);
      setKpis({ total, objetivo_total: obj_total, canales, fecha_corte: null, universo_total: j.universo_total ?? 0, cobertura_total: j.cobertura_total ?? null });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingKpis(false);
    }
  }, [apiFetch, rKey, anho, mes, dia]);

  const fetchTendencia = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingTend(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; data: TendenciaDia[]; es_periodo_actual: boolean }>(
        `/dashboard/softys-canales/tendencia/?regional=${rKey}&anho=${anho}&mes=${mes}${canalParam}`
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

  const fetchDesgloseRegional = useCallback(async () => {
    if (!anho || !mes || !esNacional) return;
    setLoadingDesglose(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const diaParam   = dia > 0 ? `&dia=${dia}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; data: Array<{ regional: string; avance: number; presupuesto: number; porcentaje: number | null }> }>(
        `/dashboard/softys-canales/por-regional/?anho=${anho}&mes=${mes}${canalParam}${diaParam}`
      );
      if (!j.success) throw new Error(j.error);
      setRegionalDesglose(j.data.map(r => ({ nombre: r.regional, avance: r.avance, presupuesto: r.presupuesto, porcentaje: r.porcentaje })));
    } catch {
      setRegionalDesglose([]);
    } finally {
      setLoadingDesglose(false);
    }
  }, [apiFetch, esNacional, canal, anho, mes, dia]);

  const fetchSkus = useCallback(async () => {
    if (!anho || !mes) return;
    setLoadingSku(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const grupoParam = grupo === "Todos" ? "" : encodeURIComponent(grupo);
      const diaParam   = dia > 0 ? `&dia=${dia}` : "";
      const j = await apiFetch<{ success: boolean; error?: string; data: SkuRow[] }>(
        `/dashboard/softys-canales/por-sku/?regional=${rKey}&anho=${anho}&mes=${mes}&grupo=${grupoParam}${canalParam}${diaParam}`
      );
      if (!j.success) throw new Error(j.error);
      setSkus(j.data);
    } catch {
      setSkus([]);
    } finally {
      setLoadingSku(false);
    }
  }, [apiFetch, rKey, canal, grupo, anho, mes, dia]);

  const fetchHistoricoCanales = useCallback(async () => {
    if (!anho || !mes || !vistaComparativa || subVista !== "canales") return;
    setLoadingHistCanales(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      let diaParam = "&modo=completo";
      if (modoDiaComp === "mismo_dia" && diaActivo > 0) diaParam = `&modo=mismo_rango&dia_ref=${diaActivo}`;
      else if (modoDiaComp === "personalizado" && diaCompPersonalizado > 0) diaParam = `&modo=personalizado&dia_ref=${diaCompPersonalizado}`;
      const j = await apiFetch<HistoricoSeries & { success: boolean }>(
        `/dashboard/softys-canales/historico-canales/?regional=${rKey}&anho=${anho}&mes=${mes}&meses=${mesesComp}${canalParam}${diaParam}`
      );
      if (!j.success) throw new Error();
      setHistCanales(j);
    } catch { setHistCanales(null); }
    finally { setLoadingHistCanales(false); }
  }, [apiFetch, rKey, canal, anho, mes, diaActivo, vistaComparativa, subVista, mesesComp, modoDiaComp, diaCompPersonalizado]);

  const fetchHistoricoSkus = useCallback(async () => {
    if (!anho || !mes || !vistaComparativa || subVista !== "skus") return;
    setLoadingHistSkus(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      let diaParam = "&modo=completo";
      if (modoDiaComp === "mismo_dia" && diaActivo > 0) diaParam = `&modo=mismo_rango&dia_ref=${diaActivo}`;
      else if (modoDiaComp === "personalizado" && diaCompPersonalizado > 0) diaParam = `&modo=personalizado&dia_ref=${diaCompPersonalizado}`;
      const j = await apiFetch<HistoricoSkus & { success: boolean }>(
        `/dashboard/softys-canales/historico-skus/?regional=${rKey}&anho=${anho}&mes=${mes}&meses=${mesesComp}&grupo=${grupoComp === "Todos" ? "" : encodeURIComponent(grupoComp)}${canalParam}${diaParam}`
      );
      if (!j.success) throw new Error();
      setHistSkus(j);
    } catch { setHistSkus(null); }
    finally { setLoadingHistSkus(false); }
  }, [apiFetch, rKey, canal, anho, mes, diaActivo, vistaComparativa, subVista, grupoComp, mesesComp, modoDiaComp, diaCompPersonalizado]);

  const fetchSkuTendencia = useCallback(async () => {
    if (!anho || !mes || !selectedSkuCode || vistaComparativa) return;
    setLoadingSkuTend(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const j = await apiFetch<{ success: boolean; data: TendenciaDia[]; producto_nombre: string; presupuesto_total: number; es_periodo_actual: boolean }>(
        `/dashboard/softys-canales/sku-tendencia/?regional=${rKey}&anho=${anho}&mes=${mes}&sku=${encodeURIComponent(selectedSkuCode)}${canalParam}`
      );
      if (!j.success) throw new Error();
      setSkuTend({ data: j.data, productoNombre: j.producto_nombre, presupuestoTotal: j.presupuesto_total, esPeriodoActual: j.es_periodo_actual });
    } catch { setSkuTend(null); }
    finally { setLoadingSkuTend(false); }
  }, [apiFetch, rKey, canal, anho, mes, selectedSkuCode, vistaComparativa]);

  const fetchHistoricoGruposComp = useCallback(async () => {
    if (!anho || !mes || !vistaComparativa || subVista !== "skus") return;
    setLoadingGruposComp(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      let diaParam = "&modo=completo";
      if (modoDiaComp === "mismo_dia" && diaActivo > 0) diaParam = `&modo=mismo_rango&dia_ref=${diaActivo}`;
      else if (modoDiaComp === "personalizado" && diaCompPersonalizado > 0) diaParam = `&modo=personalizado&dia_ref=${diaCompPersonalizado}`;
      const j = await apiFetch<HistoricoSeries & { success: boolean }>(
        `/dashboard/softys-canales/historico-grupos/?regional=${rKey}&anho=${anho}&mes=${mes}&meses=${mesesComp}${canalParam}${diaParam}`
      );
      if (!j.success) throw new Error();
      setHistGruposComp(j);
    } catch { setHistGruposComp(null); }
    finally { setLoadingGruposComp(false); }
  }, [apiFetch, rKey, canal, anho, mes, diaActivo, vistaComparativa, subVista, mesesComp, modoDiaComp, diaCompPersonalizado]);

  const fetchHistoricoSkuSingle = useCallback(async () => {
    if (!anho || !mes || !vistaComparativa || subVista !== "skus" || !selectedSkuComp) return;
    setLoadingSkuSingle(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      let diaParam = "&modo=completo";
      if (modoDiaComp === "mismo_dia" && diaActivo > 0) diaParam = `&modo=mismo_rango&dia_ref=${diaActivo}`;
      else if (modoDiaComp === "personalizado" && diaCompPersonalizado > 0) diaParam = `&modo=personalizado&dia_ref=${diaCompPersonalizado}`;
      const j = await apiFetch<HistoricoSkus & { success: boolean }>(
        `/dashboard/softys-canales/historico-skus/?regional=${rKey}&anho=${anho}&mes=${mes}&meses=${mesesComp}&sku=${encodeURIComponent(selectedSkuComp)}${canalParam}${diaParam}`
      );
      if (!j.success) throw new Error();
      setHistSkuSingle(j);
    } catch { setHistSkuSingle(null); }
    finally { setLoadingSkuSingle(false); }
  }, [apiFetch, rKey, canal, anho, mes, diaActivo, vistaComparativa, subVista, selectedSkuComp, mesesComp, modoDiaComp, diaCompPersonalizado]);

  const fetchVendedores = useCallback(async () => {
    if (!anho || !mes || modoVista !== "clientes_vendedor") return;
    setLoadingVendedores(true);
    try {
      const canalParam = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const diaParam   = dia > 0 ? `&dia=${dia}` : "";
      const grupoParam = grupoVendedor !== "Todos" ? `&grupo=${encodeURIComponent(grupoVendedor)}` : "";
      const j = await apiFetch<{ success: boolean; data: VendedorItem[] }>(
        `/dashboard/softys-canales/vendedores/?regional=${rKey}&anho=${anho}&mes=${mes}${canalParam}${diaParam}${grupoParam}`
      );
      if (!j.success) throw new Error();
      setVendedores(j.data);
    } catch { setVendedores([]); }
    finally { setLoadingVendedores(false); }
  }, [apiFetch, rKey, canal, anho, mes, dia, modoVista, grupoVendedor]);

  const fetchClientesMesComp = useCallback(async () => {
    if (!anho || !mes || modoTiempo !== "comparativo" || modoVista !== "clientes_vendedor") return;
    setLoadingClientesMesComp(true);
    try {
      const canalParam    = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const vendedorParam = vendedorComp ? `&vendedor=${encodeURIComponent(vendedorComp)}` : "";
      const grupoParam    = grupoVendedor !== "Todos" ? `&grupo=${encodeURIComponent(grupoVendedor)}` : "";
      let diaParam = "&modo=completo";
      if (modoDiaComp === "mismo_dia" && diaActivo > 0) diaParam = `&modo=mismo_rango&dia_ref=${diaActivo}`;
      else if (modoDiaComp === "personalizado" && diaCompPersonalizado > 0) diaParam = `&modo=personalizado&dia_ref=${diaCompPersonalizado}`;
      const j = await apiFetch<ClientesMesData & { success: boolean }>(
        `/dashboard/softys-canales/clientes-mes/?regional=${rKey}&anho=${anho}&mes=${mes}&meses=${mesesComp}${canalParam}${vendedorParam}${grupoParam}${diaParam}`
      );
      if (!j.success) throw new Error();
      setClientesMesComp(j);
    } catch { setClientesMesComp(null); }
    finally { setLoadingClientesMesComp(false); }
  }, [apiFetch, rKey, canal, anho, mes, diaActivo, modoTiempo, modoVista, vendedorComp, grupoVendedor, mesesComp, modoDiaComp, diaCompPersonalizado]);

  const fetchClientesSemana = useCallback(async () => {
    if (!anho || !mes || modoVista !== "clientes_vendedor") return;
    setLoadingClientes(true);
    try {
      const canalParam    = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const diaParam      = dia > 0 ? `&dia=${dia}` : "";
      const vendedorParam = selectedVendedor ? `&vendedor=${encodeURIComponent(selectedVendedor)}` : "";
      const grupoParam    = grupoVendedor !== "Todos" ? `&grupo=${encodeURIComponent(grupoVendedor)}` : "";
      const j = await apiFetch<ClientesSemanaData & { success: boolean }>(
        `/dashboard/softys-canales/clientes-semana/?regional=${rKey}&anho=${anho}&mes=${mes}${canalParam}${diaParam}${vendedorParam}${grupoParam}`
      );
      if (!j.success) throw new Error();
      setClientesSemana(j);
    } catch { setClientesSemana(null); }
    finally { setLoadingClientes(false); }
  }, [apiFetch, rKey, canal, anho, mes, dia, modoVista, selectedVendedor, grupoVendedor]);

  const fetchSkuPorCliente = useCallback(async () => {
    if (!anho || !mes || !selectedClienteCodigo || modoVista !== "clientes_vendedor") return;
    setLoadingSkuCliente(true);
    try {
      const canalParam    = canal ? `&canal=${encodeURIComponent(canal)}` : "";
      const activeVendedor = modoTiempo === "comparativo" ? vendedorComp : selectedVendedor;
      const vendedorParam  = activeVendedor ? `&vendedor=${encodeURIComponent(activeVendedor)}` : "";
      const grupoParam     = grupoVendedor !== "Todos" ? `&grupo=${encodeURIComponent(grupoVendedor)}` : "";
      let anhoParam = anho, mesParam = mes, mesesParam = "", diaParam = "", semanaParam = "";
      if (modoTiempo === "comparativo") {
        if (selectedMesComp) {
          // specific month clicked in the table
          anhoParam = selectedMesComp.anho;
          mesParam  = selectedMesComp.mes;
        } else {
          // no month selected → aggregate across full range
          mesesParam = `&meses=${mesesComp}`;
        }
      } else {
        diaParam    = dia > 0 ? `&dia=${dia}` : "";
        semanaParam = selectedSemana > 0 ? `&semana=${selectedSemana}` : "";
      }
      const j = await apiFetch<SkuPorClienteData & { success: boolean }>(
        `/dashboard/softys-canales/sku-por-cliente/?regional=${rKey}&anho=${anhoParam}&mes=${mesParam}&cliente=${encodeURIComponent(selectedClienteCodigo)}${canalParam}${diaParam}${vendedorParam}${grupoParam}${semanaParam}${mesesParam}`
      );
      if (!j.success) throw new Error();
      setSkuPorCliente(j);
    } catch { setSkuPorCliente(null); }
    finally { setLoadingSkuCliente(false); }
  }, [apiFetch, rKey, canal, anho, mes, dia, modoTiempo, modoVista, selectedClienteCodigo, selectedMesComp, mesesComp, selectedVendedor, vendedorComp, grupoVendedor, selectedSemana]);

  useEffect(() => { setSkuSearch(""); setSelectedSkuCode(null); }, [skus]);
  // Reset sku seleccionado al cambiar grupo
  useEffect(() => { setSelectedSkuCode(null); setSkuTend(null); }, [grupo]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reset SKU comp al cambiar sub-vista, canal o periodo
  useEffect(() => { setSelectedSkuComp(null); setHistSkuSingle(null); }, [subVista, canal, anho, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchKpis(); }, [fetchKpis]);
  useEffect(() => { void fetchTendencia(); }, [fetchTendencia]);
  useEffect(() => { void fetchDesgloseRegional(); }, [fetchDesgloseRegional]);
  useEffect(() => { void fetchSkus(); }, [fetchSkus]);
  useEffect(() => { void fetchSkuTendencia(); }, [fetchSkuTendencia]);
  useEffect(() => { void fetchHistoricoCanales(); }, [fetchHistoricoCanales]);
  useEffect(() => { void fetchHistoricoSkus(); }, [fetchHistoricoSkus]);
  useEffect(() => { void fetchHistoricoGruposComp(); }, [fetchHistoricoGruposComp]);
  useEffect(() => { void fetchHistoricoSkuSingle(); }, [fetchHistoricoSkuSingle]);
  useEffect(() => { void fetchVendedores(); }, [fetchVendedores]);
  useEffect(() => { void fetchClientesSemana(); }, [fetchClientesSemana]);
  useEffect(() => { void fetchSkuPorCliente(); }, [fetchSkuPorCliente]);
  useEffect(() => { void fetchClientesMesComp(); }, [fetchClientesMesComp]);
  // Reset clientes mes comp when switching modes
  useEffect(() => { setClientesMesComp(null); setVendedorComp(null); }, [modoTiempo, modoVista]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reset client selection when vendedor, grupo or period changes
  useEffect(() => { setSelectedClienteCodigo(null); setSkuPorCliente(null); setSelectedSemana(0); }, [selectedVendedor, grupoVendedor, anho, mes, canal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers UI ─────────────────────────────────────────────────────────────
  const cfg = REGIONAL_CONFIG[regional];
  const loading = loadingKpis || loadingTend || loadingDesglose || loadingSku;

  const canalItem        = kpis?.canales.find((c) => c.nombre === canal);
  const avanceActual     = canal ? (canalItem?.avance   ?? 0) : (kpis?.total          ?? 0);
  const objActual        = canal ? (canalItem?.objetivo ?? 0) : (kpis?.objetivo_total ?? 0);
  const clientesActuales = canal ? (canalItem?.clientes ?? 0) : (kpis?.canales.reduce((s, c) => s + c.clientes, 0) ?? 0);
  const universalActual  = canal ? (canalItem?.universo ?? 0) : (kpis?.universo_total ?? 0);
  const coberturaActual  = canal ? (canalItem?.cobertura ?? null) : (kpis?.cobertura_total ?? null);
  const canalLabel     = canal ?? `Total ${regional}`;

  const fechaCorte = diaActivo > 0
    ? `${anho}/${String(mes).padStart(2, "0")}/${String(diaActivo).padStart(2, "0")}`
    : `${anho}/${String(mes).padStart(2, "0")}/??`;

  const anhos = [...new Set(periodos.map(p => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter(p => p.anho === anho);

  const desgloseLabel = esNacional ? "Ventas por Regional" : "Ventas por Canal";

  const unidadLabel = (u: "uds" | "caja" | "java") => {
    if (u === "caja") return CAJA_SIZE ? `Cajas (÷${CAJA_SIZE})` : "Cajas";
    if (u === "java") return JAVA_SIZE ? `Javas (÷${JAVA_SIZE})` : "Javas";
    return "Uds";
  };

  return (
    <DashboardLayout>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-800">Softys — Canales / Regional</h1>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 border border-sky-200 uppercase tracking-wide">Softys</span>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            Detalle por canal y SKU hasta el&nbsp;
            <span className="font-semibold text-slate-700">{fechaCorte}</span>
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
            {(isAdmin || isProveedor) ? (
              <div className="flex gap-1.5 flex-wrap">
                {REGIONALES.map((r) => (
                  <button key={r} onClick={() => setRegional(r)}
                    className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                      regional === r ? `${REGIONAL_CONFIG[r].badge} shadow-sm` : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}>{r}</button>
                ))}
              </div>
            ) : (
              <span className={`text-xs font-semibold px-3 py-2 rounded-lg border ${REGIONAL_CONFIG[regional]?.badge ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                {regional}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))} disabled={loading}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-60">
              {anhos.length > 0 ? anhos.map(a => <option key={a} value={a}>{a}</option>) : [2026, 2025, 2024].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))} disabled={loading}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-60">
              {mesesDisponibles.length > 0
                ? mesesDisponibles.map(p => <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>)
                : MESES.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>

          {/* Día */}
          {maxDia > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Hasta el día</label>
              <select value={dia} onChange={(e: ChangeEvent<HTMLSelectElement>) => setDia(Number(e.target.value))} disabled={loading}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:opacity-60">
                <option value={0}>Todos ({maxDia})</option>
                {Array.from({ length: maxDia }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>Día {d}</option>
                ))}
              </select>
            </div>
          )}

          {(isAdmin || isGerenteRegional) && (
            <button onClick={() => setCanal(null)} disabled={canal === null}
              className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-30">
              <RefreshCw size={13} /> Limpiar canal
            </button>
          )}

          <button onClick={handleExport} disabled={loadingExport || !anho || !mes}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-all
              bg-emerald-600 text-white border-transparent hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ml-auto">
            <Download size={13} /> Exportar Excel
          </button>

          {/* Toggle modo vista */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Vista</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
              {([ ["skus_canal", "SKUs x Canal"], ["clientes_vendedor", "Clientes x Vendedor"] ] as const).map(([k, label]) => (
                <button key={k} onClick={() => setModoVista(k)}
                  className={`px-3 py-2 transition-colors ${modoVista === k ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}

      {(isAdmin || isGerenteRegional) && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-2.5 mb-4 text-xs">
          <BarChart2 size={14} className="shrink-0" />
          <span>
            Haz clic en cualquier card para ver el detalle de ese canal.
            {canal ? <> Viendo: <strong>{canal}</strong>.</> : " Actualmente mostrando el total."}
          </span>
        </div>
      )}

      {/* ── Card Total ─────────────────────────────────────────────────────── */}
      {(isAdmin || isGerenteRegional || !user?.canal) && (
        <div className="mb-3">
          {loadingKpis ? (
            <div className="kpi-card animate-pulse bg-slate-50 h-20" />
          ) : (
            <TotalCard regional={regional} avance={avanceActual} objetivo={objActual}
              clientes={clientesActuales} universo={universalActual} cobertura={coberturaActual}
              canalNombre={canal}
              selected={canal === null} onClick={() => setCanal(null)} />
          )}
        </div>
      )}

      {/* ── Canal cards ────────────────────────────────────────────────────── */}
      {loadingKpis ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="kpi-card animate-pulse bg-slate-50 h-36" />)}
        </div>
      ) : (
        kpis && kpis.canales.length > 0 && (() => {
          const visibleCanales = (isAdmin || isGerenteRegional)
            ? kpis.canales
            : kpis.canales.filter(c => !user?.canal || c.nombre === user.canal);
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {visibleCanales.map((c) => (
                <CanalCard key={c.nombre} nombre={c.nombre} avance={c.avance} objetivo={c.objetivo}
                  clientes={c.clientes} universo={c.universo} cobertura={c.cobertura}
                  selected={canal === c.nombre}
                  onClick={(isAdmin || isGerenteRegional) ? () => setCanal((prev) => (prev === c.nombre ? null : c.nombre)) : () => {}} />
              ))}
            </div>
          );
        })()
      )}

      {/* ── Toggle Mes Actual / Comparativo Meses + filtros de período ─────── */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="inline-flex rounded-lg overflow-hidden border border-slate-200 text-sm font-semibold shadow-sm">
          {([["mes_actual", "Mes Actual"], ["comparativo", "Comparativo Meses"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setModoTiempo(k)}
              className={`px-5 py-2.5 transition-colors flex items-center gap-1.5 ${modoTiempo === k ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
              {k === "comparativo" && <TrendingUp size={13} />}
              {label}
            </button>
          ))}
        </div>

        {modoTiempo === "comparativo" && (
          <>
            <div className="w-px h-7 bg-slate-200" />

            {/* Período */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold shadow-sm">
              {([ ["3","3M"], ["6","6M"], ["12","12M"], ["custom","Personal."] ] as const).map(([k, label]) => (
                <button key={k} onClick={() => setModoMesesComp(k as ModoMesesComp)}
                  className={`px-3 py-2 transition-colors ${modoMesesComp === k ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>

            {modoMesesComp === "custom" && (
              <input type="number" min={2} max={24} value={mesesCompCustom}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMesesCompCustom(Math.max(2, Math.min(24, parseInt(e.target.value) || 6)))}
                className="text-xs border border-slate-200 rounded-lg px-2 py-2 w-16 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="meses" />
            )}

            <div className="w-px h-7 bg-slate-200" />

            {/* Días comparados */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold shadow-sm">
              {([["completo","Mes completo"],["mismo_dia","Mismo día"],["personalizado","Personal."]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setModoDiaComp(k)}
                  className={`px-3 py-2 transition-colors ${modoDiaComp === k ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>

            {modoDiaComp === "personalizado" && (
              <input type="number" min={1} max={31} value={diaCompPersonalizado}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDiaCompPersonalizado(Math.max(1, Math.min(31, parseInt(e.target.value) || 15)))}
                className="text-xs border border-slate-200 rounded-lg px-2 py-2 w-16 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="día" />
            )}
          </>
        )}
      </div>

      {modoTiempo !== "comparativo" && modoVista === "clientes_vendedor" ? (
        /* ── Clientes x Vendedor (Mes Actual) ────────────────────────── */
        <div className="flex flex-col gap-4">

          {/* Controls row: vendedor combobox + category filter */}
          <div className="card">
            <div className="flex flex-wrap items-start gap-4">

              {/* Vendedor combobox */}
              <div className="flex flex-col gap-1 min-w-56">
                <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Vendedor</label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="text" value={vendedorSearch}
                    onChange={(e) => setVendedorSearch(e.target.value)}
                    onFocus={() => setVendedorFocused(true)}
                    onBlur={() => setTimeout(() => setVendedorFocused(false), 150)}
                    placeholder={selectedVendedor ?? "Buscar vendedor…"}
                    className="w-full text-sm pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-400" />
                  {(vendedorSearch || vendedorFocused) && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto">
                      {loadingVendedores ? (
                        <p className="text-xs text-slate-400 px-3 py-3">Cargando…</p>
                      ) : (() => {
                        const items = vendedorSearch
                          ? vendedores.filter(v => v.vendedor.toLowerCase().includes(vendedorSearch.toLowerCase()))
                          : vendedores;
                        return items.length === 0
                          ? <p className="text-xs text-slate-400 px-3 py-3">Sin resultados</p>
                          : items.map(v => (
                            <button key={v.vendedor} onClick={() => { setSelectedVendedor(v.vendedor); setVendedorSearch(""); setVendedorFocused(false); }}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 border-b border-slate-50 last:border-0 ${selectedVendedor === v.vendedor ? "bg-sky-50 text-sky-700" : "hover:bg-slate-50"}`}>
                              <span className="font-medium truncate">{v.vendedor}</span>
                              <div className="shrink-0 text-right">
                                <p className="text-[10px] text-slate-400">{v.clientes} cli.</p>
                                <p className="text-[10px] font-semibold text-slate-600">{fmtN(v.total)} Bs</p>
                              </div>
                            </button>
                          ));
                      })()}
                    </div>
                  )}
                </div>
                {selectedVendedor && (
                  <button onClick={() => { setSelectedVendedor(null); setVendedorSearch(""); }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 mt-0.5">
                    <RefreshCw size={10} /> Limpiar vendedor
                  </button>
                )}
              </div>

              {/* Category filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Línea Softys</label>
                <GrupoBotones value={grupoVendedor} onChange={setGrupoVendedor} />
              </div>
            </div>
          </div>

          {/* Two-pane: table left + SKU detail right */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">

            {/* LEFT: Client weekly table (3/5) */}
            <div className="card xl:col-span-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-slate-700 text-sm">
                    {selectedVendedor
                      ? <><span className="text-brand-600">{selectedVendedor}</span></>
                      : <span className="text-slate-400">Todos los vendedores</span>
                    }
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {MESES[mes]} {anho}{dia > 0 ? ` · hasta día ${dia}` : ""} · {clientesSemana?.clientes.length ?? 0} clientes
                  </p>
                </div>
                {clientesSemana && (
                  <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    Total: <strong className="text-slate-700">{fmtN(clientesSemana.totales.total)} Bs</strong>
                  </span>
                )}
              </div>

              {loadingClientes ? (
                <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />
              ) : !clientesSemana || clientesSemana.clientes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
                  <Store size={28} className="text-slate-200" />
                  <p className="text-slate-400 text-sm">
                    {selectedVendedor ? "Sin datos para este vendedor" : "Seleccioná un vendedor o cargando…"}
                  </p>
                </div>
              ) : (() => {
                const sems = clientesSemana.tiene_sem5
                  ? [1, 2, 3, 4, 5] as const
                  : [1, 2, 3, 4] as const;
                const semKey = (n: number) => `sem${n}` as keyof ClienteSemana;
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[540px]">
                      <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                        <tr className="text-slate-400">
                          <th className="text-left py-2 font-semibold pr-2">Código · Cliente</th>
                          {sems.map(s => (
                            <th key={s} className="text-right py-2 font-semibold px-2">
                              <button
                                onClick={() => setSelectedSemana(prev => prev === s ? 0 : s)}
                                className={`px-2 py-0.5 rounded-md transition-colors ${selectedSemana === s ? "bg-indigo-600 text-white" : "hover:bg-slate-100 text-slate-400"}`}>
                                Sem {s}
                              </button>
                            </th>
                          ))}
                          <th className="text-right py-2 font-semibold pl-2 text-slate-600">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientesSemana.clientes.map((c) => {
                          const isSelected = c.codigo === selectedClienteCodigo;
                          return (
                            <tr key={c.codigo}
                              onClick={() => setSelectedClienteCodigo(prev => prev === c.codigo ? null : c.codigo)}
                              className={`border-b border-slate-50 cursor-pointer transition-colors ${isSelected ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                              <td className="py-1.5 pr-2">
                                <p className={`font-mono text-[9px] leading-none ${isSelected ? "text-sky-500" : "text-slate-400"}`}>{c.codigo}</p>
                                <p className={`text-[10px] font-semibold leading-tight mt-0.5 max-w-[160px] truncate ${isSelected ? "text-sky-700" : "text-slate-700"}`} title={c.nombre}>{c.nombre}</p>
                              </td>
                              {sems.map(s => {
                                const val = c[semKey(s)] as number;
                                const isActiveSem = selectedSemana === s && isSelected;
                                return (
                                  <td key={s}
                                    onClick={(e) => { e.stopPropagation(); setSelectedClienteCodigo(c.codigo); setSelectedSemana(prev => prev === s ? 0 : s); }}
                                    className={`py-1.5 text-right tabular-nums px-2 transition-colors ${
                                      val > 0 ? "cursor-pointer" : "text-slate-200"
                                    } ${isActiveSem ? "bg-indigo-100 text-indigo-700 font-bold rounded" : val > 0 ? (isSelected ? "text-sky-600" : "text-slate-600") : ""}`}>
                                    {val > 0 ? fmtN(val) : "—"}
                                  </td>
                                );
                              })}
                              <td className={`py-1.5 text-right font-bold tabular-nums pl-2 ${isSelected ? "text-sky-700" : "text-slate-800"}`}>
                                {fmtN(c.total)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                        <tr className="text-slate-700 font-bold text-xs">
                          <td className="py-2 pr-2">TOTAL</td>
                          {sems.map(s => (
                            <td key={s} className="py-2 text-right tabular-nums px-2">
                              {fmtN(clientesSemana.totales[`sem${s}` as keyof typeof clientesSemana.totales] as number)}
                            </td>
                          ))}
                          <td className="py-2 text-right tabular-nums pl-2 text-brand-700">{fmtN(clientesSemana.totales.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* RIGHT: SKU detail for selected client (2/5) */}
            <div className="card xl:col-span-2">
              {!selectedClienteCodigo ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Package size={32} className="text-slate-200" />
                  <p className="font-semibold text-slate-400 text-sm">Seleccioná un cliente</p>
                  <p className="text-[11px] text-slate-300">Hacé clic en una fila para ver sus SKUs.<br />Hacé clic en una celda de semana para filtrar por semana.</p>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
                          <Package size={13} className="text-sky-500 shrink-0" />
                          SKUs — <span className="text-sky-600 truncate max-w-[180px]" title={skuPorCliente?.cliente_nombre ?? selectedClienteCodigo}>
                            {skuPorCliente?.cliente_nombre ?? selectedClienteCodigo}
                          </span>
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {selectedSemana > 0 ? (
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                              Semana {selectedSemana}
                              <button onClick={() => setSelectedSemana(0)} className="ml-0.5 text-indigo-400 hover:text-indigo-700">✕</button>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Todo el mes</span>
                          )}
                          {skuPorCliente && (
                            <span className="text-[10px] text-slate-400">{skuPorCliente.skus.length} SKUs diferentes</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => { setSelectedClienteCodigo(null); setSkuPorCliente(null); setSelectedSemana(0); }}
                        className="btn-ghost text-[10px] flex items-center gap-1 shrink-0">
                        <RefreshCw size={10} /> Cerrar
                      </button>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={skuClienteSearch} onChange={(e) => setSkuClienteSearch(e.target.value)}
                      placeholder="Buscar SKU…"
                      className="w-full text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300" />
                  </div>

                  {loadingSkuCliente ? (
                    <div className="h-48 bg-slate-50 animate-pulse rounded-xl" />
                  ) : !skuPorCliente || skuPorCliente.skus.length === 0 ? (
                    <p className="text-slate-300 text-xs text-center py-8">Sin compras en este período</p>
                  ) : (() => {
                    const q = skuClienteSearch.trim().toLowerCase();
                    const filtered = q
                      ? skuPorCliente.skus.filter(s => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q))
                      : skuPorCliente.skus;
                    return (
                      <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" style={{ maxHeight: 460 }}>
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                            <tr className="text-slate-400">
                              <th className="text-left py-1.5 font-semibold">SKU</th>
                              <th className="text-right py-1.5 font-semibold">Uds</th>
                              <th className="text-right py-1.5 font-semibold">Bs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((s) => (
                              <tr key={s.codigo} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="py-1.5 pr-2">
                                  <p className="font-mono text-[9px] text-slate-400 leading-none">{s.codigo}</p>
                                  <p className="text-[10px] text-slate-700 font-medium leading-tight mt-0.5 max-w-[160px]" title={s.producto}>
                                    {s.producto.length > 30 ? s.producto.slice(0, 30) + "…" : s.producto}
                                  </p>
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-slate-600">{fmtN(s.cantidad)}</td>
                                <td className="py-1.5 text-right tabular-nums font-semibold text-slate-800">{fmtN(s.venta_neta)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                            <tr className="font-bold text-slate-700 text-xs">
                              <td className="py-2">Total</td>
                              <td className="py-2 text-right tabular-nums">{fmtN(skuPorCliente.total_uds)}</td>
                              <td className="py-2 text-right tabular-nums text-brand-700">{fmtN(skuPorCliente.total_bs)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

          </div>
        </div>
      ) : modoTiempo === "comparativo" ? (
        /* ── Vista Comparativa ──────────────────────────────────────────── */
        <div className="card">
          {/* Header comparativo */}
          <div className="flex flex-col gap-4 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                  <TrendingUp size={16} className="text-indigo-500" />
                  Comparativo Histórico — <span className={cfg.color}>{regional}</span>
                  {canal && <span className="text-xs bg-sky-500 text-white px-2 py-0.5 rounded-full font-bold">{canal}</span>}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {mesesComp} meses hasta {MESES[mes]} {anho}
                  {modoDiaComp === "completo" && <span className="ml-1 text-slate-400">· mes completo</span>}
                  {modoDiaComp === "mismo_dia" && diaActivo > 0 && <span className="ml-1 text-indigo-500 font-semibold">· hasta día {diaActivo} de cada mes</span>}
                  {modoDiaComp === "personalizado" && <span className="ml-1 text-indigo-500 font-semibold">· hasta día {diaCompPersonalizado} de cada mes</span>}
                  {selectedSkuComp && subVista === "skus" && modoVista === "skus_canal" && (
                    <span className="ml-2 text-sky-500 font-semibold">— {histSkuSingle?.skus[0]?.producto ?? selectedSkuComp}</span>
                  )}
                </p>
              </div>

              {/* Vista toggle in comparativo */}
              <div className="flex gap-2 flex-wrap items-end">
                {/* Modo vista */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Vista</label>
                  <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
                    {([ ["skus_canal", "SKUs x Canal"], ["clientes_vendedor", "Clientes x Vendedor"] ] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setModoVista(k)}
                        className={`px-3 py-2 transition-colors ${modoVista === k ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sub-tabs (only for skus_canal) */}
                {modoVista === "skus_canal" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Análisis</label>
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
                      {([ ["canales", "Por Canal"], ["skus", "Por SKU"] ] as [SubVistaComp, string][]).map(([k, label]) => (
                        <button key={k} onClick={() => setSubVista(k)}
                          className={`px-4 py-2 transition-colors ${subVista === k ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* SKUs x Canal view */}
          {modoVista === "skus_canal" && subVista === "canales" && (
            <>
              {loadingHistCanales ? (
                <div className="h-80 bg-slate-50 animate-pulse rounded-xl" />
              ) : !histCanales || histCanales.series.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-16">Sin datos</p>
              ) : (() => {
                const lineData = histCanales.periodos.map((p, i) => ({
                  label: p.label,
                  ...Object.fromEntries(histCanales.series.map(s => [s.nombre, s.valores[i] ?? null])),
                }));
                return (
                  <>
                    <ResponsiveContainer width="100%" height={360}>
                      <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600, fill: "#475569" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={fmtAbbr} width={64} axisLine={false} tickLine={false} />
                        <Tooltip content={<TooltipHistorico />} cursor={{ stroke: "#e2e8f0", strokeWidth: 2 }} />
                        {histCanales.series.map((s, i) => (
                          <Line key={s.nombre} dataKey={s.nombre} name={s.nombre}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={3}
                            dot={{ r: 4, strokeWidth: 2, fill: "#fff", stroke: CHART_COLORS[i % CHART_COLORS.length] }}
                            activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
                      {histCanales.series.map((s, i) => {
                        const color = CHART_COLORS[i % CHART_COLORS.length];
                        const vals = s.valores.filter(v => v > 0);
                        const last = vals[vals.length - 1] ?? 0;
                        const prev = vals[vals.length - 2] ?? null;
                        const trend = prev != null ? last - prev : null;
                        return (
                          <div key={s.nombre} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                            <div>
                              <p className="text-xs font-bold text-slate-700 leading-none">{s.nombre}</p>
                              <p className="text-[10px] text-slate-400 leading-none mt-0.5">{fmt(last)}</p>
                            </div>
                            {trend != null && (
                              <span className={`text-[10px] font-bold ml-1 ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {trend >= 0 ? "▲" : "▼"} {fmtAbbr(Math.abs(trend))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* Por SKU — 3 secciones en cascada */}
          {modoVista === "skus_canal" && subVista === "skus" && (
            <div className="flex flex-col gap-8">

              {/* ── Sección 1: Evolución por Categoría ── */}
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-sm bg-indigo-500 shrink-0" />
                  Evolución por Categoría
                </h3>
                <p className="text-[11px] text-slate-400 mb-3">Clic en una categoría para filtrar la sección de SKUs</p>
                {loadingGruposComp ? (
                  <div className="h-72 bg-slate-50 animate-pulse rounded-xl" />
                ) : !histGruposComp || histGruposComp.series.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-12">Sin datos</p>
                ) : (() => {
                  const lineData = histGruposComp.periodos.map((p, i) => ({
                    label: p.label,
                    ...Object.fromEntries(histGruposComp.series.map(s => [s.nombre, s.valores[i] ?? null])),
                  }));
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600, fill: "#475569" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={fmtAbbr} width={64} axisLine={false} tickLine={false} />
                          <Tooltip content={<TooltipHistorico />} cursor={{ stroke: "#e2e8f0", strokeWidth: 2 }} />
                          {histGruposComp.series.map((s, i) => (
                            <Line key={s.nombre} dataKey={s.nombre} name={s.nombre}
                              stroke={CHART_COLORS[i % CHART_COLORS.length]}
                              strokeWidth={grupoComp === s.nombre ? 4 : grupoComp === "Todos" ? 2.5 : 1.5}
                              strokeOpacity={grupoComp === "Todos" || grupoComp === s.nombre ? 1 : 0.3}
                              dot={{ r: 4, strokeWidth: 2, fill: "#fff", stroke: CHART_COLORS[i % CHART_COLORS.length] }}
                              activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                        {histGruposComp.series.map((s, i) => {
                          const vals = s.valores.filter(v => v > 0);
                          const last = vals[vals.length - 1] ?? 0;
                          const prev = vals[vals.length - 2] ?? null;
                          const trend = prev != null ? last - prev : null;
                          return (
                            <button key={s.nombre}
                              onClick={() => setGrupoComp(prev => prev === s.nombre ? "Todos" : s.nombre as SoftysGrupo)}
                              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all ${
                                grupoComp === s.nombre
                                  ? "bg-indigo-600 text-white border-transparent shadow-sm"
                                  : "bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300"
                              }`}>
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <div className="text-left">
                                <p className="font-bold leading-none">{s.nombre}</p>
                                <p className={`text-[10px] leading-none mt-0.5 ${grupoComp === s.nombre ? "text-indigo-200" : "text-slate-400"}`}>{fmt(last)}</p>
                              </div>
                              {trend != null && (
                                <span className={`text-[10px] font-bold ml-1 ${
                                  grupoComp === s.nombre ? "text-white" : trend >= 0 ? "text-emerald-600" : "text-red-500"
                                }`}>
                                  {trend >= 0 ? "▲" : "▼"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* ── Sección 2: SKUs de la categoría ── */}
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-sm bg-sky-500 shrink-0" />
                  SKUs — {grupoComp === "Todos" ? "Todas las categorías" : grupoComp}
                </h3>
                <p className="text-[11px] text-slate-400 mb-3">Clic en un SKU para ver su comportamiento mensual</p>
                {loadingHistSkus ? (
                  <div className="h-72 bg-slate-50 animate-pulse rounded-xl" />
                ) : !histSkus || histSkus.skus.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-12">Sin datos</p>
                ) : (() => {
                  const stackedData = histSkus.periodos.map((p, i) => ({
                    label: p.label,
                    ...Object.fromEntries(histSkus.skus.map(s => [s.codigo, s.valores[i] ?? 0])),
                  }));
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stackedData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600, fill: "#475569" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={fmtAbbr} width={64} axisLine={false} tickLine={false} />
                          <Tooltip content={(props: any) => <TooltipHistSkus {...props} skus={histSkus.skus} />} cursor={{ fill: "#f8fafc" }} />
                          {histSkus.skus.map((s, i) => (
                            <Bar key={s.codigo} dataKey={s.codigo} name={s.producto} stackId="stack"
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                              fillOpacity={selectedSkuComp === null || selectedSkuComp === s.codigo ? 1 : 0.35}
                              radius={i === histSkus.skus.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                              style={{ cursor: "pointer" }}
                              onClick={(_d: any, _idx: number) => setSelectedSkuComp(prev => prev === s.codigo ? null : s.codigo)} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-100">
                        {histSkus.skus.map((s, i) => (
                          <button key={s.codigo}
                            onClick={() => setSelectedSkuComp(prev => prev === s.codigo ? null : s.codigo)}
                            className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-left border transition-all ${
                              selectedSkuComp === s.codigo
                                ? "bg-sky-50 border-sky-300 ring-1 ring-sky-300"
                                : "bg-slate-50 border-transparent hover:border-slate-200"
                            }`}>
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <div className="min-w-0">
                              <p className="font-mono text-[9px] text-slate-400 leading-none">{s.codigo}</p>
                              <p className="text-[10px] text-slate-600 font-medium leading-tight mt-0.5 truncate" title={s.producto}>{s.producto}</p>
                              <p className="text-[9px] text-slate-400 mt-0.5">{fmt(s.total)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* ── Sección 3: Comportamiento del SKU seleccionado ── */}
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-sm bg-emerald-500 shrink-0" />
                  Comportamiento mensual — {selectedSkuComp
                    ? <span className="text-sky-600">{histSkuSingle?.skus[0]?.producto ?? selectedSkuComp}</span>
                    : <span className="text-slate-400 font-normal">SKU no seleccionado</span>
                  }
                </h3>
                {!selectedSkuComp ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3 text-center bg-slate-50 rounded-xl mt-3">
                    <TrendingUp size={28} className="text-slate-200" />
                    <p className="text-slate-400 text-sm">Seleccioná un SKU del gráfico de arriba para ver su comportamiento mes a mes</p>
                  </div>
                ) : loadingSkuSingle ? (
                  <div className="h-64 bg-slate-50 animate-pulse rounded-xl mt-3" />
                ) : !histSkuSingle || histSkuSingle.skus.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-12">Sin datos para este SKU</p>
                ) : (() => {
                  const sku = histSkuSingle.skus[0];
                  const lineData = histSkuSingle.periodos.map((p, i) => ({ label: p.label, avance: sku.valores[i] ?? 0 }));
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600, fill: "#475569" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={fmtAbbr} width={64} axisLine={false} tickLine={false} />
                          <Tooltip content={<TooltipHistorico />} />
                          <Line dataKey="avance" name={sku.producto} stroke="#0ea5e9" strokeWidth={3}
                            dot={{ r: 5, strokeWidth: 2, fill: "#fff", stroke: "#0ea5e9" }} activeDot={{ r: 7 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                        <span className="font-mono text-[10px] text-slate-400">{sku.codigo}</span>
                        <span className="text-xs text-slate-600 font-medium">{sku.producto}</span>
                        <span className="ml-auto text-xs text-slate-400">Total 6 meses: <strong className="text-slate-700">{fmt(sku.total)}</strong></span>
                      </div>
                    </>
                  );
                })()}
              </div>

            </div>
          )}

          {/* Clientes x Mes (comparativo) */}
          {modoVista === "clientes_vendedor" && (
            <div className="flex flex-col gap-4">
                {/* Vendedor combobox + group filter */}
                <div className="flex flex-wrap gap-4 items-start">
                  <div className="flex flex-col gap-1 min-w-56">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Vendedor</label>
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input type="text" value={vendedorCompSearch}
                        onChange={(e) => setVendedorCompSearch(e.target.value)}
                        onFocus={() => setVendedorCompFocused(true)}
                        onBlur={() => setTimeout(() => setVendedorCompFocused(false), 150)}
                        placeholder={vendedorComp ?? "Buscar vendedor…"}
                        className="w-full text-sm pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-400" />
                      {(vendedorCompSearch || vendedorCompFocused) && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto">
                          {loadingVendedores ? (
                            <p className="text-xs text-slate-400 px-3 py-3">Cargando…</p>
                          ) : (() => {
                            const items = vendedorCompSearch
                              ? vendedores.filter(v => v.vendedor.toLowerCase().includes(vendedorCompSearch.toLowerCase()))
                              : vendedores;
                            return items.length === 0
                              ? <p className="text-xs text-slate-400 px-3 py-3">Sin resultados</p>
                              : items.map(v => (
                                <button key={v.vendedor} onClick={() => { setVendedorComp(v.vendedor); setVendedorCompSearch(""); setVendedorCompFocused(false); }}
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 border-b border-slate-50 last:border-0 ${vendedorComp === v.vendedor ? "bg-sky-50 text-sky-700" : "hover:bg-slate-50"}`}>
                                  <span className="font-medium truncate">{v.vendedor}</span>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[10px] text-slate-400">{v.clientes} clientes</p>
                                    <p className="text-[10px] font-semibold text-slate-600">{fmtN(v.total)} Bs</p>
                                  </div>
                                </button>
                              ));
                          })()}
                        </div>
                      )}
                    </div>
                    {vendedorComp && (
                      <button onClick={() => { setVendedorComp(null); setVendedorCompSearch(""); }}
                        className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 mt-0.5">
                        <RefreshCw size={10} /> Limpiar vendedor
                      </button>
                    )}
                  </div>

                  {/* Group filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Línea Softys</label>
                    <GrupoBotones value={grupoVendedor} onChange={setGrupoVendedor} />
                  </div>
                </div>

                {/* Monthly table + SKU detail two-pane */}
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">

                  {/* LEFT: Monthly table */}
                  <div className="card xl:col-span-3">
                    {/* Table header: vendor + client count */}
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-700 text-sm">
                          {vendedorComp
                            ? <><span className="text-brand-600">{vendedorComp}</span></>
                            : <span className="text-slate-400">Todos los vendedores</span>
                          }
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {clientesMesComp ? `${clientesMesComp.clientes.length} clientes` : ""}
                          {selectedMesComp ? ` · filtrando ${clientesMesComp?.periodos.find(p => p.anho === selectedMesComp.anho && p.mes === selectedMesComp.mes)?.label ?? ""}` : ""}
                        </p>
                      </div>
                      {selectedMesComp && (
                        <button onClick={() => setSelectedMesComp(null)}
                          className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
                          <RefreshCw size={10} /> Ver todos los meses
                        </button>
                      )}
                    </div>
                    {loadingClientesMesComp ? (
                      <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />
                    ) : !clientesMesComp || clientesMesComp.clientes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
                        <Store size={28} className="text-slate-200" />
                        <p className="text-slate-400 text-sm">Sin datos para el período seleccionado</p>
                      </div>
                    ) : (() => {
                      const periodos = clientesMesComp.periodos;
                      const indices  = periodos.map((_, i) => i);
                      return (
                        <div className="overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" style={{ maxHeight: 480 }}>
                          <table className="w-full text-xs min-w-[560px]">
                            <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                              <tr className="text-slate-400">
                                <th className="text-left py-2 font-semibold pr-2 min-w-[140px]">Código · Cliente</th>
                                {periodos.map(p => {
                                  const isMesActive = selectedMesComp?.anho === p.anho && selectedMesComp?.mes === p.mes;
                                  return (
                                    <th key={`${p.anho}-${p.mes}`}
                                      className={`text-right py-2 font-semibold px-2 whitespace-nowrap ${isMesActive ? "text-indigo-600" : ""}`}>
                                      {p.label}
                                    </th>
                                  );
                                })}
                                <th className="text-right py-2 font-semibold pl-2 text-slate-600 whitespace-nowrap">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clientesMesComp.clientes.map((c) => {
                                const isSelected = c.codigo === selectedClienteCodigo;
                                const rowTotal = indices.reduce((s, i) => s + (c.valores[i] ?? 0), 0);
                                return (
                                  <tr key={c.codigo}
                                    onClick={() => { setSelectedClienteCodigo(prev => prev === c.codigo ? null : c.codigo); setSelectedMesComp(null); }}
                                    className={`border-b border-slate-50 cursor-pointer transition-colors ${isSelected ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                                    <td className="py-1.5 pr-2">
                                      <p className={`font-mono text-[9px] leading-none ${isSelected ? "text-sky-500" : "text-slate-400"}`}>{c.codigo}</p>
                                      <p className={`text-[10px] font-semibold leading-tight mt-0.5 max-w-[140px] truncate ${isSelected ? "text-sky-700" : "text-slate-700"}`} title={c.nombre}>{c.nombre}</p>
                                    </td>
                                    {periodos.map((p, i) => {
                                      const val = c.valores[i] ?? 0;
                                      const isMesActive = selectedMesComp?.anho === p.anho && selectedMesComp?.mes === p.mes;
                                      return (
                                        <td key={i}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedClienteCodigo(c.codigo);
                                            setSelectedMesComp(prev => prev?.anho === p.anho && prev?.mes === p.mes ? null : { anho: p.anho, mes: p.mes });
                                          }}
                                          className={`py-1.5 text-right tabular-nums px-2 transition-colors ${
                                            isMesActive && isSelected ? "bg-indigo-100 text-indigo-700 font-bold rounded" :
                                            val > 0 ? (isSelected ? "text-sky-600" : "text-slate-700") : "text-slate-200"
                                          } ${val > 0 ? "cursor-pointer" : ""}`}>
                                          {val > 0 ? fmtN(val) : "—"}
                                        </td>
                                      );
                                    })}
                                    <td className={`py-1.5 text-right font-bold tabular-nums pl-2 ${isSelected ? "text-sky-700" : "text-slate-800"}`}>{fmtN(rowTotal)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                              <tr className="font-bold text-slate-700 text-xs">
                                <td className="py-2 pr-2">TOTAL</td>
                                {indices.map(i => {
                                  const colTotal = clientesMesComp.clientes.reduce((s, c) => s + (c.valores[i] ?? 0), 0);
                                  return <td key={i} className="py-2 text-right tabular-nums px-2">{fmtN(colTotal)}</td>;
                                })}
                                <td className="py-2 text-right tabular-nums pl-2 text-brand-700">
                                  {fmtN(indices.reduce((s, i) => s + clientesMesComp.clientes.reduce((cs, c) => cs + (c.valores[i] ?? 0), 0), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                  {/* RIGHT: SKU detail for selected client */}
                  <div className="card xl:col-span-2">
                    {!selectedClienteCodigo ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <Package size={32} className="text-slate-200" />
                        <p className="font-semibold text-slate-400 text-sm">Seleccioná un cliente</p>
                        <p className="text-[11px] text-slate-300">Hacé clic en una fila para ver sus SKUs del mes actual.</p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-3">
                          <div className="flex items-start justify-between gap-2">
                            <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
                              <Package size={13} className="text-sky-500 shrink-0" />
                              SKUs — <span className="text-sky-600 truncate max-w-[180px]" title={skuPorCliente?.cliente_nombre ?? selectedClienteCodigo}>
                                {skuPorCliente?.cliente_nombre ?? selectedClienteCodigo}
                              </span>
                            </h2>
                            <button onClick={() => { setSelectedClienteCodigo(null); setSkuPorCliente(null); setSelectedMesComp(null); }}
                              className="btn-ghost text-[10px] flex items-center gap-1 shrink-0">
                              <RefreshCw size={10} /> Cerrar
                            </button>
                          </div>
                          {skuPorCliente && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {skuPorCliente.skus.length} SKUs ·{" "}
                              {selectedMesComp
                                ? `${MESES[selectedMesComp.mes]} ${selectedMesComp.anho}`
                                : `últimos ${mesesComp} meses`}
                            </p>
                          )}
                        </div>
                        <div className="relative mb-2">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input type="text" value={skuClienteSearch} onChange={(e) => setSkuClienteSearch(e.target.value)}
                            placeholder="Buscar SKU…"
                            className="w-full text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300" />
                        </div>
                        {loadingSkuCliente ? (
                          <div className="h-48 bg-slate-50 animate-pulse rounded-xl" />
                        ) : !skuPorCliente || skuPorCliente.skus.length === 0 ? (
                          <p className="text-slate-300 text-xs text-center py-8">Sin compras en este período</p>
                        ) : (() => {
                          const q = skuClienteSearch.trim().toLowerCase();
                          const filtered = q
                            ? skuPorCliente.skus.filter(s => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q))
                            : skuPorCliente.skus;
                          return (
                            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" style={{ maxHeight: 420 }}>
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                                  <tr className="text-slate-400">
                                    <th className="text-left py-1.5 font-semibold">SKU</th>
                                    <th className="text-right py-1.5 font-semibold">Uds</th>
                                    <th className="text-right py-1.5 font-semibold">Bs</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filtered.map((s) => (
                                    <tr key={s.codigo} className="border-b border-slate-50 hover:bg-slate-50">
                                      <td className="py-1.5 pr-2">
                                        <p className="font-mono text-[9px] text-slate-400 leading-none">{s.codigo}</p>
                                        <p className="text-[10px] text-slate-700 font-medium leading-tight mt-0.5 max-w-[160px]" title={s.producto}>
                                          {s.producto.length > 30 ? s.producto.slice(0, 30) + "…" : s.producto}
                                        </p>
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-slate-600">{fmtN(s.cantidad)}</td>
                                      <td className="py-1.5 text-right tabular-nums font-semibold text-slate-800">{fmtN(s.venta_neta)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                                  <tr className="font-bold text-slate-700 text-xs">
                                    <td className="py-2">Total</td>
                                    <td className="py-2 text-right tabular-nums">{fmtN(skuPorCliente.total_uds)}</td>
                                    <td className="py-2 text-right tabular-nums text-brand-700">{fmtN(skuPorCliente.total_bs)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>

                </div>
            </div>
          )}
        </div>
      ) : (
        <>
      {/* ── Tendencia + Desglose ───────────────────────────────────────────── */}
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
                <Line dataKey="avance_acumulado"      name="Avance"      stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls />
                <Line dataKey="proyeccion_acumulada"  name="Proyección"  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
          <LeyendaLineas esPeriodoActual={esPeriodoActual} />
        </div>

        {/* Desglose condicional: regionales (Nacional) o canales (regional) */}
        <div className="card col-span-10 xl:col-span-4">
          <h2 className="font-semibold text-slate-700 text-sm mb-1">{desgloseLabel}</h2>
          <p className="text-[11px] text-slate-400 mb-4">{canalLabel} · {MESES[mes]} {anho}</p>

          {loadingDesglose ? (
            <div className="h-48 bg-slate-50 animate-pulse rounded-xl mb-3" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(regionalDesglose.length * 44 + 20, 120)}>
              <BarChart layout="vertical" data={regionalDesglose} margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                <YAxis dataKey="nombre" type="category" tick={{ fontSize: 10, fontWeight: 700 }} width={80} />
                <Tooltip content={<TooltipDesglose />} />
                <Bar dataKey="avance" name="Avance" fill="#0ea5e9" radius={[0, 3, 3, 0]} barSize={10}
                  label={{ position: "right", fontSize: 10, fill: "#64748b", formatter: ((_v: unknown, _e: unknown, idx: number) => fmtPct(regionalDesglose[idx]?.porcentaje)) as any }} />
                <Bar dataKey="presupuesto" name="Presupuesto" fill="#22c55e" radius={[0, 3, 3, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          )}

          <table className="w-full text-xs mt-3 border-t border-slate-100 pt-2">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left py-1.5 font-semibold">{esNacional ? "Regional" : "Canal"}</th>
                <th className="text-right py-1.5 font-semibold">Avance</th>
                <th className="text-right py-1.5 font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {regionalDesglose.map((r) => (
                <tr key={r.nombre} className="border-t border-slate-50">
                  <td className="py-1 font-semibold text-slate-700">{r.nombre}</td>
                  <td className="py-1 text-right text-slate-600">{fmtN(r.avance)}</td>
                  <td className={`py-1 text-right font-bold ${
                    r.porcentaje == null ? "text-slate-400" : r.porcentaje >= 100 ? "text-emerald-600" : r.porcentaje >= 80 ? "text-amber-500" : "text-red-500"
                  }`}>{fmtPct(r.porcentaje)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SKUs por Grupo Softys ──────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-semibold text-slate-700">
              SKUs Softys — <span className={cfg.color}>{canalLabel}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{MESES[mes]} {anho}</p>
          </div>

          {/* Grupo Softys */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Línea de Producto</label>
            <GrupoBotones value={grupo} onChange={setGrupo} size="md" />
          </div>

          {/* Controles: toggle Uds/Caja/Java */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Unidad (gráfico)</label>
            <div className="flex gap-2">
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
                {(["uds", "caja", "java"] as const).map((u) => (
                  <button key={u} onClick={() => setUnidadVista(u)}
                    disabled={u === "caja" && !CAJA_SIZE || u === "java" && !JAVA_SIZE}
                    title={u === "caja" && !CAJA_SIZE ? "Unidades/caja pendiente" : u === "java" && !JAVA_SIZE ? "Unidades/java pendiente" : undefined}
                    className={`px-3 py-1.5 transition-colors capitalize disabled:opacity-40 ${
                      unidadVista === u ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}>
                    {unidadLabel(u)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          {/* Barra horizontal SKUs */}
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
                                <div><p className="text-[10px] text-slate-400">Venta Neta</p><p className="font-semibold text-sky-600">{fmt(row.venta_neta)}</p></div>
                                {row.presupuesto > 0 && <div><p className="text-[10px] text-slate-400">Presupuesto</p><p className="font-semibold text-emerald-600">{fmt(row.presupuesto)}</p></div>}
                                {row.porcentaje != null && <div><p className="text-[10px] text-slate-400">Cumpl.</p><p className={`font-bold ${row.porcentaje >= 100 ? "text-emerald-600" : row.porcentaje >= 80 ? "text-amber-500" : "text-red-500"}`}>{row.porcentaje.toFixed(1)}%</p></div>}
                                <div><p className="text-[10px] text-slate-400">Unidades</p><p className="font-semibold text-slate-700">{row.cantidad.toLocaleString()}</p></div>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="cantidad" name="Unidades" radius={[0, 3, 3, 0]} barSize={10}
                        label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((v: number) => fmtAbbr(convertCantidad(v))) as any }}>
                        {filteredSkus.map((entry) => (
                          <Cell key={entry.codigo} fill={entry.codigo === selectedSkuCode ? "#0369a1" : "#0ea5e9"} />
                        ))}
                      </Bar>
                      <Bar dataKey="presupuesto_uds" name="Ppto Uds" radius={[0, 3, 3, 0]} barSize={10}>
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

          {/* Tabla detalle SKU — Bs fijo + Uds fija */}
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Package size={14} className={SOFTYS_GRUPO_CONFIG[grupo]?.color ?? "text-slate-500"} />
                <span className="text-xs font-bold text-slate-600">
                  {grupo === "Todos" ? "Todos los productos" : grupo} — {filteredSkus.length}{filteredSkus.length !== skus.length ? `/${skus.length}` : ""} SKUs
                </span>
              </div>
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Buscar producto o código…"
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300" />
            </div>
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pr-1" style={{ maxHeight: 560 }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                  <tr className="text-slate-400">
                    <th className="text-left py-2 font-semibold">Código</th>
                    <th className="text-left py-2 font-semibold">Producto</th>
                    <th className="text-right py-2 font-semibold">Cob.</th>
                    <th className="text-right py-2 font-semibold">Venta Bs</th>
                    <th className="text-right py-2 font-semibold">Uds</th>
                    <th className="text-right py-2 font-semibold">Cumpl.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSkus.map((s) => {
                    const isSelected = s.codigo === selectedSkuCode;
                    return (
                      <tr key={s.codigo}
                        onClick={() => setSelectedSkuCode((prev) => prev === s.codigo ? null : s.codigo)}
                        className={`border-b border-slate-50 cursor-pointer transition-colors ${
                          isSelected ? "bg-sky-50 ring-1 ring-inset ring-sky-300" : "hover:bg-slate-50"
                        }`}>
                        <td className={`py-1.5 font-mono font-bold text-[10px] ${isSelected ? "text-sky-600" : "text-slate-500"}`}>{s.codigo}</td>
                        <td className={`py-1.5 max-w-28 truncate ${isSelected ? "text-sky-700 font-semibold" : "text-slate-700"}`} title={s.producto}>{s.producto}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{fmtN(s.clientes)}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">{fmtN(s.venta_neta)}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{fmtN(s.cantidad)}</td>
                        <td className={`py-1.5 text-right font-bold tabular-nums ${
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

      {/* ── Tendencia diaria del SKU (siempre visible) ───────────────────── */}
      <div className="card mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
              Tendencia —{" "}
              {selectedSkuCode
                ? <span className="text-sky-600">{skuTend?.productoNombre ?? selectedSkuCode}</span>
                : <span className="text-slate-400 font-normal">SKU no seleccionado</span>
              }
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {MESES[mes]} {anho} · acumulado diario
              {skuTend?.presupuestoTotal ? <span className="ml-2 text-emerald-600 font-semibold">Presupuesto: {fmt(skuTend.presupuestoTotal)}</span> : null}
            </p>
          </div>
          {selectedSkuCode && (
            <button onClick={() => { setSelectedSkuCode(null); setSkuTend(null); }}
              className="btn-ghost text-xs flex items-center gap-1.5">
              <RefreshCw size={11} /> Deseleccionar
            </button>
          )}
        </div>
        {!selectedSkuCode ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <TrendingUp size={32} className="text-slate-200" />
            <p className="text-slate-400 text-sm">Seleccioná un SKU de la tabla para ver su tendencia diaria</p>
          </div>
        ) : loadingSkuTend ? (
          <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />
        ) : !skuTend ? (
          <p className="text-slate-300 text-sm text-center py-10">Sin datos para este SKU</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={skuTend.data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={3} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtAbbr} width={56} />
                <Tooltip content={<TooltipTendencia />} />
                <Line dataKey="presupuesto_acumulado" name="Presupuesto" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                <Line dataKey="avance_acumulado"      name="Avance"      stroke="#0ea5e9" strokeWidth={2.5} dot={false} connectNulls />
                <Line dataKey="proyeccion_acumulada"  name="Proyección"  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <LeyendaLineas esPeriodoActual={skuTend.esPeriodoActual} />
          </>
        )}
      </div>
        </>
      )}
    </DashboardLayout>
  );
}
