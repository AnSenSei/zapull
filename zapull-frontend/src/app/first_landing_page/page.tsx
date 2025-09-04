import { redirect } from 'next/navigation'

// Legacy route: redirect to the canonical page
export default function LegacyFirstLanding() {
  redirect('/how-it-works')
}
