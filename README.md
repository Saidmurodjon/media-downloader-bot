# Media Downloader Bot

A production-ready Telegram bot that downloads videos from YouTube and Instagram using `yt-dlp`. Built with **Bun**, **Hono**, **Grammy**, and **SQLite** (or Cloudflare D1).

---

## Features

- Download YouTube videos, Shorts, and Reels
- Download Instagram posts, Reels, and Stories
- Media cache — identical URLs served instantly from Telegram's servers (no re-download)
- Multi-language support: O'zbek 🇺🇿, English 🇬🇧, Русский 🇷🇺
- Admin panel with statistics, broadcast system, and user management
- Webhook mode via Hono HTTP server

---

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) in `PATH`
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A publicly accessible HTTPS URL for the webhook (e.g. via Caddy, nginx, or a tunnel)

---

## Setup (Local SQLite — VPS)

### 1. Install dependencies

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install yt-dlp
pip install -U yt-dlp
# or
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod +x /usr/local/bin/yt-dlp

# Install bot dependencies
bun install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
BOT_TOKEN=your_telegram_bot_token
WEBHOOK_URL=https://your-domain.com
ADMIN_IDS=123456789,987654321
DB_PATH=./data/bot.db
TMP_DIR=/tmp/mediabot
MAX_FILE_SIZE_MB=50
PORT=3000
```

### 3. Initialize the database

```bash
bun run db:init
```

This creates `./data/bot.db` and runs `src/schema.sql`.

### 4. Run the bot

```bash
# Development (hot reload)
bun run dev

# Production
bun run start
```

On startup, the bot automatically:
- Runs the schema migration
- Cleans up stale temp directories (> 1 hour old)
- Registers the webhook with Telegram

---

## Setup (Cloudflare D1 + Workers)

### 1. Create a D1 database

```bash
npx wrangler d1 create media-downloader-bot
```

Copy the `database_id` from the output into `wrangler.toml`.

### 2. Run the schema

```bash
npx wrangler d1 execute media-downloader-bot --file=src/schema.sql
```

### 3. Set secrets

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_IDS
npx wrangler secret put WEBHOOK_URL
```

### 4. Update `wrangler.toml`

In `src/index.ts` and `src/db.ts`, switch the adapter:

```typescript
// src/db.ts — Workers entry point receives env.DB
import { createD1Adapter, setDb } from './db.js';
setDb(createD1Adapter(env.DB));
```

### 5. Deploy

```bash
npx wrangler deploy
```

---

## Webhook Setup

The bot uses webhook mode. Your server must have a valid TLS certificate on the `WEBHOOK_URL` domain.

**Caddy (recommended):**

```caddyfile
your-domain.com {
  reverse_proxy localhost:3000
}
```

**Nginx:**

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    location /webhook {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Manual webhook registration** (if `WEBHOOK_URL` env is set, the bot does this automatically on startup):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/webhook"
```

---

## Admin Commands Reference

All admin commands require your Telegram ID to be in `ADMIN_IDS`.

| Command | Description |
|---------|-------------|
| `/admin` | Open the admin panel (inline keyboard) |
| `/stats` | Show detailed statistics |
| `/userinfo <id>` | Show user details by Telegram ID |
| `/broadcast` | Start the broadcast flow |

### Admin Panel Buttons

| Button | Action |
|--------|--------|
| 📊 Statistika | Same as `/stats` |
| 📨 Broadcast | Start broadcast flow |
| 👥 Foydalanuvchilar | Show user count |
| 🗄️ Cache | Show cache statistics |

### Broadcast Flow

1. `/broadcast` → choose **✏️ Matn** or **↪️ Forward**
2. Choose target: **🌐 Hammaga** (all users) or **👤 Bitta userga** (specific user)
3. Enter the message text or forward a message
4. Review preview → **✅ Yuborish** to confirm or **❌ Bekor qilish** to cancel
5. Bot sends in batches of 25/sec; automatically skips blocked/deactivated users

---

## Project Structure

```
src/
├── index.ts          # Hono app + startup
├── bot.ts            # Grammy bot + middleware
├── db.ts             # DB adapter (SQLite / D1)
├── schema.sql        # Database schema
├── downloader.ts     # yt-dlp wrapper
├── i18n.ts           # Translation helper
├── handlers/
│   ├── start.ts      # /start, language selection
│   ├── media.ts      # URL detection + download flow
│   └── admin.ts      # Admin panel + broadcast
└── utils/
    ├── detect.ts     # Platform detection + URL hash
    ├── cleanup.ts    # Temp file cleanup
    └── forward.ts    # Telegram file_id forwarding + upload
locales/
├── uz.json           # Uzbek strings
├── en.json           # English strings
└── ru.json           # Russian strings
scripts/
└── init-db.ts        # One-time DB initializer
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | ✅ | — | Telegram bot token |
| `WEBHOOK_URL` | ✅ | — | Public HTTPS base URL |
| `ADMIN_IDS` | ✅ | — | Comma-separated admin Telegram IDs |
| `DB_PATH` | ❌ | `./data/bot.db` | SQLite file path |
| `TMP_DIR` | ❌ | `/tmp/mediabot` | Temp download directory |
| `MAX_FILE_SIZE_MB` | ❌ | `50` | Max file size (Telegram limit) |
| `PORT` | ❌ | `3000` | HTTP server port |

---

## Health Check

```bash
curl https://your-domain.com/health
# {"ok":true,"ts":1700000000000}
```
