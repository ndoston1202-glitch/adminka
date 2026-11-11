# CafePOS ↔ Adminka ulanishi

CafePOS dasturi adminka API'si bilan quyidagicha ishlaydi.

## Umumiy oqim

1. Mijoz sizga pul o'tkazadi → siz adminkada mijoz va kalit yaratasiz (yoki mavjud kalitga **"To'lov qabul qilish"** orqali muddat qo'shasiz).
2. Kalitni mijozga berasiz: `CAFE-XXXX-XXXX-XXXX-XXXX`.
3. Mijoz CafePOS'da kalitni kiritadi → dastur `POST /api/v1/activate` chaqiradi → kalit shu kompyuterga bog'lanadi.
4. CafePOS ishga tushganda va har **6 soatda** `POST /api/v1/check` chaqiradi va yangi muddatni oladi.
5. Internet bo'lmasa, dastur oxirgi saqlangan **imzolangan token** bilan `offline_until` gacha (standart 7 kun) ishlaydi.

## Qurilma ID (`device_id`)

Har bir kompyuter uchun o'zgarmas ID: masalan, Windows `MachineGuid`
(`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`) + disk seriya raqamining SHA-256 hashi.
Uzunligi 8–200 belgi bo'lishi kerak.

## API

Server manzili, masalan: `https://admin.cafepos.uz`

### `POST /api/v1/activate`
```json
{ "key": "CAFE-NJUQ-EDFR-5UDW-NEVY", "device_id": "3f2a...", "device_name": "Kassa-1", "app_version": "1.4.0" }
```

### `POST /api/v1/check`
Body xuddi shunday. Farqi: bog'lanmagan kalitni bog'lamaydi.

### `POST /api/v1/profile`
Kalit kiritilgandan keyin CafePOS ro'yxatdan o'tish formasidagi ma'lumotlarni yuboradi.
Faqat kalit bog'langan qurilmadan qabul qilinadi. `name` va `director_name` majburiy.
```json
{ "key": "CAFE-...", "device_id": "3f2a...", "profile": {
    "name": "Rayhon Kafe", "company": "Rayhon MChJ", "district": "Chilonzor", "address": "Bunyodkor 1",
    "telegram_phone": "+998901112233", "vat_percent": 12, "inn": "123456789", "contract_no": "SH-7",
    "director_name": "Aziz Karimov", "director_phone": "+998901112233", "note": "" } }
```
Javob: `{ "ok": true }`. Ma'lumotlar adminkada kalit sahifasida ko'rinadi.

### Muvaffaqiyatli javob (200)
```json
{
  "ok": true,
  "server_time": "2026-11-11T08:05:00.000Z",
  "token": "eyJ2Ijox....<imzo>",
  "license": {
    "v": 1, "key": "CAFE-...", "device_id": "3f2a...", "customer": "Rayhon Kafe", "plan": "monthly",
    "expires_at": "2026-12-11T08:05:00.000Z",
    "offline_until": "2026-11-18T08:05:00.000Z",
    "issued_at": "2026-11-11T08:05:00.000Z"
  }
}
```

### Xatolar
| HTTP | `code` | Ma'nosi | CafePOS nima qiladi |
|---|---|---|---|
| 400 | `invalid_key`, `bad_device_id` | Format noto'g'ri | Xabar ko'rsatadi |
| 404 | `invalid_key` | Kalit mavjud emas | Saqlangan tokenni o'chiradi, kalit so'raydi |
| 402 | `expired` | Muddat tugagan (javobda `expires_at`) | Bloklaydi: "To'lov qiling" oynasi |
| 403 | `blocked` | Admin bloklagan | Saqlangan tokenni o'chiradi, bloklaydi |
| 409 | `device_mismatch` | Kalit boshqa kompyuterga bog'langan | "Administratorga murojaat qiling" |
| 409 | `not_activated` | Kalit uzilgan (admin qurilmani uzgan) | Qayta `activate` chaqiradi |
| 429 | `rate_limited` | Juda ko'p so'rov | Keyinroq urinadi |
| 5xx / tarmoq xatosi | — | Server bilan aloqa yo'q | Saqlangan token bilan oflayn ishlaydi |

