/**
 * ============================================
 * 🧪 Full Pipeline Example
 * Chạy: node src/examples/usage.js
 * ============================================
 */

const {
    initialize,
    workflowEngine,
    workflowRepository,
    publicationRepository,
} = require('../index');

async function main() {
    await initialize();

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  🚀 FULL PIPELINE DEMO               ║');
    console.log('╚══════════════════════════════════════╝\n');

    // ═══════════════════════════════════════════
    // OPTION 1: Chạy full pipeline từ 1 URL
    // ═══════════════════════════════════════════
    console.log('📌 OPTION 1: Single URL Pipeline\n');
    console.log('// Uncomment và chạy khi đã config .env:\n');
    console.log(`
  const result = await workflowEngine.runFullPipeline(
    'https://shopee.vn/product/123456',
    {
      videoStyle: 'cinematic',      // cinematic, funny, unboxing, comparison
      videoDuration: 30,            // seconds
      language: 'vi',
      tone: 'enthusiastic',
      platforms: ['tiktok', 'instagram_reels'],
      useVeo: false,                // true = dùng Veo tạo video
      autoPublish: false,           // true = tự động đăng
    }
  );
  console.log(result);
  `);

    // ═══════════════════════════════════════════
    // OPTION 2: Batch pipeline nhiều URLs
    // ═══════════════════════════════════════════
    console.log('\n📌 OPTION 2: Batch Pipeline\n');
    console.log(`
  const results = await workflowEngine.runBatch([
    'https://shopee.vn/product/111',
    'https://lazada.vn/product/222',
    'https://tiki.vn/product/333',
  ], {
    videoStyle: 'cinematic',
    videoDuration: 30,
    delayBetween: 10000,   // 10s delay giữa các jobs
    autoPublish: false,
  });
  console.log(results);
  `);

    // ═══════════════════════════════════════════
    // OPTION 3: Dashboard Stats
    // ═══════════════════════════════════════════
    console.log('\n📌 OPTION 3: Dashboard\n');
    try {
        const stats = await workflowRepository.getStats();
        console.log('📊 Dashboard Stats:', JSON.stringify(stats, null, 2));

        const analytics = await publicationRepository.getPlatformAnalytics();
        console.log('\n📈 Platform Analytics:', JSON.stringify(analytics, null, 2));
    } catch (err) {
        console.log(`   ⚠️ ${err.message}`);
        console.log('   → Hãy chạy migration SQL trước.\n');
    }

    // ═══════════════════════════════════════════
    // OPTION 4: Queue Processor (chạy liên tục)
    // ═══════════════════════════════════════════
    console.log('\n📌 OPTION 4: Queue Processor (continuous)\n');
    console.log(`
  // Không dừng, chạy liên tục xử lý pending jobs
  await workflowEngine.startQueueProcessor({
    pollInterval: 10000,   // Poll mỗi 10s
    batchSize: 5,          // Xử lý 5 jobs mỗi lần
  });
  `);

    console.log('\n══════════════════════════════════════');
    console.log('✅ Xem code ví dụ ở trên!');
    console.log('══════════════════════════════════════\n');
}

main().catch(console.error);
