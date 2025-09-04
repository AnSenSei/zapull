'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import CardSelectionModal from '@/components/CardSelectionModal'
import { getCurrentUserId } from '@/lib/authUtils'
import { useCollection } from '@/components/layout/Navbar'
import { useAuthStore } from '@/store/authStore'
import { performRandomFusion } from '@/lib/fusionApi'
import toast from 'react-hot-toast'
import styles from '@/app/synthesis/synthesis.module.css'

interface Card {
  card_reference: string;
  card_name: string;
  date_got: string;
  id: string;
  image_url: string;
  point_worth: number;
  quantity: number;
  rarity: number;
  locked_quantity: number;
  expireAt: string;
  buybackexpiresAt: string;
  request_date: string;
  collection_id?: string;
}

interface NormalSynthesisProps {
  selectedCollection: string;
  setSelectedCollection: (collection: string) => void;
}

export default function NormalSynthesis({ selectedCollection, setSelectedCollection }: NormalSynthesisProps) {
  const [synthesisResult, setSynthesisResult] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [leftCard, setLeftCard] = useState<Card | null>(null);
  const [rightCard, setRightCard] = useState<Card | null>(null);
  const [isLeftModalOpen, setIsLeftModalOpen] = useState(false);
  const [isRightModalOpen, setIsRightModalOpen] = useState(false);

  const { uid } = useAuthStore();
  const { collections, loadingCollections } = useCollection();

  // 触发传说卡片特效
  const triggerLegendaryEffect = () => {
    const end = Date.now() + (2 * 1000);
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];

    (function frame() {
      confetti({
        particleCount: 8,
        angle: 60,
        spread: 50,
        origin: { x: 0.3, y: 0.7 },
        colors: colors,
        gravity: 0.9,
        scalar: 1.0
      });
      confetti({
        particleCount: 8,
        angle: 120,
        spread: 50,
        origin: { x: 0.7, y: 0.7 },
        colors: colors,
        gravity: 0.9,
        scalar: 1.0
      });
      confetti({
        particleCount: 6,
        angle: 90,
        spread: 40,
        origin: { x: 0.5, y: 0.8 },
        colors: colors,
        gravity: 0.8,
        scalar: 1.2
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }

  // 处理合成
  const handleSynthesis = async () => {
    if (!leftCard || !rightCard) {
      toast.error('请选择两张卡牌进行合成');
      return;
    }

    // 检查两张卡牌是否来自同一分类
    const leftCardCollection = getCardCollection(leftCard);
    const rightCardCollection = getCardCollection(rightCard);
    
    if (leftCardCollection !== rightCardCollection) {
      toast.error('两张卡牌必须来自同一分类');
      return;
    }

    setIsLoading(true);
    try {
      // 获取当前用户ID
      const userId = getCurrentUserId();
      if (!userId) {
        throw new Error('用户未登录');
      }

      console.log(JSON.stringify(leftCard))
      console.log(rightCard)
      
      console.log('Synthesis request:', {
        card1_id: leftCard.id,
        card2_id: rightCard.id,
        collection_id: leftCardCollection
      });
      
      // 调用随机合成API
      const result = await performRandomFusion({
        card_id1: leftCard.id,
        card_id2: rightCard.id,
        collection_id: leftCardCollection
      });
      setSynthesisResult(result);
      setShowResult(true);
      
      // 如果合成成功，播放融合音效并触发烟花特效
      if (result.success) {
        try {
          const fusionAudio = new Audio('/draw/fusion.wav')
          fusionAudio.play().catch(() => {})
        } catch {}
        setTimeout(() => {
          triggerLegendaryEffect();
        }, 500);
      }
    } catch (error: any) {
      console.error('Synthesis error:', error);
      
      // 显示具体的错误信息
      const errorMessage = error.message || '合成失败，请重试';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 重置合成
  const resetSynthesis = () => {
    setSynthesisResult(null)
    setShowResult(false)
    setLeftCard(null)
    setRightCard(null)
  }

  // 获取卡牌所属的分类
  const getCardCollection = (card: Card): string => {
    return card.collection_id || selectedCollection || 'pokemon';
  };

  const handleLeftCardSelect = (card: Card) => {
    
    // 保存卡牌的分类信息
    const cardWithCollection = {
      ...card,
      collection_id: card.collection_id || selectedCollection
    };
    
    // 更新selectedCollection为当前选择的卡牌分类
    if (cardWithCollection.collection_id) {
      setSelectedCollection(cardWithCollection.collection_id);
    }
    
    // 检查是否需要清空右侧卡牌
    const newLeftCardCollection = cardWithCollection.collection_id;
    const currentRightCardCollection = rightCard ? getCardCollection(rightCard) : null;
    

    console.log('-----当前选择的card',cardWithCollection)
    setLeftCard(cardWithCollection);
    
    // 只有当右侧卡牌存在且分类不同时才清空右侧卡牌
    if (rightCard && currentRightCardCollection !== newLeftCardCollection) {
      setRightCard(null);
    }
  };

  const handleRightCardSelect = (card: Card) => {
    // 保存卡牌的分类信息
    const cardWithCollection = {
      ...card,
      collection_id: card.collection_id || (leftCard ? getCardCollection(leftCard) : selectedCollection)
    };
    
    // 如果没有左侧卡片，更新selectedCollection为当前选择的卡牌分类
    if (!leftCard && cardWithCollection.collection_id) {
      setSelectedCollection(cardWithCollection.collection_id);
    }
    
    setRightCard(cardWithCollection);
  };

  return (
    <>
      {/* 登录提示 */}
      {!uid && (
        <div className="text-center mb-8">
          <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
            <p className="text-yellow-400">Please login to use the synthesis feature</p>
          </div>
        </div>
      )}
      
      {!showResult ? (
        <div className="flex flex-col items-center justify-center">
          <div className={`flex justify-center items-center gap-16 mb-10 max-md:flex-row max-md:gap-8 ${styles.normalSynthesisMobile || ''}`}>
            {/* 左侧卡片选择区域 */}
            <div className="flex flex-col w-[250px] max-md:w-[140px]">
              <div 
                onClick={() => uid && setIsLeftModalOpen(true)}
                className={`relative w-[250px] h-[350px] max-md:w-[140px] max-md:h-[196px] rounded-2xl overflow-hidden bg-gradient-to-br from-[#2A2D47] via-[#1F1D2B] to-[#0F0E1A] border-2 border-[#6C5DD3]/30 shadow-lg shadow-[#6C5DD3]/20 flex items-center justify-center cursor-pointer hover:border-[#6C5DD3] transition-colors ${styles.cardSlot || ''}`}
              >
                {leftCard ? (
                  <div className="w-full h-full relative rounded-2xl overflow-hidden">
                    {leftCard.image_url ? (
                      <img
                        src={leftCard.image_url}
                        alt={leftCard.card_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        {leftCard.card_name}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5V19M5 12H19" stroke="#6C5DD3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-gray-400 text-sm mt-2 text-center">
                {leftCard ? leftCard.card_name : 'Select first card'}
              </p>
            </div>
            
            {/* 中间箭头和问号 */}
            <div className={`flex flex-col items-center justify-center ${styles.synthesisCenter || ''}`}>
              <div className={`flex items-center gap-8 mb-8 max-md:gap-4 max-md:mb-4 ${styles.synthesisArrows || ''}`}>
                <div className="w-[40px] h-[40px] rounded-[8px] bg-[#8868FF] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                
                <div className={`w-[300px] h-[420px] max-md:w-[200px] max-md:h-[280px] rounded-3xl bg-gradient-to-br from-[#2A2D47] via-[#1F1D2B] to-[#0F0E1A] flex items-center justify-center border-3 border-[#6C5DD3]/50 relative overflow-hidden shadow-2xl shadow-[#6C5DD3]/40 ${styles.resultPreview || ''}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-[#6C5DD3]/20 to-transparent"></div>
                  <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-[#6C5DD3]/30 to-transparent rounded-t-3xl"></div>
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#6C5DD3]/30 to-transparent rounded-b-3xl"></div>
                  <div className="relative z-10 flex flex-col items-center">
                    <div 
                      className="text-[120px] font-bold mb-3"
                      style={{
                        color: 'rgba(255, 255, 255, 0)',
                        textStroke: '1px #CABDFF',
                        WebkitTextStroke: '1px #CABDFF'
                      }}
                    >
                      ?
                    </div>
                  </div>
                </div>
                
                <div className="w-[40px] h-[40px] rounded-[8px] bg-[#8868FF] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 12H5M5 12L12 5M5 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              
              <div className="max-md:hidden">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`text-white px-8 py-3 text-[16px] transition-all disabled:cursor-not-allowed ${styles.synthesisButton || ''}`}
                  style={{
                    background: 'rgba(136,104,255,0.2)',
                    borderRadius: '19px',
                    border: '1px solid #8868FF'
                  }}
                  onClick={handleSynthesis}
                  disabled={!leftCard || !rightCard || isLoading || !uid}
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Synthesizing...
                    </span>
                  ) : !uid ? (
                    'Login Required'
                  ) : (
                    'Synthesis'
                  )}
                </motion.button>
              </div>
            </div>
            
            {/* 右侧卡片选择区域 */}
            <div className="flex flex-col w-[250px] max-md:w-[140px]">
              <div 
                onClick={() => uid && setIsRightModalOpen(true)}
                className={`relative w-[250px] h-[350px] max-md:w-[140px] max-md:h-[196px] rounded-2xl overflow-hidden bg-gradient-to-br from-[#2A2D47] via-[#1F1D2B] to-[#0F0E1A] border-2 border-[#6C5DD3]/30 shadow-lg shadow-[#6C5DD3]/20 flex items-center justify-center cursor-pointer hover:border-[#6C5DD3] transition-colors ${styles.cardSlot || ''}`}
              >
                {rightCard ? (
                  <div className="w-full h-full relative rounded-2xl overflow-hidden">
                    {rightCard.image_url ? (
                      <img
                        src={rightCard.image_url}
                        alt={rightCard.card_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        {rightCard.card_name}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5V19M5 12H19" stroke="#6C5DD3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-gray-400 text-sm mt-2 text-center">
                {rightCard ? rightCard.card_name : 'Select second card'}
              </p>
            </div>
          </div>
          
          <div className="text-center text-gray-400 max-w-md">
            <p>Select two cards to synthesize. The original cards will be consumed after synthesis.</p>
          </div>
          
          {/* 移动端合成按钮 */}
          <div className="md:hidden mt-8 w-full max-w-[320px]">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`text-white px-8 py-3 text-[16px] transition-all disabled:cursor-not-allowed w-full ${styles.synthesisButton || ''}`}
              style={{
                background: 'rgba(136,104,255,0.2)',
                borderRadius: '19px',
                border: '1px solid #8868FF'
              }}
              onClick={handleSynthesis}
              disabled={!leftCard || !rightCard || isLoading || !uid}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Synthesizing...
                </span>
              ) : !uid ? (
                'Login Required'
              ) : (
                'Synthesis'
              )}
            </motion.button>
          </div>
        </div>
      ) : (
        <div className={`flex flex-col items-center justify-center w-full max-w-4xl relative text-center ${styles.synthesisResultMobile || ''}`}>
          {synthesisResult.success && synthesisResult.result_card ? (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="relative w-[320px] h-[450px] max-md:w-[240px] max-md:h-[336px] rounded-2xl overflow-hidden z-10 resultCard"
                style={{
                  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                  boxShadow: '0 0 50px rgba(108, 93, 211, 0.4), 0 0 100px rgba(108, 93, 211, 0.2)'
                }}
              >
                {/* 卡牌光效边框 */}
                <div className="absolute inset-0 rounded-2xl">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/30 via-blue-500/30 to-purple-500/30 animate-pulse"></div>
                  <div className="absolute inset-1 rounded-2xl bg-gradient-to-b from-transparent via-white/5 to-transparent"></div>
                </div>
                
                {/* 卡牌内容 */}
                <div className="relative z-10 w-full h-full p-4">
                  {synthesisResult.result_card.image_url ? (
                    <img 
                      src={synthesisResult.result_card.image_url} 
                      alt={synthesisResult.result_card.card_name} 
                      className="w-full h-full object-cover rounded-xl"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-700 rounded-xl">
                      {synthesisResult.result_card.card_name}
                    </div>
                  )}
                </div>
              </motion.div>
              
              <div className="text-center mt-8 mb-6">
                {/* 显示金币数量和积分数值 */}
                <div className="flex items-center justify-center gap-6">
                  <div className="flex items-center justify-center gap-3">
                    <img 
                      src="/payment/coin.png" 
                      alt="Point Worth" 
                      className="w-8 h-8"
                    />
                    <span className="text-2xl font-bold text-[#FFD700]">
                      {synthesisResult.result_card.point_worth || '199.99'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* 操作按钮区域 - 只保留一个按钮 */}
              <div className={`mt-8 flex justify-center w-full max-w-md ${styles.resultActions || ''}`}>
                <motion.button
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 0.5 }}
                   onClick={resetSynthesis}
                   className={`w-full bg-gradient-to-r from-[#6C5DD3] to-[#8B7ED8] text-white py-3 px-6 rounded-lg font-medium hover:from-[#5A4BC4] hover:to-[#7A6FD3] transition-all duration-200 shadow-lg text-base ${styles.resultButton || ''}`}
                 >
                   Confirm
                 </motion.button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="w-[300px] h-[420px] rounded-xl bg-red-900/30 flex items-center justify-center mb-6">
                <span className="text-red-400 text-xl">Synthesis Failed</span>
              </div>
              <h2 className="text-3xl font-bold text-red-400 mb-2">Synthesis Failed!</h2>
              <p className="text-xl text-white mb-4">{synthesisResult.message}</p>
              <button 
                onClick={resetSynthesis}
                className="bg-[#1F1D2B] text-white px-6 py-3 rounded-xl hover:bg-[#2A2839] transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* 卡片选择弹窗 */}
      <CardSelectionModal
        isOpen={isLeftModalOpen}
        onClose={() => setIsLeftModalOpen(false)}
        onSelectCard={handleLeftCardSelect}
        selectedCard={leftCard}
        title="Select First Card"
      />
      
      <CardSelectionModal
        isOpen={isRightModalOpen}
        onClose={() => setIsRightModalOpen(false)}
        onSelectCard={handleRightCardSelect}
        selectedCard={rightCard}
        selectedCollection={leftCard ? getCardCollection(leftCard) : undefined}
        title="Select Second Card"
      />
    </>
  )
}