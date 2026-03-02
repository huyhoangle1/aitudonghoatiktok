/**
 * ============================================
 * 🔧 Utility Helpers
 * ============================================
 */

/**
 * Sleep helper (delay)
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper với exponential backoff
 */
async function retry(fn, { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn(attempt);
        } catch (err) {
            lastError = err;
            if (attempt === maxRetries) break;

            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
            const jitter = delay * (0.5 + Math.random() * 0.5);
            console.warn(`⚠️  Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retry in ${Math.round(jitter)}ms`);
            await sleep(jitter);
        }
    }
    throw lastError;
}

/**
 * Format giá tiền VND
 */
function formatPrice(price, currency = 'VND') {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency,
    }).format(price);
}

/**
 * Trích xuất domain từ URL
 */
function extractDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return 'unknown';
    }
}

/**
 * Nhận diện platform từ URL
 */
function detectPlatform(url) {
    const domain = extractDomain(url).toLowerCase();
    const platformMap = {
        'shopee.vn': 'shopee',
        'lazada.vn': 'lazada',
        'tiki.vn': 'tiki',
        'sendo.vn': 'sendo',
        'tiktok.com': 'tiktokshop',
        'amazon.com': 'amazon',
        'alibaba.com': 'alibaba',
        '1688.com': '1688',
    };

    for (const [key, value] of Object.entries(platformMap)) {
        if (domain.includes(key)) return value;
    }
    return 'other';
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name) {
    return name
        .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 200);
}

/**
 * Tính % giảm giá
 */
function calcDiscountPct(originalPrice, salePrice) {
    if (!originalPrice || !salePrice || originalPrice <= 0) return 0;
    return Math.round(((originalPrice - salePrice) / originalPrice) * 100 * 10) / 10;
}

/**
 * Chunk mảng thành nhóm nhỏ
 */
function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * Đếm số từ trong text
 */
function countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Tạo timestamps cho tên file
 */
function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
}

/**
 * Logger đẹp
 */
const logger = {
    info: (ctx, msg, ...args) => console.log(`[${timestamp()}] ℹ️  [${ctx}] ${msg}`, ...args),
    warn: (ctx, msg, ...args) => console.warn(`[${timestamp()}] ⚠️  [${ctx}] ${msg}`, ...args),
    error: (ctx, msg, ...args) => console.error(`[${timestamp()}] ❌ [${ctx}] ${msg}`, ...args),
    success: (ctx, msg, ...args) => console.log(`[${timestamp()}] ✅ [${ctx}] ${msg}`, ...args),
    step: (ctx, step, total, msg) => console.log(`[${timestamp()}] 🔄 [${ctx}] [${step}/${total}] ${msg}`),
};

module.exports = {
    sleep,
    retry,
    formatPrice,
    extractDomain,
    detectPlatform,
    sanitizeFilename,
    calcDiscountPct,
    chunkArray,
    countWords,
    timestamp,
    logger,
};
