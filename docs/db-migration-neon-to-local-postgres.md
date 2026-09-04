# DB migratsiyasi: Neon → self-hosted Postgres (2026-09-04)

## Qisqacha
Production bazasi **Neon (serverless Postgres, AWS us-east-2)**'dan production serverning **o'zidagi self-hosted Postgres**'ga ko'chirildi. Sabab — tarmoq kechikishi. Natija: bir xil `SELECT 1` so'rovi **~177ms → ~0.09ms, ya'ni ~2000 marta tezroq**.

To'liq arxitektura konteksti uchun repo root'dagi `CLAUDE.md`ning "DB migratsiyasi" bo'limiga qarang — bu fayl faqat shu bitta o'zgarishning batafsil hisoboti.

## Nega ko'chirildi
Bot production serveri Yevropada, Neon esa AQSh (us-east-2)'da joylashgan. Botning arxitekturasida ma'lumotlar bazasiga **har bir foydalanuvchi so'rovida** murojaat qilinadi:
- `video_cache` — har bir yuborilgan havola uchun keshni tekshirish (`Controllers.js`).
- `pg-boss` — yuklab olish navbatini doimiy poll qilish (`queue/index.js`).

Bu holatda har bir operatsiyaga Neon'gacha bo'lgan tarmoq safari (~177ms) qo'shilib borardi. Serverning o'zida ishlaydigan Postgres bu kechikishni butunlay yo'q qiladi.

## O'lchov natijasi
Production serverning o'zidan (`iep-server@100.111.79.124`), bir xil `SELECT 1` so'rovi, ketma-ket 10 marta, `\timing on` bilan o'lchandi:

| | Neon (AWS us-east-2) | Lokal Postgres (`mediabot-postgres`) |
|---|---|---|
| O'rtacha so'rov vaqti | ~177 ms | ~0.09 ms |
| Nisbat | — | **~2000x tezroq** |

Farq deyarli to'liq **tarmoq masofasi** hisobiga — xom so'rov bajarilish tezligi emas. Shu sabab bu farq har qanday DB operatsiyasida (kesh tekshiruvi, navbat poll'i, statistika yozuvi) bir xil miqyosda namoyon bo'ladi.

## Nima o'zgardi (texnik)

### 1. Yangi Postgres konteyner
Production serverda, bot bilan **bir xil Docker tarmog'ida** (`coolify`), alohida konteyner ko'tarildi:
```
docker run -d --name mediabot-postgres --network coolify --restart unless-stopped \
  --env-file <POSTGRES_USER/PASSWORD/DB bilan> \
  -v mediabot-pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```
- Tashqariga **hech qanday port ochilmagan** — faqat `coolify` tarmog'idagi konteynerlar (jumladan bot) undan foydalana oladi, konteyner nomi orqali (`mediabot-postgres`), Docker'ning ichki DNS'i yordamida.
- Coolify'ning o'z ichki bazasi (`coolify-db`) bilan **hech qanday aloqasi yo'q** — butunlay mustaqil, faqat shu bot uchun.

### 2. Ma'lumotlarni ko'chirish
Bir martalik `pg_dump` (Neon) → `psql` (lokal) orqali:
```
docker run --rm --env-file <NEON_URL bilan> postgres:18-alpine \
  sh -c 'pg_dump "$NEON_URL" --no-owner --no-privileges' \
  | docker exec -i mediabot-postgres psql -U mediabot -d mediabot
```
**Diqqat**: `postgres:18-alpine` client image ishlatildi (16 emas) — Neon Postgres 18'da ishlaydi, `pg_dump` esa o'zidan yangi versiyadagi serverdan dump olishni rad etadi (`aborting because of server version mismatch`).

Ko'chirilgandan keyin har bir jadval qatorlar soni Neon va lokal bazada solishtirilib, **aynan bir xil ekanligi tasdiqlandi** (`users`, `video_cache`, `downloads`).

### 3. Kod o'zgarishi — `db/index.js`
Avval SSL doim majburiy edi (`ssl: { rejectUnauthorized: false }`), bu Neon uchun kerak, lekin lokal Postgres'da SSL listener umuman yo'q — shu holatda ulanish butunlay buzilardi. Endi shartli:
```js
ssl: /sslmode=require/.test(DATABASE_URL) ? { rejectUnauthorized: false } : false,
```
`queue/index.js`dagi `pg-boss` o'zgarishsiz qoldi — u `DATABASE_URL`dagi `sslmode` parametriga qarab o'zi avtomatik hal qiladi (lokal URL'da bu parametr yo'q, shu sabab SSL'siz ulanadi).

Commit: `fdd6ddc` (SSL shartli), `bc81c9c` (CLAUDE.md hujjati).

### 4. `DATABASE_URL` (Coolify env) — yangi shakl
```
postgresql://mediabot:***@mediabot-postgres:5432/mediabot
```
(parol maxfiy, Coolify'ning Environment Variables bo'limida saqlangan — bu faylga yozilmagan)

### 5. Deploy
Coolify'da `DATABASE_URL` yangilandi va redeploy qilindi. Build ~3-4 daqiqa davom etdi (Dockerfile `apt-get install python3/ffmpeg` bosqichi HDD diskda sekin — bu avvaldan ma'lum, kutilgan holat, server SSD emas). Yangi konteyner sog'lom ko'tarilib, eski konteyner Coolify tomonidan avtomatik olib tashlandi (uzilishsiz almashtirish). Loglarda xatosiz: `Postgres schema ready, download queue worker started`, webhook muvaffaqiyatli o'rnatildi.

## Ochiq qolgan narsa: backup
Neon'ning avtomatik backup/PITR imkoniyati endi ishlamaydi — ma'lumot endi Neon'da yangilanmaydi. Lokal Postgres uchun mustaqil backup strategiyasi (masalan, kunlik `pg_dump` cron job + natijani serverdan tashqariga nusxalash) **hali sozlanmagan**. Bu keyingi qadam sifatida qoldirilgan.

Neon akkaunt/baza o'zi **o'chirilmagan** — hozircha zaxira/qaytarish yo'li sifatida saqlanmoqda, lekin production endi undan foydalanmaydi.
