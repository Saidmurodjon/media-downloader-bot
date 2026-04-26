# deploy.ps1 — Media Downloader Bot: Cloudflare Workers deploy
# Run from the repo root on your Windows machine (already wrangler-logged-in).
# Usage:  .\deploy.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Media Downloader Bot — Deploy Script  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Pull latest code ───────────────────────────────────────────────────────
Write-Host "[1/6] Pulling latest code..." -ForegroundColor Yellow
git pull origin claude/add-dark-mode-toggle-BfDSt
Write-Host "OK" -ForegroundColor Green

# ── 2. Install dependencies ───────────────────────────────────────────────────
Write-Host ""
Write-Host "[2/6] Installing dependencies..." -ForegroundColor Yellow
bun install
Write-Host "OK" -ForegroundColor Green

# ── 3. Apply D1 schema ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/6] Applying D1 schema..." -ForegroundColor Yellow
npx wrangler d1 execute media-downloader-bot --file=src/schema.sql
Write-Host "OK" -ForegroundColor Green

# ── 4. Set secrets ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/6] Setting secrets..." -ForegroundColor Yellow
Write-Host ""

$botToken = Read-Host "  BOT_TOKEN (@BotFather dan, masalan: 7123456789:AAF...)"
if ($botToken -ne "") {
    $botToken | npx wrangler secret put BOT_TOKEN
    Write-Host "  BOT_TOKEN saqlandi" -ForegroundColor Green
} else {
    Write-Host "  BOT_TOKEN o'tkazib yuborildi" -ForegroundColor DarkYellow
}

Write-Host ""
$adminIds = Read-Host "  ADMIN_IDS (sizning Telegram ID, masalan: 123456789)"
if ($adminIds -ne "") {
    $adminIds | npx wrangler secret put ADMIN_IDS
    Write-Host "  ADMIN_IDS saqlandi" -ForegroundColor Green
} else {
    Write-Host "  ADMIN_IDS o'tkazib yuborildi" -ForegroundColor DarkYellow
}

Write-Host ""
$downloadUrl = Read-Host "  DOWNLOAD_SERVICE_URL (VPS URL, bo'sh qoldirish mumkin)"
if ($downloadUrl -ne "") {
    $downloadUrl | npx wrangler secret put DOWNLOAD_SERVICE_URL
    Write-Host "  DOWNLOAD_SERVICE_URL saqlandi" -ForegroundColor Green
} else {
    Write-Host "  DOWNLOAD_SERVICE_URL o'tkazib yuborildi" -ForegroundColor DarkYellow
}

# ── 5. Deploy ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[5/6] Deploying to Cloudflare Workers..." -ForegroundColor Yellow
npx wrangler deploy

# ── 6. Set WEBHOOK_URL and re-deploy ─────────────────────────────────────────
Write-Host ""
Write-Host "[6/6] Webhook URL o'rnatish..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Yuqoridagi deploy natijasidagi URL ni kiriting." -ForegroundColor White
Write-Host "  Masalan: https://media-downloader-bot.saidmurod.workers.dev" -ForegroundColor DarkGray
Write-Host ""
$webhookUrl = Read-Host "  WEBHOOK_URL"
if ($webhookUrl -ne "") {
    $webhookUrl | npx wrangler secret put WEBHOOK_URL
    Write-Host "  WEBHOOK_URL saqlandi. Qayta deploy..." -ForegroundColor Green
    npx wrangler deploy
} else {
    Write-Host "  WEBHOOK_URL keyinroq o'rnating: echo 'https://...' | npx wrangler secret put WEBHOOK_URL" -ForegroundColor DarkYellow
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOY MUVAFFAQIYATLI YAKUNLANDI!     " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Tekshirish uchun:" -ForegroundColor White
if ($webhookUrl -ne "") {
    Write-Host "  curl $webhookUrl/health" -ForegroundColor Cyan
}
Write-Host "  https://dash.cloudflare.com -> Workers -> media-downloader-bot" -ForegroundColor Cyan
Write-Host ""