## Tokenni tekshirish (oflayn)

Token: `base64url(JSON) + "." + base64url(Ed25519 imzo)`. Imzo **JSON qismining base64url satri** ustidan qo'yiladi.
Ochiq kalit (`keys/license_public.pem` yoki `GET /api/v1/public-key`) CafePOS ichiga **qattiq yozib qo'yiladi**:
uni internetdan olmang, aks holda soxta server yasash mumkin bo'ladi.

CafePOS ishga tushganda:

1. Saqlangan tokenni o'qing va imzosini ochiq kalit bilan tekshiring. Imzo noto'g'ri bo'lsa, dastur bloklanadi.
2. `payload.device_id` shu kompyuterning ID'siga teng bo'lishi kerak.
3. `hozir < payload.offline_until` bo'lishi kerak (`offline_until` hech qachon `expires_at` dan katta bo'lmaydi).
4. **Soatni orqaga surishdan himoya:** oxirgi ko'rilgan vaqtni saqlang (`last_seen`).
   Agar `hozir < last_seen - 1 soat` yoki `hozir < payload.issued_at - 1 soat` bo'lsa, onlayn tekshiruv talab qiling.
5. Keyin `/api/v1/check` ni fon rejimida chaqiring. Muvaffaqiyatli bo'lsa, yangi tokenni saqlang.
   `expired`, `blocked` yoki `invalid_key` bo'lsa, darhol bloklang.

### Node.js / Electron misoli
```js
const crypto = require('crypto');
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
...adminkadagi keys/license_public.pem...
-----END PUBLIC KEY-----`;

function verifyLicenseToken(token, deviceId, lastSeen) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return { ok: false, reason: 'no_token' };
  const valid = crypto.verify(null, Buffer.from(body), crypto.createPublicKey(PUBLIC_KEY), Buffer.from(sig, 'base64url'));
  if (!valid) return { ok: false, reason: 'bad_signature' };
  const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  const now = Date.now();
  if (p.device_id !== deviceId) return { ok: false, reason: 'other_device' };
  if (now < Date.parse(p.issued_at) - 3600e3 || (lastSeen && now < lastSeen - 3600e3)) return { ok: false, reason: 'clock_rollback' };
  if (now >= Date.parse(p.expires_at)) return { ok: false, reason: 'expired' };
  if (now >= Date.parse(p.offline_until)) return { ok: false, reason: 'need_online' };
  return { ok: true, license: p, daysLeft: Math.ceil((Date.parse(p.expires_at) - now) / 86400e3) };
}
```

### C# (.NET 8+) misoli
.NET'da Ed25519 o'rnatilmagan, shuning uchun [BouncyCastle](https://www.nuget.org/packages/BouncyCastle.Cryptography) ishlatiladi:
```csharp
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Crypto.Signers;
using Org.BouncyCastle.Security;

static bool VerifySignature(string token, string publicKeyPem)
{
    var parts = token.Split('.');
    if (parts.Length != 2) return false;
    var der = Convert.FromBase64String(string.Concat(publicKeyPem.Split('\n').Where(l => !l.StartsWith("-----"))));
    var key = (Ed25519PublicKeyParameters)PublicKeyFactory.CreateKey(der);
    var signer = new Ed25519Signer();
    signer.Init(false, key);
    var data = System.Text.Encoding.ASCII.GetBytes(parts[0]);
    signer.BlockUpdate(data, 0, data.Length);
    return signer.VerifySignature(FromBase64Url(parts[1]));
}

static byte[] FromBase64Url(string s)
{
    s = s.Replace('-', '+').Replace('_', '/');
    return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
}
```
Imzo to'g'ri bo'lsa, `parts[0]` ni base64url'dan dekodlab JSON sifatida o'qing va yuqoridagi 2–4-tekshiruvlarni bajaring.
