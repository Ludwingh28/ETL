import { useState, useEffect, useRef } from 'react'
import { Flag, X, ChevronDown, Send, CheckCircle, EyeOff, Eye, Camera, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getActiveFilters } from '../utils/filterStore'
import type { ReporteTipo } from '../types'

// ── Catálogos ──────────────────────────────────────────────────────────────

const SUBTIPOS: Record<ReporteTipo, { value: string; label: string }[]> = {
  BUG: [
    { value: 'BUG_GENERAL', label: 'Bug general' },
  ],
  ERROR: [
    { value: 'ERROR_PERMISOS',        label: 'Error de permisos' },
    { value: 'ERROR_CALCULO',         label: 'Error de cálculo' },
    { value: 'ERROR_MEDIDA',          label: 'Error de medida' },
    { value: 'ERROR_TIPO_VARIABLE',   label: 'Error de tipo de variable' },
    { value: 'ERROR_VARIACION_MONTO', label: 'Variación de monto' },
  ],
  SOLICITUD: [
    { value: 'SOL_NUEVO_CALCULO',   label: 'Solicitud de nuevo cálculo' },
    { value: 'SOL_AFINACION',       label: 'Afinación de medida / cálculo' },
    { value: 'SOL_NUEVO_DASHBOARD', label: 'Solicitud de nuevo dashboard' },
  ],
}

const TIPO_LABEL: Record<ReporteTipo, string> = {
  BUG:       'Bug',
  ERROR:     'Error',
  SOLICITUD: 'Solicitud',
}

const TIPO_COLOR: Record<ReporteTipo, string> = {
  BUG:       'bg-red-100 text-red-700 border-red-200',
  ERROR:     'bg-amber-100 text-amber-700 border-amber-200',
  SOLICITUD: 'bg-blue-100 text-blue-700 border-blue-200',
}

// ── Buffer de errores de consola (instalado una sola vez al cargar el módulo) ─

const _consoleErrors: string[] = []
const MAX_ERRORS = 10

const origConsoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
  _consoleErrors.push(msg)
  if (_consoleErrors.length > MAX_ERRORS) _consoleErrors.shift()
  origConsoleError(...args)
}
window.addEventListener('error', (e) => {
  const msg = `[JS Error] ${e.message} @ ${e.filename}:${e.lineno}`
  _consoleErrors.push(msg)
  if (_consoleErrors.length > MAX_ERRORS) _consoleErrors.shift()
})
window.addEventListener('unhandledrejection', (e) => {
  const msg = `[Unhandled Promise] ${String(e.reason)}`
  _consoleErrors.push(msg)
  if (_consoleErrors.length > MAX_ERRORS) _consoleErrors.shift()
})

// ── sessionStorage key ────────────────────────────────────────────────────

const HIDDEN_KEY = 'reportBtn_hidden'

// ── Captura de contexto ───────────────────────────────────────────────────

function findSelectLabel(sel: HTMLSelectElement, idx: number): string {
  // 1. <label for="id"> explícito
  if (sel.id) {
    const t = document.querySelector<HTMLLabelElement>(`label[for="${sel.id}"]`)?.textContent?.trim()
    if (t) return t
  }
  // 2. aria-label
  const aria = sel.getAttribute('aria-label')?.trim()
  if (aria) return aria

  // 3. Buscar hermano previo corto (< 40 chars) que no contenga otro select
  let el: Element | null = sel.parentElement
  for (let d = 0; d < 4; d++) {
    if (!el) break
    let sib: Element | null = el.previousElementSibling
    while (sib) {
      if (!sib.querySelector('select') && !sib.querySelector('input[type="text"]')) {
        const t = sib.textContent?.trim() ?? ''
        if (t.length > 0 && t.length < 40) return t
      }
      sib = sib.previousElementSibling
    }
    el = el.parentElement
  }

  // 4. Primera opción como pista (ej: "Todos los canales" → clave descriptiva)
  const first = sel.options[0]?.text?.trim()
  if (first && first.length < 35) return first

  return `filtro_${idx + 1}`
}

function capturePageFilters(): Record<string, string> {
  const out: Record<string, string> = {}
  let idx = 0
  document.querySelectorAll<HTMLSelectElement>('select').forEach(sel => {
    if (sel.closest('#report-panel')) return
    const value = sel.options[sel.selectedIndex]?.text?.trim()
    if (!value) return
    const label = findSelectLabel(sel, idx++)
    out[label] = value
  })
  return out
}

