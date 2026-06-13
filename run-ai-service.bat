@echo off
REM Script to test AI Service locally

echo ========================================
echo CapstoneHub AI Service Testing
echo ========================================

cd ai-service

echo.
echo [1/4] Checking if dependencies are installed...
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

echo.
echo [2/4] Activating virtual environment...
call venv\Scripts\activate.bat

echo.
echo [3/4] Installing Python dependencies...
pip install -r requirements.txt

echo.
echo [4/4] Starting AI Service...
echo AI Service will run on http://localhost:8000
echo API docs available at http://localhost:8000/docs
echo Press Ctrl+C to stop

uvicorn main:app --reload --port 8000
