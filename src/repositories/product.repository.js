/**
 * ============================================
 * 📦 Product Repository
 * CRUD operations cho bảng products & product_images
 * ============================================
 */

const { supabaseAdmin } = require('../db/database');
const r2 = require('../storage/cloudflare-r2');

class ProductRepository {
    /**
     * Tạo sản phẩm mới (sau khi scraping)
     * @param {Object} productData
     * @returns {Object} product record
     */
    async create(productData) {
        const { data, error } = await supabaseAdmin
            .from('products')
            .insert({
                source_url: productData.sourceUrl,
                source_platform: productData.sourcePlatform,
                name: productData.name,
                price: productData.price,
                original_price: productData.originalPrice,
                currency: productData.currency || 'VND',
                discount_pct: productData.discountPct,
                description: productData.description,
                highlights: productData.highlights || [],
                specifications: productData.specifications || {},
                category: productData.category,
                brand: productData.brand,
                rating: productData.rating,
                review_count: productData.reviewCount || 0,
                ai_analysis: productData.aiAnalysis || {},
                target_audience: productData.targetAudience,
                selling_points: productData.sellingPoints || [],
                raw_html: productData.rawHtml,
                raw_data: productData.rawData || {},
            })
            .select()
            .single();

        if (error) throw new Error(`Create product failed: ${error.message}`);
        return data;
    }

    /**
     * Lấy sản phẩm theo ID
     */
    async findById(id) {
        const { data, error } = await supabaseAdmin
            .from('products')
            .select(`
        *,
        product_images (*)
      `)
            .eq('id', id)
            .single();

        if (error) throw new Error(`Find product failed: ${error.message}`);
        return data;
    }

    /**
     * Tìm sản phẩm theo URL nguồn (tránh trùng lặp)
     */
    async findBySourceUrl(sourceUrl) {
        const { data, error } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('source_url', sourceUrl)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Find by URL failed: ${error.message}`);
        }
        return data; // null nếu không tìm thấy
    }

    /**
     * Cập nhật sản phẩm
     */
    async update(id, updateData) {
        const { data, error } = await supabaseAdmin
            .from('products')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Update product failed: ${error.message}`);
        return data;
    }

    /**
     * Lưu AI analysis vào product
     */
    async saveAiAnalysis(id, analysis) {
        return this.update(id, {
            ai_analysis: analysis,
            target_audience: analysis.targetAudience,
            selling_points: analysis.sellingPoints || [],
        });
    }

    /**
     * Liệt kê sản phẩm với pagination
     */
    async list({ page = 1, limit = 20, platform = null, category = null } = {}) {
        let query = supabaseAdmin
            .from('products')
            .select('*, product_images!inner(*)', { count: 'exact' });

        if (platform) query = query.eq('source_platform', platform);
        if (category) query = query.eq('category', category);

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw new Error(`List products failed: ${error.message}`);
        return { data, total: count, page, limit };
    }

    /**
     * Thêm ảnh sản phẩm (download từ URL gốc → upload R2)
     */
    async addImage(productId, imageUrl, sortOrder = 0) {
        // 1. Mirror ảnh từ sàn TMĐT sang Cloudflare R2
        const r2Result = await r2.mirrorFromUrl(
            imageUrl,
            `products/${productId}/images`,
            `img_${sortOrder}.jpg`
        );

        // 2. Lưu record vào DB
        const { data, error } = await supabaseAdmin
            .from('product_images')
            .insert({
                product_id: productId,
                original_url: imageUrl,
                r2_key: r2Result.key,
                r2_url: r2Result.url,
                file_size: r2Result.size,
                mime_type: r2Result.contentType,
                sort_order: sortOrder,
            })
            .select()
            .single();

        if (error) throw new Error(`Add image failed: ${error.message}`);
        return data;
    }

    /**
     * Batch thêm nhiều ảnh
     */
    async addImages(productId, imageUrls) {
        const results = [];
        for (let i = 0; i < imageUrls.length; i++) {
            try {
                const result = await this.addImage(productId, imageUrls[i], i);
                results.push(result);
            } catch (err) {
                console.warn(`⚠️ Failed to add image ${i}: ${err.message}`);
            }
        }
        return results;
    }

    /**
     * Đánh dấu ảnh đẹp nhất (AI chọn)
     */
    async markBestImage(productId, imageId) {
        // Reset all
        await supabaseAdmin
            .from('product_images')
            .update({ is_best: false })
            .eq('product_id', productId);

        // Set best
        const { data, error } = await supabaseAdmin
            .from('product_images')
            .update({
                is_best: true,
            })
            .eq('id', imageId)
            .select()
            .single();

        if (error) throw new Error(`Mark best image failed: ${error.message}`);
        return data;
    }

    /**
     * Xóa sản phẩm (+ xóa ảnh trên R2)
     */
    async delete(id) {
        // Xóa folder ảnh trên R2
        await r2.deleteFolder(`products/${id}/`);

        const { error } = await supabaseAdmin
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Delete product failed: ${error.message}`);
        return { deleted: true };
    }
}

module.exports = new ProductRepository();
