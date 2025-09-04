'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { userApi, UserCard } from '@/lib/userApi';
import { getCurrentUserId } from '@/lib/authUtils';
import { useCollection } from '@/components/layout/Navbar';

interface Card {
  id: string;
  card_reference: string;
  card_name: string;
  image_url: string;
  rarity: number;
  point_worth: number;
  quantity: number;
  collection_id?: string;
}

interface CardSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCard: (card: Card) => void;
  selectedCard?: Card | null;
  selectedCollection?: string;
  title: string;
}

const CardSelectionModal: React.FC<CardSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectCard,
  selectedCard,
  selectedCollection,
  title
}) => {
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [currentCollection, setCurrentCollection] = useState<string>(selectedCollection);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { collections, loadingCollections } = useCollection();

  // 当弹窗打开时，设置默认分类
  useEffect(() => {
    if (isOpen && !loadingCollections && collections.length > 0) {
      if (selectedCollection && selectedCollection !== '') {
        setCurrentCollection(selectedCollection);
      } else if (!currentCollection || currentCollection === '') {
        setCurrentCollection(collections[0].id);
      }
    }
  }, [isOpen, collections, loadingCollections, currentCollection, selectedCollection]);

  // 当selectedCollection改变时，更新currentCollection
  useEffect(() => {
    if (selectedCollection && selectedCollection !== '' && selectedCollection !== currentCollection) {
      setCurrentCollection(selectedCollection);
    }
  }, [selectedCollection, currentCollection]);

  // 当选择分类时获取用户卡牌
  useEffect(() => {
    if (isOpen && currentCollection && !loadingCollections) {
      fetchUserCards(currentCollection);
    }
  }, [currentCollection, isOpen, loadingCollections, currentPage]);

  // 当分类改变时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [currentCollection]);

  const fetchUserCards = async (collectionId: string) => {
    const userId = getCurrentUserId();
    if (!userId) {
      setError('Please login to view your cards');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await userApi.getUserCards({
        collection_id: collectionId,
        page: currentPage,
        per_page: 20,
        sort_by: 'date_got',
        sort_order: 'desc'
      });
      
      // 合并所有子集合的卡片
      const allCards = response.subcollections.flatMap(sub => sub.cards);
      setUserCards(allCards);
      
      // 计算总页数（基于第一个子集合的分页信息）
      if (response.subcollections.length > 0 && response.subcollections[0].pagination) {
        setTotalPages(response.subcollections[0].pagination.total_pages || 1);
      } else {
        setTotalPages(1);
      }
    } catch (err: any) {
      // 对于403和401错误，不显示错误信息，让页面正常显示
      if (err?.response?.status === 403 || err?.response?.status === 401) {
        console.warn('Authentication error when fetching cards:', err);
        setUserCards([]);
        setTotalPages(1);
      } else {
        setError('Failed to load user cards');
        console.error('Error fetching user cards:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCardSelect = (userCard: UserCard) => {
    // 转换UserCard为Card格式
    const card: Card = {
      id: userCard.id,
      card_reference: userCard.card_reference,
      card_name: userCard.card_name,
      image_url: userCard.image_url,
      rarity: userCard.rarity,
      point_worth: userCard.point_worth,
      quantity: userCard.quantity,
      collection_id: currentCollection
    };
    
    onSelectCard(card);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-lg w-[90%] max-w-4xl h-[80%] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Collection Tabs */}
        {!loadingCollections && collections.length > 0 && (
          <div className="flex border-b border-gray-700">
            {collections.map((collection) => (
              <button
                key={collection.id}
                onClick={() => {
                  // 如果selectedCollection已经指定（比如选择第二张卡牌时），则不允许切换分类
                  if (!selectedCollection || selectedCollection === '' || selectedCollection === collection.id) {
                    setCurrentCollection(collection.id);
                  }
                }}
                disabled={selectedCollection && selectedCollection !== '' && selectedCollection !== collection.id}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  currentCollection === collection.id
                    ? 'text-white border-b-2 border-[#6C5DD3]'
                    : selectedCollection && selectedCollection !== '' && selectedCollection !== collection.id
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {collection.name}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white">Loading...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-400">{error}</div>
            </div>
          ) : userCards.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">No cards found in this collection</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {userCards.map((card) => (
                <div
                  key={card.id}
                  onClick={() => handleCardSelect(card)}
                  className={`relative cursor-pointer rounded-lg overflow-hidden transition-all hover:scale-105 ${
                    selectedCard?.card_reference === card.card_reference
                      ? 'ring-2 ring-[#6C5DD3]'
                      : 'hover:ring-2 hover:ring-gray-400'
                  }`}
                >
                  <div className="aspect-[3/4] bg-gray-800">
                    {card.image_url ? (
                      <img
                        src={card.image_url}
                        alt={card.card_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/cards/common1.jpg.svg';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No Image
                      </div>
                    )}
                  </div>
                  
                  {/* Card Info */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="text-white text-xs font-medium truncate">
                      {card.card_name}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-300">Qty: {card.quantity}</span>
                      <span className="text-yellow-400">{card.point_worth} pts</span>
                    </div>
                  </div>
                  
                  {/* Rarity indicator */}
                  <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                    card.rarity === 1 ? 'bg-gray-400' :
                    card.rarity === 2 ? 'bg-green-400' :
                    card.rarity === 3 ? 'bg-blue-400' :
                    card.rarity === 4 ? 'bg-purple-400' :
                    'bg-yellow-400'
                  }`} />
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center p-4 border-t border-gray-700">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-[#6C5DD3] text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-white text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-[#6C5DD3] text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CardSelectionModal;
export type { CardSelectionModalProps, Card };