'use client'

import { useRouter } from 'next/navigation'
import styles from './events.module.css'

interface Event {
  id: string
  title: string
  description: string
  duration?: string
  rules: string[]
  reward: string
  emoji: string
  isLimited: boolean
  cardClass?: string
}

const ongoingEvents: Event[] = [
  {
    id: 'welcome-bonus',
    title: 'Welcome Bonus',
    description: 'Get started with an amazing welcome bonus just for joining our community!',
    rules: ['Sign up for a new account', 'Verify your email address', 'Complete account setup'],
    reward: '500 Points instantly credited to your account',
    emoji: '🎁',
    isLimited: false
  },
  {
    id: 'marketplace-deals',
    title: 'Official Marketplace Special Deals',
    description: 'Exclusive deals and discounts available in our official marketplace.',
    rules: ['Browse our marketplace section', 'Limited quantities available', 'First come, first served basis'],
    reward: 'Special discounted prices while supplies last',
    emoji: '🛍️',
    isLimited: false
  },
  {
    id: 'daily-points-box',
    title: 'Daily Free Points Box',
    description: 'Claim your daily free points box and build up your point balance!',
    duration: 'Starting August 19th',
    rules: ['Log in daily to claim your box', 'Available every 24 hours', 'Points vary each day'],
    reward: 'Daily points box with random rewards',
    emoji: '📦',
    isLimited: false,
    cardClass: 'dailyRewardCard'
  },
  {
    id: 'top-up-bonus',
    title: 'Top Up Bonus Points',
    description: 'The more you recharge, the more bonus points you earn! Scale your rewards with your investment.',
    rules: ['Make a payment/top-up', 'Bonus percentage increases with amount', 'Instant bonus points credited'],
    reward: 'Bonus points based on top-up amount',
    emoji: '💰',
    isLimited: false
  },
  {
    id: 'discord-drops',
    title: 'Discord Points Drops',
    description: 'Join our Discord community and watch out for random point drops throughout the day!',
    rules: ['Join our official Discord server', 'Stay active in the community', 'Be ready for surprise drops'],
    reward: 'Random points drops in Discord',
    emoji: '💬',
    isLimited: false
  }
]

const limitedEvents: Event[] = [
  {
    id: 'affiliate-challenge',
    title: 'Affiliate Mega Challenge',
    description: 'Share your affiliate code and compete to become one of our top affiliates!',
    duration: 'August 18 – August 31',
    rules: [
      'Share your affiliate code with friends',
      'Earn from successful referrals',
      'Top 5 affiliates by earnings during the event period'
    ],
    reward: 'Raffle entry for top 5 affiliates (100% win)',
    emoji: '🤝',
    isLimited: true,
    cardClass: 'affiliateCard'
  },
  {
    id: 'discord-pioneer',
    title: 'Discord Pioneer Recruitment',
    description: 'Be among the first pioneers to join our Discord community and unlock exclusive benefits!',
    duration: 'Limited to first 100 users only',
    rules: [
      'Be among the first 100 members to join Zapull Discord',
      'Maintain active participation',
      'Follow Discord community guidelines'
    ],
    reward: 'Exclusive Pioneer Badge + Pioneer-only Giveaway access',
    emoji: '🏅',
    isLimited: true,
    cardClass: 'pioneerCard'
  }
]

export default function EventsPage() {
  const router = useRouter()
  
  const handleEventClick = (event: Event) => {
    if (event.id === 'daily-points-box') {
      router.push('/events/freedaily-box')
    }
    // Add other event navigation logic here if needed
  }

  const EventCard = ({ event }: { event: Event }) => {
    const isClickable = event.id === 'daily-points-box'
    
    return (
      <div 
        className={`${styles.eventCard} ${event.cardClass ? styles[event.cardClass] : ''} ${
          isClickable ? 'cursor-pointer hover:scale-105 transition-transform' : ''
        }`}
        onClick={() => isClickable && handleEventClick(event)}
      >
        {event.isLimited ? (
          <div className={styles.limitedBadge}>Limited Time</div>
        ) : (
          <div className={styles.ongoingBadge}>Ongoing</div>
        )}
        
        <div className={styles.eventTitle}>
          <span className={styles.eventEmoji}>{event.emoji}</span>
          {event.title}
          {isClickable && (
            <span className="ml-2 text-purple-400 text-sm">→ Click to claim</span>
          )}
        </div>
        
        <div className={styles.eventDescription}>
          {event.description}
        </div>
        
        {event.duration && (
          <div className={styles.eventDuration}>
            <span>📅</span>
            <span>Duration: {event.duration}</span>
          </div>
        )}
        
        <div className={styles.eventRules}>
          <div className={styles.rulesTitle}>
            <span>✨</span>
            Rules:
          </div>
          <ul className={styles.rulesList}>
            {event.rules.map((rule, index) => (
              <li key={index} className={styles.ruleItem}>
                {rule}
              </li>
            ))}
          </ul>
        </div>
        
        <div className={styles.eventReward}>
          <span className={styles.rewardIcon}>🎁</span>
          <span className={styles.rewardText}>{event.reward}</span>
        </div>
        
        {isClickable && (
          <div className="mt-4 p-3 bg-purple-500/20 rounded-lg border border-purple-500/30">
            <div className="text-purple-300 text-sm font-semibold text-center">
              🎯 Click this card to visit the Daily Reward page!
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Back Button */}
      <div className={styles.backButtonContainer}>
        <button
          onClick={() => router.back()}
          className={styles.backButton}
        >
          <span className={styles.backArrow}>←</span>
          <span>Back</span>
        </button>
      </div>
      
      <div className={styles.header}>
        <h1 className={styles.title}>Events & Promotions</h1>
        <p className={styles.subtitle}>
          Join our exciting events and promotions to earn amazing rewards and special bonuses!
        </p>
      </div>

      {/* Ongoing Events Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>🎉</span>
          <h2 className={styles.sectionTitle}>Ongoing Activities</h2>
          <span className={styles.sectionDescription}>Available anytime</span>
        </div>
        
        <div className={styles.eventsGrid}>
          {ongoingEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      {/* Limited Time Events Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>⏰</span>
          <h2 className={styles.sectionTitle}>Limited Time Events</h2>
          <span className={styles.sectionDescription}>Don't miss out!</span>
        </div>
        
        <div className={styles.eventsGrid}>
          {limitedEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>
    </div>
  )
}
