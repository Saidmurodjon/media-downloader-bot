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

## Admin panel, statistika, majburiy obuna, reklama (2026-07-24/25'da qo'shildi)

- **Admin aniqlash**: dinamik, DB'da (`users.is_admin`). Birinchi admin `.env`dagi `ADMIN_ID` orqali bootstrap qilinadi (`AdminModel.bootstrapAdmin`, har startup'da upsert — idempotent). Keyingi adminlar `/admin` menyusidan (mavjud admin tomonidan) qo'shiladi/olib tashlanadi.
- **`/admin`** — tugmali menyu (`admin/AdminController.js`, **inline keyboard**): 📊 Statistika, 📢 Reklama yuborish, 🔁 Oxirgi reklamani qayta yuborish, 📊 Reklama tarixi, 👥 Adminlar ro'yxati, ➕/➖ Admin qo'shish/olib tashlash, 📢 Majburiy obuna, ➕ Guruhga qo'shish tugmasi. **Diqqat**: reply-keyboard (pastda doim turadigan tugma) variantiga o'tish sinab ko'rildi, lekin foydalanuvchi so'rovi bilan **inline'ga qaytarildi** — reply-keyboard qo'shilmasin.
- **Statistika** (`db/DownloadLog.js`, `downloads` jadvali): foydalanuvchilar soni, platforma bo'yicha yuklab olishlar, kesh samaradorligi foizi. Har bir yuklab olish (kesh-hit ham, yangi ham) shu jadvalga loglanadi.
- **Reklama (broadcast)** — `admin/BroadcastModel.js` (`broadcasts` jadvali, JSONB `content`/`button`) + `queue/broadcast.js`:
  - Admin matn/rasm/video yoki **bir nechta rasm (albom/karusel)** yuboradi — bir necha ketma-ket xabar ~1.2s debounce oynasida birlashtiriladi (`AdminController.bufferContent`/`finalizeBufferedContent`), chunki Telegram 1024 belgidan uzun caption'li postlarni **rasm + alohida matn xabari** qilib ikkiga bo'lib yuboradi — bitta xabar deb hisoblab qabul qilinmasa, matn qismi yo'qolib qolar edi.
  - Formatlash (qalin, havola, blockquote/"quote") **entities** orqali saqlanadi (`caption_entities`/`entities`), oddiy matnga aylantirilmaydi.
  - Ixtiyoriy inline tugma qo'shish mumkin (`Matn | https://havola` formatida).
  - Yuborishda caption 1024 belgidan oshsa, avtomatik: media (caption'siz) + to'liq matn alohida xabar sifatida (`queue/broadcast.js:splitCaption`). Albomga tugma qo'shilsa, alohida kichik xabar sifatida ketadi (Telegram media-group'ga tugma qo'yishga ruxsat bermaydi).
  - Barcha foydalanuvchilarga file_id/matn asosida **qayta qurilgan xabar** yuboriladi (`copyMessage` emas) — shuning uchun "kimdan forward qilingani" hech qachon ko'rinmaydi, ~20/soniya tezlikda (Telegram rate-limit'dan xavfsiz).
  - Har bir reklama `broadcasts`ga yoziladi (sent/failed soni bilan) — "🔁 qayta yuborish" va "📊 tarix" shundan o'qiydi.
- **Majburiy obuna, ko'p kanalli** (`admin/ChannelModel.js`, `channels` + `channel_events` jadvallari): istagancha kanal qo'shish mumkin, foydalanuvchi **barchasiga** a'zo bo'lishi shart (admin bundan mustasno). Har kanal uchun: joriy umumiy obunachilar soni (`getChatMemberCount`, real vaqtda), kuzatuv boshlangandan beri qo'shilgan/chiqib ketganlar (Telegram `chat_member` hodisalari orqali, `functions/ChannelMemberHandler.js` — **faqat bot o'sha kanalga admin bo'lgandan beri**, tarixni tiklab bo'lmaydi), va ixtiyoriy reja (target_count) — songa yetganda barcha adminlarga avtomatik xabar keladi. **Faqat ochiq (@username) kanallar qo'llab-quvvatlanadi.**
- `chat_member` hodisalarini olish uchun `index.js`da `allowed_updates`ga `chat_member` qo'shilgan (polling va webhook ikkalasida ham).
- **Bot profil tavsifi** (`functions/BotDescription.js`): `setMyDescription`/`setMyShortDescription` orqali kod ichida (uz/ru/en), BotFather shart emas, har bootstrap'da qayta o'rnatiladi (idempotent).

