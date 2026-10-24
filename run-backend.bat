@echo off
REM Starts the FastAPI server on http://127.0.0.1:8000  (run setup once: see README)
cd /d "%~dp0backend"
if not exist .venv ( py -m venv .venv && call .venv\Scripts\activate && pip install -r requirements.txt ) else ( call .venv\Scripts\activate )
uvicorn app.main:app --reload --port 8000
