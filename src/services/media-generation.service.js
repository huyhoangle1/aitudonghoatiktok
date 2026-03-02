/**
 * ============================================
 * 🎨 SERVICE 3: Media Generation
 * Tạo ảnh (Gemini), Video (Veo), Audio (ElevenLabs)
 * ============================================
 */

const config = require('../config');
const { mediaRepository } = require('../repositories');
const r2 = require('../storage/cloudflare-r2');
const { logger, retry, sleep } = require('../utils/helpers');
const { generateWithFallback, generateImageWithFallback, parseJsonResponse, genAI } = require('../utils/gemini-helper');

const CTX = 'MediaGen';

class MediaGenerationService {
    /** Tạo ảnh AI và upload R2 */
    async generateImage(jobId, productId, prompt, options = {}) {
        const startTime = Date.now();
        logger.info(CTX, `Generating image process started...`);

        // Sử dụng helper mới với auto-fallback qua nhiều model (bao gồm các model free)
        const { buffer, modelUsed } = await generateImageWithFallback({
            prompt,
            jobId,
            productId
        });

        const asset = await mediaRepository.uploadAndSaveImage(buffer, jobId, productId, {
            type: options.type || 'image_generated',
            aiModel: modelUsed,
            aiPrompt: prompt,
            generationTime: Date.now() - startTime,
            ...options,
        });

        logger.success(CTX, `Image uploaded: ${asset.r2_url} (via ${modelUsed})`);
        return asset;
    }

