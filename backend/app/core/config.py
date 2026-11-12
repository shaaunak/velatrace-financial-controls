from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://postgres@localhost:5435/velatrace"
    test_database_url: str = "postgresql+psycopg://postgres@localhost:5435/velatrace_test"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    demo_workspace_id: str = "ws_northbridge_demo"
    secret_key: str = "velatrace-local-dev-secret-key-2026"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB limit for demo safety

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
