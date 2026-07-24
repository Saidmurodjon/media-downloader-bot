# Media Downloader Bot — loyiha holati

## Maqsad
YouTube, Instagram va TikTok'dan videolarni Telegram botga yuklab beruvchi bot. Talablar: eng optimal, tez, bepul/arzon, ishonchli, ko'p foydalanuvchi bir vaqtda kirsa ham qotib qolmaydigan yechim.

## Arxitektura (2026-07-24'da qayta qurildi)

Eski holat: MongoDB + Telegraf webhook (Express) + TikTok uchun RapidAPI (hardcoded kalit bilan, endi o'chirilgan), Instagram/YouTube ishlamas edi. Bu loyiha "Cloudflare'da deploy qilingan" deb boshlangan edi, lekin Cloudflare Workers'da yt-dlp/Cobalt kabi og'ir, uzoq davom etadigan jarayonlarni ishga tushirib bo'lmaydi (CPU vaqti cheklangan, arbitrary process yo'q) — shu sabab noto'g'ri platforma bo'lgan va loyiha tugallanmay qolgan edi.

Yangi stack:
- **DB**: MongoDB → **Neon (serverless Postgres)**. Ulanish `db/index.js` (pg Pool). Jadvallar: `users`, `video_cache`.
- **Video olib berish**: RapidAPI scraperlar → **self-hosted Cobalt** (github.com/imputnet/cobalt, ochiq manba, YouTube+Instagram+TikTok+boshqalarni qo'llab-quvvatlaydi). Klient: `services/cobalt.js`.
- **Navbat**: sinxron/bloklovchi yuklab olish → **pg-boss** (Postgres-based queue, Redis shart emas — Neon'ning o'zida ishlaydi). `queue/index.js`, `queue/downloadAndSend.js`. Tanlov sababi: yuklab olish job'i soniya-daqiqalar davom etadi, queue dispatch tezligi ahamiyatsiz — Redis/BullMQ qo'shimcha infratuzilma bo'lardi, foydasiz murakkablik.
- **Kesh**: `video_cache` jadvalida URL → Telegram `file_id`. Bir marta yuklangan video qayta so'ralsa, Cobalt/tarmoqqa umuman murojaat qilinmaydi — darhol qayta yuboriladi. Bu ko'p foydalanuvchili yukni eng ko'p kamaytiruvchi omil.
- **Telegram fayl limiti**: standart Bot API 50MB bilan cheklaydi. `docker-compose.yml`da ixtiyoriy **local telegram-bot-api server** bor — ulansa (`.env`dagi `BOT_API_URL`), limit 2000MB'gacha ko'tariladi.

## Hosting qarori
- Cloudflare Workers — rad etildi (yuqoridagi sabab).
- Oracle Cloud Free Tier — sinab ko'rildi, lekin ro'yxatdan o'tishda muammolar chiqdi (karta tasdiqlashda "qotib qolish", keyin "home region" xatosi, operator bilan bog'lanish talab qilindi). Support javobi noaniq muddatga cho'zilishi mumkinligi sababli tashlab yuborildi. Foydalanuvchiga Oracle support'ga yozish uchun tayyor xat (EN) berildi.
- **Hetzner Cloud** — tanlangan yechim. CX22 (2 vCPU, 4GB RAM, 40GB NVMe, ~€5.49/oy, 2026-yil iyun narxi). DigitalOcean'dan ~4 barobar arzon xuddi shu xarakteristikada.
- Foydalanuvchi Hetzner'da hisob ochgan (login qilingan), lekin **hisob "increased risk" deb belgilangan va tasdiqlash (verification) talab qilinmoqda**, aks holda loyiha yaratib bo'lmaydi. Ikkita tasdiqlash yo'li bor: (a) Credit card — $25/$100/$250/$500'dan birini tanlab, kartadan **haqiqiy pul yechiladi** (hold emas, real prepaid credit sifatida hisobga qo'shiladi, keyin hosting xarajatini yopadi), natija darhol chiqadi; (b) Document — pasport/hujjat yuklash, qo'lda tekshiriladi (soatlab/kunlab). Foydalanuvchi hali tanlab, to'lovni yakunlamagan (karta ma'lumotini Claude kirita olmaydi — xavfsizlik qoidasi).
- Shu to'siq sababli **avval lokal test qilish** qarori qabul qilindi (pastga qarang), Hetzner to'lovi keyinga qoldirilgan.

## Lokal test rejasi (VPS'siz, bepul)
- Cobalt'ni Docker orqali shu Windows kompyuterida ko'tarish (`docker compose up -d cobalt-api`, faqat shu servis — `telegram-bot-api` servisi hozircha kerak emas, chunki `TELEGRAM_API_ID`/`HASH` yo'q).
- Bot webhook o'rniga vaqtincha **polling** rejimida (`bot.launch()`) ishga tushiriladi — public URL/tunnel kerak emas. **Bu o'zgarish index.js'ga hali kiritilmagan, keyingi seansda qo'shish kerak.**
- Docker Desktop kompyuterga o'rnatildi (versiya 4.83.0, per-user install: `C:\Users\Saidmurod\AppData\Local\Programs\DockerDesktop`).
- Docker Desktop dvigateli ishga tushmadi — sabab: **WSL2 o'rnatilmagan edi** (Windows 10 Home — Hyper-V yo'q, shuning uchun WSL2 yagona backend variant).
- `wsl --install --no-launch` PowerShell orqali bajarildi — WSL2 va Ubuntu muvaffaqiyatli o'rnatildi. **Natija: "Changes will not be effective until the system is rebooted" — kompyuter hali qayta ishga tushirilmagan.**
- Reboot'dan keyin qoladigan qadamlar: Docker Desktop'ni qayta ishga tushirish → `docker info` bilan tekshirish → `docker compose up -d cobalt-api` → `.env`ga `TOKEN` va `COBALT_API_URL=http://localhost:9000` qo'shish → `index.js`ni polling rejimiga moslash → `npm start` → real Telegram orqali sinash.

## Muhim fayllar
- `index.js` — bootstrap: Postgres sxema, pg-boss worker, Express webhook
- `Controllers.js` — platforma aniqlash (youtube/instagram/tiktok regex), kesh tekshirish, navbatga qo'yish
- `db/index.js`, `db/VideoCache.js`, `user/UserModel.js` — Postgres qatlami
- `services/cobalt.js` — Cobalt API klienti (**diqqat**: field nomlari Cobalt versiyasiga qarab farq qilishi mumkin, deploy paytida tekshirish kerak)
- `queue/index.js`, `queue/downloadAndSend.js` — pg-boss worker, stream-download + Telegram multipart upload
- `docker-compose.yml` — VPS'da Cobalt + (ixtiyoriy) local telegram-bot-api

## Kerakli `.env` o'zgaruvchilari
```
TOKEN=
BaseURL=
PORT=
DATABASE_URL=       # Neon connection string — SINALGAN, ishlaydi
COBALT_API_URL=     # masalan http://localhost:9000
COBALT_API_KEY=     # ixtiyoriy, local ishonchli instance uchun bo'sh qoldirish mumkin
BOT_API_URL=        # ixtiyoriy, local bot-api server ishlatilsa
```
`.env` `.gitignore`da, repo'ga tushmaydi.

## SSH kalit
VPS uchun mahalliy kompyuterda tayyorlangan: `~/.ssh/oracle_vps` (nomi tarixiy, Hetzner uchun ham ishlatilmoqda). Public key Hetzner Console'ga qo'shilgan.

## Hozirgi holat / navbatdagi qadamlar
1. ✅ Kod qayta yozildi (Postgres, Cobalt, queue, kesh)
2. ✅ Neon DB ulanishi va model funksiyalari (`UserModel`, `VideoCache`) real ma'lumotlar bilan sinaldi
3. ✅ Docker Desktop va WSL2/Ubuntu o'rnatildi (kod orqali, `wsl --install`)
4. ⬜ **Kompyuterni reboot qilish kerak** — WSL2 o'zgarishlari hali kuchga kirmagan (keyingi seans shu yerdan boshlanadi)
5. ⬜ Reboot'dan keyin: Docker Desktop ishga tushirish, `docker compose up -d cobalt-api`
6. ⬜ `index.js`ni lokal test uchun polling rejimiga moslash (webhook shart emas)
7. ⬜ Lokal to'liq oqimni real Telegram orqali sinash (URL yuborish → video kelishi) — bularning barchasi **bepul**, VPS/to'lovsiz
8. ⬜ Lokal test muvaffaqiyatli bo'lgach: Hetzner tasdiqlashni yakunlash ($25 karta orqali, foydalanuvchi o'zi kiritadi) → CX22 server yaratish → SSH orqali production deploy
9. ⬜ Keyingi bosqich (foydalanuvchi tasdiqlagan tartib bo'yicha **keyin**): reklama (bepul tarifda) + premium tarif (reklamasiz, navbatda ustuvor — pg-boss job priority orqali). To'lov uchun tavsiya: Telegram Stars (eng oson integratsiya).

## Qabul qilingan qoidalar / kelishuvlar
- Avval asosiy oqim to'liq ishga tushirilib sinaladi, **keyin** premium/reklama qatlami qo'shiladi (foydalanuvchi qarori).
- Pul sarflashdan oldin: **avval lokal Docker bilan bepul sinash**, faqat lokal test muvaffaqiyatli bo'lgach Hetzner'ga $25 to'lanadi (foydalanuvchi qarori).
- Xavfsizlik qoidasi: Claude karta raqami, parol yoki shaxsiy hujjatlarni hech qachon o'zi kiritmaydi/yubormaydi — bunday joylarda foydalanuvchidan so'raladi.
- Xavfsizlik: Neon parolini foydalanuvchi chatda ochiq yubordi — dashboard'dan rotate qilish tavsiya etilgan, hali tasdiqlanmagan/bajarilmagan.
