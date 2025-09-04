export interface Collection {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  imagePath: string;
}

export const COLLECTIONS: Collection[] = [
  {
    id: 'pokemon',
    name: 'pokemon',
    displayName: 'Pokémon',
    icon: '🎮',
    imagePath: '/header/collection-2.webp'
  },
  {
    id: 'one_piece',
    name: 'one_piece', 
    displayName: 'One Piece',
    icon: '🏴‍☠️',
    imagePath: '/header/collection-3.webp'
  },
  {
    id: 'magic',
    name: 'magic',
    displayName: 'Magic',
    icon: '🪄',
    imagePath: '/header/collection-4.webp'
  }
];

export const getCollectionById = (id: string): Collection | undefined => {
  return COLLECTIONS.find(col => col.id === id);
};

export const getCollectionIcon = (id: string): string => {
  const collection = getCollectionById(id);
  return collection?.icon || '📦';
};

export const getCollectionImagePath = (id: string): string => {
  // Normalize the ID to handle different formats
  const normalizedId = id?.toLowerCase().replace(/[_\s-]/g, '');
  
  // Map various possible values to collection IDs
  if (normalizedId?.includes('pokemon') || normalizedId?.includes('pokémon')) {
    return COLLECTIONS.find(c => c.id === 'pokemon')?.imagePath || '/header/collection-2.webp';
  }
  if (normalizedId?.includes('onepiece') || normalizedId?.includes('one_piece')) {
    return COLLECTIONS.find(c => c.id === 'one_piece')?.imagePath || '/header/collection-3.webp';
  }
  if (normalizedId?.includes('magic')) {
    return COLLECTIONS.find(c => c.id === 'magic')?.imagePath || '/header/collection-4.webp';
  }
  
  // Try direct lookup
  const collection = getCollectionById(id);
  return collection?.imagePath || '/header/collection-1.webp';
};

export const getCollectionDisplayName = (id: string): string => {
  const collection = getCollectionById(id);
  return collection?.displayName || id;
};