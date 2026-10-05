import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Warehouse, Loader, CalendarDays, FileSpreadsheet, FileDown } from "lucide-react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../context/AuthContext";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface InventarioRow {
  almacen:     string;
  cod_interno: string;
  producto:    string;
  u_medida:    string;
  stock_total: number;
}

interface ApiResponse {
  success:   boolean;
  fecha:     string | null;
  almacenes: string[];
  data:      InventarioRow[];
  error?:    string;
}

interface ProductoPivot {
  cod_interno: string;
  producto:    string;
  u_medida:    string;
  stocks:      Record<string, number>;
  total:       number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const N = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmtN = (n: number) => n === 0 ? <span className="text-slate-300">—</span> : <>{N.format(Math.round(n))}</>;

const MESES_SHORT = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function fmtFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MESES_SHORT[parseInt(m)]} ${y}`;
}

// ─── Exportar XLSX ────────────────────────────────────────────────────────────

async function exportXLSX(rows: ProductoPivot[], almacenes: string[], fecha: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inventario");

  ws.columns = [
    { header: "Código",   key: "cod",      width: 16 },
    { header: "Producto", key: "producto", width: 48 },
    { header: "U/M",      key: "um",       width: 8  },
    ...almacenes.map(a => ({ header: a, key: a, width: 16 })),
    { header: "Total",    key: "total",    width: 14 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { horizontal: "center" };
  });

  for (const r of rows) {
    const row: Record<string, string | number> = {
      cod:      r.cod_interno,
      producto: r.producto,
      um:       r.u_medida,
      total:    r.total,
    };
    for (const a of almacenes) row[a] = r.stocks[a] ?? 0;
    ws.addRow(row);
  }

  // Formato numérico en columnas de almacenes y total
  const numCols = almacenes.map((_, i) => String.fromCharCode(68 + i)); // D en adelante
  numCols.push(String.fromCharCode(68 + almacenes.length)); // columna Total
  numCols.forEach(col => {
    ws.getColumn(col).numFmt = '#,##0';
    ws.getColumn(col).alignment = { horizontal: "right" };
  });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const tag  = Object.assign(document.createElement("a"), {
    href: url, download: `inventario_${fecha}.xlsx`,
  });
  document.body.appendChild(tag);
  tag.click();
  document.body.removeChild(tag);
  URL.revokeObjectURL(url);
}

// ─── Exportar PDF ─────────────────────────────────────────────────────────────

function exportPDF(rows: ProductoPivot[], almacenes: string[], fecha: string) {
  const doc    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const titulo = `Inventario · Stock Bueno · Al ${fecha}`;
  doc.setFontSize(13);
  doc.setTextColor(30, 58, 95);
  doc.text(titulo, 14, 14);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${rows.length} producto${rows.length !== 1 ? "s" : ""}  ·  Generado ${new Date().toLocaleDateString("es-BO")}`, 14, 20);

  const head = [["Código", "Producto", "U/M", ...almacenes, "Total"]];
  const body = rows.map(r => [
    r.cod_interno,
    r.producto,
    r.u_medida,
    ...almacenes.map(a => r.stocks[a] ? new Intl.NumberFormat("es-BO").format(r.stocks[a]) : "—"),
    new Intl.NumberFormat("es-BO").format(r.total),
  ]);

  autoTable(doc, {
    startY: 25,
    head,
    body,
    styles:     { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 10, halign: "center" },
      ...Object.fromEntries(
        almacenes.map((_, i) => [i + 3, { cellWidth: 28, halign: "right" as const }])
      ),
      [almacenes.length + 3]: { cellWidth: 28, halign: "right" as const },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data: any) => {
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

  doc.save(`inventario_${fecha}.pdf`);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardInventarioAlmacen() {
  const { apiFetch } = useAuth();

  const [almacenes, setAlmacenes] = useState<string[]>([]);
  const [rows,      setRows]      = useState<InventarioRow[]>([]);
  const [fecha,     setFecha]     = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [busqueda,   setBusqueda]   = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const j = await apiFetch<ApiResponse>("/dashboard/inventario-almacen/datos/");
      if (!j.success) { setError(j.error ?? "Error desconocido"); return; }
      setFecha(j.fecha);
      setAlmacenes(j.almacenes);
      setRows(j.data);
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Pivot: agrupar filas por producto ────────────────────────────────────
  const pivotRows = useMemo<ProductoPivot[]>(() => {
    const map = new Map<string, ProductoPivot>();
    for (const r of rows) {
      let p = map.get(r.cod_interno);
      if (!p) {
        p = { cod_interno: r.cod_interno, producto: r.producto, u_medida: r.u_medida, stocks: {}, total: 0 };
        map.set(r.cod_interno, p);
      }
      p.stocks[r.almacen] = (p.stocks[r.almacen] ?? 0) + r.stock_total;
      p.total += r.stock_total;
    }
    return Array.from(map.values());
  }, [rows]);

  // ── Filtro por búsqueda ───────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return pivotRows;
    const q = busqueda.trim().toLowerCase();
    return pivotRows.filter(r =>
      r.producto.toLowerCase().includes(q) ||
      r.cod_interno.toLowerCase().includes(q)
    );
  }, [pivotRows, busqueda]);

  // ── Totales por almacén ───────────────────────────────────────────────────
  const totalesPorAlmacen = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of filtrados) {
      for (const a of almacenes) {
        t[a] = (t[a] ?? 0) + (r.stocks[a] ?? 0);
      }
    }
    return t;
  }, [filtrados, almacenes]);

  const totalGeneral = useMemo(
    () => filtrados.reduce((s, r) => s + r.total, 0),
    [filtrados]
  );

  const colCount = almacenes.length + 4; // cod + producto + u/m + almacenes + total

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Inventarios</h1>
            <p className="text-xs text-slate-400 mt-0.5">Stock bueno por producto y almacén</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => { if (!exportando && filtrados.length) { setExportando(true); exportXLSX(filtrados, almacenes, fecha ?? '').finally(() => setExportando(false)); } }}
              disabled={!filtrados.length || exportando || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileSpreadsheet size={13} />
              {exportando ? "Exportando…" : "Excel"}
            </button>
            <button
              onClick={() => { if (filtrados.length) exportPDF(filtrados, almacenes, fecha ?? ''); }}
              disabled={!filtrados.length || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileDown size={13} />
              PDF
            </button>
          </div>
        </div>

        {/* ── Filtros ──────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Última carga */}
            {fecha && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Última carga</span>
                <div className="flex items-center gap-1.5 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg text-xs font-semibold text-brand-700 whitespace-nowrap">
                  <CalendarDays size={12} className="shrink-0" />
                  {fmtFecha(fecha)}
                </div>
              </div>
            )}

            {/* Buscador */}
            <div className="flex flex-col gap-1 flex-1 min-w-56">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Código o nombre de producto…"
                  className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

          </div>
        </div>

        {/* ── Tabla ────────────────────────────────────────────────────── */}
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="overflow-y-auto max-h-190">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Código</th>
                    <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap min-w-56">Producto</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">U/M</th>
                    {almacenes.map(a => (
                      <th key={a} className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">{a}</th>
                    ))}
                    <th className="text-right px-3 py-3 font-semibold text-slate-700 whitespace-nowrap bg-slate-100">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={colCount} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Loader size={28} className="animate-spin text-brand-400" />
                          <p className="text-xs text-slate-400">Cargando inventario…</p>
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={colCount} className="py-16 text-center text-xs text-red-500">{error}</td>
                    </tr>
                  ) : filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={colCount} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-300">
                          <Warehouse size={36} />
                          <p className="text-sm font-medium text-slate-400">Sin datos de inventario</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtrados.map((row, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-slate-500">{row.cod_interno}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{row.producto}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{row.u_medida}</td>
                        {almacenes.map(a => (
                          <td key={a} className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                            {fmtN(row.stocks[a] ?? 0)}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-800 bg-slate-50">
                          {fmtN(row.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {!loading && filtrados.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-xs">
                      <td colSpan={3} className="px-3 py-2.5 text-slate-500">
                        {filtrados.length} producto{filtrados.length !== 1 ? "s" : ""}
                      </td>
                      {almacenes.map(a => (
                        <td key={a} className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {N.format(Math.round(totalesPorAlmacen[a] ?? 0))}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 bg-slate-100">
                        {N.format(Math.round(totalGeneral))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
