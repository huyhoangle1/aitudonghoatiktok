/**
 * ============================================
 * 🧠 SERVICE 2: Creative Brain
 * Lên ý tưởng & Kịch bản video bằng Gemini Pro
 * Multimodal: text + ảnh sản phẩm → kịch bản chi tiết
 * ============================================
 */

const config = require('../config');
const { scriptRepository, promptRepository } = require('../repositories');
const r2 = require('../storage/cloudflare-r2');
const { logger, retry, formatPrice, countWords } = require('../utils/helpers');
const { generateWithFallback, parseJsonResponse } = require('../utils/gemini-helper');

const CTX = 'CreativeBrain';

class CreativeBrainService {
    /**
     * ═══════════════════════════════════════════
     * MAIN: Tạo kịch bản video từ product data
     * ═══════════════════════════════════════════
     * @param {Object} product - Product record từ DB
     * @param {Object} jobConfig - Config từ workflow job
     * @param {string} jobId - Workflow job ID
     * @returns {Object} Script record
     */
    async generateScript(product, jobConfig, jobId) {
        const startTime = Date.now();
        logger.info(CTX, `Tạo kịch bản cho: "${product.name}"`);

        try {
            // 1. Chuẩn bị media input (ảnh sản phẩm cho Gemini multimodal)
            const imageParts = await this._prepareProductImages(product);

            // 2. Tạo prompt
            const prompt = this._buildCreativePrompt(product, jobConfig);

            // 3. Gọi Gemini Pro (multimodal)
            const scriptData = await this._generateWithAI(prompt, imageParts, jobConfig);

            // 4. Lưu script vào DB
            const script = await scriptRepository.create({
                jobId,
                productId: product.id,
                title: scriptData.title,
                hook: scriptData.hook,
                narrative: scriptData.narrative || scriptData.scenes?.map((s) => s.voiceover).join(' '),
                scenes: scriptData.scenes,
                totalDuration: scriptData.total_duration || jobConfig.video_duration || 30,
                wordCount: countWords(scriptData.narrative || ''),
                hashtags: scriptData.hashtags || [],
                ctaText: scriptData.cta,
                modelUsed: config.ai.gemini.models.pro,
                promptUsed: prompt.substring(0, 2000),
                generationTime: Date.now() - startTime,
            });

            logger.success(CTX, `Script created: "${script.title}" (${script.scenes?.length || 0} scenes)`);
            return script;
        } catch (err) {
            logger.error(CTX, `Script generation failed: ${err.message}`);
            throw err;
        }
    }

    /**
     * Chuẩn bị ảnh sản phẩm cho multimodal input
     */
    async _prepareProductImages(product) {
        const parts = [];

        if (!product.product_images || product.product_images.length === 0) {
            return parts;
        }

        // Lấy tối đa 5 ảnh (best image first)
        const sortedImages = [...product.product_images].sort((a, b) => {
            if (a.is_best) return -1;
            if (b.is_best) return 1;
            return a.sort_order - b.sort_order;
        });

        for (const img of sortedImages.slice(0, 5)) {
            try {
                if (img.r2_key) {
                    const buffer = await r2.downloadFile(img.r2_key);
                    parts.push({
                        inlineData: {
                            mimeType: img.mime_type || 'image/jpeg',
                            data: buffer.toString('base64'),
                        },
                    });
                }
            } catch (err) {
                logger.warn(CTX, `Skip image ${img.id}: ${err.message}`);
            }
        }

        logger.info(CTX, `Prepared ${parts.length} product images for AI`);
        return parts;
    }