## Ulanish rejimi: gibrid webhook/polling (2026-07-25, ngrok orqali)

Lokal kompyuterda barqaror ochiq domen yo'q, shuning uchun `functions/ConnectionManager.js` **webhook**ni (ngrok tunnel orqali) ustuvor rejim sifatida ishlatadi, lekin uzluksiz nazorat qiladi va kerak bo'lsa **polling**ga o'tadi:
- Ishga tushishda: `functions/Ngrok.js` orqali tunnel ochiladi (`ngrok http <PORT>`, authtoken `.env`dagi `NGROK_AUTHTOKEN`dan), muvaffaqiyatli bo'lsa `setWebhook` chaqiriladi.
- Har **30 soniyada** tekshiradi (`getWebhookInfo` + tunnel holati). **2 marta ketma-ket** muammo topilsa → `deleteWebhook` + `bot.startPolling()` (polling'ga o'tish).
- Polling rejimida ham har 30s tekshiradi; tunnel qayta ko'tarilib, **2 marta ketma-ket** sog'lom bo'lsa → yana webhook'ga qaytadi (yangi ngrok URL bilan, chunki bepul ngrok har safar boshqa manzil beradi).
- Bu **real sinovdan o'tgan**: tunnel qo'lda o'chirilganda ~52 soniyada polling'ga o'tdi, tunnel qaytarilganda ~60 soniyada avtomatik webhook'ga qaytdi — hech qanday qo'lda aralashuvsiz.
- `Express` (`app.listen(PORT)`) va `bot.webhookCallback("/")` **doim** ishlab turadi, rejimdan qat'iy nazar — webhookCallback faqat POST so'rovlarni ushlaydi, GET "/" health-check yo'liga xalaqit bermaydi.
- **`.env`da `BaseURL` sozlansa** (production, haqiqiy domen bilan) — ngrok/ConnectionManager umuman ishga tushmaydi, to'g'ridan-to'g'ri shu doimiy URL'ga webhook o'rnatiladi (monitoring shart emas, domen barqaror deb hisoblanadi).
- ngrok winget orqali o'rnatilgan (`Ngrok.Ngrok`), lekin winget'dagi versiya (3.3.1) eskirgan chiqdi (`ERR_NGROK_121` — minimal versiya talabi), `ngrok update` bilan yangilangan (3.39.x). Yangilangandan keyin binary **yangi joyga** ko'chadi (`%LOCALAPPDATA%\Microsoft\WindowsApps\ngrok.ngrok_*\ngrok.exe`) — `.env`dagi `NGROK_BIN` shu yangilangan yo'lni ko'rsatishi kerak.

## Loglash va barqarorlik (2026-07-25)

`functions/logger.js` (winston) — barcha `console.log`/`console.error` shu bilan almashtirildi:
- `logs/app-YYYY-MM-DD.log` — barcha loglar (info+), kunlik rotatsiya, 14 kun saqlanadi
- `logs/error-YYYY-MM-DD.log` — faqat warn/error — tizim to'xtasa/muammo bo'lsa **avval shu qisqa faylni** tekshirish kerak
- Dev'da konsolga ham rangli/o'qilishi oson formatda chiqadi
- `logs/` `.gitignore`da

Shu bilan birga `process.on("uncaughtException"/"unhandledRejection")` va `bot.catch()` qo'shildi (`index.js`) — avval bunday xatolar **hech qanday izsiz** jarayonni yashirincha to'xtatib qo'yardi (bu seans davomida bir necha marta worker jarayoni "yo'qolib qolgani" shundan edi).

**Loglash yoqilgan zahoti 2 ta eski, ko'rinmas xato topildi va tuzatildi:**
1. `bot.telegram.setMyCommands(...)` hech qachon `await`/`.catch()` qilinmagan edi (loyihaning eng boshidan, prototip davridan) — Telegram uni rate-limit (429) qilganda "unhandled rejection" bo'lib chiqar, jarayon buzilardi.
2. Bootstrap'da `BotDescription.apply()` 8 ta so'rovni **bir vaqtda** (`Promise.allSettled`) yuborardi — bu doimiy ravishda Telegram rate-limitiga tegib turardi. Endi ketma-ket, orada 300ms kechikish bilan yuboriladi; muvaffaqiyatsiz bo'lsa faqat ogohlantiradi, **butun botni to'xtatmaydi** (bootstrap'dagi boshqa kosmetik bo'lmagan — DB, navbat — qadamlar hamon xato bo'lsa to'xtaydi).

