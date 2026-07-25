# Media Downloader Bot

A Telegram bot that downloads video and audio from YouTube, Instagram, and TikTok on request, with a full admin toolkit for running it as a real service — caching, broadcast messaging, forced-subscription gating, and hybrid webhook/polling connectivity.

## Features

**For users**
- Send a link from YouTube, Instagram, or TikTok — pick video or audio (MP3) format
- Sent media includes the original title, a cover thumbnail, and the source's rich text formatting (bold, links, quotes) where applicable
- Previously requested links are served instantly from cache (no re-download, no re-upload)
- Multi-language UI (Uzbek, Russian, English)

**For admins**
- `/admin` control panel (Telegram inline keyboard):
  - Usage statistics (users, downloads by platform, cache hit rate)
  - Broadcast messaging — text, photo, video, or multi-photo albums, with an optional call-to-action button, resend-last-campaign, and delivery history
  - Multi-channel forced subscription with live join/leave tracking and subscriber-goal alerts
  - Dynamic admin role management (no redeploy needed to add/remove admins)
  - Toggle for an "Add to group" button on delivered media
- Bot profile description is set via the Bot API at boot (not BotFather), so it's versioned with the code

## Architecture

| Concern | Choice | Why |
|---|---|---|
| Bot framework | [Telegraf](https://github.com/telegraf/telegraf) | Standard, well-documented Telegram Bot API client for Node.js |
| Database | [Neon](https://neon.tech) (serverless Postgres) | Managed, scales to zero, no ops overhead |
| Job queue | [pg-boss](https://github.com/timgit/pg-boss) | Postgres-backed queue — downloads run for seconds to minutes, so dispatch latency doesn't matter and a separate Redis/BullMQ deployment would be unjustified complexity |
| Media extraction | [yt-dlp](https://github.com/yt-dlp/yt-dlp) via `python -m yt_dlp` | The most actively maintained extractor against platforms' anti-bot measures; also used to pull title/duration/thumbnail metadata in the same pass |
| Transcoding | ffmpeg | Merges yt-dlp's video+audio streams, extracts MP3 audio, resizes thumbnails |
| Large uploads | Optional local [telegram-bot-api](https://github.com/tdlib/telegram-bot-api) server (Docker) | Raises Telegram's upload cap from 50MB to 2000MB |
| Connectivity | Webhook (primary) with automatic long-polling fallback | See below |

### Hybrid webhook/polling

Without a stable public domain, a webhook needs a tunnel — and tunnels drop. `functions/ConnectionManager.js` runs webhook delivery via an [ngrok](https://ngrok.com) tunnel as the primary mode, health-checking it every 30 seconds (`getWebhookInfo` plus tunnel liveness). Two consecutive failed checks trigger an automatic fallback to long-polling; two consecutive healthy checks while polling trigger an automatic switch back to a fresh webhook. If `BaseURL` is configured (e.g. a real domain in production), this whole mechanism is skipped in favor of a single fixed webhook.

### Request flow

```
User sends a link
        │
        ▼
Platform detected (YouTube / Instagram / TikTok)
        │
        ▼
Forced-subscription check (if configured) ──▶ prompt to join, if missing
        │
        ▼
Video or audio choice
        │
        ▼
Cache lookup (url + format) ──▶ HIT: resend existing Telegram file_id instantly
        │ MISS
        ▼
pg-boss job enqueued ──▶ yt-dlp downloads + extracts metadata ──▶ sent to Telegram
        │
        ▼
Result cached for next time
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3 with `pip` (for yt-dlp)
- ffmpeg
- Docker (optional, for the local Bot API server that raises the upload limit)
- A Postgres database (e.g. a free [Neon](https://neon.tech) project)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Installation

```bash
git clone https://github.com/Saidmurodjon/media-downloader-bot.git
cd media-downloader-bot
npm install
pip install yt-dlp curl_cffi "yt-dlp[default]"
```

### Configuration

Copy the variables below into a `.env` file in the project root:

```dotenv
TOKEN=                   # Bot token from @BotFather
BaseURL=                 # Leave empty for local dev (hybrid webhook/polling via ngrok);
                          # set to a fixed public URL in production
PORT=3000
DATABASE_URL=            # Postgres connection string (Neon or otherwise)
ADMIN_ID=                # Telegram chat_id of the first admin (bootstraps admin access)

# Optional: raises Telegram's upload limit from 50MB to 2000MB via a local
# telegram-bot-api server (docker-compose.yml). Get these free at my.telegram.org.
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
BOT_API_URL=              # e.g. http://localhost:8081, once the container is running

# Optional: yt-dlp/ffmpeg overrides (only needed if not on PATH)
YTDLP_PYTHON=              # default "python" ("python3" on most Linux systems)
YTDLP_FFMPEG_LOCATION=     # ffmpeg's bin directory, if not on PATH

# Optional: caps how many downloads run concurrently (default 2)
DOWNLOAD_CONCURRENCY=

# Optional: local dev webhook tunnel — free token at https://dashboard.ngrok.com
NGROK_BIN=                 # defaults to "ngrok" (PATH)
NGROK_AUTHTOKEN=
```

`.env` is gitignored — never commit it.

### Running

```bash
# Optional: local Bot API server for uploads over 50MB
docker compose up -d telegram-bot-api

npm start
```

On first boot, the app creates its Postgres schema automatically and bootstraps `ADMIN_ID` as the first admin. Message the bot's own `/start`, then `/admin` from that account to open the control panel.

## Project Structure

```
├── index.js                  # Bootstrap: schema, queue worker, connection mode, routing
├── Controllers.js            # Platform detection, subscription gate, format choice, caching
├── config.js                 # Environment variable loading
├── db/                       # Postgres layer (schema, cache, download log)
├── user/                     # User model
├── admin/                    # Admin roles, channels, broadcast, bot settings, /admin menu
├── functions/                # Cross-cutting helpers: subscription checks, channel-membership
│                              # events, bot info/description, hybrid connection manager, ngrok
├── services/ytdlp.js          # yt-dlp process wrapper + metadata/thumbnail extraction
├── queue/                    # pg-boss workers: download+send, broadcast delivery
├── text.json                 # UI strings (uz/ru/en)
└── docker-compose.yml         # Optional local telegram-bot-api server
```

## License

No license has been chosen yet — all rights reserved by the author.
