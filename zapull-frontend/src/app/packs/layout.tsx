import { ReactNode } from 'react'

export default function PacksLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="w-full bodyBackground">
      {children}
    </div>
  )
}