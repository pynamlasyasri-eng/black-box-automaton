"""Runtime configuration. Everything has a safe default; no secrets are used."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("BBA_DB_PATH", str(BASE_DIR / "data" / "experiments.db"))
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "BBA_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
# If this folder exists (after `npm run build`) the API server also serves the UI.
FRONTEND_DIST = os.environ.get("BBA_FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist"))
