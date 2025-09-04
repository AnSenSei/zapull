import AddressLayout from '@/components/layout/AddressLayout'
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return <AddressLayout>{children}</AddressLayout>
}