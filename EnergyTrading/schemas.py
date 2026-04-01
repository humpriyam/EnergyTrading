from pydantic import BaseModel
from typing import Optional

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class UserLogin(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    balance: float

    class Config:
        from_attributes = True

class BalanceUpdate(BaseModel):
    username: str
    amount: float
