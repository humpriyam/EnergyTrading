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

class ChangePassword(BaseModel):
    username: str
    old_password: str
    new_password: str

class WithdrawRequest(BaseModel):
    username: str
    amount: float
    password: str   # confirm identity before withdrawing

class DeleteAccount(BaseModel):
    username: str
    password: str   # confirm identity before deletion
