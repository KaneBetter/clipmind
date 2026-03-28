from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ClipMind"
    database_url: str = "sqlite:///./data/clipmind.db"

    # Video source (required — set via CLIPMIND_VIDEO_DIR)
    video_dir: str = ""

    # Optional: photo source directory
    photo_dir: str = ""

    # Optional: music source directory
    music_dir: str = ""

    # Thumbnails
    thumbnail_dir: str = "./data/thumbnails"
    thumbnail_width: int = 320
    thumbnail_height: int = 180

    # CapCut Mate
    capcut_mate_url: str = "http://localhost:30000/openapi/capcut-mate/v1"

    # File server root for CapCut Mate Docker path resolution (parent of video_dir on host)
    file_server_root: str = ""

    # Gemini (Phase 2)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # File server for CapCut Mate Docker
    file_server_host: str = "host.docker.internal"
    file_server_port: int = 18080

    model_config = {"env_prefix": "CLIPMIND_", "env_file": ".env"}


settings = Settings()
