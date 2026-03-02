# 🤖 AI Workflow Automation System

> **Hệ thống tự động hóa sản xuất video quảng cáo từ sản phẩm TMĐT**
> Từ URL sản phẩm → Video TikTok/Reels → Đăng tải tự động

## ⚡ Tech Stack

| Component | Technology |
|-----------|-----------|
| Database | **Supabase** (PostgreSQL) |
| Storage | **Cloudflare R2** (S3-Compatible) |
| AI Analysis | **Gemini 2.0 Flash** |
| AI Script | **Gemini 2.5 Pro** (Multimodal) |
| Image Gen | **Gemini 2.0 Flash** (Image Gen) |
| Video Gen | **Veo 2.0** |
| Voiceover | **ElevenLabs** (Multilingual V2) |
| Scraping | **Playwright** |
| Video Edit | **FFmpeg** / Shotstack API |
| Distribution | TikTok API, Facebook/Instagram Graph API |

## 🏗️ Pipeline Architecture

```
URL sản phẩm
     │
     ▼
┌─────────────────────┐
│  1. SMART SCRAPING   │  Playwright + Gemini Flash
│  Thu thập dữ liệu    │  AI tự nhận diện cấu trúc trang
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  2. CREATIVE BRAIN   │  Gemini Pro Multimodal
│  Tạo kịch bản       │  Ảnh SP + mô tả → kịch bản timeline
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  3. MEDIA GENERATION │  Gemini ImageGen + Veo + ElevenLabs
│  Tạo ảnh/video/audio │  Style Transfer, Video 4K, TTS
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  4. VIDEO EDITING    │  FFmpeg / Shotstack
│  Lắp ghép video      │  Ken Burns, transitions, subtitles
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  5. DISTRIBUTION     │  TikTok + FB + IG APIs
│  Đăng tải đa kênh    │  Scheduled publishing
└─────────────────────┘
```

## 📁 Project Structure

```
src/
├── config/
│   └── index.js              # Cấu hình tập trung (.env)
├── db/
│   ├── database.js            # Supabase client
│   └── migrations/
│       └── 001_init_schema.sql # Schema SQL (8 tables)
├── storage/
│   └── cloudflare-r2.js       # Cloudflare R2 client
├── repositories/
│   ├── index.js
│   ├── product.repository.js  # CRUD Products
│   ├── workflow.repository.js # Workflow Jobs + State
│   ├── media.repository.js    # Media Assets + R2
│   ├── script.repository.js   # Kịch bản AI
│   ├── publication.repository.js # Đăng tải
│   └── prompt.repository.js   # Thư viện Prompts
├── services/
│   ├── index.js
│   ├── smart-scraping.service.js    # Playwright + Gemini
│   ├── creative-brain.service.js    # Script Generation
│   ├── media-generation.service.js  # Image/Video/Audio
│   ├── video-editing.service.js     # FFmpeg Assembly
│   ├── distribution.service.js      # Multi-channel Post
│   └── workflow-engine.js           # Pipeline Orchestrator
├── utils/
│   └── helpers.js             # Utilities
├── examples/
│   └── usage.js               # Demo usage
└── index.js                   # Entry point
```

## 🚀 Quick Start

### 1. Cài đặt
```bash
npm install
npx playwright install chromium
```

### 2. Cấu hình `.env`
```bash
cp .env.example .env
# Cập nhật các API keys trong .env
```

### 3. Tạo Database
- Vào [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
- Paste nội dung file `src/db/migrations/001_init_schema.sql`
- Click **Run**

### 4. Tạo Cloudflare R2 Bucket
- Vào [Cloudflare Dashboard](https://dash.cloudflare.com) → R2
- Tạo bucket: `ai-workflow-media`
- Tạo API Token (R2 Read & Write)

### 5. Chạy

```bash
# Test kết nối
npm start

# Chạy full pipeline
node -e "
const { workflowEngine } = require('./src');
workflowEngine.runFullPipeline('https://shopee.vn/product/123', {
  videoStyle: 'cinematic',
  videoDuration: 30,
}).then(console.log).catch(console.error);
"
```

## 📊 Database Schema

| Table | Mô tả |
|-------|--------|
| `products` | Sản phẩm thu thập từ TMĐT |
| `product_images` | Ảnh sản phẩm (lưu trên R2) |
| `workflow_jobs` | Luồng xử lý chính (state machine) |
| `scripts` | Kịch bản AI (versioned) |
| `media_assets` | Tất cả media files (R2) |
| `publications` | Đăng tải đa kênh + analytics |
| `workflow_logs` | Nhật ký từng bước |
| `ai_prompts` | Thư viện prompts AI |

## 🔑 API Keys Cần Thiết

| Service | Lấy ở đâu |
|---------|-----------|
| Supabase | [supabase.com/dashboard](https://supabase.com/dashboard) |
| Cloudflare R2 | [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → API Tokens |
| Gemini API | [aistudio.google.com](https://aistudio.google.com/apikey) |
| ElevenLabs | [elevenlabs.io](https://elevenlabs.io) → Profile → API Keys |
| TikTok API | [developers.tiktok.com](https://developers.tiktok.com) |
| Facebook API | [developers.facebook.com](https://developers.facebook.com) |

## 📝 License

ISC
"# aitudonghoatiktok" 
