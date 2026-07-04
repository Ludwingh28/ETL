import { useEffect, useState, useCallback } from 'react'
import {
  Flag, Search, ChevronDown, X, Inbox, ExternalLink, Monitor, Calendar, Globe,
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import type { Reporte, ReporteEstado, ReportePrioridad } from '../types'

export default function AdminReportes() {
  const { apiFetch } = useAuth()

  const [reportes,         setReportes]         = useState<Reporte[]>([])
  const [reportesLoading,  setReportesLoading]  = useState(false)
  const [rFilterTipo,      setRFilterTipo]      = useState('')
  const [rFilterEstado,    setRFilterEstado]    = useState('')
  const [rFilterPrioridad, setRFilterPrioridad] = useState('')
  const [rSearch,          setRSearch]          = useState('')
  const [selectedReporte,  setSelectedReporte]  = useState<Reporte | null>(null)
  const [lightboxSrc,      setLightboxSrc]      = useState<string | null>(null)

  const fetchReportes = useCallback(async () => {
    setReportesLoading(true)
    try {
      const params = new URLSearchParams()
      if (rFilterTipo)      params.set('tipo',      rFilterTipo)
      if (rFilterEstado)    params.set('estado',    rFilterEstado)
      if (rFilterPrioridad) params.set('prioridad', rFilterPrioridad)
      if (rSearch)          params.set('search',    rSearch)
      const data = await apiFetch<Reporte[]>(`/reportes/list/?${params}`)
      setReportes(data)
    } catch { /* silencioso */ }
    finally { setReportesLoading(false) }
  }, [apiFetch, rFilterTipo, rFilterEstado, rFilterPrioridad, rSearch])

  const handleUpdateReporte = async (id: number, campo: 'estado' | 'prioridad', valor: string) => {
    try {
      const updated = await apiFetch<{ success: boolean; reporte: Reporte }>(
        `/reportes/${id}/`, { method: 'PATCH', body: JSON.stringify({ [campo]: valor }) }
      )
      setReportes(rs => rs.map(r => r.id === id ? updated.reporte : r))
    } catch { /* silencioso */ }
  }

  useEffect(() => { fetchReportes() }, [fetchReportes])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (lightboxSrc) { setLightboxSrc(null); return }
      if (selectedReporte) setSelectedReporte(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedReporte, lightboxSrc])

  return (
    <DashboardLayout>
      <div className="flex items-center gap-2 mb-6">
        <Flag size={20} className="text-brand-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reportes</h1>
          <p className="text-xs text-slate-400 mt-0.5">Administración</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Filtros */}
        <div className="card">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por usuario o descripción…"
                value={rSearch}
                onChange={e => setRSearch(e.target.value)}
                className="input-field pl-8 text-sm"
              />
            </div>
            {([
              { value: rFilterTipo,      onChange: setRFilterTipo,      label: 'Tipo',      opts: [['','Todos'],['BUG','Bug'],['ERROR','Error'],['SOLICITUD','Solicitud']] },
              { value: rFilterEstado,    onChange: setRFilterEstado,    label: 'Estado',    opts: [['','Todos'],['PENDIENTE','Pendiente'],['EN_CURSO','En curso'],['ATENDIDA','Atendida']] },
              { value: rFilterPrioridad, onChange: setRFilterPrioridad, label: 'Prioridad', opts: [['','Todas'],['CRITICA','Crítica'],['ALTA','Alta'],['MEDIA','Media'],['BAJA','Baja']] },
            ] as const).map(({ value, onChange, label, opts }) => (
              <div key={label} className="relative">
                <select
                  value={value}
                  onChange={e => (onChange as (v: string) => void)(e.target.value)}
                  className="input-field pr-8 text-sm appearance-none"
                >
                  {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            ))}
          </div>
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
          {reportesLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Cargando reportes…</div>
          ) : reportes.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
              <Inbox size={28} />
              <p className="text-sm">Sin reportes</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Descripción</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Prioridad</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Fecha</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportes.map(r => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedReporte(r)}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800 text-xs">{r.user.full_name || r.user.username}</p>
                      <p className="text-[10px] text-slate-400">@{r.user.username}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        r.tipo === 'BUG'       ? 'bg-red-100 text-red-700' :
                        r.tipo === 'ERROR'     ? 'bg-amber-100 text-amber-700' :
                                                 'bg-blue-100 text-blue-700'
                      }`}>
                        {r.tipo}
                      </span>
                      {r.subtipo && <p className="text-[10px] text-slate-400 mt-0.5">{r.subtipo.replace(/_/g,' ')}</p>}
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell max-w-xs">
                      <p className="text-xs text-slate-600 line-clamp-2">{r.descripcion}</p>
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <select
                          value={r.estado}
                          onChange={e => handleUpdateReporte(r.id, 'estado', e.target.value as ReporteEstado)}
                          className={`text-[11px] font-semibold pl-2.5 pr-6 py-1 rounded-full border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                            r.estado === 'PENDIENTE' ? 'bg-slate-100 text-slate-600 border-slate-300 focus:ring-slate-400' :
                            r.estado === 'EN_CURSO'  ? 'bg-amber-50 text-amber-700 border-amber-300 focus:ring-amber-400' :
                                                       'bg-emerald-50 text-emerald-700 border-emerald-300 focus:ring-emerald-400'
                          }`}
                        >
                          <option value="PENDIENTE">● Pendiente</option>
                          <option value="EN_CURSO">● En curso</option>
                          <option value="ATENDIDA">● Atendida</option>
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                      </div>
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <select
                          value={r.prioridad}
                          onChange={e => handleUpdateReporte(r.id, 'prioridad', e.target.value as ReportePrioridad)}
                          className={`text-[11px] font-semibold pl-2.5 pr-6 py-1 rounded-full border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                            r.prioridad === 'CRITICA' ? 'bg-red-50 text-red-700 border-red-300 focus:ring-red-400' :
                            r.prioridad === 'ALTA'    ? 'bg-orange-50 text-orange-700 border-orange-300 focus:ring-orange-400' :
                            r.prioridad === 'MEDIA'   ? 'bg-amber-50 text-amber-700 border-amber-300 focus:ring-amber-400' :
                                                        'bg-slate-100 text-slate-500 border-slate-300 focus:ring-slate-400'
                          }`}
                        >
                          <option value="CRITICA">🔴 Crítica</option>
                          <option value="ALTA">🟠 Alta</option>
                          <option value="MEDIA">🟡 Media</option>
                          <option value="BAJA">⚪ Baja</option>
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell text-xs text-slate-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('es-BO', { day:'2-digit', month:'short', year:'2-digit' })}
                      <br />
                      <span className="text-[10px]">{new Date(r.created_at).toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit' })}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <ExternalLink size={13} className="text-slate-300 group-hover:text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {reportes.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
              {reportes.length} reporte{reportes.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Modal detalle */}
      {selectedReporte && (() => {
        const r = selectedReporte
        const ctx = r.context as Record<string, unknown> | null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
               onClick={() => setSelectedReporte(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                 onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    r.tipo === 'BUG'   ? 'bg-red-100 text-red-700' :
                    r.tipo === 'ERROR' ? 'bg-amber-100 text-amber-700' :
                                         'bg-blue-100 text-blue-700'
                  }`}>{r.tipo}</span>
                  <span className="text-sm text-slate-500">{r.subtipo?.replace(/_/g,' ')}</span>
                </div>
                <button onClick={() => setSelectedReporte(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.user.full_name || r.user.username}</p>
                    <p className="text-xs text-slate-400">@{r.user.username}</p>
                  </div>
                  <p className="text-xs text-slate-400 text-right">
                    {new Date(r.created_at).toLocaleDateString('es-BO', { day:'2-digit', month:'long', year:'numeric' })}
                    <br />
                    {new Date(r.created_at).toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit' })}
                  </p>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5">Estado</p>
                    <div className="relative">
                      <select
                        value={r.estado}
                        onChange={e => {
                          handleUpdateReporte(r.id, 'estado', e.target.value as ReporteEstado)
                          setSelectedReporte({ ...r, estado: e.target.value as ReporteEstado })
                        }}
                        className={`w-full text-xs font-semibold pl-3 pr-8 py-2 rounded-xl border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                          r.estado === 'PENDIENTE' ? 'bg-slate-100 text-slate-600 border-slate-300 focus:ring-slate-400' :
                          r.estado === 'EN_CURSO'  ? 'bg-amber-50 text-amber-700 border-amber-300 focus:ring-amber-400' :
                                                     'bg-emerald-50 text-emerald-700 border-emerald-300 focus:ring-emerald-400'
                        }`}
                      >
                        <option value="PENDIENTE">● Pendiente</option>
                        <option value="EN_CURSO">● En curso</option>
                        <option value="ATENDIDA">● Atendida</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5">Prioridad</p>
                    <div className="relative">
                      <select
                        value={r.prioridad}
                        onChange={e => {
                          handleUpdateReporte(r.id, 'prioridad', e.target.value as ReportePrioridad)
                          setSelectedReporte({ ...r, prioridad: e.target.value as ReportePrioridad })
                        }}
                        className={`w-full text-xs font-semibold pl-3 pr-8 py-2 rounded-xl border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                          r.prioridad === 'CRITICA' ? 'bg-red-50 text-red-700 border-red-300 focus:ring-red-400' :
                          r.prioridad === 'ALTA'    ? 'bg-orange-50 text-orange-700 border-orange-300 focus:ring-orange-400' :
                          r.prioridad === 'MEDIA'   ? 'bg-amber-50 text-amber-700 border-amber-300 focus:ring-amber-400' :
                                                      'bg-slate-100 text-slate-500 border-slate-300 focus:ring-slate-400'
                        }`}
                      >
                        <option value="CRITICA">🔴 Crítica</option>
                        <option value="ALTA">🟠 Alta</option>
                        <option value="MEDIA">🟡 Media</option>
                        <option value="BAJA">⚪ Baja</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5">Descripción</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3 leading-relaxed">{r.descripcion}</p>
                </div>

                {ctx && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Contexto capturado</p>
                    <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-2">
                      {ctx.dashboard != null && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Monitor size={12} className="text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-500 w-20 shrink-0">Dashboard</span>
                          <span className="font-semibold">{String(ctx.dashboard)}</span>
                        </div>
                      )}
                      {ctx.url != null && (
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <Globe size={12} className="text-slate-400 shrink-0 mt-0.5" />
                          <span className="font-medium text-slate-500 w-20 shrink-0">URL</span>
                          <span className="break-all text-brand-600">{String(ctx.url)}</span>
                        </div>
                      )}
                      {ctx.timestamp != null && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Calendar size={12} className="text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-500 w-20 shrink-0">Timestamp</span>
                          <span>{new Date(String(ctx.timestamp)).toLocaleString('es-BO')}</span>
                        </div>
                      )}
                      {ctx.viewport != null && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Monitor size={12} className="text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-500 w-20 shrink-0">Pantalla</span>
                          <span>{String(ctx.viewport)}</span>
                        </div>
                      )}
                      {ctx.userAgent != null && (
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <Globe size={12} className="text-slate-400 shrink-0 mt-0.5" />
                          <span className="font-medium text-slate-500 w-20 shrink-0">Agente</span>
                          <span className="break-all text-slate-400 text-[10px]">{String(ctx.userAgent)}</span>
                        </div>
                      )}
                      {ctx.filtros != null && Object.keys(ctx.filtros as object).length > 0 && (
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <Monitor size={12} className="text-slate-400 shrink-0 mt-0.5" />
                          <span className="font-medium text-slate-500 w-20 shrink-0">Filtros</span>
                          <span className="break-all text-[10px] font-mono text-slate-500">{JSON.stringify(ctx.filtros)}</span>
                        </div>
                      )}
                      {Array.isArray(ctx.errores_consola) && ctx.errores_consola.length > 0 && (
                        <div className="mt-1">
                          <p className="text-[10px] font-medium text-red-500 mb-1">Errores de consola capturados:</p>
                          <div className="space-y-1">
                            {(ctx.errores_consola as string[]).map((e, i) => (
                              <p key={i} className="text-[10px] font-mono text-red-400 bg-red-50 rounded px-2 py-1 break-all">{e}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {ctx?.screenshot != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Captura de pantalla</p>
                    <div
                      className="relative group cursor-zoom-in"
                      onClick={() => setLightboxSrc(String(ctx.screenshot))}
                    >
                      <img src={String(ctx.screenshot)} alt="Captura" className="w-full rounded-xl border border-slate-200" />
                      <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-medium text-white bg-black/60 px-2.5 py-1 rounded-lg">
                          Ver completa
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
      {/* Lightbox de captura de pantalla */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Captura ampliada"
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </DashboardLayout>
  )
}
