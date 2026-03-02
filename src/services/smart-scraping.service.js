/**
 * ============================================
 * 🕷️ SERVICE 1: Smart Scraping
 * Thu thập dữ liệu thông minh với Playwright + Gemini
 * AI tự nhận diện cấu trúc trang, không cần selector thủ công
 * ============================================
 */

const { chromium } = require('playwright');
const config = require('../config');
const { productRepository } = require('../repositories');
const { logger, retry, detectPlatform } = require('../utils/helpers');
const { generateWithFallback, parseJsonResponse } = require('../utils/gemini-helper');

const CTX = 'SmartScraper';

class SmartScrapingService {
    constructor() {
        this.browser = null;
    }

    /**
     * Khởi tạo browser (gọi 1 lần)
     */
    async init() {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: true,
                args: ['--disable-blink-features=AutomationControlled'],
            });
            logger.info(CTX, 'Browser initialized');
        }
        return this;
    }

    /**
     * Đóng browser
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            logger.info(CTX, 'Browser closed');
        }
    }

    /**
     * ═══════════════════════════════════════════
     * MAIN: Scrape một URL sản phẩm
     * ═══════════════════════════════════════════
     * @param {string} url - URL sản phẩm trên sàn TMĐT
     * @param {Object} options
     * @returns {Object} product data đã được AI phân tích
     */
    async scrapeProduct(url, options = {}) {
        await this.init();

        const startTime = Date.now();
        logger.info(CTX, `Bắt đầu scrape: ${url}`);

        try {
            // 1. Thu thập HTML
            const rawData = await this._fetchPage(url, options);
            logger.success(CTX, `HTML fetched (${rawData.html.length} chars)`);

            // 2. AI phân tích HTML → structured data
            const aiResult = await this._analyzeWithAI(rawData.html, rawData.screenshots, url);

            // Fallback name nếu AI không trích xuất được
            if (!aiResult.name) {
                try {
                    const urlObj = new URL(url);
                    aiResult.name = decodeURIComponent(urlObj.pathname.split('/').filter(Boolean).pop() || urlObj.hostname).substring(0, 200);
                } catch (e) {
                    aiResult.name = 'Sản phẩm từ ' + url.substring(0, 80);
                }
                logger.warn(CTX, `AI returned no name, using fallback: "${aiResult.name}"`);
            }
            logger.success(CTX, `AI analysis done: "${aiResult.name}"`);

            // 3. Lưu vào Supabase
            const product = await productRepository.create({
                sourceUrl: url,
                sourcePlatform: detectPlatform(url),
                name: aiResult.name,
                price: aiResult.price,
                originalPrice: aiResult.original_price,
                discountPct: aiResult.discount_pct,
                description: aiResult.description,
                highlights: aiResult.highlights || [],
                specifications: aiResult.specifications || {},
                category: aiResult.category,
                brand: aiResult.brand,
                rating: aiResult.rating,
                reviewCount: aiResult.review_count,
                aiAnalysis: aiResult,
                targetAudience: aiResult.target_audience,
                sellingPoints: aiResult.selling_points || [],
                rawHtml: options.saveHtml ? rawData.html : null,
                rawData: { url, scrapedAt: new Date().toISOString() },
            });

            // 4. Download ảnh → Cloudflare R2
            if (aiResult.image_urls && aiResult.image_urls.length > 0) {
                logger.info(CTX, `Downloading ${aiResult.image_urls.length} images → Cloudflare R2...`);
                const images = await productRepository.addImages(product.id, aiResult.image_urls);

                // AI chọn ảnh đẹp nhất
                if (images.length > 0 && aiResult.best_image_index !== undefined) {
                    const bestIdx = Math.min(aiResult.best_image_index, images.length - 1);
                    await productRepository.markBestImage(product.id, images[bestIdx].id);
                    logger.info(CTX, `Best image marked: index ${bestIdx}`);
                }
            }

            const duration = Date.now() - startTime;
            logger.success(CTX, `Scrape hoàn tất trong ${duration}ms: ${product.name}`);

            return product;
        } catch (err) {
            logger.error(CTX, `Scrape failed: ${err.message}`);
            throw err;
        }
    }

    /**
     * Fetch trang web bằng Playwright
     */
    async _fetchPage(url, options = {}) {
        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'vi-VN',
        });

        const page = await context.newPage();

        try {
            // Navigate & đợi load
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: options.timeout || 30000,
            });

            // Scroll xuống để lazy-load ảnh
            await this._autoScroll(page);

            // Chụp screenshot (cho Gemini multimodal)
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 80 });

            // Lấy HTML (clean bớt script/style)
            const html = await page.evaluate(() => {
                // Remove scripts, styles, comments
                const clone = document.documentElement.cloneNode(true);
                clone.querySelectorAll('script, style, noscript, iframe').forEach((el) => el.remove());

                // Chỉ giữ phần body chính
                const main = clone.querySelector('main, [role="main"], #content, .product-detail, .product-page, article');
                return (main || clone.querySelector('body')).innerHTML.substring(0, 50000); // Limit 50k chars
            });

            return { html, screenshots: [screenshot] };
        } finally {
            await context.close();
        }
    }

    /**
     * Auto-scroll để trigger lazy loading
     */
    async _autoScroll(page) {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 400;
                const timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= document.body.scrollHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        window.scrollTo(0, 0); // Scroll lại đầu
                        resolve();
                    }
                }, 100);
            });
        });
    }

    /**
     * ═══════════════════════════════════════════
     * AI Analysis: Gemini Flash phân tích HTML
     * ═══════════════════════════════════════════
     * Dùng multimodal: text (HTML) + image (screenshot)
     */
    async _analyzeWithAI(html, screenshots = [], url) {
        const model = config.ai.gemini.models.flash;

        const prompt = `Bạn là AI chuyên phân tích trang web thương mại điện tử Việt Nam.

Hãy phân tích trang sản phẩm từ URL: ${url}

HTML CONTENT (đã clean):
${html.substring(0, 30000)}

YÊU CẦU: Trích xuất CHÍNH XÁC thông tin sản phẩm. Trả về JSON hợp lệ với các trường:

{
  "name": "Tên sản phẩm đầy đủ",
  "price": 0,
  "original_price": 0,
  "discount_pct": 0,
  "description": "Mô tả ngắn gọn, hấp dẫn",
  "highlights": ["Điểm nổi bật 1", "Điểm nổi bật 2", "..."],
  "specifications": {"key": "value"},
  "category": "Danh mục sản phẩm",
  "brand": "Thương hiệu",
  "rating": 4.5,
  "review_count": 100,
  "image_urls": ["url1", "url2"],
  "best_image_index": 0,
  "target_audience": "Đối tượng mục tiêu phù hợp",
  "selling_points": ["Điểm bán hàng 1 (viết hấp dẫn cho video)", "..."],
  "suggested_hashtags": ["#tag1", "#tag2"]
}

LƯU Ý:
- Giá trị price/original_price phải là SỐ (không có đơn vị)
- image_urls: lấy TẤT CẢ URL ảnh sản phẩm chất lượng cao
- best_image_index: chỉ số ảnh đẹp nhất (0-based) để làm thumbnail
- selling_points: viết theo phong cách review cho TikTok/Reels
- Chỉ trả về JSON, không thêm gì khác`;

        // Build content parts
        const parts = [{ text: prompt }];

        // Thêm screenshot nếu có (multimodal)
        if (screenshots && screenshots.length > 0) {
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: screenshots[0].toString('base64'),
                },
            });
        }

        const result = await generateWithFallback({
            preferredModel: model,
            contents: [{ role: 'user', parts }],
            config: {
                temperature: 0.2,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
            },
        });

        return parseJsonResponse(result);
    }

    /**
     * Batch scrape nhiều URLs
     */
    async scrapeMultiple(urls, options = {}) {
        const results = [];
        const concurrency = options.concurrency || 2;

        for (let i = 0; i < urls.length; i += concurrency) {
            const batch = urls.slice(i, i + concurrency);
            const batchResults = await Promise.allSettled(
                batch.map((url) => this.scrapeProduct(url, options))
            );

            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push({ success: true, data: result.value });
                } else {
                    results.push({ success: false, error: result.reason.message });
                }
            }

            logger.step(CTX, i + batch.length, urls.length, 'URLs processed');
        }

        return results;
    }
}

module.exports = new SmartScrapingService();
