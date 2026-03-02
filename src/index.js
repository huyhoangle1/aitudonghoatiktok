/**
 * ============================================
 * 🚀 AI Workflow Automation - Entry Point
 * Kiểm tra kết nối & export modules
 * ============================================
 */

const config = require('./config');
const { supabase, supabaseAdmin, testConnection } = require('./db/database');
const r2 = require('./storage/cloudflare-r2');
const repositories = require('./repositories');
const services = require('./services');

/**
 * Khởi tạo hệ thống
 */
async function initialize() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  🤖 AI Workflow Automation System v1.0              ║');
    console.log('║  Supabase + Cloudflare R2 + Gemini + Veo + 11Labs  ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    // Test Supabase
    console.log('🔌 Kiểm tra kết nối Supabase...');
    const dbOk = await testConnection();

    // Test R2
    console.log('☁️  Kiểm tra Cloudflare R2...');
    try {
        await r2.listFiles('', 1);
        console.log('✅ Cloudflare R2 kết nối thành công!');
    } catch (err) {
        console.warn('⚠️  Cloudflare R2 chưa kết nối:', err.message);
    }

    console.log('');
    console.log('📦 Repositories:');
    console.log('   ├── productRepository     → Sản phẩm');
    console.log('   ├── workflowRepository    → Workflow Jobs');
    console.log('   ├── mediaRepository       → Media Assets (R2)');
    console.log('   ├── scriptRepository      → Kịch bản AI');
    console.log('   ├── publicationRepository → Đăng tải đa kênh');
    console.log('   └── promptRepository      → Thư viện Prompts');
    console.log('');
    console.log('⚙️  Services:');
    console.log('   ├── smartScraping    → Playwright + Gemini Flash');
    console.log('   ├── creativeBrain   → Gemini Pro Multimodal');
    console.log('   ├── mediaGeneration → Image Gen + Veo + 11Labs');
    console.log('   ├── videoEditing    → FFmpeg / Shotstack');
    console.log('   ├── distribution    → TikTok + FB + IG APIs');
    console.log('   └── workflowEngine  → Pipeline Orchestrator');
    console.log('');

    return { dbOk };
}

// ── Export ────────────────────────────────────
module.exports = {
    config,
    supabase,
    supabaseAdmin,
    testConnection,
    r2,
    ...repositories,
    ...services,
    initialize,
};

// Auto-run nếu chạy trực tiếp
if (require.main === module) {
    initialize()
        .then((result) => {
            console.log('🎉 Hệ thống sẵn sàng!', result);
        })
        .catch((err) => {
            console.error('❌ Lỗi khởi tạo:', err.message);
            process.exit(1);
        });
}
