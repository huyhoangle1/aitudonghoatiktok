-- ============================================
-- 🗄️ SUPABASE MIGRATION: AI Workflow Automation
-- Version: 1.0.0
-- Date: 2026-02-27
-- ============================================
-- Chạy file này trong Supabase SQL Editor
-- Dashboard → SQL Editor → New query → Paste & Run
-- ============================================

-- ┌──────────────────────────────────────────┐
-- │  1. ENUM TYPES                           │
-- └──────────────────────────────────────────┘

-- Trạng thái tổng thể của workflow job
CREATE TYPE workflow_status AS ENUM (
  'pending',          -- Đang chờ xử lý
  'scraping',         -- Đang thu thập dữ liệu
  'analyzing',        -- AI đang phân tích
  'generating_script',-- Đang tạo kịch bản
  'generating_media', -- Đang tạo media (ảnh/video/audio)
  'editing',          -- Đang lắp ghép video
  'ready_to_publish', -- Sẵn sàng đăng
  'publishing',       -- Đang đăng lên các kênh
  'published',        -- Đã đăng thành công
  'failed',           -- Thất bại
  'cancelled'         -- Đã hủy
);

-- Loại media
CREATE TYPE media_type AS ENUM (
  'image_original',   -- Ảnh gốc từ nguồn
  'image_enhanced',   -- Ảnh đã qua AI enhancement
  'image_generated',  -- Ảnh AI tạo mới (Style Transfer)
  'video_clip',       -- Video clip ngắn từ Veo
  'video_final',      -- Video final đã edit
  'audio_voiceover',  -- Audio voiceover từ ElevenLabs
  'audio_music',      -- Nhạc nền
  'thumbnail'         -- Ảnh thumbnail
);

-- Nền tảng đăng tải
CREATE TYPE platform_type AS ENUM (
  'tiktok',
  'facebook_reels',
  'instagram_reels',
  'youtube_shorts',
  'zalo'
);

-- Trạng thái đăng tải
CREATE TYPE publish_status AS ENUM (
  'pending',
  'uploading',
  'processing',
  'published',
  'scheduled',
  'failed',
  'removed'
);


-- ┌──────────────────────────────────────────┐
-- │  2. CORE TABLES                          │
-- └──────────────────────────────────────────┘

-- ── 2.1 Products (Sản phẩm thu thập) ───────
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Thông tin nguồn
  source_url      TEXT NOT NULL,
  source_platform TEXT,                    -- shopee, lazada, tiktokshop, etc.
  
  -- Thông tin sản phẩm (AI extracted)
  name            TEXT NOT NULL,
  price           DECIMAL(15, 2),
  original_price  DECIMAL(15, 2),          -- Giá gốc (trước giảm)
  currency        TEXT DEFAULT 'VND',
  discount_pct    DECIMAL(5, 2),           -- % giảm giá
  
  -- Mô tả & đặc điểm (AI parsed)
  description     TEXT,
  highlights      JSONB DEFAULT '[]',      -- ["Chống nước IP68", "Pin 5000mAh", ...]
  specifications  JSONB DEFAULT '{}',      -- {"weight": "180g", "screen": "6.7 inch"}
  category        TEXT,
  brand           TEXT,
  rating          DECIMAL(3, 2),
  review_count    INTEGER DEFAULT 0,
  
  -- AI Analysis
  ai_analysis     JSONB DEFAULT '{}',      -- Phân tích AI về sản phẩm
  target_audience TEXT,                    -- Đối tượng mục tiêu AI nhận diện
  selling_points  JSONB DEFAULT '[]',      -- Điểm bán hàng chính AI rút ra
  
  -- Raw data
  raw_html        TEXT,                    -- HTML gốc (backup)
  raw_data        JSONB DEFAULT '{}',      -- Dữ liệu thô từ scraping
  
  -- Metadata
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index cho tìm kiếm nhanh
CREATE INDEX idx_products_source_url ON products(source_url);
CREATE INDEX idx_products_source_platform ON products(source_platform);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_created_at ON products(created_at DESC);


