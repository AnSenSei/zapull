from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field


class ConditionSchema(BaseModel):
    """Schema for achievement condition"""
    type: str
    target: Optional[int] = Field(None, description="Target value for the condition. Not required for special achievements")
    point_worth: Optional[int] = Field(None, description="Point worth threshold for draw_by_rarity achievements (e.g., 2000, 5000, 10000, 30000)")


class PointRewardSchema(BaseModel):
    """Schema for point reward"""
    type: str = "point"
    amount: int


class EmblemRewardSchema(BaseModel):
    """Schema for emblem reward"""
    type: str = "emblem"
    emblemId: str
    url: str


class EmblemRewardInputSchema(BaseModel):
    """Schema for emblem reward input"""
    type: str = "emblem"
    image: Optional[str] = None  # Base64 encoded image


class AchievementCreate(BaseModel):
    """Schema for creating an achievement"""
    name: str
    description: str
    condition: ConditionSchema
    reward: List[Union[PointRewardSchema, EmblemRewardInputSchema]]


class UploadConditionSchema(BaseModel):
    """Schema for achievement condition in upload requests"""
    type: str = Field(..., description="Type of condition (e.g., 'level_reached', 'fusion_reached', 'draw_by_rarity', 'special')")
    target: Optional[int] = Field(None, description="Target value for the condition. For draw_by_rarity, this is the number of cards to draw. Not required for special achievements", ge=1)
    point_worth: Optional[int] = Field(None, description="Point worth threshold for draw_by_rarity achievements (e.g., 2000, 5000, 10000, 30000)")
    rarity: Optional[int] = Field(None, description="Rarity level (deprecated - no longer used for draw_by_rarity)")

class UploadRewardSchema(BaseModel):
    """Base schema for achievement rewards in upload requests"""
    type: str = Field(..., description="Type of reward ('point' or 'emblem')")

class UploadPointRewardSchema(UploadRewardSchema):
    """Schema for point reward in upload requests"""
    type: str = Field(default="point", description="Type of reward")
    amount: int = Field(..., description="Amount of points to reward", ge=1)

class UploadEmblemRewardSchema(UploadRewardSchema):
    """Schema for emblem reward in upload requests"""
    type: str = Field(default="emblem", description="Type of reward")
    image: Optional[str] = Field(None, description="Base64 encoded image data for the emblem")

class UploadAchievementSchema(BaseModel):
    """Schema for uploading an achievement with base64 image"""
    name: str = Field(..., description="Name of the achievement")
    description: str = Field(..., description="Description of the achievement")
    condition: UploadConditionSchema = Field(..., description="Condition that must be met to earn the achievement")
    reward: Optional[List[Union[UploadPointRewardSchema, UploadEmblemRewardSchema]]] = Field(None, description="Optional list of rewards for completing the achievement")
    rarity: Optional[int] = Field(None, description="Rarity level (1-7, where 1 is most common and 7 is most rare)", ge=1, le=7)
    rank: Optional[int] = Field(None, description="Rank or priority of the achievement", ge=1)


class Achievement(BaseModel):
    """Schema for an achievement stored in the database"""
    id: str
    name: str
    description: str
    condition: ConditionSchema
    reward: Optional[List[Union[PointRewardSchema, EmblemRewardSchema]]] = None
    rarity: Optional[int] = None
    rank: Optional[int] = None


class AchievementResponse(BaseModel):
    """Schema for achievement response"""
    id: str
    name: str
    description: str
    condition: ConditionSchema
    reward: Optional[List[Union[PointRewardSchema, EmblemRewardSchema]]] = None
    rarity: Optional[int] = None
    rank: Optional[int] = None


class AchievementCreateForm(BaseModel):
    """Schema for creating an achievement via form data"""
    id: str
    name: str
    description: str
    condition: str  # JSON string
    reward: str  # JSON string


class PaginatedAchievementResponse(BaseModel):
    """Schema for paginated achievement list response"""
    items: List[AchievementResponse]
    total: int
    page: int
    size: int


class GroupedAchievementResponse(BaseModel):
    """Schema for grouped achievement response"""
    groups: Dict[str, List[AchievementResponse]]
    total: int
    page: int
    size: int


class AwardAchievementRequest(BaseModel):
    """Schema for awarding an achievement to a user"""
    user_id: str = Field(..., description="ID of the user to award the achievement to")
    achievement_id: str = Field(..., description="ID of the achievement to award")
    notes: Optional[str] = Field(None, description="Optional notes about the award")


class UserAchievement(BaseModel):
    """Schema for a user's achievement record"""
    id: str = Field(..., description="Unique ID for this user achievement record")
    user_id: str = Field(..., description="ID of the user who earned the achievement")
    achievement_id: str = Field(..., description="ID of the achievement that was earned")
    earned_at: str = Field(..., description="Timestamp when the achievement was earned")
    notes: Optional[str] = Field(None, description="Optional notes about the award")
    achievement_name: Optional[str] = Field(None, description="Name of the achievement (for display)")
    achievement_description: Optional[str] = Field(None, description="Description of the achievement (for display)")


class AwardAchievementResponse(BaseModel):
    """Schema for award achievement response"""
    success: bool
    message: str
    user_achievement: Optional[UserAchievement] = None
