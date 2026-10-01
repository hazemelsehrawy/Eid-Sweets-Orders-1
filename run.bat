@echo off
title Eid Sweets Orders
cd /d "%~dp0"

echo ==============================================
echo   Eid Sweets Orders - Starting Servers
echo ==============================================
echo.

echo [1/3] Starting Backend API Server (Port 5000)...
start "Eid Sweets - Backend API" cmd /k "node --env-file=.env artifacts/api-server/dist/index.mjs"

timeout /t 2 /nobreak >nul

echo [2/3] Starting Frontend Dev Server (Port 3000)...
start "Eid Sweets - Frontend UI" cmd /k "pnpm --filter @workspace/eid-sweets-orders run dev"

timeout /t 3 /nobreak >nul

echo [3/3] Opening Website in Browser...
start http://localhost:3000

echo.
echo ==============================================
echo   Website running at: http://localhost:3000
echo ==============================================
echo.
