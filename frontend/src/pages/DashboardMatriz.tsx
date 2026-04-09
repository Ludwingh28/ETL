// ─── Imports ─────────────────────────────────────────────────────────────────
import { useState, useMemo, type ComponentType } from "react";
import { LayoutGrid, RefreshCw, Table2, FileDown, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import DashboardLayout from "../components/DashboardLayout";

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

// Crear componente Plot con la build ligera de plotly
const Plot = createPlotlyComp(PlotlyDist);
const PlotlyRenderers = createPlotlyRend(Plot);

// ─── Traducciones al español ──────────────────────────────────────────────────

const RENDERER_ES: Record<string, string> = {
  // Tabla
  Table: "Tabla",
  "Table Heatmap": "Tabla — Mapa de calor",
  "Table Col Heatmap": "Tabla — Calor por columna",
  "Table Row Heatmap": "Tabla — Calor por fila",
  "Exportable TSV": "Exportar TSV",
  // Gráficas Plotly
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

// Construir objetos con claves en español
const esRenderers = Object.fromEntries(Object.entries({ ...RawTableRenderers, ...PlotlyRenderers }).map(([k, v]) => [RENDERER_ES[k] ?? k, v]));

const esAggregators = Object.fromEntries(Object.entries(defaultAggregators).map(([k, v]) => [AGGREGATOR_ES[k] ?? k, v]));

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DataRow {
  Regional: string;
  Canal: string;
  Categoría: string;
  SKU: string;
  Descripción: string;
  Mes: string;
  Avance: number;
  Objetivo: number;
  GAP: number;
  "%Cumplimiento": number;
}

// ─── Datos base ───────────────────────────────────────────────────────────────

const REGIONAL_CANALES: Record<string, { nombre: string; avance: number; objetivo: number }[]> = {
  "Santa Cruz": [
    { nombre: "DTS", avance: 1_200_000, objetivo: 1_400_000 },
    { nombre: "WHS", avance: 680_000, objetivo: 800_000 },
    { nombre: "HORECA", avance: 420_000, objetivo: 500_000 },
    { nombre: "SPM", avance: 350_000, objetivo: 400_000 },
    { nombre: "CORP", avance: 280_000, objetivo: 320_000 },
    { nombre: "ECOM", avance: 150_000, objetivo: 180_000 },
    { nombre: "WHS-LICORES", avance: 420_000, objetivo: 400_000 },
    { nombre: "PROV", avance: 620_150, objetivo: 700_000 },
  ],
  Cochabamba: [
    { nombre: "CODIS", avance: 480_000, objetivo: 550_000 },
    { nombre: "DTS", avance: 620_000, objetivo: 720_000 },
    { nombre: "WHS", avance: 380_000, objetivo: 450_000 },
    { nombre: "HORECA", avance: 250_000, objetivo: 300_000 },
    { nombre: "SPM", avance: 180_000, objetivo: 220_000 },
    { nombre: "CORP", avance: 130_000, objetivo: 160_000 },
    { nombre: "WHS-LICORES", avance: 130_090, objetivo: 120_000 },
    { nombre: "PROV", avance: 210_000, objetivo: 250_000 },
  ],
  "La Paz": [
    { nombre: "DTS-LP", avance: 520_000, objetivo: 650_000 },
    { nombre: "WHS-LP", avance: 320_000, objetivo: 400_000 },
    { nombre: "DTS-EA", avance: 280_000, objetivo: 350_000 },
    { nombre: "WHS-EA", avance: 200_000, objetivo: 250_000 },
    { nombre: "HORECA", avance: 180_000, objetivo: 220_000 },
    { nombre: "SPM", avance: 140_000, objetivo: 180_000 },
    { nombre: "WHS-LICORES", avance: 120_080, objetivo: 110_000 },
    { nombre: "PROV", avance: 190_000, objetivo: 240_000 },
  ],
};

const DIST_CAT: Record<string, Record<string, number>> = {
  DTS: { Alimentos: 0.4, Apego: 0.28, Licores: 0.18, "Home & Personal Care": 0.14 },
  "DTS-LP": { Alimentos: 0.42, Apego: 0.25, Licores: 0.18, "Home & Personal Care": 0.15 },
  "DTS-EA": { Alimentos: 0.38, Apego: 0.27, Licores: 0.2, "Home & Personal Care": 0.15 },
  WHS: { Alimentos: 0.35, Apego: 0.3, Licores: 0.15, "Home & Personal Care": 0.2 },
  "WHS-LP": { Alimentos: 0.36, Apego: 0.29, Licores: 0.16, "Home & Personal Care": 0.19 },
  "WHS-EA": { Alimentos: 0.34, Apego: 0.31, Licores: 0.15, "Home & Personal Care": 0.2 },
  "WHS-LICORES": { Alimentos: 0.02, Apego: 0.02, Licores: 0.92, "Home & Personal Care": 0.04 },
  HORECA: { Alimentos: 0.3, Apego: 0.1, Licores: 0.45, "Home & Personal Care": 0.15 },
  SPM: { Alimentos: 0.38, Apego: 0.25, Licores: 0.12, "Home & Personal Care": 0.25 },
  CORP: { Alimentos: 0.45, Apego: 0.2, Licores: 0.1, "Home & Personal Care": 0.25 },
  ECOM: { Alimentos: 0.3, Apego: 0.35, Licores: 0.1, "Home & Personal Care": 0.25 },
  CODIS: { Alimentos: 0.42, Apego: 0.25, Licores: 0.15, "Home & Personal Care": 0.18 },
  PROV: { Alimentos: 0.44, Apego: 0.22, Licores: 0.16, "Home & Personal Care": 0.18 },
};

const SKUS_CAT: Record<string, { sku: string; descripcion: string; peso: number }[]> = {
  Alimentos: [
    { sku: "ALI-001", descripcion: "Arroz Doña Rosa 5kg", peso: 0.22 },
    { sku: "ALI-002", descripcion: "Aceite Fino 1L", peso: 0.18 },
    { sku: "ALI-003", descripcion: "Azúcar Guabirá 1kg", peso: 0.16 },
    { sku: "ALI-004", descripcion: "Harina Oriental 1kg", peso: 0.2 },
    { sku: "ALI-005", descripcion: "Fideos Don Vitorio 400g", peso: 0.12 },
    { sku: "ALI-006", descripcion: "Leche Pil Entera 1L", peso: 0.12 },
  ],
  Apego: [
    { sku: "APE-001", descripcion: "Pañal Huggies M x30", peso: 0.28 },
    { sku: "APE-002", descripcion: "Pañal Pampers G x24", peso: 0.24 },
    { sku: "APE-003", descripcion: "Leche NAN 1 400g", peso: 0.18 },
    { sku: "APE-004", descripcion: "Leche Enfamil 400g", peso: 0.16 },
    { sku: "APE-005", descripcion: "Cereal Nestlé 360g", peso: 0.14 },
  ],
  Licores: [
    { sku: "LIC-001", descripcion: "Cerveza Paceña 620ml", peso: 0.26 },
    { sku: "LIC-002", descripcion: "Cerveza Huari 620ml", peso: 0.22 },
    { sku: "LIC-003", descripcion: "Cerveza Taquiña 620ml", peso: 0.18 },
    { sku: "LIC-004", descripcion: "Singani Casa Real 750ml", peso: 0.16 },
    { sku: "LIC-005", descripcion: "Ron Millonario 750ml", peso: 0.1 },
    { sku: "LIC-006", descripcion: "Vino Kohlberg Blanco 750ml", peso: 0.08 },
  ],
  "Home & Personal Care": [
    { sku: "HPC-001", descripcion: "Detergente Ace 1kg", peso: 0.22 },
    { sku: "HPC-002", descripcion: "Jabón Rexona 125g x3", peso: 0.18 },
    { sku: "HPC-003", descripcion: "Papel Higiénico Elite x4", peso: 0.16 },
    { sku: "HPC-004", descripcion: "Shampoo H&S 400ml", peso: 0.24 },
    { sku: "HPC-005", descripcion: "Lejía Sapolio 1L", peso: 0.2 },
  ],
};

const MESES_CONFIG = [
  { mes: "Enero 2026", pctAvance: 0.3, pctObj: 0.333 },
  { mes: "Febrero 2026", pctAvance: 0.32, pctObj: 0.333 },
  { mes: "Marzo 2026", pctAvance: 0.38, pctObj: 0.333 },
];

// ─── Generador determinista ───────────────────────────────────────────────────

function hashFactor(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const frac = ((h < 0 ? -h : h) % 1000) / 1000;
  return min + frac * (max - min);
}

function generateData(): DataRow[] {
  const rows: DataRow[] = [];
  for (const [regional, canales] of Object.entries(REGIONAL_CANALES)) {
    for (const canal of canales) {
      const dist = DIST_CAT[canal.nombre] ?? DIST_CAT["DTS"];
      for (const [cat, catPct] of Object.entries(dist)) {
        const catAv = canal.avance * catPct;
        const catObj = canal.objetivo * catPct;
        for (const s of SKUS_CAT[cat] ?? []) {
          for (const { mes, pctAvance, pctObj } of MESES_CONFIG) {
            const vf = hashFactor(`${regional}|${canal.nombre}|${cat}|${s.sku}|${mes}`, 0.88, 1.15);
            const obj = Math.round(catObj * pctObj * s.peso);
            const av = Math.round(catAv * pctAvance * s.peso * vf);
            rows.push({
              Regional: regional,
              Canal: canal.nombre,
              Categoría: cat,
              SKU: s.sku,
              Descripción: s.descripcion,
              Mes: mes,
              Avance: av,
              Objetivo: obj,
              GAP: av - obj,
              "%Cumplimiento": obj > 0 ? parseFloat(((av / obj) * 100).toFixed(1)) : 0,
            });
          }
        }
      }
    }
  }
  return rows;
}

const MOCK_DATA: DataRow[] = generateData();

// ─── Presets (con nombres en español que coinciden con esRenderers/esAggregators) ──

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
  { id: "reg-canal-cat", label: "Regional × Canal / Categoría", rows: ["Regional", "Canal"], cols: ["Categoría"], vals: ["Avance"], aggregatorName: "Suma entera", rendererName: "Tabla" },

  { id: "reg-mes", label: "Regional / Mes", rows: ["Regional"], cols: ["Mes"], vals: ["Avance"], aggregatorName: "Suma entera", rendererName: "Tabla — Mapa de calor" },

  { id: "canal-sku", label: "Canal × SKU / Mes", rows: ["Canal", "SKU"], cols: ["Mes"], vals: ["Avance"], aggregatorName: "Suma entera", rendererName: "Tabla" },

  { id: "cat-reg", label: "Categoría × Regional", rows: ["Categoría"], cols: ["Regional", "Mes"], vals: ["Avance"], aggregatorName: "Suma entera", rendererName: "Tabla — Calor por columna" },

  { id: "cumpl", label: "% Cumplimiento", rows: ["Regional", "Canal"], cols: ["Categoría"], vals: ["%Cumplimiento"], aggregatorName: "Promedio", rendererName: "Tabla — Mapa de calor" },

  { id: "gap", label: "GAP por Canal", rows: ["Regional", "Canal"], cols: ["Mes"], vals: ["GAP"], aggregatorName: "Suma entera", rendererName: "Tabla — Calor por fila" },

  { id: "bar-cat", label: "Barras por Categoría", rows: ["Categoría"], cols: [], vals: ["Avance"], aggregatorName: "Suma entera", rendererName: "Barras agrupadas" },

  { id: "linea-mes", label: "Tendencia Mensual", rows: ["Regional"], cols: ["Mes"], vals: ["Avance"], aggregatorName: "Suma entera", rendererName: "Líneas" },
];

const DEFAULT = PRESETS[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildState(preset: Preset): PivotTableUIProps {
  const pivotData = MOCK_DATA as unknown as PivotTableUIProps["data"];
  return {
    data: pivotData,
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
    hiddenAttributes: ["Descripción"],
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
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function DashboardMatriz() {
  const [activeId, setActiveId] = useState(DEFAULT.id);
  const [pivotState, setPivotState] = useState<PivotTableUIProps>(() => buildState(DEFAULT));
  const totalRows = useMemo(() => MOCK_DATA.length, []);

  function applyPreset(p: Preset) {
    setActiveId(p.id);
    setPivotState(buildState(p));
  }

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
              Pivot table interactiva ·<span className="font-semibold text-slate-600"> {totalRows.toLocaleString()} filas</span>
              <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Demo</span>
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
          <button onClick={() => applyPreset(DEFAULT)} className="btn-ghost flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} />
            Restablecer
          </button>
        </div>
      </div>

      {/* ── Presets ───────────────────────────────────────────────────────── */}
      <div className="card mb-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <LayoutGrid size={13} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vistas rápidas</span>
          {activeId === "custom" && <span className="ml-auto text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">Vista personalizada</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                activeId === p.id ? "bg-brand-500 text-white border-brand-500 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pivot Table ───────────────────────────────────────────────────── */}
      <div className="card overflow-x-auto">
        <PivotTableUI
          {...pivotState}
          onChange={(s: PivotTableUIProps) => {
            setActiveId("custom");
            setPivotState(s);
          }}
        />
      </div>

      {/* ── Leyenda ───────────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="font-semibold text-slate-600 mb-1">Dimensiones</p>
          <p className="text-slate-400">Regional · Canal · Categoría · SKU · Mes</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="font-semibold text-slate-600 mb-1">Medidas</p>
          <p className="text-slate-400">Avance · Objetivo · GAP · %Cumplimiento</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="font-semibold text-slate-600 mb-1">Descarga</p>
          <p className="text-slate-400">CSV / Excel descarga la tabla que está visible en pantalla</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
