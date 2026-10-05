import { useState, useMemo, useEffect, useCallback } from "react";
import { Search, Tag, AlertCircle, Loader, FileSpreadsheet, FileDown } from "lucide-react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { setActiveFilters } from "../utils/filterStore";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductoPrecio {
  cod_interno: string;
  cod_barra:   string | null;
  producto:    string;
  costo:       number | null;
  pvp:         number | null;
  margen:      number | null;
  lista:       string;
}

interface PeriodoDisponible { anho: number; mes: number; }

interface ApiResponse {
  success:              boolean;
  data:                 ProductoPrecio[];
  listas:               string[];
  listas_permitidas:    string[];
  lista_activa:         string;
  lista_forzada:        boolean;
  periodos_disponibles: PeriodoDisponible[];
  error?:               string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BS = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBs = (n: number) => BS.format(n);

function fmtNullable(n: number | null | undefined): string {
  if (n == null) return "—";
  return fmtBs(n);
}

function calcMargen(costo: number | null, pvp: number | null): number {
  if (costo == null || pvp == null) return 0;
  return pvp - costo;
}

// ─── Exportar XLSX ────────────────────────────────────────────────────────────

async function exportXLSX(rows: ProductoPrecio[], lista: string, anho: number, mes: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lista de Precios");

  ws.columns = [
    { header: "Cod. Interno", key: "cod_interno", width: 16 },
    { header: "Cod. Barra",   key: "cod_barra",   width: 16 },
    { header: "SKU",          key: "producto",    width: 48 },
    { header: "Costo (Bs)",   key: "costo",       width: 14 },
    { header: "Margen (Bs)",  key: "margen",      width: 14 },
    { header: "PVP (Bs)",     key: "pvp",         width: 14 },
    { header: "Lista",        key: "lista",       width: 20 },
  ];

  // Estilo encabezado
  ws.getRow(1).eachCell(cell => {
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { horizontal: "center" };
  });

  for (const r of rows) {
    const margen = r.margen ?? calcMargen(r.costo, r.pvp);
    ws.addRow({
      cod_interno: r.cod_interno,
      cod_barra:   r.cod_barra ?? "",
      producto:    r.producto,
      costo:       r.costo ?? "",
      margen:      margen,
      pvp:         r.pvp ?? "",
      lista:       r.lista,
    });
  }

  // Formato numérico
  ["D", "E", "F"].forEach(col => {
    ws.getColumn(col).numFmt = '#,##0.00';
    ws.getColumn(col).alignment = { horizontal: "right" };
  });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const tag  = Object.assign(document.createElement("a"), {
    href:     url,
    download: `lista_precios_${lista || "todas"}_${anho}_${String(mes).padStart(2, "0")}.xlsx`,
  });
  document.body.appendChild(tag);
  tag.click();
  document.body.removeChild(tag);
  URL.revokeObjectURL(url);
}

// ─── Exportar PDF (jsPDF A4) ─────────────────────────────────────────────────

function exportPDF(rows: ProductoPrecio[], lista: string, anho: number, mes: number) {
  const doc    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const titulo = `Lista de Precios · ${lista || "Todas"} · ${MESES[mes]} ${anho}`;
  const fecha  = new Date().toLocaleDateString("es-BO");

  // Encabezado
  doc.setFontSize(13);
  doc.setTextColor(30, 58, 95);
  doc.text(titulo, 14, 14);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${rows.length} producto${rows.length !== 1 ? "s" : ""}  ·  Generado ${fecha}`, 14, 20);

  // Tabla
  autoTable(doc, {
    startY: 25,
    head: [["Cod. Interno", "Cod. Barra", "SKU", "Costo (Bs)", "Margen (Bs)", "PVP (Bs)"]],
    body: rows.map(r => {
      const margen = r.margen ?? calcMargen(r.costo, r.pvp);
      return [
        r.cod_interno,
        r.cod_barra ?? "—",
        r.producto,
        r.costo != null ? fmtBs(r.costo) : "—",
        fmtBs(margen),
        r.pvp   != null ? fmtBs(r.pvp)   : "—",
      ];
    }),
    styles:       { fontSize: 7.5, cellPadding: 2 },
    headStyles:   { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 25 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Número de página al pie
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 6,
        { align: "center" },
      );
    },
  });

  doc.save(`lista_precios_${lista || "todas"}_${anho}_${String(mes).padStart(2, "0")}.pdf`);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardListaPrecios() {
  const { apiFetch, user } = useAuth();

  const isVendedor   = user?.cargo === "Vendedor";
  const isPrivileged = !isVendedor;

  // ── Filtros principales ───────────────────────────────────────────────────
  const [anho,  setAnho]  = useState(new Date().getFullYear());
  const [mes,   setMes]   = useState(new Date().getMonth() + 1);
  const [lista, setLista] = useState("");

  // ── Estado de datos ───────────────────────────────────────────────────────
  const [datos,        setDatos]        = useState<ProductoPrecio[]>([]);
  const [listas,           setListas]           = useState<string[]>([]);
  const [listasPermitidas, setListasPermitidas] = useState<string[]>([]);
  const [listaForzada,     setListaForzada]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [exportando,   setExportando]   = useState(false);

  // ── Períodos disponibles ─────────────────────────────────────────────────
  const [periodosDisponibles, setPeriodosDisponibles] = useState<PeriodoDisponible[]>([]);

  // ── Búsqueda y filtros extra ─────────────────────────────────────────────
  const [busqueda,      setBusqueda]      = useState("");
  const [mostrarSinPvp, setMostrarSinPvp] = useState(false);

  useEffect(() => {
    setActiveFilters({ anho, mes, lista, busqueda });
  }, [anho, mes, lista, busqueda]);


  // ── Carga de datos ────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("anho", String(anho));
      params.set("mes",  String(mes));
      if (lista) params.set("lista", lista);
      const j = await apiFetch<ApiResponse>(`/dashboard/lista-precios/datos/?${params}`);
      if (!j.success) { setError(j.error ?? "Error desconocido"); return; }
      setDatos(j.data);
      setListas(j.listas);
      setListasPermitidas(j.listas_permitidas ?? []);
      setListaForzada(j.lista_forzada);
      setPeriodosDisponibles(j.periodos_disponibles ?? []);
      if (j.lista_forzada && j.lista_activa && !lista) setLista(j.lista_activa);
      // Si el mes/año actual no tiene datos, saltar al más reciente disponible
      if (j.data.length === 0 && j.periodos_disponibles?.length) {
        const ultimo = j.periodos_disponibles[0]; // ordenados DESC
        setAnho(ultimo.anho);
        setMes(ultimo.mes);
      }
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, anho, mes, lista]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Filtrado local ────────────────────────────────────────────────────────
  const datosFiltrados = useMemo(() => {
    let result = mostrarSinPvp ? datos : datos.filter(r => r.pvp != null);
    if (!busqueda.trim()) return result;
    const q = busqueda.trim().toLowerCase();
    return result.filter(r =>
      r.producto.toLowerCase().includes(q)    ||
      r.cod_interno.toLowerCase().includes(q) ||
      (r.cod_barra?.toLowerCase().includes(q) ?? false)
    );
  }, [datos, busqueda, mostrarSinPvp]);

  // ── Exportar ──────────────────────────────────────────────────────────────
  const handleXLSX = async () => {
    if (!datosFiltrados.length || exportando) return;
    setExportando(true);
    try { await exportXLSX(datosFiltrados, lista, anho, mes); }
    finally { setExportando(false); }
  };

  const handlePDF = () => {
    if (!datosFiltrados.length) return;
    exportPDF(datosFiltrados, lista, anho, mes);
  };

  const selCls = "text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Lista de Precios</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Costos y PVP por producto · {MESES[mes]} {anho}
              {lista && <span className="ml-2 text-brand-600 font-semibold">· {lista}</span>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => void handleXLSX()}
              disabled={!datosFiltrados.length || exportando || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Exportar Excel"
            >
              <FileSpreadsheet size={13} />
              {exportando ? "Exportando…" : "Excel"}
            </button>
            <button
              onClick={handlePDF}
              disabled={!datosFiltrados.length || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Exportar PDF"
            >
              <FileDown size={13} />
              PDF
            </button>
          </div>
        </div>

        {/* ── Filtros principales ─────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-wrap gap-3 items-end">

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gestión</label>
              <select value={anho} onChange={e => { setAnho(+e.target.value); }} className={selCls}>
                {[...new Set(periodosDisponibles.map(p => p.anho))].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mes</label>
              <select value={mes} onChange={e => setMes(+e.target.value)} className={selCls}>
                {periodosDisponibles
                  .filter(p => p.anho === anho)
                  .map(p => (
                    <option key={p.mes} value={p.mes}>{MESES[p.mes]}</option>
                  ))
                }
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Lista de Precios
                {listaForzada && (
                  <span className="ml-1 text-brand-500">
                    {listasPermitidas.length > 1 ? `(${listasPermitidas.length} asignadas)` : "(tu canal)"}
                  </span>
                )}
              </label>
              <select
                value={lista}
                onChange={e => setLista(e.target.value)}
                disabled={listaForzada && listasPermitidas.length <= 1}
                className={selCls}
              >
                {isPrivileged && <option value="">Todas las listas</option>}
                {listas.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

<div className="flex flex-col gap-1 flex-1 min-w-48">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Producto, código interno o código de barra…"
                  className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] invisible select-none">·</span>
              <label className="flex items-center gap-2 cursor-pointer select-none py-2">
                <input
                  type="checkbox"
                  checked={mostrarSinPvp}
                  onChange={e => setMostrarSinPvp(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-brand-600 cursor-pointer"
                />
                <span className="text-xs text-slate-500 whitespace-nowrap">Listar Productos sin PVP</span>
              </label>
            </div>

          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* ── Tabla con scroll propio ──────────────────────────────────────── */}
        <div className="card p-0 overflow-hidden">

          {/* Contenedor scrollable — muestra ~20 filas */}
          <div className="overflow-x-auto">
            <div className="overflow-y-auto max-h-190">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Cod. Interno</th>
                    <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Cod. Barra</th>
                    <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap min-w-52">SKU</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Costo (Bs)</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Margen (Bs)</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">PVP (Bs)</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Loader size={28} className="animate-spin text-brand-400" />
                          <p className="text-xs text-slate-400">Cargando precios…</p>
                        </div>
                      </td>
                    </tr>
                  ) : datosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-300">
                          <Tag size={36} />
                          <p className="text-sm font-medium text-slate-400">Sin datos disponibles</p>
                          <p className="text-xs text-slate-300">
                            {!lista && isPrivileged
                              ? "Selecciona una lista de precios para ver los productos"
                              : "No se encontraron productos para los filtros aplicados"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    datosFiltrados.map((row, i) => {
                      const margen = row.margen ?? calcMargen(row.costo, row.pvp);
                      return (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-slate-600">{row.cod_interno}</td>
                          <td className="px-3 py-2.5">
                            {row.cod_barra
                              ? row.cod_barra.split(',').map(c => c.trim()).filter(Boolean).map((c, i) => (
                                  <span key={i} className="inline-block font-mono text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 mr-1 whitespace-nowrap">{c}</span>
                                ))
                              : <span className="text-slate-300">—</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800 min-w-52">{row.producto}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                            {fmtNullable(row.costo)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-400">
                            {fmtBs(margen)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-400">
                            {row.pvp != null ? fmtBs(row.pvp) : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer contador */}
          {!loading && datosFiltrados.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              {datosFiltrados.length} producto{datosFiltrados.length !== 1 ? "s" : ""}
              {busqueda && datos.length !== datosFiltrados.length &&
                ` (de ${datos.length} totales)`}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
