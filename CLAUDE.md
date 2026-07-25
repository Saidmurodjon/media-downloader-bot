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

## Hosting qarori
- Cloudflare Workers — rad etildi (yuqoridagi sabab).
- Oracle Cloud Free Tier — sinab ko'rildi, lekin ro'yxatdan o'tishda muammolar chiqdi (karta tasdiqlashda "qotib qolish", keyin "home region" xatosi, operator bilan bog'lanish talab qilindi). Support javobi noaniq muddatga cho'zilishi mumkinligi sababli tashlab yuborildi. Foydalanuvchiga Oracle support'ga yozish uchun tayyor xat (EN) berildi.
- **Hetzner Cloud** — tanlangan yechim. CX22 (2 vCPU, 4GB RAM, 40GB NVMe, ~€5.49/oy, 2026-yil iyun narxi). DigitalOcean'dan ~4 barobar arzon xuddi shu xarakteristikada.
- Foydalanuvchi Hetzner'da hisob ochgan (login qilingan), lekin **hisob "increased risk" deb belgilangan va tasdiqlash (verification) talab qilinmoqda**, aks holda loyiha yaratib bo'lmaydi. Ikkita tasdiqlash yo'li bor: (a) Credit card — $25/$100/$250/$500'dan birini tanlab, kartadan **haqiqiy pul yechiladi** (hold emas, real prepaid credit sifatida hisobga qo'shiladi, keyin hosting xarajatini yopadi), natija darhol chiqadi; (b) Document — pasport/hujjat yuklash, qo'lda tekshiriladi (soatlab/kunlab). Foydalanuvchi hali tanlab, to'lovni yakunlamagan (karta ma'lumotini Claude kirita olmaydi — xavfsizlik qoidasi).
- Shu to'siq sababli **avval lokal test qilish** qarori qabul qilindi (pastga qarang), Hetzner to'lovi keyinga qoldirilgan.

