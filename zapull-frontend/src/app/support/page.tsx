'use client'


import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function SupportPage() {
  const router = useRouter()
  return (
    <div className="max-w-6xl mx-auto text-white cursor-default p-4">
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-gray-300 hover:text-white px-3 py-2 bg-[#1E1F35] rounded-lg border border-gray-700"
          aria-label="Go back"
        >
          <span>←</span>
          <span>Back</span>
        </button>
      </div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Need help? We got your back!</h1>
        <p className="text-gray-400">Get in touch with us or check out our FAQ.</p>
      </div>

      <div className="flex flex-col gap-6 items-center">
        {/* 常见问题卡片 */}
        <Link href="/faq" className="w-2/3">
          <div className="bg-[#1E2142] rounded-lg p-6 flex flex-col w-full hover:bg-[#252a56] transition-colors cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">? Frequently Asked Questions</h2>
            <p className="text-gray-400 text-sm mb-4">Visit our pages where we answer the most frequently asked questions.</p>
          </div>
        </Link>

        {/* Discord服务器卡片 */}
        <Link href="https://discord.com" target="_blank" rel="noopener noreferrer" className="w-2/3">
          <div className="bg-[#1E2142] rounded-lg p-6 flex flex-col w-full hover:bg-[#252a56] transition-colors cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Discord Server</h2>
            <p className="text-gray-400 text-sm mb-4">Join our discord and get help from our awesome community or open a ticket.</p>
          </div>
        </Link>

        {/* Customer Support Email Card */}
        <Link href="mailto:support@zapull.fun" className="w-2/3">
          <div className="bg-[#1E2142] rounded-lg p-6 flex flex-col w-full hover:bg-[#252a56] transition-colors cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Customer Support</h2>
            <p className="text-gray-400 text-sm mb-4">Email our support team at support@zapull.fun for assistance with any questions or concerns.</p>
          </div>
        </Link>
      </div>
    </div>
  )
}