    /** Style Transfer: ảnh gốc xấu → bối cảnh đẹp */
    async styleTransfer(jobId, productId, originalImageKey, stylePrompt) {
        const originalBuffer = await r2.downloadFile(originalImageKey);

        // Hiện tại Imagen 3 là model tốt nhất hỗ trợ image input cho style transfer.
        // Ta sẽ dùng logic của generateImageWithFallback nhưng kèm ảnh gốc.
        const model = config.ai.gemini.models.imageGen;

        const response = await retry(async () => {
            return await genAI.models.generateContent({
                model: 'gemini-1.5-flash', // Dùng flash cho style transfer vì ổn định với multimodal
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: originalBuffer.toString('base64') } },
                        { text: `Consistent Image Generation: Hãy giữ nguyên hình dáng và đặc điểm của sản phẩm trong ảnh gốc. Thay toàn bộ bối cảnh xung quanh bằng mô tả sau: ${stylePrompt}. Phong cách nhiếp ảnh quảng cáo chuyên nghiệp, ánh sáng studio, tỷ lệ 9:16.` },
                    ],
                }],
                config: { responseModalities: ['image'], temperature: 0.7 },
            });
        }, { maxRetries: 2 });

        let imageBuffer = null;
        for (const part of (response.candidates?.[0]?.content?.parts || [])) {
            if (part.inlineData) { imageBuffer = Buffer.from(part.inlineData.data, 'base64'); break; }
        }
        if (!imageBuffer) throw new Error('Style transfer failed');

        return mediaRepository.uploadAndSaveImage(imageBuffer, jobId, productId, {
            type: 'image_enhanced',
            aiModel: 'gemini-1.5-flash',
            aiPrompt: stylePrompt,
        });
    }

    /** Batch tạo ảnh cho scenes */
    async generateSceneImages(jobId, productId, scenes) {
        const results = [];
        for (let i = 0; i < scenes.length; i++) {
            const s = scenes[i];
            logger.step(CTX, i + 1, scenes.length, `Scene image ${s.scene_id}`);
            try {
                const prompt = `Ảnh quảng cáo TikTok 9:16:\n${s.visual}\nMood: ${s.mood || 'professional'}\nCamera: ${s.camera_angle || 'eye_level'}`;
                const asset = await this.generateImage(jobId, productId, prompt);
                results.push({ sceneId: s.scene_id, asset, success: true });
                if (i < scenes.length - 1) await sleep(2000);
            } catch (err) {
                results.push({ sceneId: s.scene_id, success: false, error: err.message });
            }
        }
        return results;
    }

    /** Batch tạo video clips cho scenes via Veo */
    async generateSceneVideos(jobId, productId, scenes) {
        const results = [];
        for (let i = 0; i < scenes.length; i++) {
            const s = scenes[i];
            logger.step(CTX, i + 1, scenes.length, `Scene video ${s.scene_id}`);
            try {
                const prompt = `Video quảng cáo TikTok 9:16, ${s.duration || 5}s:\n${s.visual}\nMood: ${s.mood || 'energetic'}\nCamera: ${s.camera_angle || 'eye_level'}`;
                const asset = await this.generateVideo(jobId, productId, prompt, {
                    duration: s.duration || 5,
                });
                results.push({ sceneId: s.scene_id, asset, success: true });
                if (i < scenes.length - 1) await sleep(3000);
            } catch (err) {
                logger.warn(CTX, `Scene video ${s.scene_id} failed: ${err.message}`);
                results.push({ sceneId: s.scene_id, success: false, error: err.message });
            }
        }
        return results;
    }

    /** Video Generation via Veo */
    async generateVideo(jobId, productId, prompt, options = {}) {
        const startTime = Date.now();
        logger.info(CTX, `Generating video...`);

        const response = await retry(async () => {
            return await genAI.models.generateContent({
                model: 'veo-2.0-generate-001',
                contents: prompt,
                config: {
                    responseModalities: ['video'],
                    videoConfig: {
                        aspectRatio: '9:16',
                        durationSeconds: options.duration || 5,
                        resolution: '1080p',
                    },
                },
            });
        }, { maxRetries: 2 });

        let videoBuffer = null;
        for (const part of (response.candidates?.[0]?.content?.parts || [])) {
            if (part.inlineData?.mimeType?.startsWith('video/')) {
                videoBuffer = Buffer.from(part.inlineData.data, 'base64'); break;
            }
            if (part.videoMetadata?.downloadUri) {
                const resp = await fetch(part.videoMetadata.downloadUri);
                videoBuffer = Buffer.from(await resp.arrayBuffer()); break;
            }
        }
        if (!videoBuffer) throw new Error('No video generated');

        const asset = await mediaRepository.uploadAndSaveVideo(videoBuffer, jobId, productId, {
            duration: options.duration || 5, aiModel: 'veo-2.0', aiPrompt: prompt,
            generationTime: Date.now() - startTime,
        });
        logger.success(CTX, `Video uploaded: ${asset.r2_url}`);
        return asset;
    }

    /** TTS Voiceover via ElevenLabs */
    async generateVoiceover(jobId, productId, text, options = {}) {
        const voiceId = options.voiceId || config.ai.elevenlabs.voiceId;
        logger.info(CTX, `Generating voiceover (${text.length} chars)...`);

        const apiKey = config.ai.elevenlabs.apiKey;
        if (!apiKey) throw new Error('ElevenLabs API key not configured');

        const audioBuffer = await retry(async () => {
            const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
                body: JSON.stringify({
                    text, model_id: 'eleven_multilingual_v2',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true },
                    output_format: 'mp3_44100_128',
                }),
            });
            if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
            return Buffer.from(await resp.arrayBuffer());
        }, { maxRetries: 2 });

        const asset = await mediaRepository.uploadAndSaveAudio(audioBuffer, jobId, productId, {
            voiceId, duration: options.estimatedDuration,
        });
        logger.success(CTX, `Voiceover uploaded: ${asset.r2_url}`);
        return asset;
    }

    /** Tạo toàn bộ media cho 1 script */
    async generateAllMedia(jobId, productId, script, options = {}) {
        logger.info(CTX, `Generating all media for job ${jobId}...`);
        const results = { images: [], videos: [], voiceover: null };

        // Tạo ảnh cho scenes (luôn tạo ảnh để có fallback cho video editing)
        if (options.generateImages !== false) {
            results.images = await this.generateSceneImages(jobId, productId, script.scenes || []);
        }

        // Tạo video clips nếu được bật (dùng Veo)
        if (options.generateVideos) {
            try {
                results.videos = await this.generateSceneVideos(jobId, productId, script.scenes || []);
                logger.success(CTX, `Generated ${results.videos.filter(v => v.success).length} video clips`);
            } catch (err) {
                logger.warn(CTX, `Video generation failed, will use images: ${err.message}`);
            }
        }

        // Tạo voiceover
        if (options.generateVoiceover !== false && script.narrative) {
            try {
                results.voiceover = await this.generateVoiceover(jobId, productId, script.narrative, options);
            } catch (err) {
                logger.warn(CTX, `Voiceover failed: ${err.message}`);
            }
        }

        const totalMedia = results.images.filter(i => i.success).length
            + results.videos.filter(v => v.success).length
            + (results.voiceover ? 1 : 0);
        logger.success(CTX, `Total media generated: ${totalMedia} assets`);
        return results;
    }
}

module.exports = new MediaGenerationService();