async function captureFullContext(): Promise<Record<string, unknown>> {
  // Combinar: DOM (genérico para todos los dashboards) + filterStore (si algún dashboard lo usa)
  const domFilters   = capturePageFilters()
  const storeFilters = getActiveFilters()
  const filtros = { ...domFilters, ...storeFilters }

  return {
    url:             window.location.href,
    dashboard:       window.location.pathname.replace('/dashboard/', '').replace(/\//g, ''),
    timestamp:       new Date().toISOString(),
    userAgent:       navigator.userAgent,
    viewport:        `${window.innerWidth}x${window.innerHeight}`,
    filtros:         Object.keys(filtros).length > 0 ? filtros : undefined,
    errores_consola: _consoleErrors.length > 0 ? [..._consoleErrors] : undefined,
  }
}

async function takeScreenshot(): Promise<string | null> {
  try {
    // Intentar primero con html-to-image (silencioso, sin UI extra)
    const { toJpeg } = await import('html-to-image')
    const dataUrl = await toJpeg(document.body, {
      quality: 0.85,
      pixelRatio: 0.75,
      filter: el => el.id !== 'report-panel',
    })
    // Verificar que no sea ruido de canvas bloqueado por extensión de privacidad
    // (si el canvas fue bloqueado, toJpeg igual devuelve un dataUrl pero con píxeles aleatorios)
    if (dataUrl && dataUrl.length > 5000) return dataUrl
    return null
  } catch (err) {
    console.warn('[ReportButton] screenshot failed:', err)
    return null
  }
}

// ── Componente ─────────────────────────────────────────────────────────────

export default function ReportButton() {
  const { apiFetch } = useAuth()

  const [hidden,     setHidden]     = useState(() => sessionStorage.getItem(HIDDEN_KEY) === '1')
  const [expanded,   setExpanded]   = useState(false)
  const [tipo,       setTipo]       = useState<ReporteTipo>('BUG')
  const [subtipo,    setSubtipo]    = useState(SUBTIPOS.BUG[0].value)
  const [desc,       setDesc]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [sent,       setSent]       = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [confirm,    setConfirm]    = useState(false)
  const [capturing,    setCapturing]    = useState(false)
  const [screenshot,   setScreenshot]   = useState<string | null>(null)
  const [shotAttempted, setShotAttempted] = useState(false)

  const textRef = useRef<HTMLTextAreaElement>(null)

  // Ctrl+Shift+F → toggle sin recargar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setHidden(h => {
          const next = !h
          next ? sessionStorage.setItem(HIDDEN_KEY, '1') : sessionStorage.removeItem(HIDDEN_KEY)
          return next
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ESC → cerrar panel
  useEffect(() => {
    if (!expanded) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded])

  // Resetear subtipo al cambiar tipo
  useEffect(() => { setSubtipo(SUBTIPOS[tipo][0].value) }, [tipo])

  // Focus textarea al abrir panel
  useEffect(() => {
    if (expanded) setTimeout(() => textRef.current?.focus(), 100)
  }, [expanded])

  const hide = () => {
    sessionStorage.setItem(HIDDEN_KEY, '1')
    setHidden(true)
    setExpanded(false)
  }

  const doScreenshot = async () => {
    setCapturing(true)
    setShotAttempted(false)
    const shot = await takeScreenshot()
    setScreenshot(shot)
    setShotAttempted(true)
    setCapturing(false)
  }

  const handleOpen = async () => {
    setSent(false)
    setError(null)
    setDesc('')
    setConfirm(false)
    setScreenshot(null)
    setShotAttempted(false)
    setCapturing(true)
    const shot = await takeScreenshot()
    setScreenshot(shot)
    setShotAttempted(true)
    setCapturing(false)
    setExpanded(true)
  }

  const handleSubmit = () => {
    if (!desc.trim()) { setError('Por favor describe el problema o solicitud.'); return }
    setConfirm(true)
  }

  const handleConfirm = async () => {
    setSending(true)
    setError(null)
    try {
      const ctx = await captureFullContext()
      if (screenshot) ctx.screenshot = screenshot
      await apiFetch('/reportes/', {
        method: 'POST',
        body: JSON.stringify({ tipo, subtipo, descripcion: desc.trim(), context: ctx }),
      })
      setSent(true)
      setConfirm(false)
      setDesc('')
      setTimeout(() => { setSent(false); setExpanded(false) }, 2500)
    } catch {
      setError('No se pudo enviar el reporte. Intenta de nuevo.')
      setConfirm(false)
    } finally {
      setSending(false)
    }
  }

  // Botón mínimo cuando está oculto
  if (hidden) {
    return (
      <button
        onClick={() => { sessionStorage.removeItem(HIDDEN_KEY); setHidden(false) }}
        title="Mostrar botón de reportes (Ctrl+Shift+F)"
        className="fixed bottom-5 right-5 z-50 w-5 h-5 rounded-full bg-slate-600/25 hover:bg-slate-600/60 flex items-center justify-center transition-all duration-200 group"
      >
        <Eye size={9} className="text-white/40 group-hover:text-white transition-colors" />
      </button>
    )
  }

  return (
    <div id="report-panel" className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">

      {/* Panel expandido */}
      {expanded && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <Flag size={14} className="text-white" />
              <span className="text-sm font-semibold text-white">Reportar</span>
              {capturing && <Loader2 size={12} className="text-slate-400 animate-spin ml-1" />}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={hide} title="Ocultar (Ctrl+Shift+F para volver)"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                <EyeOff size={13} />
              </button>
              <button onClick={() => setExpanded(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">

            {/* Éxito */}
            {sent && (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle size={32} className="text-emerald-500" />
                <p className="text-sm font-medium text-slate-700">¡Reporte enviado!</p>
                <p className="text-xs text-slate-400">Gracias por tu reporte.</p>
              </div>
            )}

            {/* Confirmación */}
            {!sent && confirm && (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">¿Confirmas el envío del reporte?</p>
                <div className={`text-xs px-2 py-1.5 rounded-lg border ${TIPO_COLOR[tipo]}`}>
                  <span className="font-semibold">{TIPO_LABEL[tipo]}</span>
                  {subtipo && <span className="ml-1 opacity-70">· {SUBTIPOS[tipo].find(s => s.value === subtipo)?.label}</span>}
                </div>
                <p className="text-xs text-slate-500 line-clamp-3">{desc}</p>
                {screenshot && (
                  <div className="rounded-lg overflow-hidden border border-slate-100">
                    <img src={screenshot} alt="Captura" className="w-full" />
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 px-2 py-1">
                      <Camera size={9} /> Captura incluida
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setConfirm(false)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                    Volver
                  </button>
                  <button onClick={handleConfirm} disabled={sending}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                    {sending ? 'Enviando…' : <><Send size={11} /> Enviar</>}
                  </button>
                </div>
              </div>
            )}

            {/* Formulario */}
            {!sent && !confirm && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo</label>
                  <div className="flex gap-1.5">
                    {(['BUG', 'ERROR', 'SOLICITUD'] as ReporteTipo[]).map(t => (
                      <button key={t} onClick={() => setTipo(t)}
                        className={`flex-1 py-1 text-xs font-medium rounded-lg border transition-colors ${
                          tipo === t ? TIPO_COLOR[t] : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}>
                        {TIPO_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Subtipo</label>
                  <div className="relative">
                    <select value={subtipo} onChange={e => setSubtipo(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 pr-7 appearance-none bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400">
                      {SUBTIPOS[tipo].map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Descripción</label>
                  <textarea ref={textRef} value={desc}
                    onChange={e => { setDesc(e.target.value); setError(null) }}
                    placeholder="Describe el problema o solicitud con el mayor detalle posible…"
                    rows={4}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400" />
                </div>

                {screenshot ? (
                  <div className="rounded-lg overflow-hidden border border-slate-100">
                    <img src={screenshot} alt="Captura" className="w-full opacity-80" />
                    <div className="flex items-center justify-between px-2 py-1">
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Camera size={9} /> Captura incluida
                      </p>
                      <button onClick={() => setScreenshot(null)}
                        className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">
                        Eliminar
                      </button>
                    </div>
                  </div>
                ) : capturing ? (
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Loader2 size={9} className="animate-spin" /> Capturando pantalla…
                  </p>
                ) : shotAttempted ? (
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">Sin captura de pantalla</p>
                    <button onClick={doScreenshot}
                      className="text-[10px] text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors">
                      <Camera size={9} /> Reintentar
                    </button>
                  </div>
                ) : null}

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Se captura: dashboard, URL, filtros activos, errores de consola y captura de pantalla.
                  <br />
                  <kbd className="bg-slate-100 px-1 rounded text-slate-500">Ctrl+Shift+F</kbd> para ocultar/mostrar este botón.
                </p>
              </>
            )}
          </div>

          {/* Footer fijo — botón Continuar siempre visible */}
          {!sent && !confirm && (
            <div className="shrink-0 px-4 pb-4 pt-2 border-t border-slate-100 bg-white">
              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
              <button onClick={handleSubmit}
                className="w-full py-2 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5">
                <Send size={12} /> Continuar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Botón flotante */}
      {!expanded && (
        <button onClick={handleOpen} title="Reportar (Ctrl+Shift+F para ocultar/mostrar)"
          className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 shadow-lg flex items-center justify-center transition-colors group">
          <Flag size={16} className="text-slate-300 group-hover:text-white transition-colors" />
        </button>
      )}
    </div>
  )
}
