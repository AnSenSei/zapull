'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import styles from './provably-fair.module.css'

export default function ProvablyFairPage() {
  const router = useRouter()
  return (
    <div className={styles.container}>
      <motion.div 
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Back arrow */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"></path>
              <path d="M12 19l-7-7 7-7"></path>
            </svg>
            <span style={{ color: '#c5c5c5', fontSize: '14px' }}>Back</span>
          </button>
        </div>
        <h1 className={styles.title}>Provably Fair</h1>
        
        <section className={styles.section}>
          <p className={styles.intro}>
            Our provably fair system ensures that every pack opening is completely random and verifiable. 
            Neither you nor we can manipulate the outcome of any pack opening.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.subtitle}>How It Works</h2>
          <p className={styles.text}>
            When you open a pack, the outcome is determined by combining three pieces of information:
          </p>
          <ul className={styles.list}>
            <li><strong>Client Seed:</strong> A random string that you provide (or we generate for you)</li>
            <li><strong>Server Seed:</strong> A secret random string that we generate</li>
            <li><strong>Nonce:</strong> A counter that increases with each pack you open</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.subtitle}>The Process</h2>
          <ol className={styles.orderedList}>
            <li>
              <strong>Before Opening:</strong> We show you the hash of our server seed. This proves we've already 
              chosen our seed and can't change it later.
            </li>
            <li>
              <strong>Pack Opening:</strong> We combine your client seed, our server seed, and the nonce to generate 
              a random hash. This hash determines which cards you receive.
            </li>
            <li>
              <strong>After Opening:</strong> We reveal our server seed so you can verify the result. You can hash 
              our server seed yourself to confirm it matches the hash we showed you before.
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2 className={styles.subtitle}>Verification</h2>
          <p className={styles.text}>
            To verify a pack opening:
          </p>
          <ol className={styles.orderedList}>
            <li>Take the server seed we revealed and hash it using SHA-256</li>
            <li>Confirm this hash matches the server seed hash we showed before opening</li>
            <li>Combine the client seed, server seed, and nonce: <code>hash(client_seed + server_seed + nonce)</code></li>
            <li>The resulting hash determines your pack contents</li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2 className={styles.subtitle}>Why This Is Fair</h2>
          <ul className={styles.list}>
            <li>
              <strong>We can't cheat:</strong> We commit to our server seed by showing its hash before you open 
              the pack. We can't change it without the hash changing.
            </li>
            <li>
              <strong>You can't cheat:</strong> You don't know our server seed until after opening, so you can't 
              predict the outcome.
            </li>
            <li>
              <strong>Everything is verifiable:</strong> After opening, you have all the information needed to 
              verify the result was fair.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.subtitle}>Understanding the Seeds</h2>
          <div className={styles.seedExplanation}>
            <div className={styles.seedItem}>
              <h3>Client Seed</h3>
              <p>Your contribution to randomness. You can change this anytime before opening a pack.</p>
            </div>
            <div className={styles.seedItem}>
              <h3>Server Seed Hash</h3>
              <p>Proof of our commitment. This is the SHA-256 hash of our secret server seed.</p>
            </div>
            <div className={styles.seedItem}>
              <h3>Server Seed</h3>
              <p>Our secret contribution, revealed after opening for verification.</p>
            </div>
            <div className={styles.seedItem}>
              <h3>Nonce</h3>
              <p>A counter ensuring each pack opening produces a unique result.</p>
            </div>
            <div className={styles.seedItem}>
              <h3>Random Hash</h3>
              <p>The final hash that determines your pack contents.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.subtitle}>Need Help?</h2>
          <p className={styles.text}>
            If you have questions about our provably fair system or need help verifying a result, 
            please <Link href="/support" className={styles.link}>contact our support team</Link>.
          </p>
        </section>
      </motion.div>
    </div>
  )
}