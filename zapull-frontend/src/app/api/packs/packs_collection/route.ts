import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 这里应该调用实际的后端API
    // 暂时返回模拟数据
    const collections = [
      {
        "id": "one_piece",
        "name": "One Piece",
        "image_url": null,
        "win_rate": null,
        "max_win": null,
        "min_win": null,
        "popularity": 0,
        "price": null,
        "created_at": null,
        "is_active": null
      },
      {
        "id": "pokemon",
        "name": "Pokemon",
        "image_url": null,
        "win_rate": null,
        "max_win": null,
        "min_win": null,
        "popularity": 0,
        "price": null,
        "created_at": null,
        "is_active": null
      },
      {
        "id": "magic",
        "name": "Magic",
        "image_url": null,
        "win_rate": null,
        "max_win": null,
        "min_win": null,
        "popularity": 0,
        "price": null,
        "created_at": null,
        "is_active": null
      }
    ];

    return NextResponse.json(collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}