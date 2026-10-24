# Telegram Clone 📱

Django + REST API + vanilla JavaScript asosida yozilgan **Telegram'ga o'xshash messenjer**.
Loyiha o'quv maqsadida yaratilgan: real vaqtga yaqin chat, guruhlar, kanallar va PWA qo'llab-quvvatlaydi.

## ✨ Funksiyalar

**Autentifikatsiya**
- Ro'yxatdan o'tish / kirish / chiqish
- Profil: avatar, bio, telefon raqam
- Online status va oxirgi faollik vaqti

**Chatlar**
- Shaxsiy (private), guruh va kanal
- Xabar yuborish, tahrirlash, o'chirish
- Javob berish (reply) va forward
- Reaksiyalar (emoji)
- Poll (so'rovnoma) yaratish va ovoz berish
- Pin qilingan xabarlar
- Ovozli xabar, rasm va fayl yuborish
- Xabar qidiruvi va media galereya

**Foydalanuvchi tajribasi**
- O'qilganlik belgisi (read receipts) va o'qilmagan xabarlar soni
- "Yozmoqda..." indikatori
- Foydalanuvchilarni bloklash
- Guruh admin paneli va slow mode
- Qorong'i/yorug' mavzu
- PWA — telefonga ilova sifatida o'rnatish mumkin

## 🛠 Texnologiyalar

| Qism | Texnologiya |
|---|---|
| Backend | Python 3.13, Django 6, Django REST Framework |
| Ma'lumotlar bazasi | PostgreSQL (production) / SQLite (lokal) |
| Frontend | HTML, CSS, vanilla JavaScript (SPA) |
| Static fayllar | WhiteNoise |
| Deploy | Vercel (serverless) |

## 🚀 Lokalda ishga tushirish

### 1. Reponi klonlash

```bash
git clone https://github.com/Vixuz-sin/ishlar.git
cd ishlar
```

### 2. Virtual muhit va kutubxonalar

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. `.env` fayl yaratish

`.env.example` faylidan nusxa oling:

```bash
cp .env.example .env
```

Va ichidagi qiymatlarni to'ldiring (lokal ishlash uchun quyidagilar yetarli):

```env
SECRET_KEY=dev-uchun-uzun-tasodifiy-matn
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost
SESSION_COOKIE_SECURE=False
CSRF_COOKIE_SECURE=False
```

> ⚠️ `SESSION_COOKIE_SECURE=True` bo'lsa, lokal `http://` da login ishlamaydi — shuning uchun lokalda `False` qiling.
> Production'da esa albatta `True` bo'lishi kerak.

### 4. Migratsiyalar va server

```bash
python manage.py migrate
python manage.py createsuperuser   # ixtiyoriy, admin panel uchun
python manage.py runserver
```

Sayt: http://127.0.0.1:8000
Admin: http://127.0.0.1:8000/admin

## ⚙️ Environment o'zgaruvchilari

| Nomi | Majburiy | Tavsif |
|---|---|---|
| `SECRET_KEY` | ✅ | Django secret key |
| `DEBUG` | ❌ | `True` / `False` (default: `False`) |
| `ALLOWED_HOSTS` | ❌ | Vergul bilan ajratilgan domenlar |
| `DATABASE_URL` | ❌ | PostgreSQL ulanish manzili. Bo'lmasa SQLite ishlatiladi |
| `CSRF_TRUSTED_ORIGINS` | ❌ | Ishonchli domenlar (vergul bilan) |
| `SESSION_COOKIE_SECURE` | ❌ | Production'da `True` |
| `CSRF_COOKIE_SECURE` | ❌ | Production'da `True` |

## 📁 Loyiha tuzilishi

```
api/
  index.py              # Vercel serverless entry point
chat/
  models.py             # User, Chat, Message, Poll, Reaction
  views.py              # 37 ta API endpoint
  urls.py               # URL marshrutlari
  auth.py               # Session autentifikatsiya
  serializers.py
  migrations/
telegram_django/
  settings.py           # Sozlamalar
  urls.py
static/
  script.js             # SPA logikasi
  style.css
  manifest.json, sw.js  # PWA
templates/
  index.html            # Asosiy sahifa
manage.py
vercel.json             # Deploy konfiguratsiyasi
```

## 🔌 API endpointlar

Barcha endpointlar `/api/` bilan boshlanadi.

**Auth:** `register`, `login`, `logout`, `me`

**Chatlar:** `chats`, `chats/<id>`, `chats/<id>/messages`, `group`, `channel`, `channels`, `chats/<id>/join`

**Xabarlar:** `send`, `messages/<id>`, `messages/<id>/edit`, `messages/<id>/delete`, `messages/<id>/forward`, `messages/<id>/react`, `messages/<id>/pin`, `messages/search`

**Foydalanuvchilar:** `users`, `users/search`, `users/<id>`, `users/<id>/block`, `users/me/profile`, `online`

**Real-time (polling):** `poll/messages`, `poll/typing`, `typing`

**Boshqa:** `upload`, `upload/photo`, `chats/<id>/read`, `chats/<id>/media`, `chats/<id>/manage`, `chats/<id>/slow_mode`, `poll`, `poll/<id>/vote`, `delete_chat`

## ☁️ Deploy (Vercel)

1. Reponi Vercel'ga ulang
2. Environment o'zgaruvchilarini kiriting (`SECRET_KEY`, `DATABASE_URL`, `ALLOWED_HOSTS`, ...)
3. Build command `vercel.json`da avtomatik ishlaydi:

```bash
python manage.py collectstatic --noinput && python manage.py migrate
```

> **Muhim:** Vercel'da fayl tizimi vaqtinchalik. `uploads/` papkasiga saqlangan rasm va ovozli xabarlar
> qayta deploy bo'lganda o'chib ketadi. Buning uchun Supabase Storage yoki S3 ishlatish kerak.

## 🗺 Reja (roadmap)

- [ ] Media fayllarni cloud storage'ga ko'chirish (Supabase Storage / S3)
- [ ] CSRF himoyasini to'g'ri sozlash yoki token autentifikatsiyaga o'tish
- [ ] WebSocket orqali real-time (hozir polling ishlatiladi)
- [ ] Testlar yozish
- [ ] `views.py`ni modullarga bo'lish
- [ ] Rate limiting (spam himoyasi)

## 📄 Litsenziya

O'quv loyihasi. Foydalanish erkin.
