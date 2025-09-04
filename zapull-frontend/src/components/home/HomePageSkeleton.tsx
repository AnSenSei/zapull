export const HomePageSkeleton = {
  WinnersSection: () => (
    <section className="space-y-2 sm:space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-16 h-16 bg-[#2A2B3D] rounded animate-pulse" />
          <div className="h-6 w-24 bg-[#2A2B3D] rounded animate-pulse" />
        </div>
      </div>
      <div className="relative overflow-hidden">
        <div className="flex gap-2 sm:gap-4">
          {Array(8).fill(null).map((_, i) => (
            <div key={i} className="bg-[#2A2B3D] rounded-lg overflow-hidden animate-pulse flex-shrink-0 w-[100px] sm:w-[120px]">
              <div className="h-8 bg-[#3F3F5F]" />
              <div className="aspect-square bg-[#3F3F5F]" />
              <div className="p-2">
                <div className="h-4 bg-[#3F3F5F] rounded w-full mb-2" />
                <div className="h-4 bg-[#3F3F5F] rounded w-16 mx-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  ),

  PacksSection: () => (
    <section className="space-y-4">
      <div className="h-16 bg-[#1A1B2E]/95 rounded animate-pulse" />
      <div className="h-8 bg-[#2A2B3D] rounded w-48 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 gap-2 sm:gap-4">
        {Array(12).fill(null).map((_, i) => (
          <div key={i} className="bg-[#2A2B3D] rounded-lg overflow-hidden animate-pulse">
            <div className="aspect-square bg-[#3F3F5F]" />
            <div className="p-2">
              <div className="h-4 bg-[#3F3F5F] rounded w-full mb-2" />
              <div className="h-8 bg-[#3F3F5F] rounded" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default HomePageSkeleton
