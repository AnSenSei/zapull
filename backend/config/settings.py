from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Application settings
    app_name: str = "Card Gacha API"

    # Google Cloud Storage settings
    gcs_project_id: str = "seventh-program-433718-h8"
    gcs_bucket_name: str = "pokemon_cards_pull"
    PACKS_BUCKET: str = "pack_covers"
    user_avator_bucket: str = "user_avatars"
    emblem_bucket: str

    # Firestore settings
    firestore_project_id: str = "seventh-program-433718-h8"
    firestore_collection_cards: str = "pokemon"
    meta_data_collection: str = "collection_meta_data"
    quota_project_id: str = "seventh-program-433718-h8"

    shippo_api_key: str

    # Cloudflare R2 Storage settings
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_endpoint: str
    
    # R2 Bucket names
    r2_bucket_achievement: str = "achievement"
    r2_bucket_pack: str = "pack"
    r2_bucket_card: str = "card"
    r2_bucket_avatar: str = "avatar"

    # User backend service configuration
    user_backend_url: str = "http://localhost:8082/users/api/v1"
    
    # Typesense settings
    typesense_api_key: str = "68vTuaLCLRTBDmpEpnCy0cMSHP0oC2Kc"
    typesense_host: str = "norguvx0y71jmcsdp-1.a1.typesense.net"
    typesense_port: str = "443"
    typesense_protocol: str = "https"
    typesense_collection_pokemon: str = "pokemon_test"
    typesense_collection_one_piece: str = "one_piece_test"
    typesense_collection_magic: str = "magic_test"
    typesense_collection_listings: str = "listings_test"

    # Logging settings
    log_level: str = "INFO"

    class Config:
        env_file = ".env" # If you want to use an.env file for configuration
        env_file_encoding = 'utf-8'
        extra = 'ignore'  # Ignore extra environment variables

settings = Settings() 
