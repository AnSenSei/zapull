import Image from 'next/image'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* Hero Section */}
      <section className="pt-32 pb-16 text-center">
        <div className="container mx-auto px-4">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
            About Zapull
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Building the future of digital TCG collecting with a passionate team of collectors and technologists.
          </p>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-white">Meet Our Team</h2>
          <div className="max-w-md mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/20 rounded-xl p-8 text-center hover:transform hover:scale-105 transition-all duration-300">
              <div className="mb-6">
                <Image
                  src="/first_landing_page/team.jpg"
                  alt="Andy Qi - Founder & CTO"
                  width={150}
                  height={150}
                  className="rounded-full mx-auto object-cover border-4 border-purple-500/30"
                />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Andy Qi</h3>
              <p className="text-purple-400 text-lg mb-4">Founder & CTO</p>
              <p className="text-gray-300 leading-relaxed">
                Full-stack engineer with expertise in secure payment systems and marketplaces. 
                Background in building scalable platforms for digital commerce. 
                Focused on creating seamless user experiences.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Development Stage Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-8">Product Development Stage</h2>
          <span className="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white font-bold rounded-full mb-6">
            BETA LAUNCH
          </span>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-12">
            Zapull is currently in Beta phase, refining features and expanding our collector community.
          </p>
          
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="bg-gray-800/30 border border-gray-600/30 rounded-lg p-6 text-left">
              <h3 className="text-xl font-bold text-white mb-2">May - August 2025 - Alpha Development</h3>
              <p className="text-gray-300">Built core platform features and infrastructure</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6 text-left">
              <h3 className="text-xl font-bold text-white mb-2">September 2025 - Beta Launch (Current)</h3>
              <p className="text-gray-300">Beta testing with select collectors and feature refinement</p>
            </div>
            <div className="bg-gray-800/30 border border-gray-600/30 rounded-lg p-6 text-left">
              <h3 className="text-xl font-bold text-white mb-2">Q1 2026 - Public Launch</h3>
              <p className="text-gray-300">Full platform launch open to all collectors</p>
            </div>
          </div>
          
          <div className="mt-12 text-blue-400 font-semibold">
            <p className="mb-2">⚡ Beta features live and testing</p>
            <p className="mb-2">⚡ Expanding collector community</p>
            <p>⚡ Public launch coming Q1 2026</p>
          </div>
        </div>
      </section>

      {/* Company Details Section */}
      <section className="py-20 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-white">Company Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/20 rounded-xl p-8 text-center">
              <div className="text-4xl mb-4">📅</div>
              <h3 className="text-xl font-bold text-white mb-2">Founded</h3>
              <p className="text-purple-400 font-semibold mb-2">May 2025</p>
              <p className="text-gray-300 text-sm">Incorporated as Zapull Inc.</p>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/20 rounded-xl p-8 text-center">
              <div className="text-4xl mb-4">📍</div>
              <h3 className="text-xl font-bold text-white mb-2">Headquarters</h3>
              <p className="text-purple-400 font-semibold mb-2">Columbus, OH</p>
              <p className="text-gray-300 text-sm">Columbus, Ohio<br />United States</p>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/20 rounded-xl p-8 text-center">
              <div className="text-4xl mb-4">✉️</div>
              <h3 className="text-xl font-bold text-white mb-2">Contact</h3>
              <a href="mailto:support@zapull.fun" className="text-purple-400 font-semibold hover:text-purple-300 transition-colors">
                support@zapull.fun
              </a>
              <p className="text-gray-300 text-sm mt-2">For all inquiries and support</p>
            </div>
          </div>
          
          <div className="mt-16 max-w-4xl mx-auto bg-gray-800/30 backdrop-blur-sm border border-purple-500/20 rounded-xl p-8 text-center">
            <h3 className="text-2xl font-bold text-white mb-6">Our Mission</h3>
            <p className="text-lg text-gray-300 leading-relaxed">
              We&apos;re building Zapull to solve the biggest pain points in TCG collecting: 
              storage limitations, dead inventory, and inefficient trading. Our platform 
              combines the thrill of opening physical packs with the convenience of 
              digital management, creating a seamless experience for modern collectors.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
