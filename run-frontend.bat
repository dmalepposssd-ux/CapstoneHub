@echo off
REM Script to test Frontend locally

echo ========================================
echo CapstoneHub Frontend Testing
echo ========================================

cd frontend

echo.
echo [1/4] Checking if dependencies are installed...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
) else (
    echo Dependencies found!
)

echo.
echo [2/4] Building Frontend...
echo Building with Vite...
call npm run build

if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo [3/4] Starting Frontend Server...
echo Frontend will run on http://localhost:5173
echo Press Ctrl+C to stop

npm run dev
