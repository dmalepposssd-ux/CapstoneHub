@echo off
REM Script to test Backend locally

echo ========================================
echo CapstoneHub Backend Testing
echo ========================================

cd backend

echo.
echo [1/5] Checking if dependencies are installed...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
) else (
    echo Dependencies found!
)

echo.
echo [2/5] Checking environment...
if not exist .env (
    echo Creating .env from example...
    copy .env.example .env
)

echo.
echo [3/5] Starting Backend Server...
echo Backend will run on http://localhost:4000
echo Press Ctrl+C to stop

npm run dev
