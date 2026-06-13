@echo off
REM Quick test of the project without Docker

echo.
echo ============================================
echo CapstoneHub - Quick Health Check
echo ============================================
echo.

setlocal enabledelayedexpansion

REM Check Backend
echo [1/3] Checking Backend files...
if exist backend\package.json (
    echo ✓ Backend files present
) else (
    echo ✗ Backend files missing
)

REM Check Frontend
echo [2/3] Checking Frontend files...
if exist frontend\package.json (
    echo ✓ Frontend files present
) else (
    echo ✗ Frontend files missing
)

REM Check AI Service
echo [3/3] Checking AI Service files...
if exist ai-service\main.py (
    echo ✓ AI Service files present
) else (
    echo ✗ AI Service files missing
)

echo.
echo ============================================
echo Health Check Summary
echo ============================================
echo.

if exist backend\src\middleware.js (
    echo ✓ Backend middleware (ERROR HANDLER) - OK
) else (
    echo ✗ Backend middleware - MISSING
)

if exist backend\src\upload.js (
    echo ✓ Backend upload validation - OK
) else (
    echo ✗ Backend upload validation - MISSING
)

if exist frontend\src\components\ErrorBoundary.jsx (
    echo ✓ Frontend ErrorBoundary - OK
) else (
    echo ✗ Frontend ErrorBoundary - MISSING
)

if exist frontend\src\components\Toast.jsx (
    echo ✓ Frontend Toast notifications - OK
) else (
    echo ✗ Frontend Toast notifications - MISSING
)

if exist db\init.sql (
    echo ✓ Database schema - OK
) else (
    echo ✗ Database schema - MISSING
)

echo.
echo ============================================
echo Next Steps:
echo 1. Install Docker: https://www.docker.com/
echo 2. Run: docker compose up --build
echo 3. Open: http://localhost:5173
echo ============================================
echo.

pause
