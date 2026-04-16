import type { ReactNode } from 'react'
import Navbar from './Navbar'
import WhatsNewModal from './WhatsNewModal'
import { CURRENT_VERSION } from '../constants/changelog'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar />
      <main className="pt-16 flex-1">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      <footer className="mt-auto py-3 border-t border-slate-200 bg-white">
        <p className="text-center text-[11px] text-slate-400 select-none">
          Sistema BI Cruzimex &nbsp;·&nbsp; v{CURRENT_VERSION} &nbsp;·&nbsp; &copy; {new Date().getFullYear()}
        </p>
      </footer>

      <WhatsNewModal />
    </div>
  )
}