## Lokal test holati (VPS'siz, bepul) — 2026-07-24 kechqurun holatiga ko'ra ISHLAYAPTI
- Kompyuter reboot qilindi, Docker Desktop va WSL2/Ubuntu muvaffaqiyatli ishga tushdi.
- Bot gibrid webhook/polling rejimida ishlaydi (batafsil yuqoridagi "Ulanish rejimi" bo'limida).
- `python -m pip install --user yt-dlp curl_cffi "yt-dlp[default]"` bilan yt-dlp o'rnatildi (Python 3.14, allaqachon kompyuterda bor edi; `curl_cffi` TikTok kabi bot-himoyali saytlar uchun "impersonation" imkoniyatini beradi). `winget install Gyan.FFmpeg` bilan ffmpeg o'rnatildi, yo'li `.env`dagi `YTDLP_FFMPEG_LOCATION`da to'g'ridan-to'g'ri ko'rsatilgan.
- **Local `telegram-bot-api` server ishga tushirilgan va ishlayapti** (`docker compose up -d telegram-bot-api`). Foydalanuvchi https://my.telegram.org'dan `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` oldi (bepul, faqat telefon raqami bilan kirish kerak edi). `.env`da `BOT_API_URL=http://localhost:8081` — fayl yuklash limiti 50MB→2000MB. **Kutilmagan qo'shimcha yutuq**: bir xil videoni yuklab yuborish vaqti ~3 daqiqadan ~16 soniyaga tushdi — local server MTProto orqali HTTP Bot API'ga qaraganda ancha samaraliroq fayl yuboradi.
- Cobalt Docker konteyneri olib tashlandi (`docker rm -f`), `docker-compose.yml`dan ham o'chirildi.
- Real Telegram orqali sinaldi (@UpperDownloaderBot): YouTube havolalari (turli hajmda, jumladan 2000MB limit ostidagi kattalar ham) muvaffaqiyatli yuklab olindi; kesh, xato xabarlari, caption/thumbnail/guruh-tugmasi tekshirildi — foydalanuvchi tasdiqladi.
- **TikTok**: bu tarmoq/kompyuterdan `https://www.tiktok.com`ga umuman ulanib bo'lmaydi (`curl` 15s'da timeout, HTTP javobsiz) — kod/yt-dlp muammosi emas, ISP/davlat darajasidagi cheklov ehtimoli katta (O'zbekiston). VPN/proxy bo'lmasa hal qilib bo'lmaydi, hozircha ochiq masala.
- **Instagram**: tarmoq orqali ochiladi, lekin haqiqiy post havolasi bilan hali sinalmagan (yt-dlp'ning Instagram extractor'i vaqti-vaqti bilan "broken" deb belgilanishi mumkin — real havola bilan tekshirish kerak).
- **Muhim topilma — parallel yuklab olish resurs muammosi**: `pg-boss` standart holda faqat 1 ta job'ni bir vaqtda qayta ishlaydi (`teamSize`/`teamConcurrency: 1`) — bu ko'p-foydalanuvchili tezlikka yomon ta'sir qilardi, shuning uchun oshirilgan edi. Lekin **3 taga** oshirilganda bu Windows dev kompyuterida `STATUS_DLL_INIT_FAILED` (`0xC0000142`, exit code `3221225794`) bilan yt-dlp/ffmpeg jarayonlarini qulatib qo'ydi (resurs yetishmovchiligi). Hal qilindi: `DOWNLOAD_CONCURRENCY` env orqali sozlanadigan qilindi, standart **2**ga tushirildi (VPS'da oshirish mumkin), va bu turdagi qulash (stderr bo'sh bo'lgan nonzero exit) endi `"process_crash"` deb belgilanib, `"empty_download"` kabi bir marta avtomatik qayta uriniladi (`queue/index.js`, `services/ytdlp.js`).

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
- `services/ytdlp.js` — yt-dlp orqali video/audio yuklab olish + metadata/thumbnail parser (`python -m yt_dlp`, 480p cap, `--max-filesize`, jarayon-qulashi uchun retry)
- `queue/index.js`, `queue/downloadAndSend.js`, `queue/broadcast.js` — pg-boss worker: yuklash+yuborish (parallel, `DOWNLOAD_CONCURRENCY`), xato klassifikatsiyasi, reklama tarqatish (matn/rasm/video/albom, caption-split)
- `text.json` — 3 tilli (uz/ru/en) matnlar
- `docker-compose.yml` — local telegram-bot-api (Cobalt olib tashlangan)

## Kerakli `.env` o'zgaruvchilari
```
TOKEN=
BaseURL=                 # bo'sh = lokal gibrid webhook/polling; to'ldirilsa = fixed webhook (production)
PORT=
DATABASE_URL=            # Neon connection string — SINALGAN, ishlaydi
ADMIN_ID=                # birinchi admin chat_id (bootstrap uchun)
TELEGRAM_API_ID=         # my.telegram.org'dan, bepul — OLINGAN va sozlangan
TELEGRAM_API_HASH=       # my.telegram.org'dan, bepul — OLINGAN va sozlangan
BOT_API_URL=             # http://localhost:8081 — local bot-api server SOZLANGAN va ishlayapti
YTDLP_PYTHON=            # ixtiyoriy, default "python" (Linux'da "python3" kerak bo'lishi mumkin)
YTDLP_FFMPEG_LOCATION=   # ffmpeg bin papkasi, Linux'da PATH'da bo'lsa bo'sh qoldirish mumkin
DOWNLOAD_CONCURRENCY=    # ixtiyoriy, default 2 (Windows dev'da 3+ DLL_INIT_FAILED bergan — yuqoriga qarang)
NGROK_BIN=               # ngrok.exe to'liq yo'li — OLINGAN va sozlangan (winget joyi emas, `ngrok update`dan keyingi WindowsApps joyi)
NGROK_AUTHTOKEN=         # ngrok dashboard'dan, bepul — OLINGAN va sozlangan
```
`.env` `.gitignore`da, repo'ga tushmaydi. **Diqqat**: `TELEGRAM_API_ID`/`HASH` va `NGROK_AUTHTOKEN` real qiymatlar chatda ochiq yuborilgan — production'ga o'tishda bu ham maxfiy saqlanishi kerak (repo'ga tushmasligi allaqachon ta'minlangan, `.gitignore` orqali).

## SSH kalit
VPS uchun mahalliy kompyuterda tayyorlangan: `~/.ssh/oracle_vps` (nomi tarixiy, Hetzner uchun ham ishlatilmoqda). Public key Hetzner Console'ga qo'shilgan.

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
12. ✅ **Kod commit qilingan** — 5 ta commit (`5653466`..`7999e4a`), working tree toza
13. ⬜ Instagram real havola bilan hali sinalmagan; TikTok bu tarmoqdan network darajasida ochilmaydi (VPN kerak, alohida masala)
14. ⬜ Lokal test to'liq muvaffaqiyatli bo'lgach: Hetzner tasdiqlashni yakunlash ($25 karta orqali, foydalanuvchi o'zi kiritadi) → CX22 server yaratish → SSH orqali production deploy. **Diqqat**: VPS'da yt-dlp uchun Python3 + pip + ffmpeg o'rnatish kerak bo'ladi (`apt install python3-pip ffmpeg`, keyin `pip install yt-dlp curl_cffi "yt-dlp[default]"`), Cobalt endi kerak emas. Local telegram-bot-api uchun ham xuddi shu `TELEGRAM_API_ID`/`HASH`ni VPS'ning `.env`iga ko'chirish kifoya. Production'da odatda `BaseURL` (haqiqiy domen) ishlatiladi — shunda ngrok/`ConnectionManager` umuman kerak bo'lmaydi, `DOWNLOAD_CONCURRENCY` ham VPS resurslariga qarab oshirilishi mumkin.
15. ⬜ Keyingi bosqich (foydalanuvchi tasdiqlagan tartib bo'yicha **keyin**): premium tarif (reklamasiz, navbatda ustuvor — pg-boss job priority orqali). To'lov uchun tavsiya: Telegram Stars (eng oson integratsiya). Reklama qismi allaqachon qo'shildi (band 5).

## Qabul qilingan qoidalar / kelishuvlar
- Avval asosiy oqim to'liq ishga tushirilib sinaladi, **keyin** premium/reklama qatlami qo'shiladi (foydalanuvchi qarori).
- Pul sarflashdan oldin: **avval lokal Docker bilan bepul sinash**, faqat lokal test muvaffaqiyatli bo'lgach Hetzner'ga $25 to'lanadi (foydalanuvchi qarori).
- Xavfsizlik qoidasi: Claude karta raqami, parol yoki shaxsiy hujjatlarni hech qachon o'zi kiritmaydi/yubormaydi — bunday joylarda foydalanuvchidan so'raladi.
- Xavfsizlik: Neon parolini foydalanuvchi chatda ochiq yubordi — dashboard'dan rotate qilish tavsiya etilgan, hali tasdiqlanmagan/bajarilmagan.
