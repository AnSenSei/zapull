'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-[#1E1F2F] text-white py-10">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Legal Column */}
        <div className="space-y-4">
          <h3 className="text-white font-medium text-lg mb-4">Legal</h3>
          <ul className="space-y-3">
            <li>
              <Link href="/privacy/Privacy%20Policy.html" className="text-gray-400 hover:text-white text-sm">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/privacy/Purchase%20Terms.html" className="text-gray-400 hover:text-white text-sm">
                Purchase Terms
              </Link>
            </li>
            <li>
              <Link href="/privacy/Terms%20of%20Service(1).html" className="text-gray-400 hover:text-white text-sm">
                Terms of Service
              </Link>
            </li>
          </ul>
        </div>

        {/* Help Column */}
        <div className="space-y-4">
          <h3 className="text-white font-medium text-lg mb-4">Help</h3>
          <ul className="space-y-3">
            <li>
              <Link href="/faq" className="text-gray-400 hover:text-white text-sm">
                FAQ
              </Link>
            </li>
            <li>
              <Link href="/provably-fair" className="text-gray-400 hover:text-white text-sm">
                How does Provably Fair work?
              </Link>
            </li>
            <li>
              <Link href="/how-to-shipping" className="text-gray-400 hover:text-white text-sm">
                How does shipping work?
              </Link>
            </li>
          </ul>
        </div>

        {/* Customer Support Column */}
        <div className="space-y-4">
          <h3 className="text-white font-medium text-lg mb-4">Customer Support</h3>
          <p className="text-gray-400 text-sm">
            For any inquiries or assistance, send us an email at:
          </p>
          <a href="mailto:support@zapull.fun" className="text-blue-400 hover:underline text-sm">
            support@zapull.fun
          </a>
          <p className="text-gray-400 text-sm mt-3">
            We're here to help with any questions or concerns!
          </p>
        </div>
      </div>

      {/* Social Media and Copyright */}
      <div className="container mx-auto px-4 mt-8 pt-6 border-t border-gray-800">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex space-x-4 mb-4 md:mb-0">
            <Link href="https://www.instagram.com/zapulltcg/" aria-label="Instagram" target="_blank" rel="noopener noreferrer">
              <div className="bg-gray-700 p-2 rounded-full hover:bg-gray-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </div>
            </Link>
            <Link href="https://www.facebook.com/profile.php?id=61577744171512" aria-label="Facebook" target="_blank" rel="noopener noreferrer">
              <div className="bg-gray-700 p-2 rounded-full hover:bg-gray-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </div>
            </Link>
            <Link href="https://x.com/ZapullTCG" aria-label="X (Twitter)" target="_blank" rel="noopener noreferrer">
              <div className="bg-gray-700 p-2 rounded-full hover:bg-gray-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
            </Link>
            <Link href="https://www.tiktok.com/@zapulltcg" aria-label="TikTok" target="_blank" rel="noopener noreferrer">
              <div className="bg-gray-700 p-2 rounded-full hover:bg-gray-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                </svg>
              </div>
            </Link>
            <Link href="https://discord.gg/9x3YX7DXQj" aria-label="Discord" target="_blank" rel="noopener noreferrer">
              <div className="bg-gray-700 p-2 rounded-full hover:bg-gray-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>
            </Link>
          </div>
          <div className="text-gray-500 text-sm">
            © {new Date().getFullYear()} All Rights Reserved
          </div>
        </div>
      </div>
    </footer>
  )
}