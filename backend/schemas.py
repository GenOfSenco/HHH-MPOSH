from pydantic import BaseModel,Field
from typing import Optional,List
from enum import Enum


class UserRole(str,Enum):
    admin="admin"
    user="user"


class UserCreate(BaseModel):
    username: str=Field(...,min_length=3,max_length=50)
    password: str=Field(...,min_length=4,max_length=100)
    first_name: str=Field(...,min_length=1,max_length=100)
    last_name: str=Field(...,min_length=1,max_length=100)
    role: UserRole=UserRole.user


class UserResponse(BaseModel):
    id: str
    username: str
    first_name: str
    last_name: str
    role: str


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str="bearer"
    user: UserResponse


class TrainingHistory(BaseModel):
    accuracy: List[float]
    loss: List[float]
    val_accuracy: List[float]
    val_loss: List[float]


class ClassCount(BaseModel):
    class_name: str=Field(...,alias="class")
    count: int
    class Config:
        populate_by_name=True


class StatsResponse(BaseModel):
    train_distribution: dict
    valid_top5: List[ClassCount]
    total_train_samples: int
    total_valid_samples: int
    num_classes: int


class PredictionItem(BaseModel):
    sample_id: int
    is_correct: bool
    confidence: float
    predicted_class: Optional[str]=None
    actual_class: Optional[str]=None


class PredictionResponse(BaseModel):
    accuracy: float
    loss: float
    predictions: List[PredictionItem]


class MessageResponse(BaseModel):
    message: str
    success: bool=True
