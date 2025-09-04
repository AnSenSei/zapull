'use client'

interface ActiveFilter {
  key: string
  label: string
  value: string
  onClear: () => void
}

interface ActiveFiltersProps {
  filters: ActiveFilter[]
  onClearAll: () => void
  resultCount?: number
  className?: string
}

export default function ActiveFilters({ 
  filters, 
  onClearAll, 
  resultCount,
  className = '' 
}: ActiveFiltersProps) {
  if (filters.length === 0) return null

  return (
    <div className={`bg-[#1A1B2E]/50 rounded-lg p-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-400">Active Filters:</span>
        
        {filters.map((filter) => (
          <div
            key={filter.key}
            className="inline-flex items-center gap-1 bg-purple-600/20 border border-purple-500/50 rounded-full px-3 py-1 text-xs"
          >
            <span className="text-purple-300">{filter.label}:</span>
            <span className="text-white">{filter.value}</span>
            <button
              onClick={filter.onClear}
              className="ml-1 text-purple-300 hover:text-white"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        
        <button
          onClick={onClearAll}
          className="text-xs text-purple-400 hover:text-purple-300 underline"
        >
          Clear All
        </button>
        
        {resultCount !== undefined && (
          <span className="ml-auto text-sm text-gray-400">
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>
    </div>
  )
}