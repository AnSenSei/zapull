import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();
    const { card1_id, card2_id, collection_id } = body;

    if (!card1_id || !card2_id || !collection_id) {
      return NextResponse.json(
        { error: 'Missing required parameters: card1_id, card2_id, collection_id' },
        { status: 400 }
      );
    }

    // 这里应该调用实际的后端API
    // 暂时返回模拟的合成结果
    const mockFusionResult = {
      "success": true,
      "message": "Fusion successful!",
      "result_card": {
        "card_reference": "pokemon_fusion_001",
        "card_name": "Fusion Pikachu",
        "date_got": new Date().toISOString(),
        "id": "fusion_card_001",
        "image_url": "https://images.pokemontcg.io/base1/25_hires.png",
        "point_worth": 250,
        "quantity": 1,
        "rarity": 4,
        "locked_quantity": 0,
        "expireAt": new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        "buybackexpiresAt": new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        "request_date": new Date().toISOString(),
        "subcollection_name": "Fusion Cards"
      },
      "ingredients_used": [
        {
          "card_id": card1_id,
          "quantity_used": 1
        },
        {
          "card_id": card2_id,
          "quantity_used": 1
        }
      ],
      "user_balance_updated": {
        "previous_balance": 1000,
        "new_balance": 1000,
        "points_gained": 0
      }
    };

    // 模拟一些随机性
    const randomSuccess = Math.random() > 0.1; // 90% 成功率
    
    if (!randomSuccess) {
      return NextResponse.json({
        "success": false,
        "message": "Fusion failed! The cards were not compatible.",
        "result_card": null,
        "ingredients_used": [
          {
            "card_id": card1_id,
            "quantity_used": 1
          },
          {
            "card_id": card2_id,
            "quantity_used": 1
          }
        ],
        "user_balance_updated": {
          "previous_balance": 1000,
          "new_balance": 1000,
          "points_gained": 0
        }
      });
    }

    return NextResponse.json(mockFusionResult);
  } catch (error) {
    console.error('Error performing fusion:', error);
    return NextResponse.json(
      { error: 'Failed to perform fusion' },
      { status: 500 }
    );
  }
}