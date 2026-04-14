import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api import app_router, auth_router


app = FastAPI(title="Scheduler API")

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = os.path.join(os.path.dirname(__file__), "upload")
if os.path.isdir(upload_dir):
    app.mount("/upload", StaticFiles(directory=upload_dir), name="upload")

app.include_router(auth_router)
app.include_router(app_router)
