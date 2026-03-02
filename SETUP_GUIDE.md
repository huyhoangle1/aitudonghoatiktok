# 📋 Hướng Dẫn Chi Tiết Lấy Thông Tin `.env`

> Hướng dẫn từng bước lấy **tất cả API keys** cần thiết cho hệ thống.
> Thời gian ước tính: ~30 phút

---

## 📑 Mục lục

1. [Supabase (Database)](#1--supabase-database) — ⭐ BẮT BUỘC
2. [Cloudflare R2 (Storage)](#2-️-cloudflare-r2-storage) — ⭐ BẮT BUỘC
3. [Google Gemini (AI)](#3--google-gemini-ai) — ⭐ BẮT BUỘC
4. [ElevenLabs (Voiceover)](#4--elevenlabs-voiceover) — Khuyên dùng
5. [TikTok API](#5--tiktok-api) — Cho Publishing
6. [Facebook/Instagram API](#6--facebookinstagram-api) — Cho Publishing

---

## 1. 🗄️ Supabase (Database)

**Cần lấy:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Bước 1: Tạo tài khoản
1. Truy cập 👉 **https://supabase.com**
2. Click **"Start your project"** → Đăng ký bằng GitHub hoặc Email
3. Xác nhận email (nếu đăng ký bằng email)

### Bước 2: Tạo Project
1. Sau khi đăng nhập → Click **"New Project"**
2. Điền thông tin:
   - **Organization**: Chọn org mặc định hoặc tạo mới
   - **Name**: `ai-workflow` (hoặc tùy ý)
   - **Database Password**: Tạo mật khẩu mạnh → **LƯU LẠI** (không thể xem lại)
   - **Region**: Chọn `Southeast Asia (Singapore)` cho VN
   - **Plan**: Free tier (đủ dùng)
3. Click **"Create new project"**
4. ⏳ Đợi 2-3 phút để project khởi tạo

### Bước 3: Lấy URL & Keys
1. Vào **Project Settings** (biểu tượng ⚙️ ở sidebar trái, phía dưới cùng)
2. Click **"API"** trong menu bên trái (trong mục "Configuration")
3. Tại đây bạn sẽ thấy:

```
┌─────────────────────────────────────────────────────┐
│  Project URL                                         │
│  https://abcxyz123.supabase.co        ← SUPABASE_URL│
├─────────────────────────────────────────────────────┤
│  Project API Keys                                    │
│                                                      │
│  anon (public)                                       │
│  eyJhbGciOiJIUzI1NiI...               ← ANON_KEY    │
│                                                      │
│  service_role (secret)                               │
│  eyJhbGciOiJIUzI1NiI...               ← SERVICE_KEY │
│  ⚠️ KHÔNG CHIA SẺ KEY NÀY!                          │
└─────────────────────────────────────────────────────┘
```

4. Copy từng giá trị vào file `.env`:

```env
SUPABASE_URL=https://abcxyz123.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiI....(dài)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiI....(dài)
```

### Bước 4: Chạy Migration SQL
1. Trong Supabase Dashboard → Click **"SQL Editor"** (sidebar trái)
2. Click **"New query"**
3. Mở file `src/db/migrations/001_init_schema.sql` → Copy toàn bộ nội dung
4. Paste vào SQL Editor
5. Click **"Run"** (hoặc Ctrl+Enter)
6. ✅ Thấy "Success" → Database đã sẵn sàng!

> ⚠️ **Lưu ý**: `service_role` key có **full access** database, bypass RLS.
> Chỉ dùng ở backend, KHÔNG BAO GIỜ để ở frontend.

---

## 2. ☁️ Cloudflare R2 (Storage)

**Cần lấy:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_PUBLIC_URL`

### Bước 1: Tạo tài khoản Cloudflare
1. Truy cập 👉 **https://dash.cloudflare.com/sign-up**
2. Đăng ký bằng Email → Xác nhận email
3. Không cần thêm domain (chỉ dùng R2)

### Bước 2: Lấy Account ID
1. Đăng nhập Dashboard → Nhìn URL trình duyệt:
   ```
   https://dash.cloudflare.com/abc123def456/...
                                ^^^^^^^^^^^^^^
                                Account ID ở đây
   ```
2. Hoặc: Sidebar trái → **"Workers & Pages"** → Copy **Account ID** ở góc phải

```env
CLOUDFLARE_ACCOUNT_ID=abc123def456ghi789
```

### Bước 3: Tạo R2 Bucket
1. Sidebar trái → Click **"R2 Object Storage"**
2. Nếu lần đầu → Click **"Purchase R2 Plan"** (Free tier: 10GB storage, 10M requests/tháng miễn phí, KHÔNG cần thẻ tín dụng cho free tier)
3. Click **"Create bucket"**
4. Đặt tên: `ai-workflow-media`
5. Location: **Automatic** hoặc **Asia Pacific (APAC)**
6. Click **"Create bucket"**

### Bước 4: Bật Public Access (để platforms lấy video)
1. Vào bucket `ai-workflow-media`
2. Tab **"Settings"**
3. Kéo xuống **"Public access"** → Click **"Allow Access"**
4. Bạn sẽ nhận được Public URL dạng:
   ```
   https://pub-abc123.r2.dev
   ```
5. Hoặc: Kết nối Custom Domain (nếu có domain riêng)

```env
CLOUDFLARE_R2_PUBLIC_URL=https://pub-abc123.r2.dev
```

### Bước 5: Tạo API Token (R2)
1. Trong trang R2 → Sidebar phải → Click **"Manage R2 API Tokens"**
   - Hoặc: Vào **My Profile** (góc phải trên) → **API Tokens** → **Create Token**
2. Click **"Create API token"**
3. Cấu hình:
   - **Token name**: `ai-workflow-r2`
   - **Permissions**: **Object Read & Write**
   - **Specify bucket(s)**: Chọn `ai-workflow-media`
   - **TTL**: Không giới hạn (hoặc tùy)
4. Click **"Create API Token"**
5. ⚠️ **MÀN HÌNH TIẾP THEO RẤT QUAN TRỌNG** — Copy ngay:

```
┌─────────────────────────────────────────────┐
│  Access Key ID                               │
│  f5a8b2c1d3e4...                             │
│                                              │
│  Secret Access Key                           │
│  9k8j7h6g5f4d...                             │
│  ⚠️ Key này CHỈ HIỆN 1 LẦN!                 │
└─────────────────────────────────────────────┘
```

```env
CLOUDFLARE_R2_ACCESS_KEY_ID=f5a8b2c1d3e4...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=9k8j7h6g5f4d...
CLOUDFLARE_R2_BUCKET_NAME=ai-workflow-media
```

> ⚠️ **QUAN TRỌNG**: Secret Access Key **CHỈ HIỆN 1 LẦN DUY NHẤT**.
> Nếu quên → phải tạo token mới.

---

## 3. 🤖 Google Gemini (AI)

**Cần lấy:** `GEMINI_API_KEY`

### Cách 1: Google AI Studio (Nhanh nhất - Khuyên dùng)
1. Truy cập 👉 **https://aistudio.google.com/apikey**
2. Đăng nhập bằng Google Account
3. Click **"Create API key"**
4. Chọn project (hoặc tạo mới) → Click **"Create API key in new project"**
5. Copy API Key:

```env
GEMINI_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Cách 2: Google Cloud Console (Nếu cần Veo / Vertex AI)
1. Truy cập 👉 **https://console.cloud.google.com**
2. Tạo/chọn Project
3. **APIs & Services** → **Credentials** → **Create Credentials** → **API Key**
4. Enable các API:
   - Generative Language API (cho Gemini)
   - Vertex AI API (cho Veo video generation)
5. Copy API key

> 💡 **Mẹo**: Free tier Gemini có giới hạn:
> - Gemini 2.0 Flash: 15 RPM (requests/minute), 1M tokens/day
> - Gemini 2.5 Pro: 2 RPM, 50 requests/day  
> - Đủ dùng cho testing. Nâng cấp Pay-as-you-go nếu chạy production.

---

## 4. 🎤 ElevenLabs (Voiceover)

**Cần lấy:** `ELEVENLABS_API_KEY`

### Bước 1: Tạo tài khoản
1. Truy cập 👉 **https://elevenlabs.io**
2. Click **"Sign up"** → Đăng ký bằng Google/Email
3. Chọn plan **Free** (10,000 characters/tháng, 3 custom voices)

### Bước 2: Lấy API Key
1. Đăng nhập → Click avatar góc phải trên
2. Click **"Profile + API key"**
3. Tại mục **"API Key"** → Click biểu tượng 👁️ để hiện key
4. Copy:

```env
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Bước 3: Lấy Voice ID (tùy chọn)
1. Vào **"Voices"** trong sidebar trái
2. Chọn giọng bạn thích (ví dụ: Vietnamese voices)
3. Click giọng đó → Copy **Voice ID** từ URL hoặc settings
4. Dùng Voice ID trong config:
   ```javascript
   { voiceId: 'pNInz6obpgDQGcFmaJgB' } // ID giọng bạn chọn
   ```

> 💡 **Mẹo**: Tìm giọng Tiếng Việt:
> - Vào **Voice Library** → Search "Vietnamese"
> - Hoặc dùng **Voice Clone** để tạo giọng riêng

---

## 5. 🎵 TikTok API

**Cần lấy:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`

> ⚠️ TikTok API cần duyệt app. Quá trình mất 1-5 ngày làm việc.

### Bước 1: Tạo Developer Account
1. Truy cập 👉 **https://developers.tiktok.com**
2. Click **"Log in"** → Đăng nhập bằng TikTok account
3. Đồng ý Developer Terms

### Bước 2: Tạo App
1. Vào **"Manage apps"** → Click **"Connect an app"**
2. Điền thông tin:
   - **App name**: `AI Video Automation`
   - **Description**: `Automated video content creation and publishing`
   - **App icon**: Upload logo
   - **Category**: Content & Publishing
3. Click **"Confirm"**

### Bước 3: Cấu hình Products
1. Trong app vừa tạo → Tab **"Add products"**
2. Thêm **"Content Posting API"**:
   - Click **"Apply"** bên cạnh Content Posting API
   - Điền mô tả use case
   - ⏳ Đợi duyệt (1-5 ngày)
3. Thêm **"Login Kit"** (cần cho OAuth):
   - Redirect URI: `http://localhost:3000/auth/tiktok/callback`

### Bước 4: Lấy Credentials
1. Tab **"Basic information"**:

```
┌─────────────────────────────────────┐
│  Client Key:  aw1234567890abcdef    │
│  Client Secret: xxxxxxxxxxxxxxxxx  │
│  ⚠️ Chỉ hiện 1 lần!               │
└─────────────────────────────────────┘
```

```env
TIKTOK_CLIENT_KEY=aw1234567890abcdef
TIKTOK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxx
```

### Bước 5: Lấy User Access Token
TikTok dùng OAuth 2.0. Bạn cần thêm flow lấy token:

```
1. Redirect user đến:
   https://www.tiktok.com/v2/auth/authorize?
     client_key={CLIENT_KEY}&
     scope=user.info.basic,video.publish&
     response_type=code&
     redirect_uri={REDIRECT_URI}

2. User authorize → TikTok redirect về callback với ?code=xxx

3. Exchange code → access_token:
   POST https://open.tiktokapis.com/v2/oauth/token/
   { client_key, client_secret, code, grant_type: "authorization_code" }
   
4. Response chứa access_token (dùng để publish)
```

---

## 6. 📘 Facebook / Instagram API

**Cần lấy:** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `INSTAGRAM_ACCESS_TOKEN`

### Bước 1: Tạo Facebook App
1. Truy cập 👉 **https://developers.facebook.com**
2. Click **"My Apps"** → **"Create App"**
3. Chọn **"Other"** → **"Business"**
4. Điền:
   - **App name**: `AI Video Publisher`
   - **Contact email**: Email của bạn
   - **Business Account**: Chọn hoặc tạo mới
5. Click **"Create App"**

### Bước 2: Lấy App ID & Secret
1. Vào App → **"Settings"** → **"Basic"**
2. Tìm:

```
┌─────────────────────────────────┐
│  App ID: 1234567890123456       │
│  App Secret: Click "Show" →     │
│  abc123def456ghi789             │
└─────────────────────────────────┘
```

```env
FACEBOOK_APP_ID=1234567890123456
FACEBOOK_APP_SECRET=abc123def456ghi789
```

### Bước 3: Thêm Products
1. Sidebar trái → **"Add Product"**
2. Thêm:
   - **Facebook Login** → Set up
   - **Instagram Graph API** → Set up

### Bước 4: Lấy Page Access Token (Facebook Reels)
1. Vào **Graph API Explorer**: 👉 **https://developers.facebook.com/tools/explorer**
2. Chọn app vừa tạo
3. Click **"Generate Access Token"**
4. Chọn permissions:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `publish_video`
5. Click **"Generate"** → Authorize
6. Để lấy **Long-lived Token** (không hết hạn nhanh):
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token?
     grant_type=fb_exchange_token&
     client_id={APP_ID}&
     client_secret={APP_SECRET}&
     fb_exchange_token={SHORT_LIVED_TOKEN}
   ```

### Bước 5: Lấy Instagram Access Token
1. Instagram Business/Creator Account phải **liên kết Facebook Page**
2. Trong Graph API Explorer:
   - Chọn permissions: `instagram_basic`, `instagram_content_publish`
   - Generate Token
3. Lấy Instagram User ID:
   ```
   GET https://graph.facebook.com/v21.0/me/accounts?access_token={TOKEN}
   → Tìm Page liên kết với IG
   
   GET https://graph.facebook.com/v21.0/{PAGE_ID}?fields=instagram_business_account&access_token={TOKEN}
   → Lấy instagram_business_account.id
   ```

```env
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxxxxxxxxx
```

---

## ✅ File `.env` hoàn chỉnh

Sau khi lấy đủ thông tin, file `.env` sẽ trông như thế này:

```env
# ═══════════════════════════════════
# SUPABASE (BẮT BUỘC)
# ═══════════════════════════════════
SUPABASE_URL=https://abcxyz123.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...

# ═══════════════════════════════════
# CLOUDFLARE R2 (BẮT BUỘC)
# ═══════════════════════════════════
CLOUDFLARE_ACCOUNT_ID=abc123def456ghi789jkl012
CLOUDFLARE_R2_ACCESS_KEY_ID=f5a8b2c1d3e4f6a7b8c9
CLOUDFLARE_R2_SECRET_ACCESS_KEY=9k8j7h6g5f4d3s2a1qwertyuiop
CLOUDFLARE_R2_BUCKET_NAME=ai-workflow-media
CLOUDFLARE_R2_PUBLIC_URL=https://pub-abc123.r2.dev

# ═══════════════════════════════════
# GEMINI AI (BẮT BUỘC)
# ═══════════════════════════════════
GEMINI_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ═══════════════════════════════════
# ELEVENLABS (TÙY CHỌN - cho voiceover)
# ═══════════════════════════════════
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ═══════════════════════════════════
# TIKTOK (TÙY CHỌN - cho publishing)
# ═══════════════════════════════════
TIKTOK_CLIENT_KEY=aw1234567890abcdef
TIKTOK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxx

# ═══════════════════════════════════
# FACEBOOK/INSTAGRAM (TÙY CHỌN - cho publishing)
# ═══════════════════════════════════
FACEBOOK_APP_ID=1234567890123456
FACEBOOK_APP_SECRET=abc123def456ghi789
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxxxxxxxxx

# ═══════════════════════════════════
# APPLICATION
# ═══════════════════════════════════
NODE_ENV=development
PORT=3000
```

---

## 🎯 Thứ tự ưu tiên setup

| # | Service | Mức độ | Lý do |
|---|---------|--------|-------|
| 1 | **Supabase** | ⭐ BẮT BUỘC | Database lõi của hệ thống |
| 2 | **Cloudflare R2** | ⭐ BẮT BUỘC | Lưu trữ ảnh/video/audio |
| 3 | **Gemini API** | ⭐ BẮT BUỘC | AI phân tích + tạo kịch bản + tạo ảnh |
| 4 | **ElevenLabs** | 🔶 KHUYÊN DÙNG | Voiceover chất lượng cao |
| 5 | **TikTok API** | 🔷 TÙY CHỌN | Tự động đăng TikTok |
| 6 | **Facebook/IG** | 🔷 TÙY CHỌN | Tự động đăng Reels |

> 💡 **Bắt đầu nhanh**: Chỉ cần **Supabase + Cloudflare R2 + Gemini** (3 services)
> là đã có thể chạy scraping + tạo kịch bản + tạo ảnh/video.
> Thêm ElevenLabs + Social APIs sau khi test thành công.

---

## ❓ Troubleshooting

### "Supabase connection failed"
- Kiểm tra `SUPABASE_URL` đúng format: `https://xxx.supabase.co` (không có `/` cuối)
- Kiểm tra `SUPABASE_ANON_KEY` copy đầy đủ (rất dài, ~200 ký tự)

### "Cloudflare R2 SSL error"
- Kiểm tra `CLOUDFLARE_ACCOUNT_ID` đúng (chuỗi hex, không có dấu gạch)
- Endpoint đúng format: `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`

### "Gemini quota exceeded"
- Free tier có giới hạn RPM
- Đợi 1 phút rồi thử lại
- Hoặc upgrade lên Pay-as-you-go trên Google AI Studio

### "ElevenLabs 401 Unauthorized"
- API key sai hoặc hết hạn
- Kiểm tra lại trong Profile → API Keys

### "TikTok/Facebook API error"
- Kiểm tra app đã được duyệt chưa
- Access token có thể hết hạn → Refresh token
