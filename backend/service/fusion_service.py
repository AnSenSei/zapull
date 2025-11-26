from typing import List, Optional, Dict, Any, Union
from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, ArrayUnion

from config import get_logger
from models.fusion_schema import (
    FusionRecipe, FusionIngredient, FusionIngredientRequest, 
    CreateFusionRecipeRequest, UpdateFusionRecipeRequest,
    PaginationInfo, AppliedFilters, FusionRecipePack, 
    FusionRecipeCollection, PaginatedFusionRecipesResponse,
    CardFusionInfo, CardFusionsResponse
)
from service.storage_service import update_card_information
# No need for storage utils - R2 URLs are public

logger = get_logger(__name__)

async def create_fusion_recipe(
    recipe_data: CreateFusionRecipeRequest,
    db_client: AsyncClient
) -> str:
    """
    Creates a new fusion recipe in Firestore.
    Stores the recipe in a sub-collection under pack_collection_id.
    Also adds metadata to the collection and pack documents.

    Args:
        recipe_data: The CreateFusionRecipeRequest model containing recipe details
        db_client: Firestore client

    Returns:
        str: The ID of the created recipe (same as result_card_id)

    Raises:
        HTTPException: If there's an error creating the recipe
    """
    if not db_client:
        logger.error("Firestore client not provided to create_fusion_recipe.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    result_card_id = recipe_data.result_card_id
    card_collection_id = recipe_data.card_collection_id
    pack_id = recipe_data.pack_id
    pack_collection_id = recipe_data.pack_collection_id

    if not result_card_id:
        raise HTTPException(status_code=400, detail="Result card ID cannot be empty.")

    if not card_collection_id:
        raise HTTPException(status_code=400, detail="Card collection ID cannot be empty.")

    if not pack_id:
        raise HTTPException(status_code=400, detail="Pack ID cannot be empty.")

    if not pack_collection_id:
        raise HTTPException(status_code=400, detail="Pack collection ID cannot be empty.")

    try:
        # References to the collection and pack documents
        collection_doc_ref = db_client.collection('fusion_recipes').document(pack_collection_id)
        pack_doc_ref = collection_doc_ref.collection(pack_collection_id).document(pack_id)

        # Use pack_collection_id as a sub-collection, pack_id as a document, and result_card_id as a document in the cards sub-collection
        doc_ref = pack_doc_ref.collection('cards').document(result_card_id)

        # Check if recipe with this ID already exists
        doc = await doc_ref.get()
        if doc.exists:
            logger.warning(f"Fusion recipe with ID '{result_card_id}' already exists")
            raise HTTPException(status_code=409, detail=f"Fusion recipe with ID '{result_card_id}' already exists")

        # Resolve pack_name early so we can include it in the pre-upsert as well
        early_pack_name = pack_id
        try:
            early_packs_pack_doc_ref = (
                db_client.collection('packs')
                .document(pack_collection_id)
                .collection(pack_collection_id)
                .document(pack_id)
            )
            early_packs_pack_doc = await early_packs_pack_doc_ref.get()
            if early_packs_pack_doc.exists:
                early_packs_pack_data = early_packs_pack_doc.to_dict()
                early_pack_name = (
                    early_packs_pack_data.get("name")
                    or early_packs_pack_data.get("pack_name")
                    or pack_id
                )
        except Exception as e:
            logger.warning(f"[Pre] Failed to resolve early pack_name: {e}")

        # Pre-upsert the pack document to ensure the parent exists before any subcollection writes
        try:
            pre_pack_doc = await pack_doc_ref.get()
            pre_pack_metadata = {
                "collection_id": pack_collection_id,
                "pack_id": pack_id,
                "pack_collection_id": pack_collection_id,
                "pack_name": early_pack_name,
                "has_fusion_recipes": True,
                "last_updated": firestore.SERVER_TIMESTAMP,
            }
            if not pre_pack_doc.exists:
                pre_pack_metadata["created_at"] = firestore.SERVER_TIMESTAMP
                logger.info(f"[Pre] Creating pack doc before recipe: fusion_recipes/{pack_collection_id}/{pack_collection_id}/{pack_id}")
            else:
                logger.info(f"[Pre] Pack doc exists before recipe: fusion_recipes/{pack_collection_id}/{pack_collection_id}/{pack_id}")
            await pack_doc_ref.set(pre_pack_metadata, merge=True)
            logger.info("[Pre] Upserted minimal pack metadata (pre-recipe), including pack_name")
        except Exception as e:
            logger.warning(f"[Pre] Failed to upsert pack metadata before recipe: {e}")

        # Get collection metadata to create card_reference
        card_reference = None
        try:
            from service.storage_service import get_collection_metadata
            metadata = await get_collection_metadata(recipe_data.card_collection_id)
            card_reference = f"{metadata.firestoreCollection}/{result_card_id}"
            logger.info(f"Created card_reference: {card_reference}")
        except Exception as e:
            logger.warning(f"Could not create card_reference: {e}")
            # If we can't get the metadata, use the card_collection_id as is
            card_reference = f"{recipe_data.card_collection_id}/{result_card_id}"

        # Get collection metadata once for all ingredients
        from service.storage_service import get_collection_metadata
        global_card_collection = recipe_data.card_collection_id
        collection_name = recipe_data.card_collection_id

        try:
            metadata = await get_collection_metadata(recipe_data.card_collection_id)
            global_card_collection = metadata.firestoreCollection
            collection_name = metadata.firestoreCollection
            logger.info(f"Using metadata firestoreCollection path: '{global_card_collection}' and name: '{collection_name}'")
        except Exception as e:
            logger.warning(f"Could not get collection metadata: {e}")
            # If we can't get the metadata, use the card_collection_id as is

        # Add card_reference to each ingredient and get additional card info
        ingredients_with_reference = []
        for ingredient in recipe_data.ingredients:
            ingredient_data = ingredient.model_dump()
            # Add card_collection_id to each ingredient
            ingredient_data["card_collection_id"] = recipe_data.card_collection_id
            # Create card_reference using the collection name
            ingredient_data["card_reference"] = f"{collection_name}/{ingredient.card_id}"
            logger.info(f"Created card_reference for ingredient: {ingredient_data['card_reference']}")

            # Try to get additional card information
            try:
                card_doc_ref = db_client.collection(collection_name).document(ingredient.card_id)
                card_doc = await card_doc_ref.get()
                if card_doc.exists:
                    card_info = card_doc.to_dict()
                    ingredient_data["card_name"] = card_info.get("card_name", "")
                    ingredient_data["point_worth"] = card_info.get("point_worth", 0)
                    # R2 URLs are public, no need to sign them
                    ingredient_data["image_url"] = card_info.get("image_url", "")
                    
                    # Get probability from pack data
                    ingredient_data["probability"] = 0
                    try:
                        # Get the pack document to retrieve card probabilities
                        pack_doc_ref = db_client.collection('packs').document(recipe_data.pack_collection_id).collection(recipe_data.pack_collection_id).document(recipe_data.pack_id)
                        pack_doc = await pack_doc_ref.get()
                        if pack_doc.exists:
                            pack_data = pack_doc.to_dict()
                            cards_map = pack_data.get("cards", {})
                            # Get probability for this specific card
                            ingredient_data["probability"] = cards_map.get(ingredient.card_id, 0)
                    except Exception as e:
                        logger.warning(f"Failed to get probability for card {ingredient.card_id} from pack data: {e}")
            except Exception as e:
                logger.warning(f"Failed to get ingredient card info for {ingredient.card_id}: {e}")
                # Set default values if we can't get the card info
                ingredient_data["card_name"] = ""
                ingredient_data["image_url"] = ""
                ingredient_data["point_worth"] = 0
                ingredient_data["probability"] = 0

            ingredients_with_reference.append(ingredient_data)

        # Get result card information
        result_card_name = ""
        result_card_image_url = ""
        result_card_point_worth = 0
        try:
            result_card_doc_ref = db_client.collection(collection_name).document(result_card_id)
            result_card_doc = await result_card_doc_ref.get()
            if result_card_doc.exists:
                result_card_info = result_card_doc.to_dict()
                result_card_name = result_card_info.get("card_name", "")
                result_card_point_worth = result_card_info.get("point_worth", 0)
                # Store the GS URL for the result card
                result_card_image_url = result_card_info.get("image_url", "")
        except Exception as e:
            logger.warning(f"Failed to get result card info for {result_card_id}: {e}")

        # Create recipe document data
        recipe_doc_data = {
            "result_card_id": result_card_id,
            "card_collection_id": recipe_data.card_collection_id,
            "card_reference": card_reference,
            "pack_id": recipe_data.pack_id,
            "pack_collection_id": recipe_data.pack_collection_id,
            "ingredients": ingredients_with_reference,
            "created_at": firestore.SERVER_TIMESTAMP,
            "result_card_name": result_card_name,
            "result_card_image_url": result_card_image_url,
            "result_card_point_worth": result_card_point_worth
        }

        # Set the recipe document
        await doc_ref.set(recipe_doc_data)
        logger.info(f"Created fusion recipe document for result card '{result_card_id}'")

        # Add metadata to the collection document
        collection_metadata = {
            "last_updated": firestore.SERVER_TIMESTAMP,
            "collection_name": pack_collection_id,
            "collection_id": pack_collection_id,  # Add collection_id for consistency
            "has_fusion_recipes": True  # Flag to indicate this collection has fusion recipes
        }
        
        # Check if collection document exists
        collection_doc = await collection_doc_ref.get()
        if not collection_doc.exists:
            # If collection doesn't exist, create it with proper metadata
            collection_metadata["created_at"] = firestore.SERVER_TIMESTAMP
            logger.info(f"Creating new collection document for '{pack_collection_id}' in fusion_recipes")
        
        # Use merge=True to update the document without overwriting existing fields
        await collection_doc_ref.set(collection_metadata, merge=True)
        logger.info(f"Updated collection metadata for '{pack_collection_id}'")

        # Post-write: only bump last_updated on the (already pre-upserted) pack doc
        try:
            await pack_doc_ref.update({"last_updated": firestore.SERVER_TIMESTAMP})
            logger.info("Updated fusion pack last_updated timestamp")
        except Exception as e:
            logger.warning(f"Failed to update last_updated on fusion pack doc: {e}")

        # Update each ingredient card with fusion information
        for ingredient in recipe_data.ingredients:
            try:
                # Create fusion info object with pack_reference instead of package_id
                pack_reference = f"/packs/{recipe_data.pack_collection_id}/{recipe_data.pack_collection_id}/{recipe_data.pack_id}"
                fusion_info = {
                    "fusion_id": result_card_id,  # Using result_card_id as fusion_id
                    "result_card_id": result_card_id,
                    "pack_reference": pack_reference,
                    "result_card_name": result_card_name,
                    "result_card_image_url": result_card_image_url
                }

                # Update the card with the fusion information
                # We need to use ArrayUnion to add to the array without overwriting existing entries
                update_data = {
                    "used_in_fusion": ArrayUnion([fusion_info])
                }

                await update_card_information(
                    document_id=ingredient.card_id,
                    update_data=update_data,
                    collection_name=recipe_data.card_collection_id
                )

                logger.info(f"Updated card '{ingredient.card_id}' (with collection_id '{recipe_data.card_collection_id}') with fusion information")
                
                # Also update the card in the pack's cards subcollection if it exists there
                try:
                    pack_card_ref = db_client.collection('packs').document(recipe_data.pack_collection_id).collection(recipe_data.pack_collection_id).document(recipe_data.pack_id).collection('cards').document(ingredient.card_id)
                    pack_card_doc = await pack_card_ref.get()
                    
                    if pack_card_doc.exists:
                        # Update the card in the pack with the same fusion information
                        await pack_card_ref.update({
                            "used_in_fusion": ArrayUnion([fusion_info])
                        })
                        logger.info(f"Updated card '{ingredient.card_id}' in pack '{recipe_data.pack_id}' with fusion information")
                except Exception as e:
                    # This is optional - if the card isn't in the pack, that's fine
                    logger.debug(f"Card '{ingredient.card_id}' not found in pack '{recipe_data.pack_id}' or error updating: {e}")
                    
            except Exception as e:
                # Log the error but continue with other ingredients
                logger.error(f"Error updating ingredient card '{ingredient.card_id}' with fusion information: {e}", exc_info=True)
                # We don't want to fail the whole recipe creation if updating an ingredient fails
                # So we just log the error and continue

        return result_card_id
    except HTTPException:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error creating fusion recipe in Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating fusion recipe in Firestore: {str(e)}")

async def get_fusion_recipe_by_id(
    pack_id: str,
    pack_collection_id: str,
    result_card_id: str,
    db_client: AsyncClient
) -> FusionRecipe:
    """
    Retrieves a fusion recipe by its pack ID and result card ID from Firestore.
    Retrieves from a sub-collection under pack_collection_id.

    Args:
        pack_id: The ID of the pack
        pack_collection_id: The ID of the pack collection
        result_card_id: The ID of the result card
        db_client: Firestore client

    Returns:
        FusionRecipe: The requested fusion recipe

    Raises:
        HTTPException: If recipe not found or on database error
    """
    if not db_client:
        logger.error("Firestore client not provided to get_fusion_recipe_by_id.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    try:
        doc_ref = db_client.collection('fusion_recipes').document(pack_collection_id).collection(pack_collection_id).document(pack_id).collection('cards').document(result_card_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"Fusion recipe with result card ID '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' not found")
            raise HTTPException(status_code=404, detail=f"Fusion recipe with result card ID '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' not found")

        recipe_data = doc.to_dict()

        # Convert ingredients data to FusionIngredient objects
        ingredients = []
        for ingredient_data in recipe_data.get('ingredients', []):
            ingredients.append(FusionIngredient(**ingredient_data))

        return FusionRecipe(
            result_card_id=recipe_data.get('result_card_id'),
            card_collection_id=recipe_data.get('card_collection_id'),
            card_reference=recipe_data.get('card_reference'),
            pack_id=recipe_data.get('pack_id'),
            pack_collection_id=recipe_data.get('pack_collection_id'),
            ingredients=ingredients
        )
    except HTTPException:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error retrieving fusion recipe '{result_card_id}' from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve fusion recipe '{result_card_id}' from database.")

async def get_all_fusion_recipes(
    db_client: AsyncClient,
    collection_id: Optional[str] = None,
    pack: Optional[str] = None,
    user_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "result_card_id",
    sort_order: str = "desc",
    search_query: Optional[str] = None,
    card_name_search: Optional[str] = None,
    pack_name_search: Optional[str] = None
) -> Dict[str, Any]:
    """
    从 Firestore 中读取 fusion_recipes，结构如下：
    /fusion_recipes/{collection_id}/{collection_id}/{pack_id}/cards/{card_id}

    如果提供了 collection_id，就只读取该 collection_id 文档下的 pack → cards；
    否则遍历 fusion_recipes 下所有顶层文档，再依次读取它们各自同名子集合里的 pack → cards。

    Args:
        db_client: Firestore 的 AsyncClient 实例
        collection_id: 可选，fusion_recipes 下某个文档的 ID（比如 "pokemon"）
        pack: 可选，特定的 pack ID 进行过滤
        user_id: 可选，用户 ID，用于计算每个配方所需的卡片数量
        page: 页码，默认为 1
        per_page: 每页数量，默认为 10
        sort_by: 排序字段，默认为 "result_card_id"
        sort_order: 排序方向，默认为 "desc"
        search_query: 可选，搜索关键词（保留用于向后兼容）
        card_name_search: 可选，按结果卡片名称搜索
        pack_name_search: 可选，按卡包名称搜索

    Returns:
        Dict[str, Any]: 包含分页后的 fusion recipes 列表和分页信息的字典

    Raises:
        HTTPException: Firestore 查询出错时抛出
    """
    if not db_client:
        logger.error("Firestore client not provided to get_all_fusion_recipes.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    try:
        root_col_ref = db_client.collection('fusion_recipes')
        all_collections = []
        total_recipes = 0

        # 获取用户卡片信息（如果提供了 user_id）
        user_cards = {}
        if user_id:
            try:
                user_ref = db_client.collection('users').document(user_id)
                user_doc = await user_ref.get()

                if not user_doc.exists:
                    logger.warning(f"User with ID {user_id} not found")
                else:
                    # 获取用户的所有卡片集合
                    cards_ref = user_ref.collection('cards').document('cards')

                    # 使用 collections() 方法获取子集合
                    async for collection_ref in cards_ref.collections():
                        collection_name = collection_ref.id
                        async for card_doc in collection_ref.stream():
                            card_data = card_doc.to_dict()
                            card_id = card_doc.id
                            user_cards[f"{collection_name}:{card_id}"] = card_data.get('quantity', 0)
            except Exception as e:
                logger.error(f"Error fetching user cards: {e}", exc_info=True)
                # 继续执行，但不计算用户卡片信息
                user_id = None

        # 如果指定了 collection_id，我们只返回该 collection 的信息
        if collection_id:
            # 先检查 fusion_recipes/{collection_id} 是否存在
            top_doc_ref = root_col_ref.document(collection_id)
            top_snapshot = await top_doc_ref.get()
            if not top_snapshot.exists:
                logger.warning(f"顶层文档（fusion_recipes/{collection_id}）不存在，直接返回空对象")
                # 返回空的分页响应
                return PaginatedFusionRecipesResponse(
                    collections=[],
                    pagination=PaginationInfo(
                        total_items=0,
                        total_pages=0,
                        current_page=page,
                        per_page=per_page
                    ),
                    filters=AppliedFilters(
                        sort_by=sort_by,
                        sort_order=sort_order,
                        search_query=search_query
                    )
                )

            # 获取该 collection 下的所有 packs
            second_level_col_ref = root_col_ref.document(collection_id).collection(collection_id)
            packs_list = []
            all_recipes = []

            # 异步遍历这一层下的所有 pack 文档
            async for pack_doc in second_level_col_ref.stream():
                pack_id = pack_doc.id
                
                # 如果指定了 pack 参数，只处理匹配的 pack
                if pack and pack_id != pack:
                    continue

                # 获取该 pack 下的所有 cards
                cards_col_ref = second_level_col_ref.document(pack_id).collection('cards')
                cards_list = []

                # 异步遍历 cards 子集合下的每个 card_doc
                async for card_doc in cards_col_ref.stream():
                    recipe_data = card_doc.to_dict()
                    result_card_id = recipe_data.get('result_card_id')

                    # 处理搜索查询
                    should_skip = False
                    
                    # 按结果卡片名称搜索
                    if card_name_search:
                        card_name_search_lower = card_name_search.lower()
                        result_card_name = recipe_data.get('result_card_name', '').lower()
                        if card_name_search_lower not in result_card_name:
                            should_skip = True
                    
                    # 按卡包名称搜索
                    if pack_name_search:
                        pack_name_search_lower = pack_name_search.lower()
                        pack_data = pack_doc.to_dict()
                        pack_name = pack_data.get('pack_name', pack_id).lower()
                        if pack_name_search_lower not in pack_name:
                            should_skip = True
                    
                    if should_skip:
                        continue

                    # 构造 FusionIngredient 列表
                    ingredients_data = recipe_data.get('ingredients', []) or []
                    ingredients = []

                    # 计算用户拥有的卡片数量和总需要的卡片数量
                    cards_needed = 0
                    total_cards_needed = len(ingredients_data)

                    # Check if we need to update the recipe with missing data
                    needs_update = False
                    if (recipe_data.get('result_card_name') is None or 
                        recipe_data.get('result_card_point_worth') is None or
                        any(ing.get('card_name') is None or ing.get('point_worth') is None or ing.get('probability') is None 
                            for ing in ingredients_data)):
                        needs_update = True
                        
                    if needs_update:
                        # Update the recipe with missing data
                        update_success = await update_fusion_recipe_card_data(
                            pack_collection_id=collection_id,
                            pack_id=pack_id,
                            result_card_id=result_card_id,
                            db_client=db_client
                        )
                        
                        if update_success:
                            # Re-fetch the updated recipe data
                            card_doc = await cards_col_ref.document(result_card_id).get()
                            recipe_data = card_doc.to_dict()
                            ingredients_data = recipe_data.get('ingredients', []) or []

                    for ing in ingredients_data:
                        ing_card_collection_id = ing.get('card_collection_id')
                        ing_card_id = ing.get('card_id')
                        ing_quantity = ing.get('quantity', 1)
                        ing_card_reference = ing.get('card_reference')

                        # 检查用户是否拥有足够的卡片
                        if user_id:
                            user_card_key = f"{ing_card_collection_id}:{ing_card_id}"
                            user_quantity = user_cards.get(user_card_key, 0)
                            if user_quantity < ing_quantity:
                                cards_needed += 1

                        # Use stored ingredient data which should already have all fields
                        ing_data = dict(ing)
                        
                        # R2 URLs are public, no need to sign them

                        ingredients.append(FusionIngredient(**ing_data))

                    # R2 URLs are public, no need to sign them
                    result_image_url = recipe_data.get('result_card_image_url', '')

                    # 构造一个 FusionRecipe 实例
                    recipe = FusionRecipe(
                        result_card_id=result_card_id,
                        card_collection_id=recipe_data.get('card_collection_id'),
                        card_reference=recipe_data.get('card_reference'),
                        pack_id=recipe_data.get('pack_id'),
                        pack_collection_id=recipe_data.get('pack_collection_id'),
                        ingredients=ingredients,
                        result_card_name=recipe_data.get('result_card_name'),
                        result_card_image_url=result_image_url,
                        result_card_point_worth=recipe_data.get('result_card_point_worth'),
                        created_at=recipe_data.get('created_at')
                    )

                    # 如果提供了 user_id，添加卡片需求信息
                    if user_id:
                        recipe.cards_needed = cards_needed
                        recipe.total_cards_needed = total_cards_needed

                    cards_list.append(recipe)
                    all_recipes.append(recipe)

                # 只有当这个 pack 下确实有 cards 时，才加入最终结果
                if cards_list:
                    packs_list.append(FusionRecipePack(
                        pack_id=pack_id,
                        pack_collection_id=collection_id,
                        cards=cards_list,
                        cards_count=len(cards_list)
                    ))

            # 对所有配方进行排序和分页
            total_recipes = len(all_recipes)

            # 计算分页信息
            total_pages = (total_recipes + per_page - 1) // per_page if total_recipes > 0 else 0
            current_page = min(page, total_pages) if total_pages > 0 else 1

            # 创建 collection 对象
            collection = FusionRecipeCollection(
                collection_id=collection_id,
                packs=packs_list,
                packs_count=len(packs_list)
            )

            all_collections = [collection]


        # 如果没有指定 collection_id，我们返回所有 collections 的信息
        else:
            # 获取所有 collections
            snapshots = await root_col_ref.stream()
            all_recipes = []

            # 遍历每个 collection
            async for doc in snapshots:
                doc_id = doc.id

                # 获取该 collection 下的所有 packs
                second_level_col_ref = root_col_ref.document(doc_id).collection(doc_id)
                packs_list = []

                # 异步遍历这一层下的所有 pack 文档
                async for pack_doc in second_level_col_ref.stream():
                    pack_id = pack_doc.id
                    
                    # 如果指定了 pack 参数，只处理匹配的 pack
                    if pack and pack_id != pack:
                        continue

                    # 获取该 pack 下的所有 cards
                    cards_col_ref = second_level_col_ref.document(pack_id).collection('cards')
                    cards_list = []

                    # 异步遍历 cards 子集合下的每个 card_doc
                    async for card_doc in cards_col_ref.stream():
                        recipe_data = card_doc.to_dict()
                        result_card_id = recipe_data.get('result_card_id')

                        # 处理搜索查询
                        should_skip = False
                        
                        # 按结果卡片名称搜索
                        if card_name_search:
                            card_name_search_lower = card_name_search.lower()
                            result_card_name = recipe_data.get('result_card_name', '').lower()
                            if card_name_search_lower not in result_card_name:
                                should_skip = True
                        
                        # 按卡包名称搜索
                        if pack_name_search:
                            pack_name_search_lower = pack_name_search.lower()
                            pack_data = pack_doc.to_dict()
                            pack_name = pack_data.get('pack_name', pack_id).lower()
                            if pack_name_search_lower not in pack_name:
                                should_skip = True
                        
                        if should_skip:
                            continue

                        # 构造 FusionIngredient 列表
                        ingredients_data = recipe_data.get('ingredients', []) or []
                        ingredients = []

                        # 计算用户拥有的卡片数量和总需要的卡片数量
                        cards_needed = 0
                        total_cards_needed = len(ingredients_data)

                        # Check if we need to update the recipe with missing data
                        needs_update = False
                        if (recipe_data.get('result_card_name') is None or 
                            recipe_data.get('result_card_point_worth') is None or
                            any(ing.get('card_name') is None or ing.get('point_worth') is None or ing.get('probability') is None 
                                for ing in ingredients_data)):
                            needs_update = True
                            
                        if needs_update:
                            # Update the recipe with missing data
                            update_success = await update_fusion_recipe_card_data(
                                pack_collection_id=doc_id,
                                pack_id=pack_id,
                                result_card_id=result_card_id,
                                db_client=db_client
                            )
                            
                            if update_success:
                                # Re-fetch the updated recipe data
                                card_doc = await cards_col_ref.document(result_card_id).get()
                                recipe_data = card_doc.to_dict()
                                ingredients_data = recipe_data.get('ingredients', []) or []

                        for ing in ingredients_data:
                            ing_card_collection_id = ing.get('card_collection_id')
                            ing_card_id = ing.get('card_id')
                            ing_quantity = ing.get('quantity', 1)

                            # 检查用户是否拥有足够的卡片
                            if user_id:
                                user_card_key = f"{ing_card_collection_id}:{ing_card_id}"
                                user_quantity = user_cards.get(user_card_key, 0)
                                if user_quantity < ing_quantity:
                                    cards_needed += 1

                            # Process ingredient data to generate signed URL
                            ing_data = dict(ing)
                            # R2 URLs are public, no need to sign them
                            
                            ingredients.append(FusionIngredient(**ing_data))

                        # R2 URLs are public, no need to sign them
                        result_image_url = recipe_data.get('result_card_image_url', '')

                        # 构造一个 FusionRecipe 实例
                        recipe = FusionRecipe(
                            result_card_id=result_card_id,
                            card_collection_id=recipe_data.get('card_collection_id'),
                            card_reference=recipe_data.get('card_reference'),
                            pack_id=recipe_data.get('pack_id'),
                            pack_collection_id=recipe_data.get('pack_collection_id'),
                            ingredients=ingredients,
                            result_card_name=recipe_data.get('result_card_name'),
                            result_card_image_url=result_image_url,
                            result_card_point_worth=recipe_data.get('result_card_point_worth'),
                            created_at=recipe_data.get('created_at')
                        )

                        # 如果提供了 user_id，添加卡片需求信息
                        if user_id:
                            recipe.cards_needed = cards_needed
                            recipe.total_cards_needed = total_cards_needed

                        cards_list.append(recipe)
                        all_recipes.append(recipe)

                    # 只有当这个 pack 下确实有 cards 时，才加入最终结果
                    if cards_list:
                        packs_list.append(FusionRecipePack(
                            pack_id=pack_id,
                            pack_collection_id=doc_id,
                            cards=cards_list,
                            cards_count=len(cards_list)
                        ))

                # 只有当这个 collection 下确实有 packs 时，才加入最终结果
                if packs_list:
                    all_collections.append(FusionRecipeCollection(
                        collection_id=doc_id,
                        packs=packs_list,
                        packs_count=len(packs_list)
                    ))

            # 对所有配方进行排序和分页
            total_recipes = len(all_recipes)

        # 计算分页信息
        total_pages = (total_recipes + per_page - 1) // per_page if total_recipes > 0 else 0
        current_page = min(page, total_pages) if total_pages > 0 else 1

        # 返回分页响应 - use Pydantic model's dict() method for proper serialization
        return {
            "collections": [
                {
                    "collection_id": col.collection_id,
                    "packs": [
                        {
                            "pack_id": pack.pack_id,
                            "pack_collection_id": pack.pack_collection_id,
                            "cards": [card.dict() for card in pack.cards],
                            "cards_count": pack.cards_count
                        } for pack in col.packs
                    ],
                    "packs_count": col.packs_count
                } for col in all_collections
            ],
            "pagination": {
                "total_items": total_recipes,
                "total_pages": total_pages,
                "current_page": current_page,
                "per_page": per_page
            },
            "filters": {
                "sort_by": sort_by,
                "sort_order": sort_order,
                "search_query": search_query,
                "card_name_search": card_name_search,
                "pack_name_search": pack_name_search,
                "pack": pack
            }
        }

    except Exception as e:
        logger.error(f"Error retrieving fusion recipes from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve fusion recipes from database.")

async def get_fusion_packs_in_collection(
    db_client: AsyncClient,
    collection_id: str,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "pack_id",
    sort_order: str = "asc",
    search_query: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get all packs in a collection that have fusion recipes.
    
    Args:
        db_client: Firestore client
        collection_id: The collection ID to get packs from
        page: Page number for pagination
        per_page: Number of items per page
        sort_by: Sort field (pack_id, pack_name, or fusion_count)
        sort_order: Sort direction (asc or desc)
        search_query: Search query to filter by pack name
        
    Returns:
        Dict containing collection_id, paginated list of packs with their fusion counts, and pagination info
    """
    if not db_client:
        logger.error("Firestore client not provided to get_fusion_packs_in_collection.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    try:
        # Query the fusion_recipes collection for the given collection_id
        collection_ref = db_client.collection('fusion_recipes').document(collection_id).collection(collection_id)
        
        # Get all pack documents
        pack_docs = collection_ref.stream()
        
        packs = []
        async for pack_doc in pack_docs:
            pack_id = pack_doc.id
            pack_data = pack_doc.to_dict()
            
            # Get fusion count for this pack efficiently using Firestore count aggregation
            cards_ref = pack_doc.reference.collection('cards')
            # Use Firestore's count() aggregation to count documents without fetching them
            count_query = cards_ref.count()
            count_result = await count_query.get()
            fusion_count = count_result[0][0].value
            
            # Skip packs with no fusion recipes
            if fusion_count == 0:
                continue
                
            pack_info = {
                "pack_id": pack_id,
                "pack_name": pack_data.get("pack_name", pack_id),
                "fusion_count": fusion_count
            }
            
            # Apply search filter if provided
            if search_query:
                search_lower = search_query.lower()
                if search_lower not in pack_info["pack_name"].lower():
                    continue
            
            packs.append(pack_info)
        
        # Sort packs
        if sort_by == "pack_name":
            packs.sort(key=lambda x: x["pack_name"], reverse=(sort_order == "desc"))
        elif sort_by == "fusion_count":
            packs.sort(key=lambda x: x["fusion_count"], reverse=(sort_order == "desc"))
        else:  # Default to pack_id
            packs.sort(key=lambda x: x["pack_id"], reverse=(sort_order == "desc"))
        
        # Calculate pagination
        total_items = len(packs)
        total_pages = (total_items + per_page - 1) // per_page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        
        # Get paginated results
        paginated_packs = packs[start_idx:end_idx]
        
        return {
            "collection_id": collection_id,
            "packs": paginated_packs,
            "pagination": {
                "total_items": total_items,
                "total_pages": total_pages,
                "current_page": page,
                "per_page": per_page
            }
        }
        
    except Exception as e:
        logger.error(f"Error retrieving fusion packs for collection {collection_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve fusion packs for collection {collection_id}.")

async def update_fusion_recipe(
    pack_id: str,
    pack_collection_id: str,
    result_card_id: str,
    updates: UpdateFusionRecipeRequest,
    db_client: AsyncClient
) -> bool:
    """
    Updates an existing fusion recipe in Firestore.
    Also updates the fusion information in ingredient cards.
    Updates in a sub-collection under pack_collection_id.

    Args:
        pack_id: The ID of the pack
        pack_collection_id: The ID of the pack collection
        result_card_id: The ID of the result card
        updates: The UpdateFusionRecipeRequest model containing fields to update
        db_client: Firestore client

    Returns:
        bool: True if update was successful

    Raises:
        HTTPException: If recipe not found or on database error
    """
    if not db_client:
        logger.error("Firestore client not provided to update_fusion_recipe.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    try:
        doc_ref = db_client.collection('fusion_recipes').document(pack_collection_id).collection(pack_collection_id).document(pack_id).collection('cards').document(result_card_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"Fusion recipe with result card ID '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' not found")
            raise HTTPException(status_code=404, detail=f"Fusion recipe with result card ID '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' not found")

        # Get current recipe data
        current_recipe_data = doc.to_dict()

        # Prepare update data
        update_data = {}

        # Track if pack_id is updated
        new_pack_id = None
        if updates.pack_id is not None:
            update_data['pack_id'] = updates.pack_id
            new_pack_id = updates.pack_id

        if updates.pack_collection_id is not None:
            update_data['pack_collection_id'] = updates.pack_collection_id

        if updates.card_collection_id is not None:
            update_data['card_collection_id'] = updates.card_collection_id

            # Update card_reference if card_collection_id is updated
            try:
                from service.storage_service import get_collection_metadata
                metadata = await get_collection_metadata(updates.card_collection_id)
                update_data['card_reference'] = f"{metadata.name}/{result_card_id}"
                logger.info(f"Updated card_reference: {update_data['card_reference']}")
            except Exception as e:
                logger.warning(f"Could not update card_reference: {e}")
                # If we can't get the metadata, use the card_collection_id as is
                update_data['card_reference'] = f"{updates.card_collection_id}/{result_card_id}"


        # Handle ingredient updates
        if updates.added_ingredients is not None or updates.deleted_ingredients is not None:
            # Get current ingredients
            current_ingredients = current_recipe_data.get('ingredients', [])

            # Use the current recipe's card_collection_id or the updated one if provided
            card_collection_id = updates.card_collection_id or current_recipe_data.get('card_collection_id')

            ingredients_to_add = {
                (ingredient.card_id, card_collection_id)
                for ingredient in (updates.added_ingredients or [])
            }

            # Create a dictionary to store the full ingredient objects for removal
            ingredients_to_remove_dict = {}
            for ingredient in (updates.deleted_ingredients or []):
                key = (ingredient.card_id, card_collection_id)
                ingredients_to_remove_dict[key] = ingredient

            # Create a set of tuples for efficient set operations
            ingredients_to_remove = set(ingredients_to_remove_dict.keys())

            # Log the ingredients to be removed for debugging
            for (card_id, card_collection_id), ingredient in ingredients_to_remove_dict.items():
                logger.info(f"Will remove fusion information from card '{card_id}' (with collection_id '{card_collection_id}') with quantity={ingredient.quantity}")

            # Calculate the new ingredients list by removing deleted and adding new
            current_ingredient_set = {
                (ingredient.get('card_id'), ingredient.get('card_collection_id'))
                for ingredient in current_ingredients
            }

            # Remove ingredients_to_remove and add ingredients_to_add
            final_ingredient_set = (current_ingredient_set - ingredients_to_remove) | ingredients_to_add

            # Convert back to a list of FusionIngredient objects
            final_ingredients = []
            for card_id, card_collection_id in final_ingredient_set:
                # Find the ingredient in current ingredients or added ingredients
                ingredient_found = False

                # First check in current ingredients
                for ingredient in current_ingredients:
                    if (ingredient.get('card_id') == card_id and 
                        ingredient.get('card_collection_id') == card_collection_id):
                        final_ingredients.append(FusionIngredient(**ingredient))
                        ingredient_found = True
                        break

                # If not found in current, check in added ingredients
                if not ingredient_found and updates.added_ingredients:
                    for ingredient in updates.added_ingredients:
                        # FusionIngredientRequest only has card_id and quantity
                        if ingredient.card_id == card_id:
                            # Need to construct full FusionIngredient with card data
                            ingredient_data = {
                                "card_id": card_id,
                                "card_collection_id": card_collection_id,
                                "quantity": ingredient.quantity,
                                "card_reference": "",
                                "card_name": "",
                                "image_url": "",
                                "point_worth": 0,
                                "probability": 0
                            }
                            
                            # Get collection metadata for card_reference
                            collection_name = card_collection_id  # Default to card_collection_id
                            try:
                                from service.storage_service import get_collection_metadata
                                metadata = await get_collection_metadata(card_collection_id)
                                collection_name = metadata.firestoreCollection
                                ingredient_data["card_reference"] = f"{collection_name}/{card_id}"
                            except Exception as e:
                                logger.warning(f"Could not get collection metadata for ingredient: {e}")
                                ingredient_data["card_reference"] = f"{card_collection_id}/{card_id}"
                            
                            # Fetch card data to populate additional fields
                            try:
                                card_doc_ref = db_client.collection(collection_name).document(card_id)
                                card_doc = await card_doc_ref.get()
                                if card_doc.exists:
                                    card_info = card_doc.to_dict()
                                    ingredient_data["card_name"] = card_info.get("card_name", "")
                                    ingredient_data["point_worth"] = card_info.get("point_worth", 0)
                                    ingredient_data["image_url"] = card_info.get("image_url", "")
                                    
                                    # Get probability from pack data
                                    try:
                                        pack_id_for_prob = new_pack_id or current_recipe_data.get('pack_id')
                                        pack_collection_id_for_prob = updates.pack_collection_id or current_recipe_data.get('pack_collection_id')
                                        pack_doc_ref = db_client.collection('packs').document(pack_collection_id_for_prob).collection(pack_collection_id_for_prob).document(pack_id_for_prob)
                                        pack_doc = await pack_doc_ref.get()
                                        if pack_doc.exists:
                                            pack_data = pack_doc.to_dict()
                                            cards_map = pack_data.get("cards", {})
                                            ingredient_data["probability"] = cards_map.get(card_id, 0)
                                    except Exception as e:
                                        logger.warning(f"Failed to get probability for card {card_id}: {e}")
                            except Exception as e:
                                logger.warning(f"Failed to get card info for added ingredient {card_id}: {e}")
                            
                            final_ingredients.append(FusionIngredient(**ingredient_data))
                            break

            # Remove fusion information from removed ingredients
            for key in ingredients_to_remove:
                card_id, card_collection_id = key
                ingredient = ingredients_to_remove_dict[key]

                try:
                    # Use get_card_by_id to handle collection metadata lookup
                    from service.storage_service import get_card_by_id
                    try:
                        card = await get_card_by_id(card_id, card_collection_id)
                        card_data = card.model_dump()

                        # Remove this fusion from the used_in_fusion array
                        if 'used_in_fusion' in card_data and card_data['used_in_fusion']:
                            # Filter out the fusion with this result_card_id
                            updated_fusions = [
                                fusion for fusion in card_data['used_in_fusion'] 
                                if fusion.get('result_card_id') != result_card_id
                            ]

                            # Update the card with the filtered array using update_card_information
                            from service.storage_service import update_card_information
                            await update_card_information(
                                document_id=card_id,
                                update_data={'used_in_fusion': updated_fusions},
                                collection_name=card_collection_id
                            )

                            logger.info(f"Removed fusion information from card '{card_id}' (with collection_id '{card_collection_id}') with quantity={ingredient.quantity}")
                            
                            # Also remove fusion information from the card in the pack's cards subcollection if it exists
                            try:
                                pack_id = new_pack_id or current_recipe_data.get('pack_id')
                                pack_collection_id = updates.pack_collection_id or current_recipe_data.get('pack_collection_id')
                                pack_card_ref = db_client.collection('packs').document(pack_collection_id).collection(pack_collection_id).document(pack_id).collection('cards').document(card_id)
                                pack_card_doc = await pack_card_ref.get()
                                
                                if pack_card_doc.exists:
                                    pack_card_data = pack_card_doc.to_dict()
                                    if 'used_in_fusion' in pack_card_data and pack_card_data['used_in_fusion']:
                                        # Filter out the fusion with this result_card_id
                                        updated_pack_fusions = [
                                            fusion for fusion in pack_card_data['used_in_fusion'] 
                                            if fusion.get('result_card_id') != result_card_id
                                        ]
                                        # Update the card in the pack with the filtered array
                                        await pack_card_ref.update({
                                            'used_in_fusion': updated_pack_fusions
                                        })
                                        logger.info(f"Removed fusion information from card '{card_id}' in pack '{pack_id}'")
                            except Exception as e:
                                # This is optional - if the card isn't in the pack, that's fine
                                logger.debug(f"Card '{card_id}' not found in pack or error updating: {e}")
                                
                        else:
                            logger.info(f"Card '{card_id}' (with collection_id '{card_collection_id}') has no fusion information to remove")
                    except HTTPException as e:
                        if e.status_code == 404:
                            # If the card doesn't exist, log a warning but continue
                            logger.warning(f"Card '{card_id}' (with collection_id '{card_collection_id}') not found when trying to remove fusion information")
                        else:
                            # Re-raise other HTTP exceptions
                            raise e
                except Exception as e:
                    # Log the error but continue with other ingredients
                    logger.error(f"Error removing fusion information from ingredient card: {e}", exc_info=True)

            # Add fusion information to new ingredients
            for card_id, card_collection_id in ingredients_to_add:
                try:
                    # Create fusion info object with pack_reference instead of package_id
                    pack_id = new_pack_id or current_recipe_data.get('pack_id')
                    pack_collection_id = updates.pack_collection_id or current_recipe_data.get('pack_collection_id')
                    pack_reference = f"/packs/{pack_collection_id}/{pack_collection_id}/{pack_id}"
                    
                    # Get result card info for the fusion info
                    result_card_name = current_recipe_data.get('result_card_name', '')
                    result_card_image_url = current_recipe_data.get('result_card_image_url', '')

                    fusion_info = {
                        "fusion_id": result_card_id,
                        "result_card_id": result_card_id,
                        "pack_reference": pack_reference,
                        "result_card_name": result_card_name,
                        "result_card_image_url": result_card_image_url
                    }

                    # Update the card with the fusion information
                    update_data = {
                        "used_in_fusion": ArrayUnion([fusion_info])
                    }

                    await update_card_information(
                        document_id=card_id,
                        update_data=update_data,
                        collection_name=card_collection_id
                    )

                    logger.info(f"Added fusion information to card '{card_id}' (with collection_id '{card_collection_id}')")
                    
                    # Also update the card in the pack's cards subcollection if it exists there
                    try:
                        pack_card_ref = db_client.collection('packs').document(pack_collection_id).collection(pack_collection_id).document(pack_id).collection('cards').document(card_id)
                        pack_card_doc = await pack_card_ref.get()
                        
                        if pack_card_doc.exists:
                            # Update the card in the pack with the same fusion information
                            await pack_card_ref.update({
                                "used_in_fusion": ArrayUnion([fusion_info])
                            })
                            logger.info(f"Added fusion information to card '{card_id}' in pack '{pack_id}'")
                    except Exception as e:
                        # This is optional - if the card isn't in the pack, that's fine
                        logger.debug(f"Card '{card_id}' not found in pack '{pack_id}' or error updating: {e}")
                        
                except Exception as e:
                    # Log the error but continue with other ingredients
                    logger.error(f"Error adding fusion information to ingredient card: {e}", exc_info=True)

            # Get collection metadata once for all ingredients
            from service.storage_service import get_collection_metadata
            global_card_collection = card_collection_id
            collection_name = card_collection_id

            try:
                metadata = await get_collection_metadata(card_collection_id)
                global_card_collection = metadata.firestoreCollection
                collection_name = metadata.name
                logger.info(f"Using metadata firestoreCollection path: '{global_card_collection}' and name: '{collection_name}'")
            except Exception as e:
                logger.warning(f"Could not get collection metadata: {e}")
                # If we can't get the metadata, use the card_collection_id as is

            # Add card_reference to each ingredient and update the ingredients in the recipe
            ingredients_with_reference = []
            for ingredient in final_ingredients:
                ingredient_data = ingredient.model_dump()

                # If ingredient already has card_reference, use it
                if hasattr(ingredient, 'card_reference') and ingredient.card_reference:
                    ingredient_data["card_reference"] = ingredient.card_reference
                else:
                    # Create card_reference using the collection name
                    ingredient_data["card_reference"] = f"{collection_name}/{ingredient.card_id}"
                    logger.info(f"Created card_reference for ingredient: {ingredient_data['card_reference']}")

                # Ensure card_collection_id is set correctly
                ingredient_data["card_collection_id"] = card_collection_id

                ingredients_with_reference.append(ingredient_data)

            update_data['ingredients'] = ingredients_with_reference

        # If pack_id is updated but ingredients are not, update fusion information in all current ingredients
        elif new_pack_id is not None:
            current_ingredients = current_recipe_data.get('ingredients', [])
            for ingredient in current_ingredients:
                try:
                    card_id = ingredient.get('card_id')
                    card_collection_id = ingredient.get('card_collection_id')

                    if card_id and card_collection_id:
                        # Use get_card_by_id to handle collection metadata lookup
                        from service.storage_service import get_card_by_id
                        try:
                            card = await get_card_by_id(card_id, card_collection_id)
                            card_data = card.model_dump()

                            # Update the pack_reference in the used_in_fusion array
                            if 'used_in_fusion' in card_data and card_data['used_in_fusion']:
                                updated_fusions = []
                                for fusion in card_data['used_in_fusion']:
                                    if fusion.get('result_card_id') == result_card_id:
                                        # Update the pack_reference instead of package_id
                                        pack_collection_id = updates.pack_collection_id or current_recipe_data.get('pack_collection_id')
                                        pack_reference = f"/packs/{pack_collection_id}/{pack_collection_id}/{new_pack_id}"

                                        # Remove package_id if it exists and add pack_reference
                                        if 'package_id' in fusion:
                                            del fusion['package_id']

                                        fusion['pack_reference'] = pack_reference
                                    updated_fusions.append(fusion)

                                # Update the card with the updated array using update_card_information
                                from service.storage_service import update_card_information
                                await update_card_information(
                                    document_id=card_id,
                                    update_data={'used_in_fusion': updated_fusions},
                                    collection_name=card_collection_id
                                )

                                logger.info(f"Updated fusion information in card '{card_id}' (with collection_id '{card_collection_id}')")
                                
                                # Also update the fusion information in pack cards if they exist
                                # Handle both old pack (if exists) and new pack
                                old_pack_id = current_recipe_data.get('pack_id')
                                old_pack_collection_id = current_recipe_data.get('pack_collection_id')
                                
                                # Remove from old pack if different from new pack
                                if old_pack_id != new_pack_id:
                                    try:
                                        old_pack_card_ref = db_client.collection('packs').document(old_pack_collection_id).collection(old_pack_collection_id).document(old_pack_id).collection('cards').document(card_id)
                                        old_pack_card_doc = await old_pack_card_ref.get()
                                        
                                        if old_pack_card_doc.exists:
                                            old_pack_card_data = old_pack_card_doc.to_dict()
                                            if 'used_in_fusion' in old_pack_card_data and old_pack_card_data['used_in_fusion']:
                                                # Filter out the fusion with this result_card_id
                                                updated_old_pack_fusions = [
                                                    fusion for fusion in old_pack_card_data['used_in_fusion'] 
                                                    if fusion.get('result_card_id') != result_card_id
                                                ]
                                                await old_pack_card_ref.update({
                                                    'used_in_fusion': updated_old_pack_fusions
                                                })
                                                logger.info(f"Removed fusion information from card '{card_id}' in old pack '{old_pack_id}'")
                                    except Exception as e:
                                        logger.debug(f"Card '{card_id}' not found in old pack or error updating: {e}")
                                
                                # Add to new pack
                                try:
                                    new_pack_card_ref = db_client.collection('packs').document(pack_collection_id).collection(pack_collection_id).document(new_pack_id).collection('cards').document(card_id)
                                    new_pack_card_doc = await new_pack_card_ref.get()
                                    
                                    if new_pack_card_doc.exists:
                                        # Update the card in the new pack with updated fusion info
                                        fusion_info = {
                                            "fusion_id": result_card_id,
                                            "result_card_id": result_card_id,
                                            "pack_reference": pack_reference,
                                            "result_card_name": current_recipe_data.get('result_card_name', ''),
                                            "result_card_image_url": current_recipe_data.get('result_card_image_url', '')
                                        }
                                        await new_pack_card_ref.update({
                                            "used_in_fusion": ArrayUnion([fusion_info])
                                        })
                                        logger.info(f"Added fusion information to card '{card_id}' in new pack '{new_pack_id}'")
                                except Exception as e:
                                    logger.debug(f"Card '{card_id}' not found in new pack or error updating: {e}")
                                    
                        except HTTPException as e:
                            if e.status_code == 404:
                                # If the card doesn't exist, log a warning but continue
                                logger.warning(f"Card '{card_id}' (with collection_id '{card_collection_id}') not found when trying to update fusion information")
                            else:
                                # Re-raise other HTTP exceptions
                                raise e
                except Exception as e:
                    # Log the error but continue with other ingredients
                    logger.error(f"Error updating fusion information in ingredient card: {e}", exc_info=True)

        if not update_data:
            logger.warning(f"No updates provided for fusion recipe '{result_card_id}'")
            return True  # Nothing to update

        # Update the document
        await doc_ref.update(update_data)
        
        # Update the pack document's last_updated timestamp
        pack_doc_ref = db_client.collection('fusion_recipes').document(pack_collection_id).collection(pack_collection_id).document(pack_id)
        await pack_doc_ref.update({
            "last_updated": firestore.SERVER_TIMESTAMP
        })
        logger.info(f"Updated fusion recipe '{result_card_id}'")

        return True
    except HTTPException:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error updating fusion recipe '{result_card_id}' in Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not update fusion recipe '{result_card_id}' in database.")

async def get_card_fusions(
    collection_id: str,
    card_id: str,
    db_client: AsyncClient
) -> CardFusionsResponse:
    """
    Retrieves information about what fusions a card is used in.

    Args:
        collection_id: The ID of the collection the card belongs to
        card_id: The ID of the card
        db_client: Firestore client

    Returns:
        CardFusionsResponse: Information about the fusions the card is used in

    Raises:
        HTTPException: If card not found or on database error
    """
    if not db_client:
        logger.error("Firestore client not provided to get_card_fusions.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    try:
        # Get the card data using the storage service
        from service.storage_service import get_card_by_id
        card = await get_card_by_id(card_id, collection_id)

        # Extract the used_in_fusion array from the card data
        card_data = card.model_dump()
        logger.info(f"Card data for '{card_id}' in collection '{collection_id}': {card_data}")

        fusions = []

        if 'used_in_fusion' in card_data and card_data['used_in_fusion']:
            logger.info(f"Found used_in_fusion array with {len(card_data['used_in_fusion'])} entries")
            # Convert each fusion info to a CardFusionInfo object
            for fusion in card_data['used_in_fusion']:
                logger.info(f"Processing fusion: {fusion}")
                fusion_info = CardFusionInfo(
                    fusion_id=fusion.get('fusion_id', ''),
                    result_card_id=fusion.get('result_card_id', ''),
                    pack_reference=fusion.get('pack_reference', '')
                )
                fusions.append(fusion_info)
        else:
            logger.warning(f"No used_in_fusion array found in card data for '{card_id}' in collection '{collection_id}'")

        # Create and return the response
        return CardFusionsResponse(
            card_id=card_id,
            collection_id=collection_id,
            fusions=fusions
        )
    except HTTPException as e:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error retrieving fusion information for card '{card_id}' in collection '{collection_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve fusion information for card '{card_id}' in collection '{collection_id}': {str(e)}")

async def delete_fusion_recipe(
    pack_id: str,
    pack_collection_id: str,
    result_card_id: str,
    db_client: AsyncClient
) -> bool:
    """
    Deletes a fusion recipe from Firestore.
    Also removes the fusion information from all ingredient cards.
    Deletes from a sub-collection under pack_collection_id.

    Args:
        pack_id: The ID of the pack
        pack_collection_id: The ID of the pack collection
        result_card_id: The ID of the result card
        db_client: Firestore client

    Returns:
        bool: True if deletion was successful

    Raises:
        HTTPException: If recipe not found or on database error
    """
    if not db_client:
        logger.error("Firestore client not provided to delete_fusion_recipe.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    try:
        doc_ref = db_client.collection('fusion_recipes').document(pack_collection_id).collection(pack_collection_id).document(pack_id).collection('cards').document(result_card_id)
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"Fusion recipe with result card ID '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' not found")
            raise HTTPException(status_code=404, detail=f"Fusion recipe with result card ID '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' not found")

        # Get the recipe data to find all ingredients
        recipe_data = doc.to_dict()

        # Remove fusion information from all ingredient cards
        if 'ingredients' in recipe_data and recipe_data['ingredients']:
            for ingredient_data in recipe_data['ingredients']:
                try:
                    # Get card_id and card_collection_id from ingredient data
                    card_id = ingredient_data.get('card_id')
                    card_collection_id = ingredient_data.get('card_collection_id')
                    quantity = ingredient_data.get('quantity', 0)
                    available_in_packages = ingredient_data.get('available_in_packages', [])

                    if card_id and card_collection_id:
                        try:
                            # Use update_card_information to handle collection metadata lookup
                            # First, get the current card data to check if it has used_in_fusion
                            from service.storage_service import clean_fusion_references
                            try:
                                    await clean_fusion_references(
                                        document_id=card_id,
                                        collection_name=card_collection_id,
                                        fusion_id_to_remove=result_card_id
                                    )

                                    logger.info(f"Removed fusion information from card '{card_id}' (with collection_id '{card_collection_id}') with metadata: quantity={quantity}, available_in_packages={available_in_packages}")
                                    
                                    # Also remove fusion information from the card in the pack's cards subcollection if it exists
                                    try:
                                        pack_card_ref = db_client.collection('packs').document(pack_collection_id).collection(pack_collection_id).document(pack_id).collection('cards').document(card_id)
                                        pack_card_doc = await pack_card_ref.get()
                                        
                                        if pack_card_doc.exists:
                                            pack_card_data = pack_card_doc.to_dict()
                                            if 'used_in_fusion' in pack_card_data and pack_card_data['used_in_fusion']:
                                                # Filter out the fusion with this result_card_id
                                                updated_pack_fusions = [
                                                    fusion for fusion in pack_card_data['used_in_fusion'] 
                                                    if fusion.get('result_card_id') != result_card_id
                                                ]
                                                # Update the card in the pack with the filtered array
                                                await pack_card_ref.update({
                                                    'used_in_fusion': updated_pack_fusions
                                                })
                                                logger.info(f"Removed fusion information from card '{card_id}' in pack '{pack_id}'")
                                    except Exception as e:
                                        # This is optional - if the card isn't in the pack, that's fine
                                        logger.debug(f"Card '{card_id}' not found in pack or error updating: {e}")
                            except HTTPException as e:
                                if e.status_code == 404:
                                    # If the card doesn't exist, log a warning but continue
                                    logger.warning(f"Card '{card_id}' (with collection_id '{card_collection_id}') not found when trying to remove fusion information")
                                else:
                                    # Re-raise other HTTP exceptions
                                    raise e
                        except Exception as e:
                            # Log the error but continue with other ingredients
                            logger.error(f"Error removing fusion information from ingredient card '{card_id}' (with collection_id '{card_collection_id}'): {e}", exc_info=True)
                except Exception as e:
                    # Log the error but continue with other ingredients
                    logger.error(f"Error removing fusion information from ingredient card: {e}", exc_info=True)
                    # We don't want to fail the whole recipe deletion if updating an ingredient fails
                    # So we just log the error and continue

        # Delete the document
        await doc_ref.delete()
        logger.info(f"Deleted fusion recipe '{result_card_id}'")

        return True
    except HTTPException:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error deleting fusion recipe '{result_card_id}' from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not delete fusion recipe '{result_card_id}' from database.")

async def update_fusion_recipe_card_data(
    pack_collection_id: str,
    pack_id: str,
    result_card_id: str,
    db_client: AsyncClient
) -> bool:
    """
    Updates fusion recipe with missing card data (card_name, point_worth, probability).
    This function fetches the data from the cards collection and pack data.
    
    Args:
        pack_collection_id: The ID of the pack collection
        pack_id: The ID of the pack
        result_card_id: The ID of the result card
        db_client: Firestore client
        
    Returns:
        bool: True if update was successful
    """
    try:
        # Get the fusion recipe document
        doc_ref = db_client.collection('fusion_recipes').document(pack_collection_id).collection(pack_collection_id).document(pack_id).collection('cards').document(result_card_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            logger.warning(f"Fusion recipe not found: {result_card_id}")
            return False
            
        recipe_data = doc.to_dict()
        card_collection_id = recipe_data.get('card_collection_id')
        
        # Get collection metadata
        from service.storage_service import get_collection_metadata
        collection_name = card_collection_id
        
        try:
            metadata = await get_collection_metadata(card_collection_id)
            collection_name = metadata.firestoreCollection
        except Exception as e:
            logger.warning(f"Could not get collection metadata: {e}")
        
        # Update ingredients with missing data
        updated_ingredients = []
        ingredients_changed = False
        
        for ingredient in recipe_data.get('ingredients', []):
            updated_ingredient = dict(ingredient)
            
            # Check if we need to fetch card data
            if (updated_ingredient.get('card_name') is None or 
                updated_ingredient.get('point_worth') is None or
                updated_ingredient.get('probability') is None):
                
                try:
                    # Fetch card data
                    card_doc_ref = db_client.collection(collection_name).document(ingredient['card_id'])
                    card_doc = await card_doc_ref.get()
                    
                    if card_doc.exists:
                        card_info = card_doc.to_dict()
                        
                        # Update missing fields
                        if updated_ingredient.get('card_name') is None:
                            updated_ingredient['card_name'] = card_info.get('card_name', '')
                            ingredients_changed = True
                            
                        if updated_ingredient.get('point_worth') is None:
                            updated_ingredient['point_worth'] = card_info.get('point_worth', 0)
                            ingredients_changed = True
                            
                        # Store GS URL for image (will be converted to signed URL when retrieved)
                        if updated_ingredient.get('image_url') is None and 'image_url' in card_info:
                            updated_ingredient['image_url'] = card_info.get('image_url', '')
                            ingredients_changed = True
                    
                    # Get probability from pack data
                    if updated_ingredient.get('probability') is None:
                        try:
                            pack_doc_ref = db_client.collection('packs').document(pack_collection_id).collection(pack_collection_id).document(pack_id)
                            pack_doc = await pack_doc_ref.get()
                            
                            if pack_doc.exists:
                                pack_data = pack_doc.to_dict()
                                cards_map = pack_data.get('cards', {})
                                updated_ingredient['probability'] = cards_map.get(ingredient['card_id'], 0)
                                ingredients_changed = True
                        except Exception as e:
                            logger.warning(f"Failed to get probability: {e}")
                            updated_ingredient['probability'] = 0
                            ingredients_changed = True
                            
                except Exception as e:
                    logger.error(f"Error fetching card data for {ingredient['card_id']}: {e}")
                    # Set default values if fetch fails
                    if updated_ingredient.get('card_name') is None:
                        updated_ingredient['card_name'] = ''
                    if updated_ingredient.get('point_worth') is None:
                        updated_ingredient['point_worth'] = 0
                    if updated_ingredient.get('probability') is None:
                        updated_ingredient['probability'] = 0
                    if updated_ingredient.get('image_url') is None:
                        updated_ingredient['image_url'] = ''
                    ingredients_changed = True
                    
            updated_ingredients.append(updated_ingredient)
        
        # Update result card data if missing
        update_data = {}
        
        if recipe_data.get('result_card_name') is None or recipe_data.get('result_card_point_worth') is None:
            try:
                result_card_doc_ref = db_client.collection(collection_name).document(result_card_id)
                result_card_doc = await result_card_doc_ref.get()
                
                if result_card_doc.exists:
                    result_card_info = result_card_doc.to_dict()
                    
                    if recipe_data.get('result_card_name') is None:
                        update_data['result_card_name'] = result_card_info.get('card_name', '')
                        
                    if recipe_data.get('result_card_point_worth') is None:
                        update_data['result_card_point_worth'] = result_card_info.get('point_worth', 0)
                        
                    if recipe_data.get('result_card_image_url') is None and 'image_url' in result_card_info:
                        update_data['result_card_image_url'] = result_card_info.get('image_url', '')
                        
            except Exception as e:
                logger.error(f"Error fetching result card data: {e}")
                if recipe_data.get('result_card_name') is None:
                    update_data['result_card_name'] = ''
                if recipe_data.get('result_card_point_worth') is None:
                    update_data['result_card_point_worth'] = 0
                if recipe_data.get('result_card_image_url') is None:
                    update_data['result_card_image_url'] = ''
        
        # Update the document if any changes were made
        if ingredients_changed:
            update_data['ingredients'] = updated_ingredients
            
        if update_data:
            await doc_ref.update(update_data)
            logger.info(f"Updated fusion recipe {result_card_id} with missing card data")
            return True
        else:
            logger.info(f"No updates needed for fusion recipe {result_card_id}")
            return True
            
    except Exception as e:
        logger.error(f"Error updating fusion recipe card data: {e}", exc_info=True)
        return False

async def fix_fusion_recipe_pack_metadata(
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Fixes missing metadata for fusion recipe packs.
    This function scans all fusion recipe packs and ensures they have proper metadata.
    
    Args:
        db_client: Firestore client
        
    Returns:
        Dict with statistics about fixed packs
    """
    if not db_client:
        logger.error("Firestore client not provided")
        raise HTTPException(status_code=500, detail="Firestore service not configured")
        
    fixed_collections = 0
    fixed_packs = 0
    errors = []
    
    try:
        # Get all collections in fusion_recipes
        fusion_recipes_ref = db_client.collection('fusion_recipes')
        collection_docs = fusion_recipes_ref.stream()
        
        async for collection_doc in collection_docs:
            collection_id = collection_doc.id
            collection_data = collection_doc.to_dict() or {}
            
            # Check if collection needs metadata
            if not collection_data.get('collection_name') or not collection_data.get('collection_id'):
                try:
                    collection_metadata = {
                        "last_updated": firestore.SERVER_TIMESTAMP,
                        "collection_name": collection_id,
                        "collection_id": collection_id,
                        "has_fusion_recipes": True
                    }
                    
                    if not collection_data.get('created_at'):
                        collection_metadata["created_at"] = firestore.SERVER_TIMESTAMP
                        
                    await collection_doc.reference.set(collection_metadata, merge=True)
                    fixed_collections += 1
                    logger.info(f"Fixed metadata for collection '{collection_id}'")
                except Exception as e:
                    error_msg = f"Error fixing collection '{collection_id}': {e}"
                    logger.error(error_msg)
                    errors.append(error_msg)
            
            # Now check all packs in this collection
            packs_ref = collection_doc.reference.collection(collection_id)
            pack_docs = packs_ref.stream()
            
            async for pack_doc in pack_docs:
                pack_id = pack_doc.id
                pack_data = pack_doc.to_dict() or {}
                
                # Check if pack needs metadata
                if (not pack_data.get('pack_name') or 
                    not pack_data.get('collection_id') or 
                    not pack_data.get('pack_id') or
                    not pack_data.get('has_fusion_recipes')):
                    
                    try:
                        # Try to get pack name from packs collection
                        pack_name = pack_id
                        try:
                            packs_doc_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
                            packs_doc = await packs_doc_ref.get()
                            if packs_doc.exists:
                                packs_data = packs_doc.to_dict()
                                pack_name = packs_data.get("pack_name", pack_id)
                        except Exception as e:
                            logger.warning(f"Could not get pack name from packs collection: {e}")
                        
                        # Determine the card collection ID
                        card_collection_id = pack_data.get('collection_id')
                        if not card_collection_id:
                            # Try to infer from the structure
                            # Usually the card collection is the same as pack collection for fusion recipes
                            card_collection_id = collection_id
                        
                        pack_metadata = {
                            "last_updated": firestore.SERVER_TIMESTAMP,
                            "pack_name": pack_name,
                            "collection_id": card_collection_id,
                            "pack_id": pack_id,
                            "pack_collection_id": collection_id,
                            "has_fusion_recipes": True,
                            "cards": {}  # Indicate cards subcollection exists
                        }
                        
                        if not pack_data.get('created_at'):
                            pack_metadata["created_at"] = firestore.SERVER_TIMESTAMP
                            
                        await pack_doc.reference.set(pack_metadata, merge=True)
                        fixed_packs += 1
                        logger.info(f"Fixed metadata for pack '{pack_id}' in collection '{collection_id}'")
                        
                    except Exception as e:
                        error_msg = f"Error fixing pack '{pack_id}' in collection '{collection_id}': {e}"
                        logger.error(error_msg)
                        errors.append(error_msg)
                        
        return {
            "success": True,
            "fixed_collections": fixed_collections,
            "fixed_packs": fixed_packs,
            "errors": errors,
            "message": f"Fixed {fixed_collections} collections and {fixed_packs} packs"
        }
        
    except Exception as e:
        logger.error(f"Error fixing fusion recipe pack metadata: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fixing fusion recipe pack metadata: {str(e)}")
