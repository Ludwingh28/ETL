// Global filter store — dashboards call setActiveFilters() on every filter change.
// ReportButton reads getActiveFilters() when the user opens a report.

let _filters: Record<string, unknown> = {}

export function setActiveFilters(filters: Record<string, unknown>): void {
  _filters = filters
}

export function getActiveFilters(): Record<string, unknown> {
  return _filters
}

export function clearActiveFilters(): void {
  _filters = {}
}
