/**
 * ============================================
 * 🔧 Application Configuration
 * Tập trung toàn bộ cấu hình từ .env
 * ============================================
 */

require('dotenv').config();

const config = {
    // ── Supabase ─────────────────────────────────
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },

    // ── Cloudflare R2 (S3-Compatible) ────────────
    cloudflare: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        r2: {
            accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'ai-workflow-media',
            publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL,
            // Cloudflare R2 S3-Compatible endpoint
            get endpoint() {
                return `https://${config.cloudflare.accountId}.r2.cloudflarestorage.com`;
            },
        },
    },

    // ── AI Services ──────────────────────────────
    ai: {
        gemini: {
            apiKey: process.env.GEMINI_API_KEY,
            models: {
                flash: 'gemini-2.5-flash',        // Newest Stable Flash (Available)
                pro: 'gemini-2.5-pro',            // Newest Stable Pro (Available)
                imageGen: 'imagen-4.0-fast-generate-001', // Newest Imagen 4 (Available)
            },
        },
        elevenlabs: {
            apiKey: process.env.ELEVENLABS_API_KEY,
            voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
        },
        veo: {
            // Veo (Google Video Gen) - sử dụng qua Vertex AI
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        },
    },

    // ── Social Media APIs ────────────────────────
    social: {
        tiktok: {
            clientKey: process.env.TIKTOK_CLIENT_KEY,
            clientSecret: process.env.TIKTOK_CLIENT_SECRET,
        },
        facebook: {
            appId: process.env.FACEBOOK_APP_ID,
            appSecret: process.env.FACEBOOK_APP_SECRET,
        },
        instagram: {
            accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
        },
    },

    // ── Application ──────────────────────────────
    app: {
        env: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT, 10) || 3000,
        isDev: process.env.NODE_ENV !== 'production',
    },
};

/**
 * Validate các config bắt buộc
 */
function validateConfig() {
    const required = [
        ['SUPABASE_URL', config.supabase.url],
        ['SUPABASE_ANON_KEY', config.supabase.anonKey],
        ['CLOUDFLARE_ACCOUNT_ID', config.cloudflare.accountId],
        ['CLOUDFLARE_R2_ACCESS_KEY_ID', config.cloudflare.r2.accessKeyId],
        ['CLOUDFLARE_R2_SECRET_ACCESS_KEY', config.cloudflare.r2.secretAccessKey],
    ];

    const missing = required.filter(([name, value]) => !value);

    if (missing.length > 0) {
        console.warn(
            `⚠️  Missing config: ${missing.map(([n]) => n).join(', ')}\n` +
            `   → Hãy cập nhật file .env theo .env.example`
        );
    }
}

validateConfig();

module.exports = config;
