import asyncio
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.cloud import firestore

async def check_card():
    db = firestore.AsyncClient(project='zapull-production')
    card_id = 'eabdeeaf-7a9b-4800-a66b-7055cbfab920'
    
    # Check Rainbow Vault
    rainbow_ref = db.collection('packs').document('pokemon').collection('pokemon').document('Rainbow Vault')
    rainbow_pack = await rainbow_ref.get()
    if rainbow_pack.exists:
        data = rainbow_pack.to_dict()
        cards = data.get('cards', {})
        in_rainbow = card_id in cards
        print(f'Card in Rainbow Vault: {in_rainbow}')
    
    # Check Rayquaza pack
    ray_ref = db.collection('packs').document('pokemon').collection('pokemon').document('46a1f99d-d349-4708-9307-0bf012e8fa34')
    ray_pack = await ray_ref.get()
    if ray_pack.exists:
        data = ray_pack.to_dict()
        cards = data.get('cards', {})
        in_ray = card_id in cards
        pack_name = data.get('name', data.get('pack_name', ''))
        print(f'Card in {pack_name}: {in_ray}')
    
    # Check card fusion refs
    card_ref = db.collection('pokemon').document(card_id)
    card = await card_ref.get()
    if card.exists:
        card_data = card.to_dict()
        fusions = card_data.get('used_in_fusion', [])
        print(f'\nCard has {len(fusions)} fusion refs:')
        for f in fusions:
            print(f'  Pack ref: {f.get("pack_reference")}')

asyncio.run(check_card())