-- ── 2.2 Product Images (Ảnh gốc sản phẩm) ──
CREATE TABLE product_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Ảnh gốc
  original_url    TEXT NOT NULL,           -- URL gốc từ sàn TMĐT
  
  -- Cloudflare R2
  r2_key          TEXT,                    -- Key trên R2: products/{product_id}/{filename}
  r2_url          TEXT,                    -- Public URL trên R2
  
  -- AI Analysis
  quality_score   DECIMAL(3, 2),           -- 0-1, AI đánh giá chất lượng ảnh
  is_best         BOOLEAN DEFAULT FALSE,   -- AI chọn ảnh đẹp nhất
  ai_description  TEXT,                    -- AI mô tả nội dung ảnh
  dominant_colors JSONB DEFAULT '[]',      -- Màu chủ đạo ["#FF5733", "#2E86C1"]
  
  -- Metadata
  width           INTEGER,
  height          INTEGER,
  file_size       INTEGER,                 -- bytes
  mime_type       TEXT DEFAULT 'image/jpeg',
  sort_order      INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_product_images_best ON product_images(product_id) WHERE is_best = TRUE;


-- ── 2.3 Workflow Jobs (Luồng xử lý chính) ──
CREATE TABLE workflow_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Job info
  title           TEXT NOT NULL,
  status          workflow_status DEFAULT 'pending',
  priority        INTEGER DEFAULT 5,       -- 1 (cao nhất) -> 10 (thấp nhất)
  
  -- Configuration
  config          JSONB DEFAULT '{}'::jsonb,
  -- Ví dụ config:
  -- {
  --   "video_style": "cinematic",
  --   "video_duration": 30,
  --   "aspect_ratio": "9:16",
  --   "voice_id": "elevenlabs_voice_id",
  --   "music_style": "upbeat",
  --   "target_platforms": ["tiktok", "instagram_reels"],
  --   "language": "vi",
  --   "tone": "enthusiastic"
  -- }
  
  -- Progress tracking
  current_step    TEXT,                    -- Bước hiện tại đang chạy
  progress_pct    INTEGER DEFAULT 0,       -- 0-100
  steps_completed JSONB DEFAULT '[]',      -- ["scraping", "analyzing", ...]
  
  -- Error handling
  error_message   TEXT,
  error_details   JSONB,
  retry_count     INTEGER DEFAULT 0,
  max_retries     INTEGER DEFAULT 3,
  
  -- Timing
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  estimated_duration INTEGER,              -- seconds
  
  -- Metadata
  created_by      UUID,                    -- User ID (nếu có auth)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_jobs_status ON workflow_jobs(status);
CREATE INDEX idx_workflow_jobs_product ON workflow_jobs(product_id);
CREATE INDEX idx_workflow_jobs_priority ON workflow_jobs(priority, created_at);
CREATE INDEX idx_workflow_jobs_created_at ON workflow_jobs(created_at DESC);


