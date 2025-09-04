'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import styles from './FairModal.module.css'

interface FairModalProps {
  isOpen: boolean
  onClose: () => void
  transactionId?: string
  date?: string
  time?: string
  packData?: {
    pack_type: string
    price_points: number
    client_seed: string
    server_seed: string
    server_seed_hash: string
    nonce: number
    random_hash: string
  }
}

export default function FairModal({ isOpen, onClose, transactionId, date, time, packData }: FairModalProps) {
  // Use packData if provided, otherwise use mock data
  const fairData = packData ? {
    clientSeed: packData.client_seed,
    serverSeed: packData.server_seed,
    serverSeedHash: packData.server_seed_hash,
    nonce: packData.nonce.toString(),
    randomHash: packData.random_hash,
    packType: packData.pack_type,
    pricePoints: packData.price_points
  } : {
    clientSeed: '3f8a01f',
    serverSeed: '4c6e9c',
    serverSeedHash: '21d9f0f0f7bbea4c5f7a4e1c8f2e0e1a',
    nonce: '12',
    randomHash: '7a8b9c0d1e2f3g4h5i6j',
    packType: 'example_pack_1',
    pricePoints: 5600
  }
  
  // 复制状态管理
  const [copiedField, setCopiedField] = useState<string | null>(null)
  
  // 复制功能
  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    }).catch(err => {
      console.error('复制失败:', err)
    })
  }

  // Lock/unlock background scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => document.body.classList.remove('modal-open')
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className={styles.modalOverlay}>
      <motion.div 
        className={styles.modalContainer}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Close"
        >
          <Image src="/icons/close.png" alt="Close" width={18} height={18} />
        </button>

        {/* Header (no back row) */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Provably fair</h2>
          <p className={styles.modalSubtitle}>
            The outcome of every box is randomly generated using the following information
          </p>
        </div>

        {/* 信息区域 */}
        <div className={styles.modalBody}>
          <div className={styles.boxSection}>
            <p className={styles.infoLabel}>PACK</p>
            <div className={styles.boxContent}>
              <div className={styles.boxInfo}>
                <p className={styles.boxText}>
                  {fairData.packType.split('/').pop()?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown Pack'}
                </p>
                <Link href="/provably-fair" className={styles.infoLink}>Learn how provably fair works</Link>
              </div>
              <div className={styles.boxPrice}>
                <img src="/payment/coin.png" alt="coin" className={styles.coinIcon} />
                <span className={styles.priceText}>{fairData.pricePoints.toLocaleString()}</span>
              </div>
            </div>
          </div>


          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Client Seed</p>
              <div className={styles.infoValue}>
                <p className={styles.infoValueText} title={fairData.clientSeed}>{fairData.clientSeed}</p>
                <button 
                  className={styles.copyButton} 
                  onClick={() => handleCopy(fairData.clientSeed, 'clientSeed')}
                  aria-label="复制客户端种子"
                >
                  <img src="/icons/copy.svg" alt="复制" className={styles.copyIcon} />
                </button>
                <span className={`${styles.copySuccess} ${copiedField === 'clientSeed' ? styles.copySuccessVisible : ''}`}>
Copied!
                </span>
              </div>
            </div>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Random Hash</p>
              <div className={styles.infoValue}>
                <p className={styles.infoValueText} title={fairData.randomHash}>{fairData.randomHash.substring(0, 12)}...</p>
                <button 
                  className={styles.copyButton} 
                  onClick={() => handleCopy(fairData.randomHash, 'randomHash')}
                  aria-label="复制随机哈希"
                >
                  <img src="/icons/copy.svg" alt="复制" className={styles.copyIcon} />
                </button>
                <span className={`${styles.copySuccess} ${copiedField === 'randomHash' ? styles.copySuccessVisible : ''}`}>
                  Copied!
                </span>
              </div>
            </div>
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Server Seed Hash</p>
              <div className={styles.infoValue}>
                <p className={styles.infoValueText} title={fairData.serverSeedHash}>{fairData.serverSeedHash.substring(0, 12)}...</p>
                <button 
                  className={styles.copyButton} 
                  onClick={() => handleCopy(fairData.serverSeedHash, 'serverSeedHash')}
                  aria-label="复制服务器种子哈希"
                >
                  <img src="/icons/copy.svg" alt="复制" className={styles.copyIcon} />
                </button>
                <span className={`${styles.copySuccess} ${copiedField === 'serverSeedHash' ? styles.copySuccessVisible : ''}`}>
                  Copied!
                </span>
              </div>
            </div>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Server Seed</p>
              <div className={styles.infoValue}>
                <p className={styles.infoValueText} title={fairData.serverSeed}>{fairData.serverSeed}</p>
                <button 
                  className={styles.copyButton} 
                  onClick={() => handleCopy(fairData.serverSeed, 'serverSeed')}
                  aria-label="复制服务器种子"
                >
                  <img src="/icons/copy.svg" alt="复制" className={styles.copyIcon} />
                </button>
                <span className={`${styles.copySuccess} ${copiedField === 'serverSeed' ? styles.copySuccessVisible : ''}`}>
                  Copied!
                </span>
              </div>
            </div>
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Nonce</p>
              <div className={styles.infoValue}>
                <p className={styles.infoValueText} title={fairData.nonce}>{fairData.nonce}</p>
                <button 
                  className={styles.copyButton} 
                  onClick={() => handleCopy(fairData.nonce, 'nonce')}
                  aria-label="复制随机数"
                >
                  <img src="/icons/copy.svg" alt="复制" className={styles.copyIcon} />
                </button>
                <span className={`${styles.copySuccess} ${copiedField === 'nonce' ? styles.copySuccessVisible : ''}`}>
                  Copied!
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 交易信息 */}
        <div className={styles.modalFooter}>
          <p>ID: {transactionId || 'N/A'}</p>
          <p>Time: {date || 'N/A'} {time || ''}</p>
        </div>
      </motion.div>
    </div>
  )
}