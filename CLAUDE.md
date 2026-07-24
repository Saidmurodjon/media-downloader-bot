# Media Downloader Bot — loyiha holati

## Maqsad
YouTube, Instagram va TikTok'dan videolarni Telegram botga yuklab beruvchi bot. Talablar: eng optimal, tez, bepul/arzon, ishonchli, ko'p foydalanuvchi bir vaqtda kirsa ham qotib qolmaydigan yechim.

## Arxitektura (2026-07-24'da qayta qurildi, 2026-07-24 kechqurun video-olish qatlami Cobalt'dan yt-dlp'ga o'zgartirildi)

Eski holat: MongoDB + Telegraf webhook (Express) + TikTok uchun RapidAPI (hardcoded kalit bilan, endi o'chirilgan), Instagram/YouTube ishlamas edi. Bu loyiha "Cloudflare'da deploy qilingan" deb boshlangan edi, lekin Cloudflare Workers'da yt-dlp/Cobalt kabi og'ir, uzoq davom etadigan jarayonlarni ishga tushirib bo'lmaydi (CPU vaqti cheklangan, arbitrary process yo'q) — shu sabab noto'g'ri platforma bo'lgan va loyiha tugallanmay qolgan edi.

Yangi stack:
- **DB**: MongoDB → **Neon (serverless Postgres)**. Ulanish `db/index.js` (pg Pool). Jadvallar: `users`, `video_cache`.
- **Video olib berish**: RapidAPI scraperlar → **self-hosted Cobalt** → keyinroq **yt-dlp** (pastga qarang, sabab bilan). Klient: `services/ytdlp.js`.
- **Navbat**: sinxron/bloklovchi yuklab olish → **pg-boss** (Postgres-based queue, Redis shart emas — Neon'ning o'zida ishlaydi). `queue/index.js`, `queue/downloadAndSend.js`. Tanlov sababi: yuklab olish job'i soniya-daqiqalar davom etadi, queue dispatch tezligi ahamiyatsiz — Redis/BullMQ qo'shimcha infratuzilma bo'lardi, foydasiz murakkablik.
- **Kesh**: `video_cache` jadvalida URL → Telegram `file_id`. Bir marta yuklangan video qayta so'ralsa, tarmoqqa umuman murojaat qilinmaydi — darhol qayta yuboriladi. Bu ko'p foydalanuvchili yukni eng ko'p kamaytiruvchi omil.
- **Telegram fayl limiti**: standart Bot API 50MB bilan cheklaydi. `docker-compose.yml`da ixtiyoriy **local telegram-bot-api server** bor — ulansa (`.env`dagi `BOT_API_URL`), limit 2000MB'gacha ko'tariladi. `services/ytdlp.js` shu limitga qarab `--max-filesize` qo'yadi (50M yoki 2000M) — limitdan katta video "err_toolarge" xabari bilan rad etiladi, urinishga sarflanmaydi.

### Nega Cobalt'dan yt-dlp'ga o'tildi
Lokal sinovda Cobalt (self-hosted, `ghcr.io/imputnet/cobalt:10`, Docker) ba'zi YouTube videolarida "tunnel" havolasini muvaffaqiyatli qaytarar edi, lekin o'sha havoladan haqiqiy video baytlarini so'raganda **doimiy 0 bayt** qaytarardi (tekshirilgan videolar: `cIzDSbn2DGc`, `E7LDKyJlHG8` — ikkalasi ham izchil, bir necha marta takrorlanadi). Cobalt konteyner logi hech qanday xato ko'rsatmadi. Sabab, ehtimol, YouTube cookie/PO-token yo'qligi. Xuddi shu ikkala video **yt-dlp** bilan sinalganda muammosiz yuklandi — chunki yt-dlp YouTube'ning bot-himoyasiga qarshi eng faol yangilanadigan ochiq loyiha. Shu sabab video-olish qatlami yt-dlp'ga almashtirildi, Cobalt (kod ham, `docker-compose.yml`dagi servis ham) olib tashlandi.

`services/ytdlp.js` `python -m yt_dlp` orqali ishlaydi (PATH'ga alohida qo'shish shart emas, Windows'da ham, Linux'da (`python3`) ham bir xil ishlaydi). Video format: `bv*[height<=480]+ba/b[height<=480]/best`, `--merge-output-format mp4` (ffmpeg orqali audio+video birlashtiriladi). Audio format: `-x --audio-format mp3` (faqat audio oqimi yuklanadi, video umuman tortilmaydi — tezroq). Bir xil chaqiruvda `--write-info-json` + `--write-thumbnail --convert-thumbnails jpg` orqali sarlavha/davomiylik/o'lcham va cover-rasm ham olinadi (alohida so'rov emas, JSON sidecar fayl **parse** qilinadi — `readMetadata()`). Thumbnail Telegram talabiga (≤320x320) ffmpeg orqali kichraytiriladi. `YTDLP_FFMPEG_LOCATION` (.env) — ffmpeg'ning bin papkasi, Windows'da PATH'ga avtomatik qo'shilmagani uchun kerak; Linux VPS'da odatda `apt install ffmpeg` qilingandan keyin PATH'da bo'ladi, shu holda bu o'zgaruvchi bo'sh qoldirilishi mumkin.

