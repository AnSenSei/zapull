from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal, List
from datetime import datetime

class CreatePaymentIntentRequest(BaseModel):
    """
    Request model for creating a payment intent.
    """
    amount: int = Field(..., description="Amount to charge in cents (e.g., 1000 for $10.00)")
    currency: str = Field("usd", description="Currency code (default: usd)")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata for the payment intent")
    refer_code: Optional[str] = Field(None, description="Optional referral code to apply to this payment")

class CreateMarketplaceCashIntentRequest(BaseModel):
    """
    Request model for creating a marketplace cash intent.
    """
    amount: int = Field(..., description="Amount to charge in cents (e.g., 1000 for $10.00)")
    currency: str = Field("usd", description="Currency code (default: usd)")
    application_fee_amount: int = Field(..., description="Application fee amount in cents")
    transfer_data: Dict[str, str] = Field(..., description="Transfer data for the payment intent")
    listing_id: str = Field(..., description="The ID of the listing")
    offer_id: str = Field(..., description="The ID of the offer")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata for the payment intent")

class PaymentIntentResponse(BaseModel):
    """
    Response model for a payment intent.
    """
    id: str = Field(..., description="Stripe payment intent ID")
    client_secret: str = Field(..., description="Client secret used to complete the payment on the client side")
    amount: int = Field(..., description="Amount in cents")
    currency: str = Field(..., description="Currency code")
    status: str = Field(..., description="Payment intent status")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")

class WebhookResponse(BaseModel):
    """
    Response model for webhook events.
    """
    status: str = Field(..., description="Status of the webhook processing (success, ignored, etc.)")
    details: Dict[str, Any] = Field(..., description="Details about the processed webhook event")

class RechargeRecord(BaseModel):
    """
    Model for a single recharge record.
    """
    id: int = Field(..., description="Recharge record ID")
    amount_cash: float = Field(..., description="Amount of cash recharged in dollars")
    points_granted: int = Field(..., description="Points granted for the recharge")
    created_at: str = Field(..., description="Timestamp of the recharge")

class RechargeHistoryResponse(BaseModel):
    """
    Response model for user recharge history.
    """
    user_id: str = Field(..., description="User ID")
    total_cash_recharged: float = Field(..., description="Total amount of cash recharged by the user")
    recharge_history: list[RechargeRecord] = Field([], description="List of recharge records")

class OnboardingLinkResponse(BaseModel):
    """
    Response model for Stripe Connect onboarding link.
    """
    onboarding_url: str = Field(..., description="URL for the Stripe Connect onboarding process")

class ConnectStatusResponse(BaseModel):
    """
    Response model for Stripe Connect account status.
    """
    status: Literal["not_connected", "incomplete", "ready"] = Field(..., description="Status of the Stripe Connect account")

class StripeTaxStatusResponse(BaseModel):
    """
    Response model for Stripe tax status.
    """
    stripe_tax_enabled: bool = Field(..., description="Whether automatic tax is enabled for the Stripe account")

class StripeDashboardLinkResponse(BaseModel):
    """
    Response model for Stripe Express dashboard login link.
    """
    login_url: str = Field(..., description="URL for logging into the Stripe Express dashboard")

class TaxConsentResponse(BaseModel):
    """
    Response model for tax consent update.
    """
    success: bool = Field(..., description="Whether the tax consent was successfully updated")
    user_id: str = Field(..., description="The ID of the user whose tax consent was updated")

class PaymentMethod(BaseModel):
    """
    Model for a payment method.
    """
    id: str = Field(..., description="Stripe payment method ID")
    type: str = Field(..., description="Payment method type (card, bank_account, etc.)")
    card: Optional[Dict[str, Any]] = Field(None, description="Card details if type is card")
    is_default: bool = Field(False, description="Whether this is the default payment method")
    created_at: str = Field(..., description="Creation timestamp")

class AttachPaymentMethodRequest(BaseModel):
    """
    Request model for attaching a payment method.
    """
    payment_method_id: str = Field(..., description="Stripe payment method ID to attach")
    set_as_default: bool = Field(False, description="Whether to set as default payment method")

class PaymentMethodListResponse(BaseModel):
    """
    Response model for listing payment methods.
    """
    payment_methods: List[PaymentMethod] = Field(..., description="List of payment methods")
    default_payment_method_id: Optional[str] = Field(None, description="ID of the default payment method")

class PaymentStatusCheckResponse(BaseModel):
    """
    Response model for payment status check.
    """
    payment_intent_id: str = Field(..., description="Stripe payment intent ID")
    status: str = Field(..., description="Payment status")
    amount: int = Field(..., description="Amount in cents")
    currency: str = Field(..., description="Currency code")
    created_at: str = Field(..., description="Creation timestamp")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Payment metadata")

class PaginatedRechargeHistoryResponse(BaseModel):
    """
    Response model for paginated recharge history.
    """
    user_id: str = Field(..., description="User ID")
    total_cash_recharged: float = Field(..., description="Total amount of cash recharged by the user")
    recharge_history: List[RechargeRecord] = Field([], description="List of recharge records")
    total_count: int = Field(..., description="Total number of recharge records")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Number of items per page")
    has_next: bool = Field(..., description="Whether there are more pages")

# Missing response models that are imported in payment_router.py

class StripeOnboardingResponse(BaseModel):
    """
    Response model for Stripe Connect onboarding.
    """
    onboarding_url: str = Field(..., description="URL for the Stripe Connect onboarding process")

class PaymentMethodResponse(BaseModel):
    """
    Response model for payment method operations.
    """
    id: str = Field(..., description="Stripe payment method ID")
    type: str = Field(..., description="Payment method type (card, bank_account, etc.)")
    card: Optional[Dict[str, Any]] = Field(None, description="Card details if type is card")
    created: int = Field(..., description="Creation timestamp")

class ListPaymentMethodsResponse(BaseModel):
    """
    Response model for listing payment methods.
    """
    payment_methods: List[PaymentMethod] = Field(..., description="List of payment methods")
    default_payment_method_id: Optional[str] = Field(None, description="ID of the default payment method")

class DeletePaymentMethodResponse(BaseModel):
    """
    Response model for deleting a payment method.
    """
    success: bool = Field(..., description="Whether the payment method was successfully deleted")

class SetDefaultPaymentMethodResponse(BaseModel):
    """
    Response model for setting a default payment method.
    """
    success: bool = Field(..., description="Whether the default payment method was set successfully")
    default_payment_method_id: str = Field(..., description="The ID of the default payment method")

class PaymentStatusResponse(BaseModel):
    """
    Response model for payment status check with transaction completion details.
    """
    payment_intent_id: str = Field(..., description="Stripe payment intent ID")
    status: str = Field(..., description="Payment status")
    amount: int = Field(..., description="Amount in cents")
    currency: str = Field(..., description="Currency code")
    created_at: str = Field(..., description="Creation timestamp")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Payment metadata")
    transaction_completed: bool = Field(..., description="Whether the associated transaction was completed")
    transaction_type: Optional[Literal["recharge", "marketplace"]] = Field(None, description="Type of transaction")
    transaction_details: Dict[str, Any] = Field({}, description="Details about the completed transaction")

class StripeStatusResponse(BaseModel):
    """
    Response model for Stripe Connect account status.
    """
    status: Literal["not_connected", "incomplete", "ready"] = Field(..., description="Status of the Stripe Connect account")
