import Navbar, { CollectionProvider } from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import './globals.css'
import type { Metadata } from 'next'
import LoginModal from '@/components/LoginModal'
import RegisterModal from '@/components/RegisterModal'
import ResetModal from '@/components/ResetModal'
import VerifyEmailModal from '@/components/VerifyEmailModal'
import EditDisplayNameModal from '@/components/EditDisplayNameModal'
import AuthProvider from '@/components/AuthProvider'
import AuthListener from '@/components/AuthListener'
import AxiosInterceptorSetup from '@/components/AxiosInterceptorSetup'
import { Toaster } from 'react-hot-toast'
import { AchievementModalManager } from '@/components/AchievementModalManager'
import { PeriodicAchievementChecker } from '@/components/PeriodicAchievementChecker'
import ToastClickAwayBootstrap from '@/components/ToastClickAwayBootstrap'

export const metadata: Metadata = {
  title: 'Zapull - TCG Collecting Platform',
  description: 'The ultimate ecosystem for modern TCG collectors. Open packs digitally, trade cards, earn achievements, and build your collection with Zapull.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="min-h-screen">
        <AuthProvider />
        <AuthListener />
        <AxiosInterceptorSetup />
        <Toaster 
          position="top-center" 
          toastOptions={{
            duration: 4000,
            style: {
              cursor: 'pointer'
            },
            success: {
              duration: 1000,
              className: 'app-success-toast'
            }
          }}
        />
        <ToastClickAwayBootstrap />
        <AchievementModalManager />
        <PeriodicAchievementChecker />
        <CollectionProvider>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="w-full px-2 sm:px-3 md:px-4 lg:px-6 xl:px-8 2xl:px-10 pt-navbar py-4 sm:py-8 flex-grow bodyBackground overflow-visible will-change-scroll">
              <div className="max-w-[1600px] mx-auto overflow-visible">
                {children}
              </div>
            </main>
          </div>
        </CollectionProvider>
        <Footer />
        <LoginModal />
        <RegisterModal />
        <ResetModal />
        <VerifyEmailModal />
        <EditDisplayNameModal />
      </body>
    </html>
  )
}