### Video/audio tanlovi, caption, kesh
`Controllers.js`: URL yuborilganda darhol yuklanmaydi — avval "🎥 Video / 🎵 Audio" inline tugmasi chiqadi (URL+platform vaqtincha xotirada, `pendingRequests` Map, chat_id bo'yicha). Tanlovdan keyin kesh (`video_cache`, endi **(url, format)** composite key — bitta video ham video, ham audio holida alohida keshlanadi) tekshiriladi, topilmasa navbatga qo'yiladi. Yuborilgan xabarda: sarlavha + `📥 @BotUsername` (caption, `functions/MediaMessage.js`), thumbnail, `duration/width/height` (video uchun `supports_streaming: true` bilan). Kesh-hit holatida ham xuddi shu caption qayta tuziladi — shuning uchun `video_cache`da `title` ham saqlanadi.

### Guruhga qo'shish tugmasi (admin tomonidan yoqib/o'chiriladi)
`bot_settings` jadvalida (`key`/`value`) `show_add_to_group_button` bayrog'i saqlanadi (`admin/BotSettings.js`). Yoqilgan bo'lsa, har bir yuborilgan video/audio ostida `https://t.me/{username}?startgroup=true` havolali tugma chiqadi. `/admin` menyusidan boshqariladi. Standart holat: **o'chirilgan**.

## Admin panel, statistika, majburiy obuna (2026-07-24 kechqurun qo'shildi)

- **Admin aniqlash**: dinamik, DB'da (`users.is_admin`). Birinchi admin `.env`dagi `ADMIN_ID` orqali bootstrap qilinadi (`AdminModel.bootstrapAdmin`, har startup'da upsert — idempotent). Keyingi adminlar `/admin` menyusidan (mavjud admin tomonidan) qo'shiladi/olib tashlanadi.
- **`/admin`** — tugmali menyu (`admin/AdminController.js`): 📊 Statistika, 📢 Reklama yuborish, 👥 Adminlar ro'yxati, ➕/➖ Admin qo'shish/olib tashlash, 📢 Majburiy obuna, ➕ Guruhga qo'shish tugmasi.
- **Statistika** (`db/DownloadLog.js`, `downloads` jadvali): foydalanuvchilar soni, platforma bo'yicha yuklab olishlar, kesh samaradorligi foizi. Har bir yuklab olish (kesh-hit ham, yangi ham) shu jadvalga loglanadi.
- **Reklama (broadcast)**: admin matn/rasm/video yuboradi → tasdiqlash tugmasi → pg-boss navbatiga (`broadcast-message`) tushadi (`queue/broadcast.js`) → barcha foydalanuvchilarga `copyMessage` orqali ~20/soniya tezlikda yuboriladi (Telegram rate-limit'dan xavfsiz), oxirida admin'ga natija hisoboti keladi.
- **Majburiy obuna, ko'p kanalli** (`admin/ChannelModel.js`, `channels` + `channel_events` jadvallari): istagancha kanal qo'shish mumkin, foydalanuvchi **barchasiga** a'zo bo'lishi shart (admin bundan mustasno). Har kanal uchun: joriy umumiy obunachilar soni (`getChatMemberCount`, real vaqtda), kuzatuv boshlangandan beri qo'shilgan/chiqib ketganlar (Telegram `chat_member` hodisalari orqali, `functions/ChannelMemberHandler.js` — **faqat bot o'sha kanalga admin bo'lgandan beri**, tarixni tiklab bo'lmaydi), va ixtiyoriy reja (target_count) — songa yetganda barcha adminlarga avtomatik xabar keladi. **Faqat ochiq (@username) kanallar qo'llab-quvvatlanadi.**
- `chat_member` hodisalarini olish uchun `index.js`da `allowed_updates`ga `chat_member` qo'shilgan (polling va webhook ikkalasida ham).

