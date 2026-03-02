/**
 * ============================================
 * 🚀 WORKFLOW ENGINE
 * Điều phối toàn bộ pipeline từ URL → Published
 * ============================================
 */

const { workflowRepository, productRepository } = require('../repositories');
const smartScraping = require('./smart-scraping.service');
const creativeBrain = require('./creative-brain.service');
const mediaGen = require('./media-generation.service');
const videoEdit = require('./video-editing.service');
const distribution = require('./distribution.service');
const { logger, sleep } = require('../utils/helpers');

const CTX = 'WorkflowEngine';

class WorkflowEngine {
    /**
     * ═══════════════════════════════════════════
     * MAIN: Chạy toàn bộ pipeline từ URL
     * ═══════════════════════════════════════════
     * URL → Scrape → AI Script → Media Gen → Edit → Publish
     */
    async runFullPipeline(url, options = {}) {
        logger.info(CTX, `🚀 Starting pipeline for: ${url}`);
        const startTime = Date.now();
        let jobId = null;

        try {
            // ── STEP 1: Smart Scraping ──────────────
            logger.info(CTX, '━━━ STEP 1/6: Smart Scraping ━━━');
            const product = await smartScraping.scrapeProduct(url, {
                saveHtml: options.saveHtml,
            });

            // ── Tạo hoặc dùng workflow job đã có ────
            const jobConfig = {
                video_style: options.videoStyle || 'cinematic',
                video_duration: options.videoDuration || 30,
                aspect_ratio: '9:16',
                voice_id: options.voiceId,
                target_platforms: options.platforms || ['tiktok', 'instagram_reels'],
                language: options.language || 'vi',
                tone: options.tone || 'enthusiastic',
            };

            let job;
            if (options.existingJobId) {
                // Dùng job đã tạo bởi server API
                const { supabaseAdmin } = require('../db/database');
                const { data } = await supabaseAdmin.from('workflow_jobs').update({
                    product_id: product.id,
                    title: `Auto: ${product.name}`.substring(0, 200),
                    config: jobConfig,
                    status: 'scraping',
                    current_step: 'scraping_done',
                    progress_pct: 15,
                }).eq('id', options.existingJobId).select().single();
                job = data || { id: options.existingJobId };
                logger.info(CTX, `Using existing job: ${job.id}`);
            } else {
                job = await workflowRepository.create({
                    productId: product.id,
                    title: `Auto: ${product.name}`.substring(0, 200),
                    priority: options.priority || 5,
                    config: jobConfig,
                });
            }
            jobId = job.id;

            await workflowRepository.updateStatus(jobId, 'scraping', 'scraping_done', 15);
            logger.success(CTX, `Product: "${product.name}" | Job: ${jobId}`);

            // ── STEP 2: AI Analysis & Script ────────
            logger.info(CTX, '━━━ STEP 2/6: Creative Brain ━━━');
            await workflowRepository.updateStatus(jobId, 'generating_script', 'script_gen', 25);

            const enrichedProduct = await productRepository.findById(product.id);
            const script = await creativeBrain.generateScript(enrichedProduct, jobConfig, jobId);

            await workflowRepository.updateStatus(jobId, 'generating_script', 'script_done', 35);
            logger.success(CTX, `Script: "${script.title}" (${script.scenes?.length || 0} scenes)`);

            // ── STEP 3: Media Generation ────────────
            logger.info(CTX, '━━━ STEP 3/6: Media Generation ━━━');
            await workflowRepository.updateStatus(jobId, 'generating_media', 'media_gen', 40);
            await workflowRepository.addLog(jobId, 'media_gen', 'info', 'Bắt đầu tạo media assets...');

            const useVeo = options.useVeo || jobConfig.use_veo || false;
            const mediaResults = await mediaGen.generateAllMedia(
                jobId, product.id, script,
                {
                    generateImages: true,
                    generateVideos: useVeo,
                    generateVoiceover: true,
                    voiceId: jobConfig.voice_id,
                }
            );

            const successImages = mediaResults.images.filter((r) => r.success).length;
            const failedImages = mediaResults.images.filter((r) => !r.success);
            const successVideos = mediaResults.videos.filter((r) => r.success).length;
            const totalMedia = successImages + successVideos + (mediaResults.voiceover ? 1 : 0);

            // Log chi tiết kết quả media
            await workflowRepository.addLog(jobId, 'media_gen', 'info',
                `Media kết quả: ${successImages}/${mediaResults.images.length} ảnh, ` +
                `${successVideos}/${mediaResults.videos.length} video, ` +
                `voiceover: ${mediaResults.voiceover ? '✅' : '❌'}`
            );

            if (failedImages.length > 0) {
                const firstError = failedImages[0]?.error || 'Unknown';
                await workflowRepository.addLog(jobId, 'media_gen', 'warning',
                    `${failedImages.length} ảnh thất bại, lỗi: ${firstError.substring(0, 200)}`
                );
            }

            // Nếu KHÔNG có media nào thành công → fail
            if (totalMedia === 0) {
                const errMsg = 'Không tạo được media nào. Kiểm tra API key (Gemini, ElevenLabs).';
                await workflowRepository.addLog(jobId, 'media_gen', 'error', errMsg);
                throw new Error(errMsg);
            }

            await workflowRepository.updateStatus(jobId, 'generating_media', 'media_done', 65);
            logger.success(CTX, `Media: ${totalMedia} assets (${successImages} imgs, ${successVideos} vids, vo: ${!!mediaResults.voiceover})`);

            // ── STEP 4: Video Assembly ──────────────
            logger.info(CTX, '━━━ STEP 4/6: Video Editing ━━━');
            await workflowRepository.updateStatus(jobId, 'editing', 'video_edit', 70);
            await workflowRepository.addLog(jobId, 'video_edit', 'info', 'Bắt đầu lắp ghép video...');

            const finalVideo = await videoEdit.assembleFinalVideo(
                jobId, product.id, script,
                { duration: jobConfig.video_duration }
            );

            // Log thông tin về final video
            if (finalVideo?.metadata?.note) {
                await workflowRepository.addLog(jobId, 'video_edit', 'warning', finalVideo.metadata.note);
            }

            const isRealVideo = finalVideo?.mime_type?.includes('video') && finalVideo?.r2_url && !finalVideo.r2_url.includes('placeholder');
            await workflowRepository.addLog(jobId, 'video_edit', 'info',
                isRealVideo
                    ? `✅ Video hoàn thành: ${finalVideo.r2_url}`
                    : `⚠️ Video chưa lắp ghép được (${finalVideo?.metadata?.note || 'cần FFmpeg'}). Media assets vẫn có sẵn để xem.`
            );

            await workflowRepository.updateStatus(jobId, 'editing', 'edit_done', 85);
            logger.success(CTX, `Final video: ${finalVideo.r2_url || 'fallback asset'}`);

            // ── STEP 5: Ready to publish ────────────
            await workflowRepository.updateStatus(jobId, 'ready_to_publish', 'ready', 90);
            await workflowRepository.addLog(jobId, 'ready', 'info',
                `Pipeline hoàn thành! ${totalMedia} media assets đã tạo. ` +
                (isRealVideo ? 'Video sẵn sàng publish.' : 'Các ảnh/audio đã sẵn sàng (chưa cài FFmpeg nên chưa ghép video).')
            );

            // ── STEP 6: Publish (nếu auto) ─────────
            if (options.autoPublish) {
                logger.info(CTX, '━━━ STEP 5/6: Publishing ━━━');
                await workflowRepository.updateStatus(jobId, 'publishing', 'publishing', 92);

                await distribution.publishToAll(jobId, finalVideo.id, {
                    platforms: jobConfig.target_platforms,
                    caption: this._buildCaption(product, script),
                    hashtags: script.hashtags || [],
                    ...options.publishConfig,
                });

                await workflowRepository.updateStatus(jobId, 'published', 'published', 100);
            } else {
                logger.info(CTX, '⏸️  Auto-publish disabled. Video ready for manual review.');
            }

            const totalTime = Math.round((Date.now() - startTime) / 1000);
            logger.success(CTX, `🎉 Pipeline complete in ${totalTime}s!`);

            return {
                jobId,
                productId: product.id,
                productName: product.name,
                scriptTitle: script.title,
                finalVideoUrl: finalVideo.r2_url,
                mediaCount: totalMedia,
                hasRealVideo: isRealVideo,
                totalTimeSeconds: totalTime,
                status: options.autoPublish ? 'published' : 'ready_to_publish',
            };

        } catch (err) {
            logger.error(CTX, `Pipeline failed: ${err.message}`);
            if (jobId) {
                await workflowRepository.markFailed(jobId, err.message, {
                    stack: err.stack,
                    url,
                });
            }
            throw err;
        }
    }

