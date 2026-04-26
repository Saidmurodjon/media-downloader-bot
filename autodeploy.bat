@echo off
setlocal EnableDelayedExpansion
title Media Downloader Bot — Auto Deploy

echo.
echo  ==========================================
echo   Media Downloader Bot - Auto Deploy
echo  ==========================================
echo.

:: ── Move to script directory ──────────────────────────────────────────────────
cd /d "%~dp0"

:: ── 1. Pull latest code ───────────────────────────────────────────────────────
echo [1/7] Pulling latest code...
git pull origin claude/add-dark-mode-toggle-BfDSt
if %errorlevel% neq 0 ( echo ERROR: git pull failed & pause & exit /b 1 )
echo.

:: ── 2. Install dependencies ───────────────────────────────────────────────────
echo [2/7] Installing dependencies...
call bun install
if %errorlevel% neq 0 ( echo ERROR: bun install failed & pause & exit /b 1 )
echo.

:: ── 3. Apply D1 schema ────────────────────────────────────────────────────────
echo [3/7] Applying D1 schema...
call npx wrangler d1 execute media-downloader-bot --file=src\schema.sql
if %errorlevel% neq 0 ( echo ERROR: D1 schema failed & pause & exit /b 1 )
echo.

:: ── 4. Set secrets ────────────────────────────────────────────────────────────
echo [4/7] Setting BOT_TOKEN...
echo 5599008079:AAGwZDs8nfPXEev-zQbt5HT-wQjXfGZhgYU | call npx wrangler secret put BOT_TOKEN
echo.

echo [5/7] Setting ADMIN_IDS...
echo 693732696 | call npx wrangler secret put ADMIN_IDS
echo.

:: ── 5. First deploy ───────────────────────────────────────────────────────────
echo [6/7] Deploying to Cloudflare Workers...
call npx wrangler deploy 2>&1 | tee deploy_output.txt
if %errorlevel% neq 0 ( echo ERROR: deploy failed & pause & exit /b 1 )
echo.

:: ── 6. Extract workers.dev URL and set WEBHOOK_URL ───────────────────────────
echo [7/7] Setting WEBHOOK_URL and re-deploying...

:: Extract the workers.dev URL from deploy output
set WORKER_URL=
for /f "tokens=*" %%i in ('findstr /i "workers.dev" deploy_output.txt') do (
    set LINE=%%i
    for %%j in (!LINE!) do (
        echo %%j | findstr /i "https://" >nul 2>&1
        if !errorlevel! equ 0 (
            set WORKER_URL=%%j
        )
    )
)

if "!WORKER_URL!"=="" (
    echo Could not auto-detect workers.dev URL.
    set /p WORKER_URL="Please enter your Workers URL manually (e.g. https://media-downloader-bot.NAME.workers.dev): "
)

echo Detected URL: !WORKER_URL!
echo !WORKER_URL! | call npx wrangler secret put WEBHOOK_URL
echo.

:: ── 7. Re-deploy with WEBHOOK_URL set ────────────────────────────────────────
call npx wrangler deploy
if %errorlevel% neq 0 ( echo ERROR: second deploy failed & pause & exit /b 1 )

:: ── 8. Test health endpoint ──────────────────────────────────────────────────
echo.
echo Testing health endpoint...
curl -s !WORKER_URL!/health
echo.

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  ==========================================
echo   DEPLOY MUVAFFAQIYATLI YAKUNLANDI!
echo  ==========================================
echo.
echo  Bot URL : !WORKER_URL!/webhook
echo  Health  : !WORKER_URL!/health
echo.
echo  Telegram botingizni sinab ko'ring: @BotFather da botni qidiring
echo  va biror YouTube/Instagram havolasi yuboring.
echo.

:: cleanup
del deploy_output.txt 2>nul

pause
