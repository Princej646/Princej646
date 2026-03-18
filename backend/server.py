from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from passlib.hash import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class LoginRequest(BaseModel):
    username: str
    credential: str
    mode: str  # 'pin' or 'password'

class User(BaseModel):
    id: str
    username: str
    name: str
    role: str  # admin, manager, captain, cashier

class LoginResponse(BaseModel):
    user: User
    message: str

# Auth Routes
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    # Check if users collection exists and has data
    users_count = await db.users.count_documents({})
    
    if users_count == 0:
        # Initialize with demo users
        demo_users = [
            {
                "id": str(uuid.uuid4()),
                "username": "admin",
                "password_hash": bcrypt.hash("admin123"),
                "pin_hash": bcrypt.hash("1234"),
                "name": "Admin User",
                "role": "admin",
                "created_at": datetime.utcnow().isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "username": "manager",
                "password_hash": bcrypt.hash("manager123"),
                "pin_hash": bcrypt.hash("5678"),
                "name": "Manager User",
                "role": "manager",
                "created_at": datetime.utcnow().isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "username": "captain",
                "password_hash": bcrypt.hash("captain123"),
                "pin_hash": bcrypt.hash("9012"),
                "name": "Captain User",
                "role": "captain",
                "created_at": datetime.utcnow().isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "username": "cashier",
                "password_hash": bcrypt.hash("cashier123"),
                "pin_hash": bcrypt.hash("3456"),
                "name": "Cashier User",
                "role": "cashier",
                "created_at": datetime.utcnow().isoformat()
            }
        ]
        await db.users.insert_many(demo_users)
    
    # Find user
    user = await db.users.find_one({"username": request.username})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify credential
    if request.mode == "pin":
        if not bcrypt.verify(request.credential, user["pin_hash"]):
            raise HTTPException(status_code=401, detail="Invalid PIN")
    else:
        if not bcrypt.verify(request.credential, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid password")
    
    user_response = User(
        id=user["id"],
        username=user["username"],
        name=user["name"],
        role=user["role"]
    )
    
    return LoginResponse(user=user_response, message="Login successful")

# User Management Routes (Admin only)
@api_router.get("/users")
async def get_users():
    users = await db.users.find({}, {"password_hash": 0, "pin_hash": 0}).to_list(1000)
    return {"users": users}

@api_router.post("/users")
async def create_user(request: dict):
    # Check if username already exists
    existing = await db.users.find_one({"username": request.get("username")})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user_id = str(uuid.uuid4())
    user_data = {
        "id": user_id,
        "username": request.get("username"),
        "name": request.get("name"),
        "role": request.get("role"),
        "password_hash": bcrypt.hash(request.get("password")),
        "pin_hash": bcrypt.hash(request.get("pin")),
        "created_at": datetime.utcnow().isoformat()
    }
    
    await db.users.insert_one(user_data)
    return {"message": "User created successfully", "id": user_id}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, request: dict):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {
        "name": request.get("name"),
        "role": request.get("role"),
    }
    
    # Only update password/pin if provided
    if request.get("password"):
        update_data["password_hash"] = bcrypt.hash(request.get("password"))
    if request.get("pin"):
        update_data["pin_hash"] = bcrypt.hash(request.get("pin"))
    
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    return {"message": "User updated successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

@api_router.get("/")
async def root():
    return {"message": "Restaurant POS API", "status": "online"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
