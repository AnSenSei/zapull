// Stripe配置和初始化
import { loadStripe } from '@stripe/stripe-js'

// 初始化Stripe
export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

export default stripePromise