**Yuk/burst himoyasi** ("100+ so'rov bir vaqtda kelsa" va "video hajmi katta bo'lsa" degan savolларга javoban):
- `pg-boss`ning `expireInMinutes`i **15 → 60 daqiqaga** oshirildi (`queue/index.js`). Bu muddat navbatda kutish vaqtiga emas, balki job **ishga tushgandan keyingi** ishlash vaqtiga tegishli (tekshirildi, pg-boss manba kodida tasdiqlandi: `startedOn + expireIn`). Muammo: 2000MB'ga yaqin katta video 15 daqiqadan ko'p vaqt olishi mumkin edi — shunda pg-boss job'ni "muvaffaqiyatsiz" deb hisoblab qayta urinar edi, lekin haqiqiy yuklab olish **to'xtamasdan orqa fonda davom etardi** (pg-boss uni bekor qila olmaydi) — natijada video ikki marta yuborilishi yoki resurs isrofi xavfi bor edi.
- Yangi `Queue.isQueueFull()` (`pg-boss`ning `getQueueSize`) — navbatda **50+** so'rov bo'lsa, yangi so'rovlarga "hozir band, keyinroq urinib ko'ring" (`err_busy`, 3 tilda) deyiladi, ular jimgina o'nlab daqiqalik navbatga qo'yilmaydi (`Controllers.js`).
- Eslatma: bu ikkalasi ham **DOWNLOAD_CONCURRENCY**ga bog'liq muammoning yumshatilishi, tub yechimi emas — chinakam ko'p-foydalanuvchili tezlik uchun VPS'da concurrency'ni oshirish kerak bo'ladi (yuqoriga qarang).

