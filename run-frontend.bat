@echo off
REM Starts the Vite dev server on http://localhost:5173
cd /d "%~dp0frontend"
if not exist node_modules ( npm install )
npm run dev
