import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest
) {
  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id');
    const sortBy = searchParams.get('sort_by') || 'date_got';
    const sortOrder = searchParams.get('sort_order') || 'desc';
    const searchQuery = searchParams.get('search_query') || '';

    // 这里应该调用实际的后端API
    // 暂时返回模拟数据
    const mockUserCards = {
      "subcollections": [
        {
          "subcollection_name": "Base Set",
          "cards": [
            {
              "card_reference": "pokemon_001",
              "card_name": "Pikachu",
              "date_got": "2025-01-15T10:30:00.000Z",
              "id": "card_001",
              "image_url": "https://images.pokemontcg.io/base1/25_hires.png",
              "point_worth": 100,
              "quantity": 2,
              "rarity": 3,
              "locked_quantity": 0,
              "expireAt": "2026-01-15T10:30:00.000Z",
              "buybackexpiresAt": "2025-07-15T10:30:00.000Z",
              "request_date": "2025-01-15T10:30:00.000Z",
              "subcollection_name": "Base Set"
            },
            {
              "card_reference": "pokemon_002",
              "card_name": "Charizard",
              "date_got": "2025-01-14T15:20:00.000Z",
              "id": "card_002",
              "image_url": "https://images.pokemontcg.io/base1/4_hires.png",
              "point_worth": 500,
              "quantity": 1,
              "rarity": 5,
              "locked_quantity": 0,
              "expireAt": "2026-01-14T15:20:00.000Z",
              "buybackexpiresAt": "2025-07-14T15:20:00.000Z",
              "request_date": "2025-01-14T15:20:00.000Z",
              "subcollection_name": "Base Set"
            },
            {
              "card_reference": "pokemon_003",
              "card_name": "Blastoise",
              "date_got": "2025-01-13T09:15:00.000Z",
              "id": "card_003",
              "image_url": "https://images.pokemontcg.io/base1/2_hires.png",
              "point_worth": 300,
              "quantity": 1,
              "rarity": 4,
              "locked_quantity": 0,
              "expireAt": "2026-01-13T09:15:00.000Z",
              "buybackexpiresAt": "2025-07-13T09:15:00.000Z",
              "request_date": "2025-01-13T09:15:00.000Z",
              "subcollection_name": "Base Set"
            },
            {
              "card_reference": "pokemon_004",
              "card_name": "Venusaur",
              "date_got": "2025-01-12T14:45:00.000Z",
              "id": "card_004",
              "image_url": "https://images.pokemontcg.io/base1/15_hires.png",
              "point_worth": 280,
              "quantity": 1,
              "rarity": 4,
              "locked_quantity": 0,
              "expireAt": "2026-01-12T14:45:00.000Z",
              "buybackexpiresAt": "2025-07-12T14:45:00.000Z",
              "request_date": "2025-01-12T14:45:00.000Z",
              "subcollection_name": "Base Set"
            }
          ],
          "pagination": {
            "total_items": 4,
            "items_per_page": 50,
            "current_page": 1,
            "total_pages": 1
          },
          "filters": {
            "sort_by": sortBy,
            "sort_order": sortOrder,
            "search_query": searchQuery,
            "collection_id": collectionId || "",
            "filter_out_accepted": true
          }
        }
      ]
    };

    return NextResponse.json(mockUserCards);
  } catch (error) {
    console.error('Error fetching user cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user cards' },
      { status: 500 }
    );
  }
}