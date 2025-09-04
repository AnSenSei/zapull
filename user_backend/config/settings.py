from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Application settings
    app_name: str

    # Google Cloud Storage settings
    gcs_project_id: str
    gcs_bucket_name: str
    user_avator_bucket: str

    # Firestore settings
    firestore_project_id: str
    firestore_collection_users: str
    quota_project_id: str

    # Card expiration settings (in days)
    card_expire_days: int
    card_buyback_expire_days: int

    # Backend service URLs
    storage_service_url: str

    # Stripe API settings
    stripe_api_key: str
    stripe_webhook_secret: str
    stripe_connect_webhook_secret: str
    
    # Cloudflare R2 Storage settings
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_endpoint: str
    
    # R2 Bucket names
    r2_bucket_achievement: str
    r2_bucket_pack: str
    r2_bucket_card: str
    r2_bucket_avatar: str

    # R2 Public domains (for generating public URLs)
    r2_public_domain_achievement: str = "achievement-dev.zapull.fun"
    r2_public_domain_pack: str = "pack-dev.zapull.fun"
    r2_public_domain_card: str = "card-dev.zapull.fun"
    r2_public_domain_avatar: str = "avator-dev.zapull.fun"
    
    # Development settings
    development_mode: bool = False
    enable_docs: bool = False
    
    # Typesense settings
    typesense_api_key: str = "68vTuaLCLRTBDmpEpnCy0cMSHP0oC2Kc"
    typesense_host: str = "norguvx0y71jmcsdp-1.a1.typesense.net"
    typesense_port: str = "443"
    typesense_protocol: str = "https"
    typesense_collection_listings: str = "listings_test"

    #shippo API KEY
    shippo_api_key: str

    #mailgun api
    mailgun_api: str

    # Database connection settings
    db_instance_connection_name: str
    db_user: str
    db_pass: str
    db_name: str
    db_port: int

    # Logging settings
    log_level: str

    # Firebase settings
    firebase_api_key: str
    firebase_auth_domain: str
    firebase_project_id: str
    firebase_storage_bucket: str
    firebase_messaging_sender_id: str
    firebase_app_id: str
    firebase_measurement_id: str = ""  # Optional

    class Config:
        env_file = ".env" # If you want to use an.env file for configuration
        env_file_encoding = 'utf-8'
        extra = 'ignore'  # Ignore extra environment variables

settings = Settings()
