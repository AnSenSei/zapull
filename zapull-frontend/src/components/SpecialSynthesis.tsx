'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import Image from 'next/image'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useCollection } from '@/components/layout/Navbar'
import { getFusionRecipes, getFusionPacks, performFusion, getFusionRecipeWithUserInfo, FusionRecipe, FusionRecipeWithUserInfo } from '@/lib/fusionApi'
import LazyImage from '@/components/LazyImage'
import CustomDropdown from '@/components/CustomDropdown'
import styles from '@/app/synthesis/synthesis.module.css'
import toast from 'react-hot-toast'

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

interface SpecialSynthesisProps {
  selectedCollection: string;
  setSelectedCollection: (collection: string) => void;
  onDetailViewChange?: (isDetailView: boolean) => void;
  initialPack?: string;
}

export default function SpecialSynthesis({ selectedCollection, setSelectedCollection, onDetailViewChange, initialPack }: SpecialSynthesisProps) {
  const [synthesisResult, setSynthesisResult] = useState<Card | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); // no longer used for backend pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<FusionRecipeWithUserInfo | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [allPackGroups, setAllPackGroups] = useState<Array<{pack_id: string, pack_name: string, pack_collection_id: string, recipe_count?: number}>>([]);
  const loadMoreRef = typeof window !== 'undefined' ? (document.createElement('div')) : null as any;
  const [showRecipeDetail, setShowRecipeDetail] = useState(false);
  const [loadingRecipeDetail, setLoadingRecipeDetail] = useState(false);
  const [expandedPacks, setExpandedPacks] = useState<Set<string>>(new Set()); // Track expanded packs
  const [loadingPacks, setLoadingPacks] = useState<Set<string>>(new Set()); // Track loading state for each pack
  const [packRecipes, setPackRecipes] = useState<Map<string, FusionRecipe[]>>(new Map()); // Cache recipes for each pack
  const [packGroups, setPackGroups] = useState<Array<{pack_id: string, pack_name: string, pack_collection_id: string, recipe_count: number}>>([]);
  
