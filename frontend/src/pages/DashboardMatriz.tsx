// ─── Imports ─────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useCallback, type ComponentType } from "react";
import { LayoutGrid, RefreshCw, Table2, FileDown, FileSpreadsheet, AlertCircle, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../context/AuthContext";

const API_BASE =
  import.meta.env.MODE === "production" ? "\\sistemabi\\api" : "http://localhost:8000/api";

// react-pivottable (CJS) ─ necesita resolución manual del .default
import _PivotUIRaw from "react-pivottable/PivotTableUI";
import _TableRenderersRaw from "react-pivottable/TableRenderers";
import _PlotlyRenderersRaw from "react-pivottable/PlotlyRenderers";
import _UtilitiesRaw from "react-pivottable/Utilities";
import type { PivotTableUIProps } from "react-pivottable/PivotTableUI";
import "react-pivottable/pivottable.css";

// react-plotly.js factory + plotly.js-dist-min (bundled pre-built)
import _createPlotlyComponentRaw from "react-plotly.js/factory";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – plotly.js-dist-min no tiene tipos TS pero funciona en browser
import _PlotlyDistRaw from "plotly.js-dist-min";

// ─── Resolución CJS/ESM ───────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
const PivotTableUI = ((_PivotUIRaw as any).default ?? _PivotUIRaw) as ComponentType<PivotTableUIProps>;
const RawTableRenderers = ((_TableRenderersRaw as any).default ?? _TableRenderersRaw) as Record<string, ComponentType<unknown>>;
const createPlotlyComp = ((_createPlotlyComponentRaw as any).default ?? _createPlotlyComponentRaw) as (Plotly: unknown) => ComponentType<unknown>;
const createPlotlyRend = ((_PlotlyRenderersRaw as any).default ?? _PlotlyRenderersRaw) as (Plot: unknown) => Record<string, ComponentType<unknown>>;
const PlotlyDist = (_PlotlyDistRaw as any).default ?? _PlotlyDistRaw;
const defaultAggregators = (((_UtilitiesRaw as any).default ?? _UtilitiesRaw) as any).aggregators as Record<string, unknown>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const Plot = createPlotlyComp(PlotlyDist);
const PlotlyRenderers = createPlotlyRend(Plot);

// ─── Roles ────────────────────────────────────────────────────────────────────

const ADMIN_CARGOS = new Set(["Gerente General", "Gerente de Ventas", "Admin"]);

const REGIONAL_OPTIONS = [
  { label: "Nacional", value: "nacional" },
  { label: "Santa Cruz", value: "santa_cruz" },
  { label: "Cochabamba", value: "cochabamba" },
  { label: "La Paz", value: "la_paz" },
];

const REGIONAL_NAME_TO_KEY: Record<string, string> = {
  "Santa Cruz": "santa_cruz",
  Cochabamba: "cochabamba",
  "La Paz": "la_paz",
  Nacional: "nacional",
};

// ─── Traducciones al español ──────────────────────────────────────────────────

const RENDERER_ES: Record<string, string> = {
  Table: "Tabla",
  "Table Heatmap": "Tabla — Mapa de calor",
  "Table Col Heatmap": "Tabla — Calor por columna",
  "Table Row Heatmap": "Tabla — Calor por fila",
  "Exportable TSV": "Exportar TSV",
  "Grouped Column Chart": "Barras agrupadas",
  "Stacked Column Chart": "Barras apiladas",
  "Grouped Bar Chart": "Barras horiz. agrupadas",
  "Stacked Bar Chart": "Barras horiz. apiladas",
  "Line Chart": "Líneas",
  "Dot Chart": "Puntos",
  "Area Chart": "Área",
  "Scatter Chart": "Dispersión",
  "Multiple Pie Chart": "Tortas múltiples",
};

const AGGREGATOR_ES: Record<string, string> = {
  Count: "Contar",
  "Count Unique Values": "Contar únicos",
  "List Unique Values": "Listar únicos",
  Sum: "Suma",
  "Integer Sum": "Suma entera",
  Average: "Promedio",
  Median: "Mediana",
  "Sample Variance": "Varianza",
  "Sample Standard Deviation": "Desv. estándar",
  Minimum: "Mínimo",
  Maximum: "Máximo",
  First: "Primero",
  Last: "Último",
  "Sum over Sum": "Suma / Suma",
  "Sum as Fraction of Total": "% del total (suma)",
  "Sum as Fraction of Rows": "% por fila (suma)",
  "Sum as Fraction of Columns": "% por columna (suma)",
  "Count as Fraction of Total": "% del total (conteo)",
  "Count as Fraction of Rows": "% por fila (conteo)",
  "Count as Fraction of Columns": "% por columna (conteo)",
};

const esRenderers = Object.fromEntries(
  Object.entries({ ...RawTableRenderers, ...PlotlyRenderers }).map(([k, v]) => [RENDERER_ES[k] ?? k, v])
);

const esAggregators = Object.fromEntries(
  Object.entries(defaultAggregators).map(([k, v]) => [AGGREGATOR_ES[k] ?? k, v])
);

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  rows: string[];
  cols: string[];
  vals: string[];
  aggregatorName: string;
  rendererName: string;
}