    /**
     * Build creative prompt
     */
    _buildCreativePrompt(product, jobConfig) {
        const duration = jobConfig.video_duration || 30;
        const style = jobConfig.video_style || 'cinematic';
        const tone = jobConfig.tone || 'enthusiastic';
        const lang = jobConfig.language || 'vi';

        return `Bạn là chuyên gia sáng tạo nội dung video ngắn hàng đầu Việt Nam cho TikTok/Instagram Reels.

══════════════════════════════════
📦 THÔNG TIN SẢN PHẨM
══════════════════════════════════
- Tên: ${product.name}
- Giá: ${formatPrice(product.price)}${product.original_price ? ` (gốc: ${formatPrice(product.original_price)}, giảm ${product.discount_pct}%)` : ''}
- Thương hiệu: ${product.brand || 'N/A'}
- Danh mục: ${product.category || 'N/A'}
- Đánh giá: ${product.rating || 'N/A'}/5 (${product.review_count || 0} reviews)
- Điểm nổi bật: ${JSON.stringify(product.highlights || [])}
- Thông số: ${JSON.stringify(product.specifications || {})}
- Đối tượng: ${product.target_audience || 'Đại chúng'}
- Selling points: ${JSON.stringify(product.selling_points || [])}

Ảnh sản phẩm đính kèm ở trên (nếu có).

══════════════════════════════════
🎬 YÊU CẦU TẠO KỊCH BẢN
══════════════════════════════════
- Thời lượng: ${duration} giây
- Tỷ lệ: 9:16 (dọc, cho mobile)
- Phong cách: ${style}
- Giọng điệu: ${tone}
- Ngôn ngữ: ${lang === 'vi' ? 'Tiếng Việt' : 'English'}

QUY TẮC:
1. Hook PHẢI gây tò mò trong 1-3 giây đầu (câu hỏi bất ngờ, con số sốc, v.v.)
2. Mỗi scene tối đa 5-7 giây
3. Mô tả visual PHẢI đủ chi tiết để AI tạo hình (bối cảnh, lighting, góc camera)
4. Voiceover tự nhiên, như đang nói chuyện với bạn bè
5. Text overlay ngắn gọn, ĐẬM, dùng emoji
6. CTA cuối video phải mạnh mẽ, thúc đẩy hành động

TRẢ VỀ JSON:
{
  "title": "Tiêu đề video (hấp dẫn, có keyword)",
  "hook": "Câu hook mở đầu (3 giây đầu)",
  "narrative": "Toàn bộ nội dung voiceover liền mạch",
  "total_duration": ${duration},
  "scenes": [
    {
      "scene_id": 1,
      "timestamp": 0,
      "duration": 3,
      "visual": "Mô tả chi tiết hình ảnh/video cần tạo. VD: Close-up sản phẩm trên nền marble trắng, ánh sáng soft từ bên trái, bokeh mờ phía sau",
      "voiceover": "Lời thoại cho scene này",
      "text_overlay": "📱 TEXT HIỆN TRÊN MÀN HÌNH",
      "motion": "Hiệu ứng: zoom_in, slide_left, rotate, shake, bounce, fade_in, parallax, etc.",
      "transition": "Chuyển cảnh: cut, fade, slide, glitch, zoom, whip_pan, etc.",
      "camera_angle": "Góc quay: close_up, wide_shot, top_down, 45_degree, panning, tracking",
      "mood": "Cảm xúc: exciting, curious, amazed, urgent, satisfied"
    }
  ],
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "cta": "Call to action cuối video",
  "suggested_music": "Gợi ý phong cách nhạc nền"
}

CHỈ TRẢ VỀ JSON, KHÔNG THÊM GÌ KHÁC.`;
    }

    /**
     * Gọi Gemini Pro multimodal
     */
    async _generateWithAI(prompt, imageParts = [], jobConfig = {}) {
        const model = config.ai.gemini.models.pro;
        const parts = [...imageParts, { text: prompt }];

        const result = await generateWithFallback({
            preferredModel: model,
            contents: [{ role: 'user', parts }],
            config: {
                temperature: 0.85,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
            },
        });

        return parseJsonResponse(result);
    }

    /**
     * Tạo phiên bản kịch bản mới (iterate/improve)
     */
    async regenerateScript(jobId, product, jobConfig, feedback = '') {
        const existing = await scriptRepository.findByJobId(jobId);

        const additionalPrompt = feedback
            ? `\n\n⚠️ FEEDBACK TỪ LẦN TRƯỚC:\n${feedback}\n\nKịch bản cũ:\n${JSON.stringify(existing?.scenes || [], null, 2)}\n\nHãy CẢI THIỆN dựa trên feedback.`
            : '';

        const tempConfig = { ...jobConfig, _additionalPrompt: additionalPrompt };
        return this.generateScript(product, tempConfig, jobId);
    }

    /**
     * Đề xuất nhiều ý tưởng video cho 1 sản phẩm
     */
    async brainstormIdeas(product, count = 3) {
        const prompt = `Bạn là chuyên gia sáng tạo nội dung TikTok/Reels.

Sản phẩm: ${product.name}
Giá: ${formatPrice(product.price)}
Highlights: ${JSON.stringify(product.highlights)}

Hãy đề xuất ${count} ý tưởng video khác nhau. Mỗi ý tưởng gồm:
- concept: Khái niệm video (1 câu)
- hook: Câu hook mở đầu
- style: Phong cách (cinematic, funny, unboxing, comparison, story, etc.)
- estimated_engagement: Dự đoán mức độ tương tác (low/medium/high/viral)
- target: Đối tượng chính

Trả về JSON: { "ideas": [...] }`;

        const result = await generateWithFallback({
            preferredModel: config.ai.gemini.models.pro,
            contents: prompt,
            config: {
                temperature: 0.95,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
            },
        });

        return parseJsonResponse(result);
    }
}

module.exports = new CreativeBrainService();