## Hosting qarori
- Cloudflare Workers — rad etildi (yuqoridagi sabab).
- Oracle Cloud Free Tier — sinab ko'rildi, lekin ro'yxatdan o'tishda muammolar chiqdi (karta tasdiqlashda "qotib qolish", keyin "home region" xatosi, operator bilan bog'lanish talab qilindi). Support javobi noaniq muddatga cho'zilishi mumkinligi sababli tashlab yuborildi. Foydalanuvchiga Oracle support'ga yozish uchun tayyor xat (EN) berildi.
- **Hetzner Cloud** — rejalashtirilgan edi (CX22, ~€5.49/oy), lekin hisob tasdiqlash to'sig'i ($25 karta yoki hujjat) sababli **amalda ishlatilmadi** — buning o'rniga foydalanuvchida allaqachon mavjud bo'lgan **Ubuntu server + Coolify** ishlatildi (pastga, "Production deploy" bo'limiga qarang). Hetzner rejasi shu bilan **eskirgan/rad etilgan** hisoblanadi, agar kelajakda alohida server kerak bo'lib qolmasa.
- Shu to'siq sababli **avval lokal test qilish** qarori qabul qilingan edi — lokal test muvaffaqiyatli yakunlangach, to'g'ridan-to'g'ri mavjud Coolify serveriga production deploy qilindi (2026-09-02).

## Lokal test holati (VPS'siz, bepul) — 2026-07-24 kechqurun holatiga ko'ra ISHLAYAPTI
- Kompyuter reboot qilindi, Docker Desktop va WSL2/Ubuntu muvaffaqiyatli ishga tushdi.
- Bot gibrid webhook/polling rejimida ishlaydi (batafsil yuqoridagi "Ulanish rejimi" bo'limida).
- `python -m pip install --user yt-dlp curl_cffi "yt-dlp[default]"` bilan yt-dlp o'rnatildi (Python 3.14, allaqachon kompyuterda bor edi; `curl_cffi` TikTok kabi bot-himoyali saytlar uchun "impersonation" imkoniyatini beradi). `winget install Gyan.FFmpeg` bilan ffmpeg o'rnatildi, yo'li `.env`dagi `YTDLP_FFMPEG_LOCATION`da to'g'ridan-to'g'ri ko'rsatilgan.
- **Local `telegram-bot-api` server ishga tushirilgan va ishlayapti** (`docker compose up -d telegram-bot-api`). Foydalanuvchi https://my.telegram.org'dan `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` oldi (bepul, faqat telefon raqami bilan kirish kerak edi). `.env`da `BOT_API_URL=http://localhost:8081` — fayl yuklash limiti 50MB→2000MB. **Kutilmagan qo'shimcha yutuq**: bir xil videoni yuklab yuborish vaqti ~3 daqiqadan ~16 soniyaga tushdi — local server MTProto orqali HTTP Bot API'ga qaraganda ancha samaraliroq fayl yuboradi.
- Cobalt Docker konteyneri olib tashlandi (`docker rm -f`), `docker-compose.yml`dan ham o'chirildi.
- Real Telegram orqali sinaldi (@UpperDownloaderBot): YouTube havolalari (turli hajmda, jumladan 2000MB limit ostidagi kattalar ham) muvaffaqiyatli yuklab olindi; kesh, xato xabarlari, caption/thumbnail/guruh-tugmasi tekshirildi — foydalanuvchi tasdiqladi.
- **TikTok**: bu tarmoq/kompyuterdan `https://www.tiktok.com`ga umuman ulanib bo'lmaydi (`curl` 15s'da timeout, HTTP javobsiz) — kod/yt-dlp muammosi emas, ISP/davlat darajasidagi cheklov ehtimoli katta (O'zbekiston). VPN/proxy bo'lmasa hal qilib bo'lmaydi, hozircha ochiq masala.
- **Instagram**: real Reel/video havola bilan sinaldi — **ishlaydi** (yuklash + caption + thumbnail + Telegram'ga yuborish, to'liq zanjir). Faqat **rasm/carousel** (bir nechta rasmdan iborat, videosiz) postlar ishlamaydi — bu kutilgan holat, yt-dlp "No video formats found" deydi, chunki bunday postda haqiqatan video yo'q (bot faqat video/audio yuklaydi, rasm emas).
- **Instagram Stories ishlamaydi (qasddan, tuzatilmagan)**: `[instagram:story] ...: You need to log in to access this content` — Stories oddiy post/Reels'dan farqli, faqat login qilingan holatda ko'rinadi, yt-dlp cookie'siz umuman ololmaydi. 2026-09-02'da production'da real foydalanuvchi havolasi bilan tasdiqlandi. Tuzatish uchun alohida Instagram akkaunt cookie'sini serverga joylashtirish kerak bo'lardi — akkaunt bloklanish xavfi va cookie yangilab turish og'irligi sababli **ataylab qilinmadi** (foydalanuvchi qarori). TikTok bilan bir qatorda "bilingan, hal qilinmagan" cheklov.
- **Muhim topilma — parallel yuklab olish resurs muammosi**: `pg-boss` standart holda faqat 1 ta job'ni bir vaqtda qayta ishlaydi (`teamSize`/`teamConcurrency: 1`) — bu ko'p-foydalanuvchili tezlikka yomon ta'sir qilardi, shuning uchun oshirilgan edi. Lekin **3 taga** oshirilganda bu Windows dev kompyuterida `STATUS_DLL_INIT_FAILED` (`0xC0000142`, exit code `3221225794`) bilan yt-dlp/ffmpeg jarayonlarini qulatib qo'ydi (resurs yetishmovchiligi). Hal qilindi: `DOWNLOAD_CONCURRENCY` env orqali sozlanadigan qilindi, standart **2**ga tushirildi (VPS'da oshirish mumkin), va bu turdagi qulash (stderr bo'sh bo'lgan nonzero exit) endi `"process_crash"` deb belgilanib, `"empty_download"` kabi bir marta avtomatik qayta uriniladi (`queue/index.js`, `services/ytdlp.js`).

## Production deploy — Ubuntu + Coolify + Cloudflare Tunnel (2026-09-02) — ISHLAYAPTI

Bot foydalanuvchining mavjud Ubuntu serveriga (Coolify o'rnatilgan, Tailscale orqali masofadan boshqariladi — Tailscale IP `100.111.79.124`, SSH user `iep-server`) yangi Coolify loyihasi sifatida deploy qilindi. Serverning haqiqiy public IP'i yo'q — tashqi trafik **Cloudflare Tunnel** (`cloudflared` systemd xizmati, tunnel nomi `iep`) orqali kiradi, Tailscale esa faqat admin (Claude/foydalanuvchi) uchun SSH kirish yo'li.

Domen: **`https://downloader.saidmurod.com`** (`BaseURL`, fixed webhook). Dastlab `downloader.iep.saidmurod.com` sinalgan edi, lekin ishlamadi — pastga qarang.

### Topilgan va tuzatilgan 5 ta muammo (deploy qilingan zahoti bot umuman javob bermadi)
1. **`BOT_API_URL` noto'g'ri sozlangan edi** — Coolify env'da bot o'zining webhook domeniga (`https://downloader.iep.saidmurod.com`) tenglashtirilgan edi, holbuki bu faqat **lokal self-hosted `telegram-bot-api` server** manzili bo'lishi kerak (`docker-compose.yml`dagi ixtiyoriy xizmat, VPS'da hali deploy qilinmagan). Natija: `index.js:30`dagi `apiRoot: BOT_API_URL` bot o'ziga-o'zi `/bot<token>/getMe` so'rov yubormoqchi bo'lib, TLS handshake xatosi bilan cheksiz qulab tushardi. **Yechim**: `BOT_API_URL` Coolify'dan butunlay o'chirildi (standart `api.telegram.org`, 50MB limit bilan ishlaydi hozircha).
2. **`DATABASE_URL`da yozuv xatosi** — `...neondb??sslmode=require` (ikkita `?`). Asosiy `db/index.js` (`pg.Pool`) buzilmadi, chunki u alohida `ssl: { rejectUnauthorized: false }` beradi — lekin **`pg-boss`** (`queue/index.js`, `new PgBoss(DATABASE_URL)`) faqat URL query-parametriga tayanadi, ikkinchi `?` uni `sslmode` emas `?sslmode` nomli parametr qilib yuborgan, shu sabab SSL talabini aniqlay olmay "connection is insecure" xatosi bilan qulagan. **Yechim**: bitta `?` qoldirilib tuzatildi.
3. **Cloudflare sertifikat cheklovi** — `saidmurod.com` zonasidagi Cloudflare Universal SSL faqat `saidmurod.com` va `*.saidmurod.com` (bitta daraja)ni qamraydi. `downloader.iep.saidmurod.com` ikkinchi darajali subdomen bo'lgani uchun **hech qanday mos sertifikat topilmadi** — Cloudflare edge TLS handshake'ni butunlay rad etardi (`ssl3_read_bytes:...handshake failure`), Telegram ham aynan shu xatoni ko'rardi. Cloudflare "Total TLS" (bu holatda $10/oy) ishlatish o'rniga **bepul yechim tanlandi**: domen bitta darajaga tushirildi — `downloader.saidmurod.com` (mavjud `*.saidmurod.com` wildcard'ga to'g'ri keladi). Cloudflare DNS'ga `downloader` → `iep.saidmurod.com` CNAME (proxied) qo'shildi, Coolify domeni va `BaseURL` shunga mos yangilandi.
4. **Cloudflare Tunnel'da yangi domen uchun marshrut yo'q edi** — `cloudflared`ning "Published application routes" (Zero Trust dashboard → Networks → Tunnels → `iep` → Public Hostname) da faqat `*.iep.saidmurod.com` va `iep.saidmurod.com` bor edi, `saidmurod.com` darajasidagi yangi subdomen uchun mos yozuv yo'q edi (404 qaytarardi, Traefik'ga umuman yetib bormasdi). **Yechim**: yangi Public Hostname qo'shildi: `downloader.saidmurod.com` → Service. Avval `http://127.0.0.1:80` qo'yilganda Traefik'ning HTTP→HTTPS majburiy-redirect middleware'i tufayli **cheksiz redirect loop** hosil bo'ldi (`302 → o'ziga`). **Yechim**: Service `https://127.0.0.1:443`ga o'zgartirildi, "Additional application settings → TLS" ostida **No TLS Verify** yoqildi va **Origin Server Name** = `downloader.saidmurod.com` qo'yildi (aks holda cloudflared noto'g'ri SNI — `127.0.0.1` — yuborib, Traefik'ning Host-asosli marshrutlashi mos router topa olmay 502 qaytarardi).
5. **Konteynerda Python/yt-dlp/ffmpeg umuman yo'q edi** — Coolify bu loyihani **Nixpacks** orqali avtomatik build qilgan (Node.js loyihasi sifatida aniqlangan), bu esa faqat `npm install`ni bajaradi — Python, pip, ffmpeg, yt-dlp o'rnatilmagan. Bot Telegram'ga javob berardi, lekin video/audio yuklab bo'lmasdi (`python: not found`). **Yechim**: repo root'ga **`Dockerfile`** qo'shildi (`node:22-bookworm-slim` asosida, `apt-get install python3 python3-pip python-is-python3 ffmpeg` + `pip3 install yt-dlp curl_cffi`), Coolify'da Build Pack **Nixpacks → Dockerfile**ga o'zgartirildi, `YTDLP_PYTHON=python3` env qo'shildi. Redeploy'dan keyin real YouTube video (webhook orqali sun'iy Telegram update simulyatsiya qilib) muvaffaqiyatli yuklab olindi va keshlandi — **to'liq zanjir (webhook → navbat → yt-dlp → Telegram'ga yuborish → kesh) tasdiqlandi**.

### Diagnostika usuli (kelajakda foydali)
Muammolar SSH orqali (`ssh -i ~/.ssh/iep_server iep-server@100.111.79.124`, key `usermod -aG docker iep-server` bilan sozlangan) `docker ps`/`docker logs`/`docker inspect` bilan topildi. Muhim nozik jihat: `functions/logger.js` production'da konsolga yozmaydi (fayllarga — `logs/app-*.log`, `logs/error-*.log` — yozadi), shuning uchun `docker logs` bo'sh/foydasiz ko'rinadi — xatoni ko'rish uchun `docker cp <container>:/app/logs /tmp/...` bilan log papkasini konteynerdan tashqariga chiqarib o'qish kerak (konteyner qayta-qayta qulab tushayotgan bo'lsa ham ishlaydi, chunki `docker cp` konteyner holatidan qat'i nazar fayl tizimiga kira oladi).

## Muhim fayllar
- `index.js` — bootstrap: Postgres sxema, pg-boss worker, `ConnectionManager` (gibrid webhook/polling) yoki fixed webhook (`BaseURL` bo'lsa), admin/format/obuna callback routing, `chat_member` eventlari
- `Controllers.js` — platforma aniqlash, majburiy obuna tekshiruvi, video/audio tanlov so'rovi, kesh tekshirish, navbatga qo'yish
- `db/index.js`, `db/VideoCache.js`, `db/DownloadLog.js`, `user/UserModel.js` — Postgres qatlami
- `admin/AdminModel.js`, `admin/ChannelModel.js`, `admin/BotSettings.js`, `admin/BroadcastModel.js`, `admin/AdminController.js` — admin huquqi, kanallar, on/off sozlamalar, reklama tarixi, `/admin` menyu mantig'i (inline keyboard)
- `functions/Subscription.js` — ko'p-kanalli a'zolik tekshiruvi
- `functions/ChannelMemberHandler.js` — kanal join/leave hodisalari, reja-bajarildi bildirishnomasi
- `functions/BotInfo.js` — bot username'ni bir marta keshlab saqlaydi
- `functions/BotDescription.js` — bot profil tavsifini (uz/ru/en) Bot API orqali o'rnatadi
- `functions/MediaMessage.js` — caption va "guruhga qo'shish" tugmasi qurish
- `functions/ConnectionManager.js` — webhook/polling gibrid holat mashinasi (sog'liqni tekshirish, avtomatik almashish)
- `functions/Ngrok.js` — ngrok tunnel jarayonini boshqarish (ishga tushirish, URL olish, holatini tekshirish)
- `functions/logger.js` — winston logger (fayllarga rotatsiya bilan yozish + dev konsol)
- `services/ytdlp.js` — yt-dlp orqali video/audio yuklab olish + metadata/thumbnail parser (`python -m yt_dlp`, 480p cap, `--max-filesize`, jarayon-qulashi uchun retry)
- `queue/index.js`, `queue/downloadAndSend.js`, `queue/broadcast.js` — pg-boss worker: yuklash+yuborish (parallel, `DOWNLOAD_CONCURRENCY`), xato klassifikatsiyasi, reklama tarqatish (matn/rasm/video/albom, caption-split)
- `text.json` — 3 tilli (uz/ru/en) matnlar
- `docker-compose.yml` — local telegram-bot-api (Cobalt olib tashlangan, VPS'da hali deploy qilinmagan — hozircha `BOT_API_URL` bo'sh, 50MB limit)
- `Dockerfile` — production build (Coolify), `node:22-bookworm-slim` + python3/pip/ffmpeg/yt-dlp/curl_cffi. Coolify'da Build Pack shu faylga ("Dockerfile") sozlangan bo'lishi shart — standart Nixpacks Python/ffmpeg o'rnatmaydi.
- `README.md` — ingliz tilida, GitHub uchun professional loyiha hujjati (xususiyatlar, arxitektura, o'rnatish)

**Tozalangan o'lik kod** (2026-07-25): `test.js` va `keyboards/Keyboards.js` — aloqasiz eski bot shablonidan (kontakt so'rash, "Service/Meeting" oqimi) qolgan, hech qayerda ishlatilmagan fayllar o'chirildi. `keyboards/InlineKeyboards.js`da ham xuddi shu shablondan qolgan 4 ta ishlatilmagan eksport (`setInlineKey`, `setInlineMeet`, `setInlineServiceTrue`, `setOldService`) olib tashlandi — faqat `languages` (til tanlash) qoldi.

## Kerakli `.env` o'zgaruvchilari
```
TOKEN=
BaseURL=                 # bo'sh = lokal gibrid webhook/polling; to'ldirilsa = fixed webhook (production)
PORT=
DATABASE_URL=            # Neon connection string — SINALGAN, ishlaydi. Diqqat: oxirida bitta "?sslmode=require" bo'lsin (ikkita "??" pg-boss'ni SSL talabini aniqlay olmay qulatgan — 2026-09-02'da topilgan)
ADMIN_ID=                # birinchi admin chat_id (bootstrap uchun)
TELEGRAM_API_ID=         # my.telegram.org'dan, bepul — OLINGAN va sozlangan
TELEGRAM_API_HASH=       # my.telegram.org'dan, bepul — OLINGAN va sozlangan
BOT_API_URL=             # FAQAT haqiqiy self-hosted telegram-bot-api server manzili bo'lsa to'ldiring (masalan http://localhost:8081) — bot o'zining webhook/BaseURL domeniga TENGLASHTIRILMASIN, aks holda bot o'ziga-o'zi so'rov yuborib qulaydi (production'da hozircha bo'sh, shu sabab tarixi bor)
YTDLP_PYTHON=            # ixtiyoriy, default "python" — Linux Docker konteynerida (Dockerfile) "python3" deb ANIQ ko'rsatilishi kerak, "python" har doim ham mavjud emas
YTDLP_FFMPEG_LOCATION=   # ffmpeg bin papkasi, Linux'da PATH'da bo'lsa bo'sh qoldirish mumkin
DOWNLOAD_CONCURRENCY=    # ixtiyoriy, default 2 (Windows dev'da 3+ DLL_INIT_FAILED bergan — yuqoriga qarang)
NGROK_BIN=               # ngrok.exe to'liq yo'li — OLINGAN va sozlangan (winget joyi emas, `ngrok update`dan keyingi WindowsApps joyi)
NGROK_AUTHTOKEN=         # ngrok dashboard'dan, bepul — OLINGAN va sozlangan
```
`.env` `.gitignore`da, repo'ga tushmaydi. **Diqqat**: `TELEGRAM_API_ID`/`HASH` va `NGROK_AUTHTOKEN` real qiymatlar chatda ochiq yuborilgan — production'ga o'tishda bu ham maxfiy saqlanishi kerak (repo'ga tushmasligi allaqachon ta'minlangan, `.gitignore` orqali).

## SSH kalit
- `~/.ssh/oracle_vps` — eski, Hetzner/Oracle rejasi uchun tayyorlangan (nomi tarixiy). Hozirgi production serverda ishlatilmaydi.
- `~/.ssh/iep_server` — **hozirgi production server** (`iep-server@100.111.79.124`, Tailscale IP) uchun 2026-09-02'da yaratilgan. Public key serverdagi `~/.ssh/authorized_keys`ga qo'lda qo'shilgan. `iep-server` foydalanuvchisi `docker` guruhiga qo'shilgan (`sudo usermod -aG docker iep-server`) — shuning uchun `sudo`siz `docker ps`/`docker logs`/`docker cp` ishlaydi.

## Hozirgi holat / navbatdagi qadamlar
1. ✅ Kod qayta yozildi (Postgres, queue, kesh)
2. ✅ Docker Desktop, WSL2/Ubuntu, yt-dlp, ffmpeg, ngrok — hammasi o'rnatilgan va ishlayapti
3. ✅ Video olish qatlami Cobalt'dan **yt-dlp**'ga o'tkazildi — YouTube'da real sinovdan o'tdi
4. ✅ Xato xabarlari aniqlashtirildi (video mavjud emas / juda katta / timeout / jarayon-qulashi — tilga mos, avtomatik retry)
5. ✅ **Admin panel** (`/admin`, inline keyboard): statistika, reklama (matn/rasm/video/albom, tugma, qayta yuborish, tarix), admin/kanal boshqaruvi — real sinovdan o'tdi
6. ✅ **Ko'p-kanalli majburiy obuna**: join/leave kuzatuvi, reja va bildirishnoma — kod tayyor, real kanal bilan hali to'liq sinov qilinmagan
7. ✅ **Video/audio tanlov tugmasi**, caption (sarlavha + bot username, entities bilan formatlash saqlanadi), thumbnail, ixtiyoriy "guruhga qo'shish" tugmasi — real sinovdan o'tdi, foydalanuvchi tasdiqladi
8. ✅ **Local telegram-bot-api server** sozlandi (`TELEGRAM_API_ID`/`HASH` olindi) — fayl limiti 2000MB'ga ko'tarildi, yuklash tezligi ham sezilarli yaxshilandi
9. ✅ **Parallel yuklab olish** (`DOWNLOAD_CONCURRENCY=2`) — ko'p-foydalanuvchili tezlik uchun, resurs-qulashi muammosi tuzatilgan
10. ✅ **Gibrid webhook/polling** (ngrok) — real outage+recovery sinovidan o'tdi, ~1 daqiqada ikkala yo'nalishda ham avtomatik almashadi
11. ✅ **Bot profil tavsifi** kod orqali o'rnatiladi (uz/ru/en), `/start`/`/about` YouTube'ni qamrab oladigan qilib yangilandi
12. ✅ **Instagram** (video/Reels) real havola bilan sinaldi va ishlaydi; faqat rasm/carousel postlar qo'llab-quvvatlanmaydi (kutilgan cheklov)
13. ✅ **GitHub**: kod push qilingan (`origin/main` bilan sinxron), portativ `.env` qiymatlari (DB, token, Telegram API, bot-api URL) GitHub Actions Secrets'ga saqlangan — VPS uchun deploy workflow keyinroq shulardan foydalanadi. Eski Cloudflare davridan qolgan secretlar tozalangan.
14. ✅ O'lik kod tozalandi (eski bot shablonidan qolgan ishlatilmagan fayllar/eksportlar)
15. ✅ **Loglash tizimi** (winston, fayl+konsol, kunlik rotatsiya) va global crash handler'lar qo'shildi — shu bilan 2 ta eski ko'rinmas xato (unawaited `setMyCommands`, parallel `BotDescription` so'rovlaridan rate-limit) topilib tuzatildi
16. ✅ **Burst/katta-video himoyasi**: `expireInMinutes` 15→60, `Queue.isQueueFull()` orqali 50+ navbatda "band" xabari
17. ⬜ TikTok bu tarmoqdan network darajasida ochilmaydi (VPN kerak, alohida masala) — yagona ochiq platforma muammosi
18. ✅ **Production deploy yakunlandi** (2026-09-02): Hetzner o'rniga mavjud Ubuntu+Coolify server ishlatildi (batafsil yuqoridagi "Production deploy" bo'limida). Domen `https://downloader.saidmurod.com`, Cloudflare Tunnel orqali. 5 ta muammo (BOT_API_URL, DATABASE_URL, Cloudflare sertifikat, Tunnel marshruti, Python/yt-dlp yo'qligi) topilib tuzatildi. Real YouTube video yuklab-yuborish tasdiqlandi.
19. ⬜ **VPS'da hali qilinmagan**: local `telegram-bot-api` server deploy qilish (50MB→2000MB limit uchun, `docker-compose.yml` tayyor, `TELEGRAM_API_ID`/`HASH` allaqachon `.env`da bor) — ixtiyoriy keyingi qadam. `DOWNLOAD_CONCURRENCY` ham server resurslariga qarab oshirilishi mumkin (hozir standart 2).
20. ⬜ Keyingi bosqich (foydalanuvchi tasdiqlagan tartib bo'yicha **keyin**): premium tarif (reklamasiz, navbatda ustuvor — pg-boss job priority orqali). To'lov uchun tavsiya: Telegram Stars (eng oson integratsiya). Reklama qismi allaqachon qo'shildi (band 5).

## Qabul qilingan qoidalar / kelishuvlar
- Avval asosiy oqim to'liq ishga tushirilib sinaladi, **keyin** premium/reklama qatlami qo'shiladi (foydalanuvchi qarori).
- Pul sarflashdan oldin: **avval lokal Docker bilan bepul sinash** (bajarildi) — production uchun esa Hetzner to'lovi shart bo'lmadi, mavjud Coolify server ishlatildi (yuqoriga qarang).
- Xavfsizlik qoidasi: Claude karta raqami, parol yoki shaxsiy hujjatlarni hech qachon o'zi kiritmaydi/yubormaydi — bunday joylarda foydalanuvchidan so'raladi.
- Xavfsizlik: Neon parolini foydalanuvchi chatda ochiq yubordi — dashboard'dan rotate qilish tavsiya etilgan, hali tasdiqlanmagan/bajarilmagan.
