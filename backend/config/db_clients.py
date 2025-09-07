from google.cloud import storage
from google.cloud import firestore
from google.api_core.client_options import ClientOptions
import typesense
from .settings import settings
from config import get_logger
import os

logger = get_logger(__name__)

# Initialize Google Cloud Storage client
storage_client = None
try:
    # Use Application Default Credentials
    storage_client = storage.Client(project=settings.quota_project_id)
    env_type = "Cloud Run" if os.getenv("K_SERVICE") else "local development"
    logger.info(f"Successfully initialized Google Cloud Storage client for project {settings.quota_project_id} in {env_type} environment")
except Exception as e:
    logger.error(f"Failed to initialize Google Cloud Storage client: {e}", exc_info=True)
    storage_client = None  # Ensure it's None if initialization fails

# Initialize Firestore client
firestore_client = None
try:
    # Explicitly set the quota_project_id using ClientOptions
    client_options = ClientOptions(quota_project_id=settings.quota_project_id)
    firestore_client = firestore.AsyncClient(
        project=settings.firestore_project_id, # This is the project where your Firestore DB resides
        client_options=client_options
    )
    logger.info(f"Successfully initialized Firestore AsyncClient for project {settings.firestore_project_id} with quota project {settings.quota_project_id}.")
except Exception as e:
    logger.error(f"Failed to initialize Firestore client: {e}", exc_info=True)
    firestore_client = None # Ensure it's None if initialization fails

# Initialize Typesense client
typesense_client = None
try:
    typesense_client = typesense.Client({
        'api_key': settings.typesense_api_key,
        'nodes': [{
            'host': settings.typesense_host,
            'port': settings.typesense_port,
            'protocol': settings.typesense_protocol
        }],
        'connection_timeout_seconds': 2
    })
    logger.info(f"Successfully initialized Typesense client")
except Exception as e:
    logger.error(f"Failed to initialize Typesense client: {e}", exc_info=True)
    typesense_client = None

def get_storage_client():
    if storage_client is None:
        logger.error("Storage client is not initialized.")
        raise RuntimeError("Storage client is not initialized. Check GCS configuration and credentials.")
    return storage_client

def get_firestore_client():
    if firestore_client is None:
        logger.error("Firestore client is not initialized.")
        raise RuntimeError("Firestore client is not initialized. Check Firestore configuration and credentials.")
    return firestore_client 

def get_typesense_client():
    """Get the global Typesense client"""
    if typesense_client is None:
        logger.error("Typesense client is not initialized.")
        raise RuntimeError("Typesense client is not initialized. Check Typesense configuration.")
    return typesense_client

def get_typesense_collection_name(collection_id: str = None):
    """
    Get the appropriate Typesense collection name based on collection_id.
    """
    if collection_id == "pokemon":
        return settings.typesense_collection_pokemon
    elif collection_id == "one_piece":
        return settings.typesense_collection_one_piece
    elif collection_id == "magic":
        return settings.typesense_collection_magic
    elif collection_id == "users":
        return settings.typesense_collection_users
    else:
        # Default to pokemon if collection_id is not specified or not recognized
        return settings.typesense_collection_pokemon