const PRESETS: Preset[] = [
  {
    id: "reg-canal-cat",
    label: "Regional × Canal / Categoría",
    rows: ["Regional", "Canal"],
    cols: ["Categoría"],
    vals: ["Bs Vendidos"],
    aggregatorName: "Suma entera",
    rendererName: "Tabla",
  },
  {
    id: "vend-sku",
    label: "Vendedor × SKU",
    rows: ["Vendedor", "SKU"],
    cols: ["Categoría"],
    vals: ["Bs Vendidos"],
    aggregatorName: "Suma entera",
    rendererName: "Tabla",
  },
  {
    id: "ruta-cat",
    label: "Ruta × Categoría",
    rows: ["Ruta"],
    cols: ["Categoría"],
    vals: ["Bs Vendidos"],
    aggregatorName: "Suma entera",
    rendererName: "Tabla — Calor por columna",
  },
  {
    id: "sup-vend",
    label: "Supervisor × Vendedor",
    rows: ["Supervisor", "Vendedor"],
    cols: ["Categoría"],
    vals: ["Bs Vendidos"],
    aggregatorName: "Suma entera",
    rendererName: "Tabla",
  },
  {
    id: "ppto",
    label: "Presupuesto vs Ventas",
    rows: ["Regional", "Canal"],
    cols: [],
    vals: ["Bs Vendidos"],
    aggregatorName: "Suma entera",
    rendererName: "Tabla",
  },
  {
    id: "gap",
    label: "GAP por Canal",
    rows: ["Regional", "Canal"],
    cols: ["Categoría"],
    vals: ["GAP"],
    aggregatorName: "Suma entera",
    rendererName: "Tabla — Calor por fila",
  },
  {
    id: "uds",
    label: "Unidades por SKU",
    rows: ["Categoría", "SKU"],
    cols: [],
    vals: ["Unidades"],
    aggregatorName: "Suma entera",
    rendererName: "Tabla",
  },
  {
    id: "licores",
    label: "Cajas 9L (Licores)",
    rows: ["Vendedor"],
    cols: [],
    vals: ["Cajas 9L"],
    aggregatorName: "Suma",
    rendererName: "Tabla",
  },
  {
    id: "bar-cat",
    label: "Barras por Categoría",
    rows: ["Categoría"],
    cols: [],
    vals: ["Bs Vendidos"],
    aggregatorName: "Suma entera",
    rendererName: "Barras agrupadas",
  },
];

