/**
 * ============================================
 * 🤖 Gemini Helper - Multi-Model Fallback
 * Tự động chuyển model khi hết quota
 * ============================================
 */

const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const { logger } = require('./helpers');

const CTX = 'GeminiHelper';

const genAI = new GoogleGenAI(config.ai.gemini.apiKey); // Sử dụng string trực tiếp nếu obj không được hỗ trợ tốt

// Danh sách models theo thứ tự ưu tiên (đã verify qua ListModels API)
const FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-pro-latest',
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.0-flash-lite',
];

// Track model nào đang bị quota (cache tạm)
const quotaBlocked = new Map(); // model -> timestamp khi bị block

/**
 * Gọi Gemini AI với auto-fallback qua nhiều model
 * @param {Object} options
 * @param {string} options.preferredModel - Model ưu tiên (mặc định: flash)
 * @param {Array} options.contents - Content parts
 * @param {Object} options.config - Generation config
 * @param {number} options.maxRetries - Số lần retry trên mỗi model (mặc định: 2)
 * @returns {string} Text response
 */
async function generateWithFallback({ preferredModel, contents, config: genConfig, maxRetries = 2 }) {
    // Sắp xếp models: preferred model đầu tiên, bỏ qua model đang bị block
    const now = Date.now();
    const models = [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)]
        .filter(m => {
            const blockedAt = quotaBlocked.get(m);
            // Unblock sau 60 giây
            if (blockedAt && (now - blockedAt) < 60000) return false;
            if (blockedAt) quotaBlocked.delete(m); // Hết thời gian block
            return true;
        });

    if (models.length === 0) {
        // Nếu tất cả đều bị block, thử lại tất cả
        quotaBlocked.clear();
        models.push(...FALLBACK_MODELS);
        logger.warn(CTX, 'All models were blocked, resetting...');
    }

    let lastError = null;

    for (const model of models) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(CTX, `Using model: ${model} (attempt ${attempt}/${maxRetries})`);

                const response = await genAI.models.generateContent({
                    model,
                    contents,
                    config: genConfig,
                });

                const text = response.text;
                if (!text) throw new Error('Empty response from model');

                logger.success(CTX, `✅ ${model} responded (${text.length} chars)`);
                return text;
            } catch (err) {
                lastError = err;
                const errMsg = err.message || JSON.stringify(err);
                const isQuotaError = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
                const isModelNotFound = errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('not supported');

                if (isQuotaError) {
                    logger.warn(CTX, `⚠️ ${model} quota exceeded, switching...`);
                    quotaBlocked.set(model, Date.now());
                    break; // Chuyển sang model tiếp
                }

                if (isModelNotFound) {
                    logger.warn(CTX, `⚠️ ${model} not available, skipping`);
                    break; // Model không tồn tại, skip
                }

                // Lỗi khác → retry trên cùng model
                logger.warn(CTX, `⚠️ ${model} attempt ${attempt} failed: ${errMsg.substring(0, 100)}`);

                if (attempt < maxRetries) {
                    const delay = attempt * 1000;
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
    }

    throw lastError || new Error('All Gemini models failed');
}

/**
 * Gọi Gemini AI để TẠO ẢNH với auto-fallback
 */
async function generateImageWithFallback({ prompt, jobId, productId, maxRetries = 2 }) {
    const imageModels = [
        'imagen-4.0-fast-generate-001',
        'imagen-4.0-generate-001',
        'gemini-2.0-flash-exp-image-generation',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image',
        'gemini-3.1-flash-image-preview',
    ];

    let lastError = null;

    for (const model of imageModels) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(CTX, `🎨 Image Gen: Trying ${model} (attempt ${attempt})`);

                const response = await genAI.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        responseModalities: ['image'],
                        temperature: 0.9
                    },
                });

                let imageBuffer = null;
                if (response.candidates?.[0]?.content?.parts) {
                    for (const part of response.candidates[0].content.parts) {
                        if (part.inlineData) {
                            imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                            break;
                        }
                    }
                }

                if (imageBuffer) {
                    logger.success(CTX, `✅ Image generated successfully using ${model}`);
                    return { buffer: imageBuffer, modelUsed: model };
                }

                throw new Error('Model responded but no image data found');
            } catch (err) {
                lastError = err;
                const errMsg = err.message || '';

                if (errMsg.includes('429') || errMsg.includes('quota')) {
                    logger.warn(CTX, `⚠️  ${model} QUOTA EXCEEDED (429). Waiting 2s and trying next model...`);
                    await new Promise(r => setTimeout(r, 2000));
                    break;
                }

                if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('modality') || errMsg.includes('not supported')) {
                    logger.warn(CTX, `⚠️  ${model} NOT COMPATIBLE or NOT FOUND. Trying next model...`);
                    break;
                }

                logger.warn(CTX, `⚠️  ${model} failed (Attempt ${attempt}): ${errMsg.substring(0, 80)}`);
            }
        }
    }

    throw lastError || new Error('All image generation models failed due to quota or compatibility');
}

/**
 * Parse JSON response từ Gemini (clean markdown blocks)
 */
function parseJsonResponse(text) {
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    try {
        return JSON.parse(clean);
    } catch (e) {
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error(`Cannot parse AI response: ${clean.substring(0, 200)}`);
    }
}

module.exports = { generateWithFallback, generateImageWithFallback, parseJsonResponse, genAI };
