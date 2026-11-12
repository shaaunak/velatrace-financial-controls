"""VelaTrace FastAPI Application Entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="VelaTrace — Financial Reporting Assurance API",
    version="1.0.0",
    description="Every number. Verified. Every decision. Traceable.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "velatrace-api"}


app.include_router(router, prefix="/api/v1")