const DEFAULT_PRESET = PRESETS[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildState(preset: Preset, data: Record<string, unknown>[]): PivotTableUIProps {
  return {
    data: data as unknown as PivotTableUIProps["data"],
    renderers: esRenderers as PivotTableUIProps["renderers"],
    aggregators: esAggregators as PivotTableUIProps["aggregators"],
    rows: preset.rows,
    cols: preset.cols,
    vals: preset.vals,
    aggregatorName: preset.aggregatorName,
    rendererName: preset.rendererName,
    onChange: () => undefined,
    unusedOrientationCutoff: Infinity,
    menuLimit: 500,
  };
}

function downloadTable(format: "csv" | "xlsx") {
  const table = document.querySelector(".pvtTable") as HTMLTableElement | null;
  if (!table) return;

  const wb = XLSX.utils.table_to_book(table, { sheet: "Matriz" });
  const ts = new Date().toISOString().slice(0, 10);
  const name = `dashboard-matriz-${ts}`;

  if (format === "xlsx") {
    XLSX.writeFile(wb, `${name}.xlsx`);
  } else {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR];
const MONTHS = [
  { v: 1, l: "Enero" }, { v: 2, l: "Febrero" }, { v: 3, l: "Marzo" },
  { v: 4, l: "Abril" }, { v: 5, l: "Mayo" },    { v: 6, l: "Junio" },
  { v: 7, l: "Julio" }, { v: 8, l: "Agosto" },  { v: 9, l: "Septiembre" },
  { v: 10, l: "Octubre" }, { v: 11, l: "Noviembre" }, { v: 12, l: "Diciembre" },
];

// ─── Página ───────────────────────────────────────────────────────────────────

export default function DashboardMatriz() {
  const { token, user } = useAuth();

  const isAdmin = ADMIN_CARGOS.has(user?.cargo ?? "");
  const isGerenteRegional = !isAdmin && user?.cargo === "Gerente Regional";

  // Filters
  const [anho, setAnho] = useState(CURRENT_YEAR);
  const [mes, setMes] = useState(CURRENT_MONTH);
  const [regional, setRegional] = useState("nacional");
  const [canal, setCanal] = useState("");

  // Lock regional for non-admin
  useEffect(() => {
    if (!isAdmin) {
      const key = REGIONAL_NAME_TO_KEY[user?.regional ?? ""] ?? "santa_cruz";
      setRegional(key);
    }
  }, [isAdmin, user?.regional]);

  // Data
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ anho: String(anho), mes: String(mes) });
      if (isAdmin) params.set("regional", regional);
      if (canal) params.set("canal", canal);

      const res = await fetch(`${API_BASE}/dashboard/matriz/datos/?${params}`, {
        headers: { Authorization: `Token ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error desconocido");
      setData(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [token, anho, mes, regional, canal, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Pivot state
  const [activeId, setActiveId] = useState(DEFAULT_PRESET.id);
  const [pivotState, setPivotState] = useState<PivotTableUIProps>(() => buildState(DEFAULT_PRESET, []));

  useEffect(() => {
    const preset = PRESETS.find((p) => p.id === activeId) ?? DEFAULT_PRESET;
    setPivotState(buildState(preset, data));
  }, [data, activeId]);

  function applyPreset(p: Preset) {
    setActiveId(p.id);
    setPivotState(buildState(p, data));
  }

  const totalRows = useMemo(() => data.length, [data]);

  return (
    <DashboardLayout>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-50 shrink-0">
            <Table2 size={18} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Dashboard Matriz</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Pivot table interactiva ·{" "}
              {loading ? (
                <span className="text-slate-400">cargando...</span>
              ) : (
                <span className="font-semibold text-slate-600">{totalRows.toLocaleString()} filas</span>
              )}
            </p>
          </div>
        </div>

        {/* Botones de descarga + restablecer */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => downloadTable("csv")} className="btn-ghost flex items-center gap-1.5 text-sm text-emerald-700 hover:bg-emerald-50" title="Descargar tabla visible como CSV">
            <FileDown size={14} />
            CSV
          </button>
          <button onClick={() => downloadTable("xlsx")} className="btn-ghost flex items-center gap-1.5 text-sm text-emerald-700 hover:bg-emerald-50" title="Descargar tabla visible como Excel">
            <FileSpreadsheet size={14} />
            Excel
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <button onClick={() => applyPreset(DEFAULT_PRESET)} className="btn-ghost flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} />
            Restablecer
          </button>
          <button onClick={fetchData} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-sm" title="Recargar datos">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="card mb-4 py-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Año */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión</label>
            <div className="flex gap-1">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setAnho(y)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                    anho === y ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-200 hover:border-brand-300"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Mes */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mes</label>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              {MONTHS.map((m) => (
                <option key={m.v} value={m.v}>{m.l}</option>
              ))}
            </select>
          </div>

          {/* Regional */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regional</label>
            {isAdmin ? (
              <select
                value={regional}
                onChange={(e) => setRegional(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                {REGIONAL_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg">
                {user?.regional ?? "—"}
              </span>
            )}
          </div>

          {/* Canal (libre para admin y gerente regional) */}
          {(isAdmin || isGerenteRegional) && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Canal</label>
              <input
                type="text"
                value={canal}
                onChange={(e) => setCanal(e.target.value.toUpperCase())}
                placeholder="Todos los canales"
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 w-44"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Presets ───────────────────────────────────────────────────────── */}
      <div className="card mb-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <LayoutGrid size={13} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vistas rápidas</span>
          {activeId === "custom" && (
            <span className="ml-auto text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">Vista personalizada</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                activeId === p.id
                  ? "bg-brand-500 text-white border-brand-500 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pivot Table ───────────────────────────────────────────────────── */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
            <Loader2 size={22} className="animate-spin text-brand-500" />
            <span className="text-sm">Cargando datos del servidor…</span>
          </div>
        ) : data.length === 0 && !error ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            Sin datos para el período seleccionado
          </div>
        ) : (
          <PivotTableUI
            {...pivotState}
            onChange={(s: PivotTableUIProps) => {
              setActiveId("custom");
              setPivotState(s);
            }}
          />
        )}
      </div>

      {/* ── Leyenda ───────────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="font-semibold text-slate-600 mb-1">Dimensiones</p>
          <p className="text-slate-400">Regional · Canal · Supervisor · Vendedor · Ruta · Categoría · SKU · Período</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="font-semibold text-slate-600 mb-1">Medidas</p>
          <p className="text-slate-400">Bs Vendidos · Unidades · Cajas 9L · Presupuesto · Proyectado Cierre · GAP · Desviación %</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="font-semibold text-slate-600 mb-1">Descarga</p>
          <p className="text-slate-400">CSV / Excel descarga la tabla que está visible en pantalla</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