## Hosting qarori
- Cloudflare Workers — rad etildi (yuqoridagi sabab).
- Oracle Cloud Free Tier — sinab ko'rildi, lekin ro'yxatdan o'tishda muammolar chiqdi (karta tasdiqlashda "qotib qolish", keyin "home region" xatosi, operator bilan bog'lanish talab qilindi). Support javobi noaniq muddatga cho'zilishi mumkinligi sababli tashlab yuborildi. Foydalanuvchiga Oracle support'ga yozish uchun tayyor xat (EN) berildi.
- **Hetzner Cloud** — tanlangan yechim. CX22 (2 vCPU, 4GB RAM, 40GB NVMe, ~€5.49/oy, 2026-yil iyun narxi). DigitalOcean'dan ~4 barobar arzon xuddi shu xarakteristikada.
- Foydalanuvchi Hetzner'da hisob ochgan (login qilingan), lekin **hisob "increased risk" deb belgilangan va tasdiqlash (verification) talab qilinmoqda**, aks holda loyiha yaratib bo'lmaydi. Ikkita tasdiqlash yo'li bor: (a) Credit card — $25/$100/$250/$500'dan birini tanlab, kartadan **haqiqiy pul yechiladi** (hold emas, real prepaid credit sifatida hisobga qo'shiladi, keyin hosting xarajatini yopadi), natija darhol chiqadi; (b) Document — pasport/hujjat yuklash, qo'lda tekshiriladi (soatlab/kunlab). Foydalanuvchi hali tanlab, to'lovni yakunlamagan (karta ma'lumotini Claude kirita olmaydi — xavfsizlik qoidasi).
- Shu to'siq sababli **avval lokal test qilish** qarori qabul qilindi (pastga qarang), Hetzner to'lovi keyinga qoldirilgan.

