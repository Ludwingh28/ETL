import { useState, useEffect, useRef } from 'react'
import { Download, CheckCircle, X } from 'lucide-react'

type DlPhase = 'downloading' | 'done'
interface DlState { phase: DlPhase; name: string }

export default function DownloadToast() {
  const [dl, setDl] = useState<DlState | null>(null)
  const blobUrl = useRef<string | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const onStart = (e: Event) => {
      const { name } = (e as CustomEvent).detail as { name: string }
      clearTimeout(dismissTimer.current)
      if (blobUrl.current) { URL.revokeObjectURL(blobUrl.current); blobUrl.current = null }
      setDl({ phase: 'downloading', name })
    }

    const onDone = (e: Event) => {
      const { url, name } = (e as CustomEvent).detail as { url: string; name: string }
      blobUrl.current = url
      setDl({ phase: 'done', name })
      const a = document.createElement('a')
      a.href = url; a.download = name
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      dismissTimer.current = setTimeout(dismiss, 8000)
    }

    const onError = () => setDl(null)

    window.addEventListener('dl:start', onStart)
    window.addEventListener('dl:done', onDone)
    window.addEventListener('dl:error', onError)
    return () => {
      window.removeEventListener('dl:start', onStart)
      window.removeEventListener('dl:done', onDone)
      window.removeEventListener('dl:error', onError)
    }
  }, [])

  function dismiss() {
    clearTimeout(dismissTimer.current)
    setDl(null)
    if (blobUrl.current) { URL.revokeObjectURL(blobUrl.current); blobUrl.current = null }
  }

  if (!dl) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-fade-in">
      {dl.phase === 'downloading' ? (
        <div className="flex items-start gap-3 bg-white border border-amber-200 shadow-xl rounded-xl px-4 py-3.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
            <Download size={15} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Descarga en proceso</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              El archivo se descargará automáticamente cuando esté listo.
              Podés seguir usando el sistema —&nbsp;
              <span className="font-medium text-amber-700">no cierre esta pestaña ni el navegador.</span>
            </p>
          </div>
          <button onClick={dismiss} className="text-slate-300 hover:text-slate-500 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-white border border-green-200 shadow-xl rounded-xl px-4 py-3.5">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle size={15} className="text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Descarga completada</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{dl.name}</p>
          </div>
          <button onClick={dismiss} className="text-slate-300 hover:text-slate-500 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