    /** Chạy pipeline cho 1 job đã tồn tại (resume) */
    async resumeJob(jobId) {
        const job = await workflowRepository.findById(jobId);
        if (!job) throw new Error(`Job ${jobId} not found`);

        logger.info(CTX, `Resuming job: ${job.title} (status: ${job.status})`);
        // TODO: Resume từ step cuối thành công
        return job;
    }

    /** Batch pipeline cho nhiều URLs */
    async runBatch(urls, options = {}) {
        logger.info(CTX, `Batch pipeline: ${urls.length} URLs`);
        const results = [];

        for (let i = 0; i < urls.length; i++) {
            logger.step(CTX, i + 1, urls.length, urls[i]);
            try {
                const result = await this.runFullPipeline(urls[i], options);
                results.push({ url: urls[i], success: true, ...result });
            } catch (err) {
                results.push({ url: urls[i], success: false, error: err.message });
            }
            // Delay giữa các jobs
            if (i < urls.length - 1) await sleep(options.delayBetween || 5000);
        }

        const success = results.filter((r) => r.success).length;
        logger.success(CTX, `Batch done: ${success}/${urls.length} succeeded`);
        return results;
    }

    /** Queue processor: xử lý pending jobs liên tục */
    async startQueueProcessor(options = {}) {
        const pollInterval = options.pollInterval || 10000;
        const batchSize = options.batchSize || 5;

        logger.info(CTX, `Queue processor started (poll: ${pollInterval}ms)`);

        while (true) {
            try {
                const pendingJobs = await workflowRepository.getPendingJobs(batchSize);

                if (pendingJobs.length > 0) {
                    logger.info(CTX, `Processing ${pendingJobs.length} pending jobs...`);
                    for (const job of pendingJobs) {
                        await this.resumeJob(job.id);
                    }
                }
            } catch (err) {
                logger.error(CTX, `Queue error: ${err.message}`);
            }

            await sleep(pollInterval);
        }
    }

    /** Build caption từ product + script */
    _buildCaption(product, script) {
        const hashtags = (script.hashtags || []).join(' ');
        const cta = script.cta_text || script.cta || 'Link mua ở bio! 🔥';
        return `${script.hook || ''}\n\n${product.name}\n💰 ${product.price ? product.price.toLocaleString('vi-VN') + 'đ' : ''}\n\n${cta}\n\n${hashtags}`.trim();
    }
}

module.exports = new WorkflowEngine();
