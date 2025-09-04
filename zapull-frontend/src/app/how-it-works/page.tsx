'use client'

import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'

export default function FirstLandingPage() {
  const { openRegisterModal } = useAuthStore()
  const router = useRouter()

  return (
    <div className="space-y-16">
      {/* Back Button */}
      <div className="pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/30 text-white text-sm hover:bg-white/10"
        >
          Back
        </button>
      </div>

      {/* Hero Section */}
      <section className="pt-6">
        <div>
          <h1
            className="text-2xl sm:text-3xl md:text-4xl font-bold text-center"
            style={{
              background: 'linear-gradient(135deg, #b794f6 0%, #9f7aea 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Experience the future of TCG collecting
          </h1>
        </div>
        <div className="mt-6 rounded-xl overflow-hidden w-full h-[200px] sm:h-[260px] md:h-[360px] lg:h-[480px]">
          <video autoPlay muted loop playsInline className="w-full h-full object-cover">
            <source src="/first_landing_page/纯动效.mp4" type="video/mp4" />
          </video>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="space-y-6">
        <h2
          className="text-2xl md:text-3xl font-extrabold text-center"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          How It Works
        </h2>
        <div className="mx-auto grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 max-w-[1400px]">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border-2 border-amber-500/80 overflow-hidden">
              <div className="relative w-full aspect-square">
                <Image src={`/first_landing_page/step${i}.png`} alt={`Step ${i}`} fill className="object-cover" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="space-y-8">
        <h2
          className="text-2xl md:text-3xl font-extrabold text-center"
          style={{
            background: 'linear-gradient(135deg, #BDA9FF 0%, #F4F1FF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Core Features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          <div className="p-6 rounded-xl border border-purple-400/30 bg-white/5">
            <div className="w-12 h-12 rounded-lg bg-purple-400/30 flex items-center justify-center mb-4 text-xl">🏆</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Achievement System</h3>
            <p className="text-gray-200">Unlock rewards and badges as you grow your collection. Complete challenges to earn exclusive perks and showcase your collector status.</p>
          </div>
          <div className="p-6 rounded-xl border border-purple-400/30 bg-white/5">
            <div className="w-12 h-12 rounded-lg bg-purple-400/30 flex items-center justify-center mb-4 text-xl">📦</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Free Shipping</h3>
            <p className="text-gray-200">Earn free shipping by reaching coins milestones. The more you collect and engage, the more you save on delivery costs.</p>
          </div>
          <div className="p-6 rounded-xl border border-purple-400/30 bg-white/5">
            <div className="w-12 h-12 rounded-lg bg-purple-400/30 flex items-center justify-center mb-4 text-xl">🛒</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Marketplace</h3>
            <p className="text-gray-200">Buy, sell, and trade cards with collectors worldwide. Set your prices, browse listings, and build your dream collection.</p>
          </div>
          <div className="p-6 rounded-xl border border-purple-400/30 bg-white/5">
            <div className="w-12 h-12 rounded-lg bg-purple-400/30 flex items-center justify-center mb-4 text-xl">🧪</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Fusion</h3>
            <p className="text-gray-200">Combine cards to craft stronger outcomes and unlock new possibilities through our fusion system.</p>
          </div>
        </div>
      </section>

      {/* About Zapull */}
      <section className="space-y-6">
        <h2
          className="text-2xl md:text-3xl font-semibold text-center"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 50%, #f59e0b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          About Zapull
        </h2>
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <p className="text-gray-200 font-semibold">At Zapull, we're building the ultimate ecosystem for modern collectors. We believe collecting should be thrilling, flexible, and rewarding – without the burden of bulk storage or dead-end pulls.</p>
          <p className="text-gray-300 text-sm">Our vision is simple: create a seamless digital-to-physical collecting experience where every card has value. Open packs digitally and receive only the cards you want shipped to your door. Earn free shipping by hitting coins milestones, sell unwanted cards back instantly for coins, or list them on our integrated marketplace to trade with fellow collectors.</p>
          <p className="text-gray-300 text-sm">We're more than a pack-opening platform – we're crafting the future of TCG collecting, where strategy meets excitement, and every collector controls their journey.</p>
          <p className="font-bold text-lg"><span className="text-emerald-400">Collect smarter.</span> <span className="text-blue-400">Trade freely.</span> <span className="text-amber-400">Build your legacy.</span></p>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="rounded-2xl text-center py-16" style={{ background: 'linear-gradient(135deg, rgba(189,169,255,0.15) 0%, rgba(244,241,255,0.10) 100%)' }}>
        <h2
          className="text-3xl font-extrabold mb-6"
          style={{
            background: 'linear-gradient(135deg, #BDA9FF 0%, #F4F1FF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Ready to Get Started?
        </h2>
        <button onClick={openRegisterModal} className="px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-lg font-semibold">Sign Up Now</button>
      </section>
    </div>
  )
}

