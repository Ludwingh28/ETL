import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-red-200 shadow-lg p-8 max-w-md w-full text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Algo salió mal</h2>
            <p className="text-sm text-slate-500 mb-4">
              Ocurrió un error inesperado. Recargá la página para continuar.
            </p>
            <p className="text-xs font-mono text-red-600 bg-red-50 rounded-lg px-3 py-2 text-left break-all mb-5">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary w-full"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
