/**
 * ============================================
 * 🌐 HTTP Server + Dashboard + API
 * Giữ app chạy liên tục, phục vụ dashboard & API
 * ============================================
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');
const { testConnection } = require('./db/database');
const r2 = require('./storage/cloudflare-r2');
const repositories = require('./repositories');
const services = require('./services');

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve Dashboard (static files) ─────────
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));

// ── API Routes ─────────────────────────────

// Health check
app.get('/api/health', async (req, res) => {
    const dbOk = await testConnection();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        supabase: dbOk,
        uptime: process.uptime(),
    });
});

// Dashboard stats (with fallback)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await repositories.workflowRepository.getStats();
        res.json(stats);
    } catch (err) {
        // Fallback: tính stats từ bảng trực tiếp
        try {
            const { supabaseAdmin } = require('./db/database');
            const { data: allJobs } = await supabaseAdmin.from('workflow_jobs').select('status', { count: 'exact' });
            const jobs = allJobs || [];
            const breakdown = {};
            jobs.forEach(j => { breakdown[j.status] = (breakdown[j.status] || 0) + 1; });
            res.json({
                total_jobs: jobs.length,
                active_jobs: jobs.filter(j => !['published', 'failed', 'cancelled', 'pending'].includes(j.status)).length,
                published_today: jobs.filter(j => j.status === 'published').length,
                total_views: 0,
                total_likes: 0,
                media_count: 0,
                status_breakdown: breakdown,
            });
        } catch (e2) {
            res.json({ total_jobs: 0, active_jobs: 0, published_today: 0, total_views: 0, total_likes: 0, media_count: 0, status_breakdown: {} });
        }
    }
});

// ── Workflow Jobs CRUD ──────────────────────

// List jobs (with fallback)
app.get('/api/jobs', async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const result = await repositories.workflowRepository.list({
            page: parseInt(page),
            limit: parseInt(limit),
            status: status || null,
        });
        res.json(result);
    } catch (err) {
        // Fallback: query directly
        try {
            const { supabaseAdmin } = require('./db/database');
            let query = supabaseAdmin.from('workflow_jobs').select('*').order('created_at', { ascending: false }).limit(parseInt(req.query.limit) || 50);
            if (req.query.status) query = query.eq('status', req.query.status);
            const { data } = await query;
            res.json({ data: data || [] });
        } catch (e2) {
            res.json({ data: [] });
        }
    }
});

// Get job by ID
app.get('/api/jobs/:id', async (req, res) => {
    try {
        const job = await repositories.workflowRepository.findById(req.params.id);
        res.json(job);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get job logs
app.get('/api/jobs/:id/logs', async (req, res) => {
    try {
        const logs = await repositories.workflowRepository.getLogs(req.params.id);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get job media assets
app.get('/api/jobs/:id/media', async (req, res) => {
    try {
        const media = await repositories.mediaRepository.findByJobId(req.params.id);
        res.json(media || []);
    } catch (err) {
        res.json([]);
    }
});
// ── Media Assets ────────────────────────────

app.get('/api/media', async (req, res) => {
    try {
        const { type } = req.query;
        const { supabaseAdmin } = require('./db/database');
        let query = supabaseAdmin.from('media_assets').select('*').order('created_at', { ascending: false }).limit(100);
        if (type) query = query.like('type', `${type}%`);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.json([]);
    }
});

/**
 * 🧪 AI Labs: Text-to-Image
 */