-- ── 2.4 Scripts (Kịch bản AI) ───────────────
CREATE TABLE scripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES workflow_jobs(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Kịch bản tổng thể
  title           TEXT,
  hook            TEXT,                    -- Câu hook mở đầu
  narrative       TEXT,                    -- Toàn bộ kịch bản dạng text
  
  -- Kịch bản chi tiết theo timeline
  -- Mỗi scene: { 
  --   "timestamp": 5, 
  --   "duration": 3,
  --   "visual": "Ảnh sản phẩm hiện ra từ bên trái",
  --   "voiceover": "Tính năng chống nước IP68...",
  --   "text_overlay": "CHỐNG NƯỚC IP68",
  --   "motion": "slide_in_left",
  --   "transition": "fade",
  --   "media_ref": "product_image_1"
  -- }
  scenes          JSONB DEFAULT '[]',
  
  -- Thông tin thêm
  total_duration  INTEGER,                 -- Tổng thời lượng (seconds)
  word_count      INTEGER,
  hashtags        JSONB DEFAULT '[]',      -- ["#review", "#tech", "#muangay"]
  cta_text        TEXT,                    -- Call to action: "Link mua ở bio!"
  
  -- AI metadata
  model_used      TEXT,                    -- Model nào tạo kịch bản
  prompt_used     TEXT,                    -- Prompt đã dùng
  generation_time INTEGER,                 -- ms
  version         INTEGER DEFAULT 1,       -- Version kịch bản
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scripts_job ON scripts(job_id);
CREATE INDEX idx_scripts_product ON scripts(product_id);


-- ── 2.5 Media Assets (Tất cả media files) ───
CREATE TABLE media_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES workflow_jobs(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- File info
  type            media_type NOT NULL,
  filename        TEXT NOT NULL,
  mime_type       TEXT,
  file_size       INTEGER,                 -- bytes
  
  -- Cloudflare R2 Storage
  r2_key          TEXT NOT NULL,           -- Key trên R2
  r2_url          TEXT,                    -- Public URL
  r2_bucket       TEXT,                    -- Bucket name
  
  -- Dimensions (cho ảnh/video)
  width           INTEGER,
  height          INTEGER,
  duration        DECIMAL(10, 2),          -- seconds (cho video/audio)
  aspect_ratio    TEXT,                    -- "9:16", "16:9", "1:1"
  
  -- AI Generation metadata
  ai_model        TEXT,                    -- Model nào tạo ra
  ai_prompt       TEXT,                    -- Prompt đã dùng
  ai_params       JSONB DEFAULT '{}',      -- Tham số generation
  generation_time INTEGER,                 -- ms
  
  -- Chất lượng
  quality_score   DECIMAL(3, 2),           -- 0-1
  is_selected     BOOLEAN DEFAULT FALSE,   -- Được chọn để dùng trong final video
  
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_assets_job ON media_assets(job_id);
CREATE INDEX idx_media_assets_product ON media_assets(product_id);
CREATE INDEX idx_media_assets_type ON media_assets(type);
CREATE INDEX idx_media_assets_r2_key ON media_assets(r2_key);
CREATE INDEX idx_media_assets_selected ON media_assets(job_id) WHERE is_selected = TRUE;


-- ── 2.6 Publications (Đăng tải đa kênh) ────
CREATE TABLE publications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES workflow_jobs(id) ON DELETE CASCADE,
  media_asset_id  UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  
  -- Platform info
  platform        platform_type NOT NULL,
  status          publish_status DEFAULT 'pending',
  
  -- Nội dung đăng
  caption         TEXT,
  hashtags        JSONB DEFAULT '[]',
  
  -- Platform response
  platform_post_id TEXT,                   -- ID bài đăng trên platform
  platform_url    TEXT,                    -- URL bài đăng
  platform_response JSONB DEFAULT '{}',   -- Raw response từ API
  
  -- Lên lịch
  scheduled_at    TIMESTAMPTZ,             -- Thời gian lên lịch đăng
  published_at    TIMESTAMPTZ,             -- Thời gian đăng thực tế
  
  -- Analytics (cập nhật sau)
  views           INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5, 4),           -- Tỷ lệ tương tác
  
  -- Error
  error_message   TEXT,
  retry_count     INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_publications_job ON publications(job_id);
CREATE INDEX idx_publications_platform ON publications(platform);
CREATE INDEX idx_publications_status ON publications(status);
CREATE INDEX idx_publications_scheduled ON publications(scheduled_at) WHERE status = 'scheduled';


-- ── 2.7 Workflow Logs (Nhật ký từng bước) ───
CREATE TABLE workflow_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES workflow_jobs(id) ON DELETE CASCADE,
  
  -- Log info
  step            TEXT NOT NULL,            -- "scraping", "analyzing", "image_gen", ...
  level           TEXT DEFAULT 'info',      -- "info", "warn", "error", "debug"
  message         TEXT NOT NULL,
  
  -- Chi tiết
  details         JSONB DEFAULT '{}',
  duration_ms     INTEGER,                 -- Thời gian xử lý bước này
  
  -- Metadata
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_logs_job ON workflow_logs(job_id);
CREATE INDEX idx_workflow_logs_step ON workflow_logs(step);
CREATE INDEX idx_workflow_logs_level ON workflow_logs(level);
CREATE INDEX idx_workflow_logs_created_at ON workflow_logs(created_at DESC);


-- ── 2.8 AI Prompts Library (Thư viện prompts) ──
CREATE TABLE ai_prompts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Prompt info
  name            TEXT NOT NULL UNIQUE,
  category        TEXT NOT NULL,           -- "scraping", "script", "image_gen", "video_gen"
  description     TEXT,
  
  -- Prompt template
  template        TEXT NOT NULL,           -- Prompt với {{placeholders}}
  variables       JSONB DEFAULT '[]',      -- ["product_name", "features", ...]
  
  -- Config
  model           TEXT,                    -- Model khuyến nghị
  temperature     DECIMAL(3, 2) DEFAULT 0.7,
  max_tokens      INTEGER,
  
  -- Tracking
  usage_count     INTEGER DEFAULT 0,
  avg_quality     DECIMAL(3, 2),           -- Rating trung bình output
  is_active       BOOLEAN DEFAULT TRUE,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_prompts_category ON ai_prompts(category);
CREATE INDEX idx_ai_prompts_active ON ai_prompts(is_active) WHERE is_active = TRUE;


-- ┌──────────────────────────────────────────┐
-- │  3. FUNCTIONS & TRIGGERS                 │
-- └──────────────────────────────────────────┘

-- ── Auto-update updated_at ──────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger cho tất cả tables có updated_at
CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_workflow_jobs_updated
  BEFORE UPDATE ON workflow_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_scripts_updated
  BEFORE UPDATE ON scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_publications_updated
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ai_prompts_updated
  BEFORE UPDATE ON ai_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── Function: Cập nhật workflow status ──────
CREATE OR REPLACE FUNCTION update_workflow_progress(
  p_job_id UUID,
  p_status workflow_status,
  p_step TEXT,
  p_progress INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE workflow_jobs
  SET 
    status = p_status,
    current_step = p_step,
    progress_pct = COALESCE(p_progress, progress_pct),
    steps_completed = CASE 
      WHEN p_step IS NOT NULL AND NOT (steps_completed ? p_step)
      THEN steps_completed || to_jsonb(p_step)
      ELSE steps_completed
    END,
    started_at = CASE 
      WHEN started_at IS NULL AND p_status != 'pending' 
      THEN NOW() 
      ELSE started_at 
    END,
    completed_at = CASE 
      WHEN p_status IN ('published', 'failed', 'cancelled') 
      THEN NOW() 
      ELSE completed_at 
    END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;


-- ── Function: Thống kê Dashboard ────────────
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_jobs', (SELECT COUNT(*) FROM workflow_jobs),
    'active_jobs', (SELECT COUNT(*) FROM workflow_jobs WHERE status NOT IN ('published', 'failed', 'cancelled')),
    'published_today', (SELECT COUNT(*) FROM workflow_jobs WHERE status = 'published' AND completed_at >= CURRENT_DATE),
    'failed_jobs', (SELECT COUNT(*) FROM workflow_jobs WHERE status = 'failed'),
    'total_products', (SELECT COUNT(*) FROM products),
    'total_publications', (SELECT COUNT(*) FROM publications WHERE status = 'published'),
    'total_views', (SELECT COALESCE(SUM(views), 0) FROM publications),
    'total_likes', (SELECT COALESCE(SUM(likes), 0) FROM publications),
    'avg_engagement', (SELECT COALESCE(AVG(engagement_rate), 0) FROM publications WHERE engagement_rate IS NOT NULL),
    'media_count', (SELECT COUNT(*) FROM media_assets),
    'status_breakdown', (
      SELECT jsonb_object_agg(status, cnt)
      FROM (SELECT status, COUNT(*) as cnt FROM workflow_jobs GROUP BY status) s
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;


-- ── Function: Lấy jobs cần xử lý tiếp ──────
CREATE OR REPLACE FUNCTION get_pending_jobs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF workflow_jobs AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM workflow_jobs
    WHERE status NOT IN ('published', 'failed', 'cancelled')
    ORDER BY priority ASC, created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- ┌──────────────────────────────────────────┐
-- │  4. ROW LEVEL SECURITY (RLS)             │
-- └──────────────────────────────────────────┘

-- Enable RLS trên tất cả tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

-- Policy: Service role có thể đọc/ghi tất cả (Backend)
-- Supabase service_role key tự động bypass RLS

-- Policy: Anon/Authenticated users chỉ đọc
CREATE POLICY "Allow read for authenticated" ON products
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read for authenticated" ON product_images
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read for authenticated" ON workflow_jobs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read for authenticated" ON scripts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read for authenticated" ON media_assets
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read for authenticated" ON publications
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read for authenticated" ON workflow_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read for authenticated" ON ai_prompts
  FOR SELECT USING (auth.role() = 'authenticated');


-- ┌──────────────────────────────────────────┐
-- │  5. SEED DATA: Default AI Prompts        │
-- └──────────────────────────────────────────┘

INSERT INTO ai_prompts (name, category, description, template, variables, model, temperature) VALUES

('smart_scraper_analyzer', 'scraping', 
 'Phân tích HTML để trích xuất thông tin sản phẩm',
 'Bạn là AI chuyên phân tích trang web thương mại điện tử. Hãy phân tích HTML sau và trích xuất thông tin sản phẩm:

HTML: {{html_content}}

Trả về JSON với các trường:
- name: Tên sản phẩm
- price: Giá bán (số)
- original_price: Giá gốc (số, nếu có)
- description: Mô tả ngắn
- highlights: Mảng các điểm nổi bật
- specifications: Object các thông số kỹ thuật
- category: Danh mục
- brand: Thương hiệu
- image_urls: Mảng URL ảnh sản phẩm',
 '["html_content"]',
 'gemini-2.0-flash', 0.3),

('creative_script_generator', 'script',
 'Tạo kịch bản video review sản phẩm',
 'Bạn là chuyên gia sáng tạo nội dung video ngắn cho TikTok/Reels.

THÔNG TIN SẢN PHẨM:
- Tên: {{product_name}}
- Giá: {{price}}
- Điểm nổi bật: {{highlights}}
- Đối tượng: {{target_audience}}

YÊU CẦU:
- Tạo video {{duration}} giây, tỷ lệ 9:16 (dọc)
- Phong cách: {{style}} 
- Giọng điệu: {{tone}}
- Phải có hook mạnh trong 3 giây đầu

Trả về JSON với cấu trúc:
{
  "title": "Tiêu đề video",
  "hook": "Câu hook mở đầu",
  "scenes": [
    {
      "timestamp": 0,
      "duration": 3,
      "visual": "Mô tả hình ảnh/video",
      "voiceover": "Lời thoại",
      "text_overlay": "Text hiện trên màn hình",
      "motion": "Hiệu ứng chuyển động",
      "transition": "Kiểu chuyển cảnh"
    }
  ],
  "hashtags": ["#tag1", "#tag2"],
  "cta": "Call to action"
}',
 '["product_name", "price", "highlights", "target_audience", "duration", "style", "tone"]',
 'gemini-2.5-pro-preview', 0.8),

('image_style_transfer', 'image_gen',
 'Tạo ảnh sản phẩm với bối cảnh sang trọng',
 'Tạo ảnh quảng cáo chuyên nghiệp cho sản phẩm {{product_name}}.

MÔ TẢ SẢN PHẨM: {{product_description}}

PHONG CÁCH: {{style}}
- Bối cảnh sang trọng, ánh sáng studio chuyên nghiệp
- Tỷ lệ 9:16 (1080x1920)
- Phong cách: {{visual_style}}
- Màu chủ đạo: {{color_scheme}}

Sản phẩm phải là trung tâm, nổi bật và hấp dẫn.',
 '["product_name", "product_description", "style", "visual_style", "color_scheme"]',
 'gemini-2.0-flash', 0.9),

('video_scene_prompt', 'video_gen',
 'Tạo prompt cho Veo video generation',
 'Tạo video quảng cáo sản phẩm {{product_name}}.

CẢNH: {{scene_description}}
THỜI LƯỢNG: {{duration}} giây
GÓC QUAY: {{camera_angle}}
HIỆU ỨNG: {{effects}}
PHONG CÁCH: Cinematic, chuyên nghiệp, ánh sáng đẹp

Video phải mượt mà, chất lượng cao, phù hợp cho TikTok/Reels.',
 '["product_name", "scene_description", "duration", "camera_angle", "effects"]',
 'veo-2', 0.7);


-- ┌──────────────────────────────────────────┐
-- │  6. VIEWS (Tiện truy vấn)                │
-- └──────────────────────────────────────────┘

-- View: Dashboard tổng hợp workflow
CREATE OR REPLACE VIEW v_workflow_dashboard AS
SELECT 
  wj.id,
  wj.title,
  wj.status,
  wj.priority,
  wj.progress_pct,
  wj.current_step,
  wj.created_at,
  wj.started_at,
  wj.completed_at,
  p.name as product_name,
  p.source_platform,
  p.price as product_price,
  (SELECT COUNT(*) FROM media_assets ma WHERE ma.job_id = wj.id) as media_count,
  (SELECT COUNT(*) FROM publications pub WHERE pub.job_id = wj.id) as publication_count,
  (SELECT COUNT(*) FROM publications pub WHERE pub.job_id = wj.id AND pub.status = 'published') as published_count
FROM workflow_jobs wj
LEFT JOIN products p ON wj.product_id = p.id
ORDER BY wj.priority ASC, wj.created_at DESC;

-- View: Analytics tổng hợp theo platform
CREATE OR REPLACE VIEW v_platform_analytics AS
SELECT
  platform,
  COUNT(*) as total_posts,
  COUNT(*) FILTER (WHERE status = 'published') as published,
  COALESCE(SUM(views), 0) as total_views,
  COALESCE(SUM(likes), 0) as total_likes,
  COALESCE(SUM(comments), 0) as total_comments,
  COALESCE(SUM(shares), 0) as total_shares,
  COALESCE(AVG(engagement_rate), 0) as avg_engagement
FROM publications
GROUP BY platform;


-- ✅ Migration hoàn tất!
-- Kiểm tra: SELECT * FROM get_dashboard_stats();
