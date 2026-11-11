# CafePOS Adminka

CafePOS dasturining litsenziya kalitlarini boshqarish uchun admin panel va aktivatsiya API.

- Mijozlar va ularning kalitlari (`CAFE-XXXX-XXXX-XXXX-XXXX`)
- Oylik/yillik muddatli kalitlar. Mijoz pul o'tkazganda admin **"To'lov qabul qilish"** orqali muddatni uzaytiradi
- Har kalit **bitta kompyuterga** bog'lanadi. Admin qurilmani uzib, yangi kompyuterga o'tkazishga ruxsat bera oladi
- Bloklash, to'lovlar tarixi, har bir kalit bo'yicha jurnal (aktivlashtirish va rad etilgan urinishlar)
- CafePOS **Ed25519 bilan imzolangan token** oladi va internet bo'lmasa ham `OFFLINE_GRACE_DAYS` kungacha ishlaydi

CafePOS tomonini ulash bo'yicha: [docs/CAFEPOS_INTEGRATION.md](docs/CAFEPOS_INTEGRATION.md)

## O'rnatish

Talablar: Node.js 20+, PostgreSQL 13+.

```bash
npm install
cp .env.example .env          # DATABASE_URL va SESSION_SECRET ni to'ldiring
npm run gen-keys              # keys/license_private.pem va keys/license_public.pem
npm run migrate
npm run create-admin -- admin "kuchli-parol"
npm start                     # http://localhost:3000
```

> ⚠️ `keys/license_private.pem` faylini **yo'qotmang va hech kimga bermang**. Uning zaxira nusxasini saqlang.
> Yo'qolsa, barcha CafePOS'larni yangi ochiq kalit bilan qayta chiqarishga to'g'ri keladi.
> Ochiq kalitni (`license_public.pem`) CafePOS ichiga joylang.

Productionda: `NODE_ENV=production`, `COOKIE_SECURE=true` va HTTPS (masalan Nginx + Let's Encrypt) ishlating.
Kalitni fayl o'rniga `LICENSE_PRIVATE_KEY` muhit o'zgaruvchisida PEM ko'rinishida ham berish mumkin.

## Ish jarayoni

1. **Mijozlar → + Yangi mijoz**: ism, kafe nomi va telefonni kiritasiz.
2. Mijoz sahifasida **Kalit yaratish**: tarif, oylar soni va o'tkazilgan summani kiritasiz. Kalit nusxasini mijozga yuborasiz.
3. Mijoz keyingi oy uchun pul o'tkazganda: kalit sahifasi → **To'lov qabul qilish**. Muddat joriy tugash sanasidan
   boshlab uzaytiriladi (agar muddat allaqachon tugagan bo'lsa, bugundan boshlab). CafePOS yangi muddatni keyingi tekshiruvda avtomatik oladi.
4. Bosh sahifada 7 kun ichida tugaydigan va tugagan kalitlar ko'rinadi, shu ro'yxat bo'yicha mijozlarga eslatish mumkin.

## Testlar

```bash
createdb adminka_test
npm test        # TEST_DATABASE_URL bilan boshqa bazani ko'rsatish mumkin
```

## Tuzilma

```
src/
  app.js, server.js     Express ilova
  licenses.js           Asosiy logika: yaratish, uzaytirish, aktivlashtirish, tekshirish
  signing.js            Ed25519 token imzolash
  routes/api.js         CafePOS uchun API (/api/v1/activate, /api/v1/check)
  routes/admin.js       Admin panel
  views/                EJS sahifalar
migrations/             SQL migratsiyalar
scripts/                migrate, create-admin, gen-keys
docs/                   CafePOS integratsiyasi
```