app.post('/api/ai/generate-image', async (req, res) => {
    try {
        const { prompt, jobId, productId } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const asset = await services.mediaGeneration.generateImage(
            jobId || 'lab-gen',
            productId || null,
            prompt,
            { type: 'image_lab_generated' }
        );
        res.json(asset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 🧪 AI Labs: Image-to-Image (Style Transfer / Edit)
 */
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/ai/edit-image', upload.single('image'), async (req, res) => {
    try {
        const { prompt, jobId, productId } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Image file is required' });
        if (!prompt) return res.status(400).json({ error: 'Edit prompt is required' });

        // 1. Upload ảnh gốc lên R2 trước
        const r2 = require('./storage/cloudflare-r2');
        const filename = `ref_${Date.now()}_${file.originalname}`;
        const uploadResult = await r2.uploadImage(file.buffer, filename, file.mimetype);

        // 2. Gọi Style Transfer
        const asset = await services.mediaGeneration.styleTransfer(
            jobId || 'lab-edit',
            productId || null,
            uploadResult.key,
            prompt
        );

        res.json({
            original: uploadResult.url,
            edited: asset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Pipeline Trigger ────────────────────────

// Chạy full pipeline từ URL
app.post('/api/pipeline/run', async (req, res) => {
    try {
        const { url, options = {} } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        // Tạo job record ngay để dashboard hiện liền
        let jobId = null;
        try {
            const { supabaseAdmin } = require('./db/database');
            const { data: jobRecord } = await supabaseAdmin.from('workflow_jobs').insert({
                title: `Pipeline: ${url.substring(0, 120)}`,
                status: 'scraping',
                config: {
                    source_url: url,
                    video_style: options.videoStyle || 'cinematic',
                    video_duration: options.videoDuration || 30,
                    target_platforms: options.platforms || ['tiktok'],
                    use_veo: options.useVeo || false,
                },
                priority: 5,
                current_step: 'scraping',
                progress_pct: 5,
            }).select().single();
            jobId = jobRecord?.id;
            console.log('📋 Job created:', jobId);
        } catch (e) {
            console.warn('⚠️ Could not pre-create job:', e.message);
        }

        // Response ngay cho dashboard
        res.json({
            message: '🚀 Pipeline started!',
            jobId,
            url,
            status: 'processing',
        });

        // Fire-and-forget pipeline (truyền jobId để pipeline cập nhật job này)
        console.log('🚀 Starting pipeline for:', url);
        services.workflowEngine.runFullPipeline(url, { ...options, existingJobId: jobId }).catch((err) => {
            console.error('❌ Pipeline error:', err.message);
            // Cập nhật job thành failed nếu có jobId
            if (jobId) {
                const { supabaseAdmin } = require('./db/database');
                supabaseAdmin.from('workflow_jobs').update({
                    status: 'failed',
                    error_message: err.message,
                    progress_pct: 0,
                    completed_at: new Date().toISOString(),
                }).eq('id', jobId).then(() => {
                    console.log('🔴 Job marked as failed:', jobId);
                });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Retry job
app.post('/api/jobs/:id/retry', async (req, res) => {
    try {
        const result = await repositories.workflowRepository.retry(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel job
app.post('/api/jobs/:id/cancel', async (req, res) => {
    try {
        const { supabaseAdmin } = require('./db/database');
        const { data, error } = await supabaseAdmin.from('workflow_jobs').update({
            status: 'cancelled',
            error_message: 'Cancelled by user',
            completed_at: new Date().toISOString(),
        }).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Publish job
app.post('/api/jobs/:id/publish', async (req, res) => {
    try {
        const jobId = req.params.id;
        await repositories.workflowRepository.updateStatus(jobId, 'publishing', 'publishing', 92);

        // Lấy thông tin job
        const { supabaseAdmin } = require('./db/database');
        const { data: job } = await supabaseAdmin.from('workflow_jobs')
            .select('*, products(*)')
            .eq('id', jobId).single();

        // Tìm final video asset
        const media = await repositories.mediaRepository.findByJobId(jobId);
        const finalVideo = media.find(m => m.type === 'video_final');
        const anyVideo = media.find(m => m.type?.includes('video'));
        const anyAsset = finalVideo || anyVideo || media[0];

        if (!anyAsset || !anyAsset.r2_url) {
            await repositories.workflowRepository.addLog(jobId, 'publishing', 'error',
                'Không tìm thấy video/media để publish. Hãy chạy lại pipeline.'
            );
            await repositories.workflowRepository.updateStatus(jobId, 'ready_to_publish', 'ready', 90);
            return res.status(400).json({
                error: 'Không có video để publish. Cần tạo media trước.',
                mediaCount: media.length,
                mediaTypes: media.map(m => m.type),
            });
        }

        // Log thông tin publish
        await repositories.workflowRepository.addLog(jobId, 'publishing', 'info',
            `Đang publish asset: ${anyAsset.type} (${anyAsset.r2_url?.substring(0, 80)}...)`
        );

        // Fire-and-forget publish
        res.json({
            status: 'publishing',
            asset: { id: anyAsset.id, type: anyAsset.type, url: anyAsset.r2_url },
        });

        // Gọi distribution service trong background
        try {
            const platforms = job?.config?.target_platforms || ['tiktok'];
            await services.distribution.publishToAll(jobId, anyAsset.id, {
                platforms,
                caption: job?.products?.name || job?.title || '',
                hashtags: [],
            });
            await repositories.workflowRepository.updateStatus(jobId, 'published', 'published', 100);
            await repositories.workflowRepository.addLog(jobId, 'published', 'info', 'Publish hoàn thành!');
        } catch (pubErr) {
            console.error('❌ Publish error:', pubErr.message);
            await repositories.workflowRepository.addLog(jobId, 'publishing', 'error',
                `Publish failed: ${pubErr.message}`
            );
            await repositories.workflowRepository.updateStatus(jobId, 'ready_to_publish', 'ready', 90);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete job
app.delete('/api/jobs/:id', async (req, res) => {
    try {
        const result = await repositories.workflowRepository.delete(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pipeline History - lấy toàn bộ lịch sử quy trình
app.get('/api/pipeline-history', async (req, res) => {
    try {
        const { page = 1, limit = 50, status } = req.query;
        const result = await repositories.workflowRepository.list({
            page: parseInt(page),
            limit: parseInt(limit),
            status: status || null,
        });
        // Nếu có data, lấy thêm logs cho mỗi job
        const jobsWithLogs = await Promise.all(
            (result.data || []).map(async (job) => {
                try {
                    const logs = await repositories.workflowRepository.getLogs(job.id, { limit: 100 });
                    return { ...job, logs: logs || [] };
                } catch (e) {
                    return { ...job, logs: [] };
                }
            })
        );
        res.json({ ...result, data: jobsWithLogs });
    } catch (err) {
        // Fallback
        try {
            const { supabaseAdmin } = require('./db/database');
            let query = supabaseAdmin.from('workflow_jobs').select('*').order('created_at', { ascending: false }).limit(50);
            if (req.query.status) query = query.eq('status', req.query.status);
            const { data } = await query;
            res.json({ data: data || [] });
        } catch (e2) {
            res.json({ data: [] });
        }
    }
});

// Batch pipeline
app.post('/api/pipeline/batch', async (req, res) => {
    try {
        const { urls, options = {} } = req.body;
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({ error: 'urls array is required' });
        }

        res.json({
            message: `🚀 Batch pipeline started: ${urls.length} URLs`,
            urls,
            status: 'processing',
        });

        services.workflowEngine.runBatch(urls, options).catch((err) => {
            console.error('❌ Batch error:', err.message);
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Products ────────────────────────────────

app.get('/api/products', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const result = await repositories.productRepository.list({
            page: parseInt(page),
            limit: parseInt(limit),
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Publications / Analytics ────────────────

app.get('/api/analytics', async (req, res) => {
    try {
        const analytics = await repositories.publicationRepository.getPlatformAnalytics();
        res.json(analytics);
    } catch (err) {
        // Fallback: empty analytics
        res.json([]);
    }
});

app.get('/api/publications/top', async (req, res) => {
    try {
        const top = await repositories.publicationRepository.getTopPosts(10);
        res.json(top);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Redirect root → dashboard ───────────────
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// ── Start Server ────────────────────────────
const http = require('http');

async function startServer() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  🤖 AI Workflow Automation System v1.0              ║');
    console.log('║  Supabase + Cloudflare R2 + Gemini + Veo + 11Labs  ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    // Test connections
    console.log('🔌 Kiểm tra kết nối Supabase...');
    await testConnection();

    console.log('☁️  Kiểm tra Cloudflare R2...');
    try {
        await r2.listFiles('', 1);
        console.log('✅ Cloudflare R2 kết nối thành công!');
    } catch (err) {
        console.warn('⚠️  Cloudflare R2:', err.message);
    }

    // Start HTTP server (dùng http.createServer để đảm bảo process không tắt)
    const port = config.app.port;
    const server = http.createServer(app);

    server.listen(port, () => {
        console.log('');
        console.log(`🌐 Server đang chạy tại:`);
        console.log(`   → http://localhost:${port}           (API)`);
        console.log(`   → http://localhost:${port}/dashboard  (Dashboard UI)`);
        console.log('');
        console.log('📡 API Endpoints:');
        console.log('   GET  /api/health          → Health check');
        console.log('   GET  /api/stats           → Dashboard stats');
        console.log('   GET  /api/jobs            → List jobs');
        console.log('   GET  /api/jobs/:id        → Job detail');
        console.log('   GET  /api/jobs/:id/logs   → Job logs');
        console.log('   POST /api/pipeline/run    → Run pipeline {url, options}');
        console.log('   POST /api/pipeline/batch  → Batch pipeline {urls, options}');
        console.log('   GET  /api/products        → List products');
        console.log('   GET  /api/analytics       → Platform analytics');
        console.log('');
        console.log('⏳ Server đang chạy... Nhấn Ctrl+C để dừng.');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Đang tắt server...');
        server.close(() => {
            console.log('✅ Server đã tắt.');
            process.exit(0);
        });
    });

    process.on('SIGTERM', () => {
        server.close(() => process.exit(0));
    });
}

startServer().catch((err) => {
    console.error('❌ Server start failed:', err.message);
    process.exit(1);
});
