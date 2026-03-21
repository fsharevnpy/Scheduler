from fastapi import FastAPI

from api import app_router, auth_router


app = FastAPI(title="Scheduler API")
app.include_router(auth_router)
app.include_router(app_router)
