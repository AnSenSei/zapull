'use client'

interface ActivePackFiltersProps {
  searchQuery: string
  minPrice: number | null
  maxPrice: number | null
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onClearSearch: () => void
  onClearPriceRange: () => void
  onClearSort: () => void
}

export default function ActivePackFilters({
  searchQuery,
  minPrice,
  maxPrice,
  sortBy,
  sortOrder,
  onClearSearch,
  onClearPriceRange,
  onClearSort
}: ActivePackFiltersProps) {
  const hasActiveFilters = searchQuery || minPrice !== null || maxPrice !== null || sortBy !== 'popularity' || sortOrder !== 'desc'

  if (!hasActiveFilters) return null

  const getSortLabel = () => {
    const labels: Record<string, string> = {
      'popularity': 'Default',
      'price': 'Price',
      'win_rate': 'Win Rate',
      'max_win': 'Max Win',
      'min_win': 'Min Win'
    }
    const orderLabel = sortOrder === 'desc' ? 'High to Low' : 'Low to High'
    return `${labels[sortBy] || sortBy}: ${orderLabel}`
  }

  const getPriceRangeLabel = () => {
    if (minPrice !== null && maxPrice !== null) {
      return `$${minPrice} - $${maxPrice}`
    } else if (minPrice !== null) {
      return `Over $${minPrice}`
    } else if (maxPrice !== null) {
      return `Under $${maxPrice}`
    }
    return ''
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="text-sm text-gray-400">Active filters:</span>
      
      {searchQuery && (
        <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#8B5CF6]/20 text-white text-sm rounded-full">
          <span>Search: "{searchQuery}"</span>
          <button
            onClick={onClearSearch}
            className="ml-1 hover:text-[#8B5CF6] transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {(minPrice !== null || maxPrice !== null) && (
        <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#8B5CF6]/20 text-white text-sm rounded-full">
          <span>Price: {getPriceRangeLabel()}</span>
          <button
            onClick={onClearPriceRange}
            className="ml-1 hover:text-[#8B5CF6] transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {(sortBy !== 'popularity' || sortOrder !== 'desc') && (
        <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#8B5CF6]/20 text-white text-sm rounded-full">
          <span>Sort: {getSortLabel()}</span>
          <button
            onClick={onClearSort}
            className="ml-1 hover:text-[#8B5CF6] transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}