## Lokal test holati (VPS'siz, bepul) — 2026-07-24 kechqurun holatiga ko'ra ISHLAYAPTI
- Kompyuter reboot qilindi, Docker Desktop va WSL2/Ubuntu muvaffaqiyatli ishga tushdi.
- Bot **polling** rejimida ishlaydi (`index.js`: `BaseURL` bo'sh bo'lsa `bot.launch()` chaqiriladi, webhook o'rniga).
- `python -m pip install --user yt-dlp curl_cffi "yt-dlp[default]"` bilan yt-dlp o'rnatildi (Python 3.14, allaqachon kompyuterda bor edi; `curl_cffi` TikTok kabi bot-himoyali saytlar uchun "impersonation" imkoniyatini beradi). `winget install Gyan.FFmpeg` bilan ffmpeg o'rnatildi, yo'li `.env`dagi `YTDLP_FFMPEG_LOCATION`da to'g'ridan-to'g'ri ko'rsatilgan.
- **Local `telegram-bot-api` server ishga tushirilgan va ishlayapti** (`docker compose up -d telegram-bot-api`). Foydalanuvchi https://my.telegram.org'dan `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` oldi (bepul, faqat telefon raqami bilan kirish kerak edi). `.env`da `BOT_API_URL=http://localhost:8081` — fayl yuklash limiti 50MB→2000MB. **Kutilmagan qo'shimcha yutuq**: bir xil videoni yuklab yuborish vaqti ~3 daqiqadan ~16 soniyaga tushdi — local server MTProto orqali HTTP Bot API'ga qaraganda ancha samaraliroq fayl yuboradi.
- Cobalt Docker konteyneri olib tashlandi (`docker rm -f`), `docker-compose.yml`dan ham o'chirildi.
- Real Telegram orqali sinaldi (@UpperDownloaderBot): YouTube havolalari (turli hajmda, jumladan 2000MB limit ostidagi kattalar ham) muvaffaqiyatli yuklab olindi; kesh, xato xabarlari, caption/thumbnail/guruh-tugmasi tekshirildi — foydalanuvchi tasdiqladi.
- **TikTok**: bu tarmoq/kompyuterdan `https://www.tiktok.com`ga umuman ulanib bo'lmaydi (`curl` 15s'da timeout, HTTP javobsiz) — kod/yt-dlp muammosi emas, ISP/davlat darajasidagi cheklov ehtimoli katta (O'zbekiston). VPN/proxy bo'lmasa hal qilib bo'lmaydi, hozircha ochiq masala.
- **Instagram**: tarmoq orqali ochiladi, lekin haqiqiy post havolasi bilan hali sinalmagan (yt-dlp'ning Instagram extractor'i vaqti-vaqti bilan "broken" deb belgilanishi mumkin — real havola bilan tekshirish kerak).

## Muhim fayllar
- `index.js` — bootstrap: Postgres sxema, pg-boss worker, polling yoki webhook, admin/format/obuna callback routing, `chat_member` eventlari
- `Controllers.js` — platforma aniqlash, majburiy obuna tekshiruvi, video/audio tanlov so'rovi, kesh tekshirish, navbatga qo'yish
- `db/index.js`, `db/VideoCache.js`, `db/DownloadLog.js`, `user/UserModel.js` — Postgres qatlami
- `admin/AdminModel.js`, `admin/ChannelModel.js`, `admin/BotSettings.js`, `admin/AdminController.js` — admin huquqi, kanallar, on/off sozlamalar, `/admin` menyu mantig'i
- `functions/Subscription.js` — ko'p-kanalli a'zolik tekshiruvi
- `functions/ChannelMemberHandler.js` — kanal join/leave hodisalari, reja-bajarildi bildirishnomasi
- `functions/BotInfo.js` — bot username'ni bir marta keshlab saqlaydi
- `functions/MediaMessage.js` — caption va "guruhga qo'shish" tugmasi qurish
- `services/ytdlp.js` — yt-dlp orqali video/audio yuklab olish + metadata/thumbnail parser (`python -m yt_dlp`, 480p cap, `--max-filesize`)
- `queue/index.js`, `queue/downloadAndSend.js`, `queue/broadcast.js` — pg-boss worker: yuklash+yuborish, xato klassifikatsiyasi, reklama tarqatish
- `text.json` — 3 tilli (uz/ru/en) matnlar
- `docker-compose.yml` — local telegram-bot-api (Cobalt olib tashlangan)

## Kerakli `.env` o'zgaruvchilari
```
TOKEN=
BaseURL=
PORT=
DATABASE_URL=            # Neon connection string — SINALGAN, ishlaydi
ADMIN_ID=                # birinchi admin chat_id (bootstrap uchun)
TELEGRAM_API_ID=         # my.telegram.org'dan, bepul — OLINGAN va sozlangan
TELEGRAM_API_HASH=       # my.telegram.org'dan, bepul — OLINGAN va sozlangan
BOT_API_URL=             # http://localhost:8081 — local bot-api server SOZLANGAN va ishlayapti
YTDLP_PYTHON=            # ixtiyoriy, default "python" (Linux'da "python3" kerak bo'lishi mumkin)
YTDLP_FFMPEG_LOCATION=   # ffmpeg bin papkasi, Linux'da PATH'da bo'lsa bo'sh qoldirish mumkin
```
`.env` `.gitignore`da, repo'ga tushmaydi. **Diqqat**: `TELEGRAM_API_ID`/`HASH` real qiymatlar chatda ochiq yuborilgan — production'ga o'tishda bu ham maxfiy saqlanishi kerak (repo'ga tushmasligi allaqachon ta'minlangan, `.gitignore` orqali).

## SSH kalit
VPS uchun mahalliy kompyuterda tayyorlangan: `~/.ssh/oracle_vps` (nomi tarixiy, Hetzner uchun ham ishlatilmoqda). Public key Hetzner Console'ga qo'shilgan.

## Hozirgi holat / navbatdagi qadamlar
1. ✅ Kod qayta yozildi (Postgres, queue, kesh)
2. ✅ Docker Desktop, WSL2/Ubuntu, yt-dlp, ffmpeg — hammasi o'rnatilgan va ishlayapti
3. ✅ Video olish qatlami Cobalt'dan **yt-dlp**'ga o'tkazildi — YouTube'da real sinovdan o'tdi
4. ✅ Xato xabarlari aniqlashtirildi (video mavjud emas / juda katta / timeout — tilga mos)
5. ✅ **Admin panel** (`/admin`): statistika, reklama (broadcast), admin boshqaruvi — real sinovdan o'tdi
6. ✅ **Ko'p-kanalli majburiy obuna**: join/leave kuzatuvi, reja va bildirishnoma — kod tayyor, real kanal bilan sinov qilinmagan (foydalanuvchi hali sinamagan)
7. ✅ **Video/audio tanlov tugmasi**, caption (sarlavha + bot username), thumbnail, ixtiyoriy "guruhga qo'shish" tugmasi — real sinovdan o'tdi, foydalanuvchi tasdiqladi
8. ✅ **Local telegram-bot-api server** sozlandi (`TELEGRAM_API_ID`/`HASH` olindi) — fayl limiti 2000MB'ga ko'tarildi, kutilmaganda yuklash tezligi ham sezilarli yaxshilandi
9. ⬜ Instagram real havola bilan hali sinalmagan; TikTok bu tarmoqdan network darajasida ochilmaydi (VPN kerak, alohida masala)
10. ⬜ **Kod hali commit qilinmagan** — butun seans davomidagi barcha o'zgarishlar (Cobalt→yt-dlp, admin panel, kanal, format tanlovi, caption/thumbnail) working directory'da turibdi, `git status` katta diff ko'rsatadi
11. ⬜ Lokal test to'liq muvaffaqiyatli bo'lgach: Hetzner tasdiqlashni yakunlash ($25 karta orqali, foydalanuvchi o'zi kiritadi) → CX22 server yaratish → SSH orqali production deploy. **Diqqat**: VPS'da yt-dlp uchun Python3 + pip + ffmpeg o'rnatish kerak bo'ladi (`apt install python3-pip ffmpeg`, keyin `pip install yt-dlp curl_cffi "yt-dlp[default]"`), Cobalt endi kerak emas. Local telegram-bot-api uchun ham xuddi shu `TELEGRAM_API_ID`/`HASH`ni VPS'ning `.env`iga ko'chirish kifoya.
12. ⬜ Keyingi bosqich (foydalanuvchi tasdiqlagan tartib bo'yicha **keyin**): premium tarif (reklamasiz, navbatda ustuvor — pg-boss job priority orqali). To'lov uchun tavsiya: Telegram Stars (eng oson integratsiya). Reklama qismi allaqachon qo'shildi (band 5).

## Qabul qilingan qoidalar / kelishuvlar
- Avval asosiy oqim to'liq ishga tushirilib sinaladi, **keyin** premium/reklama qatlami qo'shiladi (foydalanuvchi qarori).
- Pul sarflashdan oldin: **avval lokal Docker bilan bepul sinash**, faqat lokal test muvaffaqiyatli bo'lgach Hetzner'ga $25 to'lanadi (foydalanuvchi qarori).
- Xavfsizlik qoidasi: Claude karta raqami, parol yoki shaxsiy hujjatlarni hech qachon o'zi kiritmaydi/yubormaydi — bunday joylarda foydalanuvchidan so'raladi.
- Xavfsizlik: Neon parolini foydalanuvchi chatda ochiq yubordi — dashboard'dan rotate qilish tavsiya etilgan, hali tasdiqlanmagan/bajarilmagan.