// totalPages no longer used; infinite scroll controls visibility locally

  const { uid } = useAuthStore();
  const { collections } = useCollection();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchQuery]);


  // 执行融合操作
  const handleFusion = async (recipe: FusionRecipeWithUserInfo) => {
    if (!uid) {
      toast.error('请先登录');
      return;
    }
    
    setIsLoading(true);
    try {
      const result = await performFusion({
        result_card_id: recipe.result_card_id,
        collection_id: selectedCollection
      });
      
      if (result.success) {
        setSynthesisResult(result.result_card);
        setShowResult(true);
        setShowRecipeDetail(false);
        setSelectedRecipe(null);
        // 播放融合音效
        try {
          const fusionAudio = new Audio('/draw/fusion.wav')
          fusionAudio.play().catch(() => {})
        } catch {}
        triggerLegendaryEffect();
        // 重新获取配方数据以更新卡牌数量
        fetchPackGroups();
        // Clear cached recipes to force refresh when packs are re-expanded
        setPackRecipes(new Map());
        setExpandedPacks(new Set());
      } else {
        toast.error(result.message || '合成失败');
      }
    } catch (error) {
      console.error('Fusion failed:', error);
      toast.error('合成失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-select Pokemon collection if none selected
  useEffect(() => {
    if (!selectedCollection && collections.length > 0) {
      const pokemonCollection = collections.find(c => c.id === 'pokemon');
      if (pokemonCollection) {
        setSelectedCollection('pokemon');
      } else {
        setSelectedCollection(collections[0].id);
      }
    }
  }, [collections, selectedCollection]);

  // Notify parent when detail view changes
  useEffect(() => {
    if (onDetailViewChange) {
      onDetailViewChange(showRecipeDetail);
    }
  }, [showRecipeDetail, onDetailViewChange]);

  // 当选择的集合或页面改变时重新获取数据
  useEffect(() => {
    if (selectedCollection) {
      fetchPackGroups();
    }
  }, [selectedCollection, uid]);

  // Auto-expand pack if initialPack is provided
  useEffect(() => {
    if (initialPack && packGroups.length > 0) {
      const packExists = packGroups.some(group => group.pack_id === initialPack);
      if (packExists && !expandedPacks.has(initialPack)) {
        handlePackExpand(initialPack);
        // Scroll to the pack after a short delay
        setTimeout(() => {
          const packElement = document.getElementById(`pack-${initialPack}`);
          if (packElement) {
            packElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 500);
      }
    }
  }, [initialPack, packGroups]);

  // Fetch pack groups first
  const fetchPackGroups = async () => {
    if (!selectedCollection) return;  // recipes can be viewed without login
    
    setLoadingRecipes(true);
    try {
      const response = await getFusionPacks({
        collection_id: selectedCollection,
      });
      
      // Build full list of pack groups (no server-side pagination/sort/search)
      const groups: Array<{pack_id: string, pack_name: string, pack_collection_id: string, recipe_count?: number}> = [];
      (response.packs || []).forEach((pack: any) => {
        groups.push({
          pack_id: pack.pack_id,
          pack_name: pack.pack_name || pack.name || pack.pack_id,
          pack_collection_id: selectedCollection,
        });
      });
      
      // Save all packs and reset visible slice and filters
      setAllPackGroups(groups);
      // Apply current search filter on client
      const filtered = debouncedSearchQuery
        ? groups.filter(g => g.pack_name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
        : groups;
      setVisibleCount(20);
      setPackGroups(filtered.slice(0, 20));
    } catch (error) {
      console.error('Failed to fetch pack groups:', error);
      setAllPackGroups([]);
      setPackGroups([]);
    } finally {
      setLoadingRecipes(false);
    }
  };

  // Client-side search and infinite scroll
  useEffect(() => {
    // Re-filter when search changes
    const filtered = debouncedSearchQuery
      ? allPackGroups.filter(g => g.pack_name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
      : allPackGroups;
    setVisibleCount(20);
    setPackGroups(filtered.slice(0, 20));
  }, [debouncedSearchQuery, allPackGroups]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sentinelId = 'fusion-packs-load-more';
    let sentinel = document.getElementById(sentinelId);
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.id = sentinelId;
      sentinel.style.height = '1px';
      document.body.appendChild(sentinel);
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Load more packs if available
          const filtered = debouncedSearchQuery
            ? allPackGroups.filter(g => g.pack_name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
            : allPackGroups;
          if (visibleCount < filtered.length) {
            const next = Math.min(filtered.length, visibleCount + 20);
            setPackGroups(filtered.slice(0, next));
            setVisibleCount(next);
          }
        }
      });
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [debouncedSearchQuery, allPackGroups, visibleCount]);

  // Fetch recipes for a specific pack
  const fetchPackRecipes = async (packId: string) => {
    if (packRecipes.has(packId) || !selectedCollection) return;  // Remove uid check - recipes can be viewed without login
    
    setLoadingPacks(prev => new Set(prev).add(packId));
    
    try {
      const response = await getFusionRecipes({
        collection_id: selectedCollection,
        pack: packId,
        page: 1,
        per_page: 100, // Get all recipes for this pack
        sort_by: 'result_card_id',
        sort_order: 'asc'
      });
      
      // Extract recipes for this pack
      let packRecipeList: FusionRecipe[] = [];
      response.collections.forEach(collection => {
        collection.packs.forEach(pack => {
          if (pack.pack_id === packId) {
            packRecipeList = pack.cards;
          }
        });
      });
      
      setPackRecipes(prev => new Map(prev).set(packId, packRecipeList));
    } catch (error) {
      console.error(`Failed to fetch recipes for pack ${packId}:`, error);
    } finally {
      setLoadingPacks(prev => {
        const newSet = new Set(prev);
        newSet.delete(packId);
        return newSet;
      });
    }
  };

  // Handle pack expansion
  const handlePackExpand = async (packId: string) => {
    const isExpanding = !expandedPacks.has(packId);
    
    if (isExpanding) {
      setExpandedPacks(prev => new Set(prev).add(packId));
      if (!packRecipes.has(packId)) {
        await fetchPackRecipes(packId);
      }
    } else {
      setExpandedPacks(prev => {
        const newSet = new Set(prev);
        newSet.delete(packId);
        return newSet;
      });
    }
  };



  // 重置合成结果
  const resetSynthesis = () => {
    setShowResult(false);
    setSynthesisResult(null);
  };

  // 触发传说卡片特效
  const triggerLegendaryEffect = () => {
    const end = Date.now() + (3 * 1000); // 特殊合成的特效更长
    const colors = ['#FFD700', '#FF1493', '#00FFFF', '#FF4500', '#9370DB', '#32CD32'];

    (function frame() {
      confetti({
        particleCount: 12,
        angle: 60,
        spread: 60,
        origin: { x: 0.2, y: 0.6 },
        colors: colors,
        gravity: 0.8,
        scalar: 1.2
      });
      confetti({
        particleCount: 12,
        angle: 120,
        spread: 60,
        origin: { x: 0.8, y: 0.6 },
        colors: colors,
        gravity: 0.8,
        scalar: 1.2
      });
      confetti({
        particleCount: 10,
        angle: 90,
        spread: 50,
        origin: { x: 0.5, y: 0.7 },
        colors: colors,
        gravity: 0.7,
        scalar: 1.5
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }

  // 移除了不再使用的函数

  return (
    <>
      {showRecipeDetail ? (
        <div className={`w-full max-w-6xl mx-auto ${styles.recipeDetailMobile || ''}`}>
          {/* 返回按钮 */}
          <div className="mb-6">
            <button
              onClick={() => {
                setShowRecipeDetail(false);
                setSelectedRecipe(null);
              }}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to recipes
            </button>
          </div>
          
          {/* 配方详情页面 */}
          {selectedRecipe && (
            <div className="flex flex-col items-center">
              {/* 顶部配方卡片 */}
              <div className="mb-8">
                <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-xl p-6 border border-purple-400/30">
                  <div className="text-center mb-4">
                    <h2 className="text-2xl font-bold text-white mb-2">{selectedRecipe.result_card_name || selectedRecipe.result_card_id}</h2>
                    <div className="text-gray-400">Fusion Recipe</div>
                    {/* 卡包ID红框 - 可点击跳转 */}
                    {selectedRecipe.pack_id && (
                      <div className="mt-2">
                        <Link 
                          href={`/packs/${selectedRecipe.pack_collection_id || selectedRecipe.card_collection_id}/${selectedRecipe.pack_id}`}
                          className="inline-block"
                        >
                          <div className="bg-red-600/20 border-2 border-red-500 rounded-lg px-3 py-1 text-red-400 text-sm font-bold hover:bg-red-600/30 hover:border-red-400 transition-colors cursor-pointer">
                            {(selectedRecipe as any).pack_name || selectedRecipe.pack_id}
                          </div>
                        </Link>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-center">
                    <div className="relative">
                      <div 
                        className="w-48 h-64 max-md:w-32 max-md:h-44 bg-gray-700 rounded-lg flex items-center justify-center border-2 resultCard"
                        style={{ borderColor: 'rgba(160, 134, 255, 0.4)' }}
                      >
                        <LazyImage 
                          src={selectedRecipe.result_card_image_url} 
                          alt={selectedRecipe.result_card_name || selectedRecipe.result_card_id} 
                          fill
                          className="object-cover rounded-lg"
                          eager
                        />
                        <div className="hidden w-full h-full items-center justify-center text-gray-400 text-sm">
                          {selectedRecipe.result_card_name || selectedRecipe.result_card_id}
                        </div>
                      </div>
                      

                    </div>
                  </div>
                </div>
              </div>
              
              {/* 树状连接线 */}
               <div className="relative mb-12">
                 {/* 垂直连接线 */}
                 <div className="w-1 h-20 bg-gray-400 mx-auto"></div>
                 
                 {/* 分叉点 */}
                 <div className="w-4 h-4 bg-gray-400 rounded-full mx-auto -mt-2 mb-6 border-2 border-gray-800"></div>
                 
                 {/* 水平连接线容器 */}
                 <div className="flex justify-center mb-6">
                   <div className="relative" style={{width: `${selectedRecipe.ingredients.length * 240 + (selectedRecipe.ingredients.length - 1) * 48}px`}}>
                     {/* 主水平线 */}
                     <div className="absolute top-0 left-0 right-0 h-1 bg-gray-400"></div>
                     
                     {/* 每个材料的垂直连接线 */}
                     {selectedRecipe.ingredients.map((_, index) => (
                       <div 
                         key={index}
                         className="absolute w-1 h-12 bg-gray-400"
                         style={{
                           left: `${index * 288 + 120}px`,
                           top: '0px'
                         }}
                       ></div>
                     ))}
                   </div>
                 </div>
               </div>
               
               {/* 材料卡片网格 - 居中对齐，与配方卡片尺寸一致 */}
               <div className="flex justify-center mb-8">
                 <div className={`flex justify-center mb-6 max-md:flex-col max-md:gap-6 max-md:items-center ${styles.ingredientsGrid || ''}`} style={{width: `${selectedRecipe.ingredients.length * 288 + (selectedRecipe.ingredients.length - 1) * 48}px`}}>
                   {selectedRecipe.ingredients.map((ingredient, index) => (
                      <div key={`${ingredient.card_id}-${index}`} className={`relative flex-1 max-md:w-full max-md:max-w-xs ${styles.ingredientCard || ''}`} style={{maxWidth: '288px'}}>
                        <Link 
                          href={`/packs/${selectedRecipe.pack_collection_id || selectedRecipe.card_collection_id}/${selectedRecipe.pack_id}?card=${ingredient.card_id}`}
                          className="block"
                          title="View in pack details"
                        >
                          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600 h-full hover:border-purple-400 transition-colors">
                            {/* 材料标题 */}
                          <div className="text-center mb-2">
                              <div className="text-white text-sm font-medium truncate" title={ingredient.card_name || ingredient.card_reference || ingredient.card_id}>
                                {ingredient.card_name || ingredient.card_reference || ingredient.card_id}
                              </div>
                            </div>
                            
                            {/* 材料卡片图片 - 与配方卡片相同尺寸 */}
                            <div className="relative mb-2 flex justify-center">
                              <div 
                                className="bg-gray-700 rounded flex items-center justify-center border-2 relative w-48 h-64 max-md:w-32 max-md:h-44"
                                style={{ borderColor: 'rgba(160, 134, 255, 0.2)' }}
                              >
                                {ingredient.image_url ? (
                                  <LazyImage 
                                    src={ingredient.image_url} 
                                    alt={ingredient.card_name || ingredient.card_reference || ingredient.card_id} 
                                    fill
                                    className="object-cover rounded"
                                    onError={() => {}}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center px-2">
                                    {ingredient.card_name || ingredient.card_reference || ingredient.card_id}
                                  </div>
                                )}
                                
                                {/* 数量显示 - (拥有/需要) 格式 */}
                                <div className={`absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs font-bold text-white z-10 ${
                                  uid ? (
                                    (ingredient.user_quantity || 0) >= ingredient.quantity 
                                      ? 'bg-green-600' 
                                      : 'bg-red-600'
                                  ) : 'bg-gray-600'
                                }`}>
                                  {uid ? (
                                    `(${ingredient.user_quantity || 0}/${ingredient.quantity})`
                                  ) : (
                                    `x${ingredient.quantity}`
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* 点数显示 */}
                            {typeof ingredient.point_worth === 'number' && (
                              <div className="text-center mt-1">
                                <div className="inline-flex items-center gap-1 text-xs text-gray-300">
                                  <Image src="/users/coin.png" alt="Coin" width={12} height={12} />
                                  <span>{ingredient.point_worth}</span>
                                </div>
                              </div>
                            )}
                            
                            {/* 材料类型标识 */}
                             <div className="text-center text-xs text-gray-400 mt-1">
                              Material
                             </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                 </div>
               </div>
              
              {/* 合成按钮区域 */}
              <div className={`flex gap-4 justify-center max-md:flex-col max-md:w-full ${styles.buttonGroup || ''}`}>
                <button
                  onClick={() => {
                    setShowRecipeDetail(false);
                    setSelectedRecipe(null);
                  }}
                  className={`text-white px-8 py-3 text-[16px] transition-all max-md:w-full ${styles.actionButton || ''}`}
                  style={{
                    background: 'rgba(136,104,255,0.2)',
                    borderRadius: '19px',
                    border: '1px solid #8868FF'
                  }}
                >
                  Back
                </button>
                
                <button
                  onClick={() => {
                    if (selectedRecipe) {
                      handleFusion(selectedRecipe);
                    }
                  }}
                  disabled={!selectedRecipe || !selectedRecipe.can_perform_fusion || isLoading}
                  className={`text-white px-8 py-3 text-[16px] transition-all disabled:cursor-not-allowed disabled:opacity-50 max-md:w-full ${styles.actionButton || ''}`}
                  style={{
                    background: 'rgba(136,104,255,0.2)',
                    borderRadius: '19px',
                    border: '1px solid #8868FF'
                  }}
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Fusing...
                    </span>
                  ) : (
                    uid ? 'Fuse' : 'Login to Fuse'
                  )}
                </button>
              </div>
              

            </div>
          )}
        </div>
      ) : !showResult ? (
        <div className={`w-full ${styles.specialSynthesisMobile || ''}`}>
          {/* 顶部筛选区域 */}
          <div className={`flex items-center justify-between mb-6 gap-4 max-md:flex-col max-md:items-stretch ${styles.filterSection || ''}`}>
            {/* Collection dropdown selector */}
            <CustomDropdown
              value={selectedCollection}
              onChange={setSelectedCollection}
              options={collections}
              placeholder="Select Collection"
            />
            
            <div className={`flex items-center gap-4 flex-shrink-0 max-md:w-full max-md:flex-col max-md:gap-2 ${styles.searchSection || ''}`}>
              <input
                type="text"
                placeholder="Search packs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`bg-gray-700 text-white px-4 py-2 rounded-lg text-sm border-none outline-none max-md:w-full ${styles.searchInput || ''}`}
              />
              <div className="text-gray-400 text-sm whitespace-nowrap">
                {packGroups.length} packs found
              </div>
            </div>
          </div>
          
          {/* 加载状态 */}
          {loadingRecipes ? (
            <div className="flex justify-center items-center py-12">
              <div className="text-gray-400">Loading fusion recipes...</div>
            </div>
          ) : (
            <>
              {/* 按卡包分组显示 - 使用展开/折叠方式 */}
              {packGroups.length > 0 && packGroups.map((packGroup) => (
                <div key={packGroup.pack_id} id={`pack-${packGroup.pack_id}`} className="mb-6">
                  {/* 卡包标题行 - 可点击展开/折叠 */}
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => handlePackExpand(packGroup.pack_id)}
                      className="flex-1 flex items-center gap-2 text-white font-bold cursor-pointer transition-all hover:opacity-80 px-4 py-2"
                      style={{ background: 'rgba(136,104,255,0.2)', borderRadius: '19px', border: '1px solid #8868FF', fontSize: '14px' }}
                    >
                      {/* 展开/折叠箭头 */}
                      <svg 
                        className={`w-4 h-4 transition-transform flex-shrink-0 ${expandedPacks.has(packGroup.pack_id) ? 'rotate-90' : ''}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div className="flex-1 text-left">
                        {packGroup.pack_name}
                      </div>
                    </button>
                    
                    {/* 链接到卡包详情 - 简化为图标 */}
                    <Link 
                      href={`/packs/${packGroup.pack_collection_id}/${packGroup.pack_id}`}
                      className="text-purple-400 hover:text-purple-300 transition-colors p-2"
                      title="View pack details"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  </div>
                  
                  {/* 该卡包的融合配方网格 - 只在展开时显示 */}
                  {expandedPacks.has(packGroup.pack_id) && (
                    <div className="ml-6">
                      {loadingPacks.has(packGroup.pack_id) ? (
                        <div className="flex justify-center items-center py-8">
                          <div className="text-gray-400">Loading recipes...</div>
                        </div>
                      ) : (
                        <div className={`grid grid-cols-6 gap-4 max-md:grid-cols-2 ${styles.recipeGrid || ''}`}>
                          {packRecipes.get(packGroup.pack_id)?.map((recipe) => {
                            const hasAllCards = uid && recipe.cards_needed === 0;
                            
                            return (
                              <div key={`${recipe.result_card_id}-${recipe.pack_id}`} className="relative">
                                <div 
                                  className={`bg-gray-800 rounded-lg p-3 border border-gray-600 hover:border-purple-400 transition-colors cursor-pointer max-md:p-4 ${styles.recipeCard || ''}`}
                                  onClick={async () => {
                                    setLoadingRecipeDetail(true);
                                    try {
                                      // If user is not logged in, create a basic recipe from available data
                                      if (!uid) {
                                        // Convert FusionRecipe to FusionRecipeWithUserInfo format
                                        const basicRecipe: FusionRecipeWithUserInfo = {
                                          result_card_id: recipe.result_card_id,
                                          card_collection_id: recipe.card_collection_id,
                                          card_reference: recipe.card_reference,
                                          pack_id: recipe.pack_id,
                                          pack_collection_id: recipe.pack_collection_id,
                                          ingredients: recipe.ingredients.map(ing => ({
                                            ...ing,
                                            user_quantity: 0,
                                            has_enough: false
                                          })),
                                          result_card_name: recipe.result_card_details?.card_name || recipe.result_card_name,
                                          result_card_image_url: recipe.result_card_details?.image_url || recipe.result_card_image,
                                          result_card_point_worth: recipe.result_card_details?.point_worth || recipe.point_worth,
                                          cards_needed: recipe.total_cards_needed,
                                          total_cards_needed: recipe.total_cards_needed,
                                          can_perform_fusion: false
                                        };
                                        setSelectedRecipe({...basicRecipe, pack_name: packGroup.pack_name});
                                        setShowRecipeDetail(true);
                                      } else {
                                        // User is logged in, fetch full recipe with user info
                                        const detailedRecipe = await getFusionRecipeWithUserInfo({
                                          pack_collection_id: recipe.pack_collection_id,
                                          pack_id: recipe.pack_id,
                                          result_card_id: recipe.result_card_id
                                        });
                                        setSelectedRecipe({...detailedRecipe, pack_name: packGroup.pack_name});
                                        setShowRecipeDetail(true);
                                      }
                                    } catch (error) {
                                      console.error('Failed to fetch recipe details:', error);
                                      toast.error('Failed to load recipe details');
                                    } finally {
                                      setLoadingRecipeDetail(false);
                                    }
                                  }}
                                >
                                  {/* 标题 */}
                                  <div className="text-center mb-1">
                                    <div className={`text-white text-sm font-medium truncate max-md:text-xs max-md:leading-tight ${styles.recipeTitle || ''}`} title={recipe.result_card_details?.card_name || recipe.result_card_name || recipe.result_card_id}>
                                      {recipe.result_card_details?.card_name || recipe.result_card_name || recipe.result_card_id}
                                    </div>
                                  </div>
                                  
                                  {/* 卡牌图片容器 */}
                                  <div className="relative mb-1">
                                    <div 
                                      className="aspect-[3/4] bg-gray-700 rounded flex items-center justify-center border-2"
                                      style={{ borderColor: 'rgba(160, 134, 255, 0.2)' }}
                                    >
                                      <LazyImage 
                                        src={recipe.result_card_details?.image_url || recipe.result_card_image} 
                                        alt={recipe.result_card_name || recipe.result_card_id} 
                                        fill
                                        className="object-cover rounded"
                                      />
                                      <div className="hidden w-full h-full items-center justify-center text-gray-400 text-xs">
                                        {recipe.result_card_details?.card_name || recipe.result_card_name || recipe.result_card_id}
                                      </div>
                                    </div>
                                    
                                    {/* 左上角数量小方块 - 只在登录时显示拥有数量 */}
                                    <div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5 text-xs font-bold z-10">
                                      <span className={uid ? (hasAllCards ? "text-green-400" : "text-red-400") : "text-gray-400"}>
                                        {uid ? (
                                          `${Math.max(0, recipe.total_cards_needed - (recipe.cards_needed || 0))}/${recipe.total_cards_needed || 0}`
                                        ) : (
                                          `${recipe.total_cards_needed || 0} cards`
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* 积分 */}
                                  <div className="flex items-center justify-center gap-1 mb-1">
                                    <Image 
                                      src="/payment/coin.png" 
                                      alt="Coin" 
                                      width={16}
                                      height={16}
                                    />
                                    <span className="text-yellow-400 text-sm font-bold">{recipe.result_card_details?.point_worth || recipe.point_worth || '0'}</span>
                                  </div>
                                  
                                  {/* 点击查看详情提示 */}
                                  <div className="text-center text-xs text-gray-400 mt-1">
                                    Click to view recipe
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Infinite scroll sentinel */}
              <div id="fusion-packs-load-more" className="h-1" />
              
              {/* 无数据提示 */}
              {packGroups.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-gray-400">No fusion recipes found</div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="fixed inset-0 bg-black/80 z-[100000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="flex flex-col items-center justify-center w-full max-w-4xl relative text-center">
          {synthesisResult ? (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="relative w-[320px] h-[450px] rounded-2xl overflow-hidden z-[100000]"
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
                <div className="relative z-[100001] w-full h-full p-4">
                  {synthesisResult.image_url ? (
                    <LazyImage 
                      src={synthesisResult.image_url} 
                      alt={synthesisResult.card_name} 
                      fill
                      className="object-cover rounded-xl"
                      eager
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-700 rounded-xl">
                      {synthesisResult.card_name}
                    </div>
                  )}
                </div>
              </motion.div>
              
              <div className="text-center mt-8 mb-6">
                {/* 显示金币数量和积分数值 */}
                <div className="flex items-center justify-center gap-6">
                  <div className="flex items-center justify-center gap-3">
                    <Image 
                      src="/payment/coin.png" 
                      alt="Point Worth" 
                      width={32}
                      height={32}
                    />
                    <span className="text-2xl font-bold text-[#FFD700]">
                      {synthesisResult.point_worth || '199.99'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* 操作按钮区域 - 只保留一个按钮 */}
              <div className="mt-8 flex justify-center w-full max-w-md">
                <motion.button
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 0.5 }}
                   onClick={resetSynthesis}
                   className="w-full bg-gradient-to-r from-[#6C5DD3] to-[#8B7ED8] text-white py-3 px-6 rounded-lg font-medium hover:from-[#5A4BC4] hover:to-[#7A6FD3] transition-all duration-200 shadow-lg text-base"
                 >
                   Confirm
                 </motion.button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="w-[300px] h-[420px] rounded-xl bg-red-900/30 flex items-center justify-center mb-6">
                <span className="text-red-400 text-xl">Fusion Failed</span>
              </div>
              <h2 className="text-3xl font-bold text-red-400 mb-2">Fusion Failed!</h2>
              <button 
                onClick={resetSynthesis}
                className="bg-[#1F1D2B] text-white px-6 py-3 rounded-xl hover:bg-[#2A2839] transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
        </div>
      )}
      
      {/* 移除了卡片选择弹窗 */}
    </>
  )
}