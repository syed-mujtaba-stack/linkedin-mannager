from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:  # pragma: no cover - dotenv is included in requirements
    pass

BACKEND_DIR = Path(__file__).resolve().parent


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Nexus Agent Studio")
    environment: str = os.getenv("APP_ENV", "development")
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "").strip()
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "openrouter/free").strip()
    openrouter_base_url: str = os.getenv(
        "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
    ).rstrip("/")
    openrouter_http_referer: str = os.getenv(
        "OPENROUTER_HTTP_REFERER", "http://localhost:5173"
    )
    openrouter_app_title: str = os.getenv("OPENROUTER_APP_TITLE", "Nexus Agent Studio")
    supabase_url: str = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    supabase_service_role_key: str = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_SECRET_KEY", "").strip()
    )
    sqlite_path: Path = Path(
        os.getenv("SQLITE_PATH", str(BACKEND_DIR / "data" / "nexus.sqlite3"))
    )
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    )
    max_message_chars: int = _int_env("MAX_MESSAGE_CHARS", 12000)
    max_context_messages: int = _int_env("MAX_CONTEXT_MESSAGES", 30)
    max_tool_rounds: int = _int_env("MAX_TOOL_ROUNDS", 3)
    openrouter_timeout_seconds: int = _int_env("OPENROUTER_TIMEOUT_SECONDS", 180)

    @property
    def uses_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


settings = Settings()
