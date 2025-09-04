from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import firebase_admin
from firebase_admin import auth, credentials
import os
from config import get_logger, settings

logger = get_logger(__name__)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    try:
        # Try to use default credentials (for Cloud Run)
        if os.getenv("K_SERVICE"):
            firebase_admin.initialize_app()
            logger.info("Initialized Firebase Admin SDK with default credentials (Cloud Run)")
        else:
            # For local development, you might need to set GOOGLE_APPLICATION_CREDENTIALS
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
                logger.info(f"Initialized Firebase Admin SDK with service account from {cred_path}")
            else:
                # Try to initialize with default credentials
                try:
                    firebase_admin.initialize_app()
                    logger.info("Initialized Firebase Admin SDK with default credentials (local)")
                except Exception as default_error:
                    logger.warning(f"Could not initialize with default credentials: {default_error}")
                    logger.warning("Firebase Admin SDK not initialized. Authentication will not work.")
                    logger.warning("Please set GOOGLE_APPLICATION_CREDENTIALS or run 'gcloud auth application-default login'")
    except Exception as e:
        logger.error(f"Failed to initialize Firebase Admin SDK: {e}", exc_info=True)
        logger.error("Authentication endpoints will not work without Firebase Admin SDK")
        # Don't raise here to allow the app to start, but auth endpoints will fail


class FirebaseBearer(HTTPBearer):
    """
    Firebase Bearer token authentication.
    Extracts and validates Firebase ID tokens from the Authorization header.
    """
    
    def __init__(self, auto_error: bool = True):
        super(FirebaseBearer, self).__init__(
            auto_error=auto_error,
            scheme_name="FirebaseBearer",  # This connects to the OpenAPI schema
            description="Firebase ID Token authentication"
        )
    
    async def __call__(self, request: Request) -> Optional[dict]:
        credentials: HTTPAuthorizationCredentials = await super(FirebaseBearer, self).__call__(request)
        if credentials:
            if not credentials.scheme == "Bearer":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid authentication scheme."
                )
            
            # Verify the Firebase ID token
            try:
                # Check if Firebase Admin SDK is initialized
                if not firebase_admin._apps:
                    logger.error("Firebase Admin SDK is not initialized")
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Authentication service is not available. Please check server configuration."
                    )
                
                decoded_token = auth.verify_id_token(credentials.credentials)
                return decoded_token
            except auth.InvalidIdTokenError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid ID token."
                )
            except auth.ExpiredIdTokenError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has expired."
                )
            except auth.RevokedIdTokenError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has been revoked."
                )
            except ValueError as e:
                # This can happen if Firebase project ID is not set
                logger.error(f"Firebase configuration error: {e}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Authentication service is misconfigured."
                )
            except Exception as e:
                logger.error(f"Error verifying Firebase token: {e}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Could not validate credentials."
                )
        else:
            # When auto_error is False and no credentials are provided, return None
            # This allows optional authentication
            if not self.auto_error:
                return None
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid authorization code."
            )


# Create an instance of the Firebase Bearer class
firebase_bearer = FirebaseBearer()


async def get_current_user_id(decoded_token: dict = Depends(firebase_bearer)) -> str:
    """
    Extract user ID from the decoded Firebase token.
    
    Args:
        decoded_token: The decoded Firebase ID token
        
    Returns:
        str: The user ID (uid) from the token
    """
    user_id = decoded_token.get("uid")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token."
        )
    return user_id


async def get_current_user(decoded_token: dict = Depends(firebase_bearer)) -> dict:
    """
    Get the full user information from the decoded Firebase token.
    
    Args:
        decoded_token: The decoded Firebase ID token
        
    Returns:
        dict: The full decoded token containing user information
    """
    return decoded_token


# Optional: Create a dependency that checks if the user has certain custom claims
async def require_custom_claim(claim_name: str, claim_value: any = True):
    """
    Create a dependency that requires a specific custom claim in the token.
    
    Args:
        claim_name: The name of the custom claim to check
        claim_value: The expected value of the claim (default: True)
        
    Returns:
        A dependency function that validates the custom claim
    """
    async def verify_claim(decoded_token: dict = Depends(firebase_bearer)):
        claims = decoded_token.get("claims", {})
        if claims.get(claim_name) != claim_value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Missing required claim: {claim_name}"
            )
        return decoded_token
    
    return verify_claim