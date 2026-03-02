/**
 * ============================================
 * 📡 Publication Repository
 * CRUD + Analytics cho đăng tải đa kênh
 * ============================================
 */

const { supabaseAdmin } = require('../db/database');

class PublicationRepository {
    /**
     * Tạo record đăng tải mới
     */
    async create(pubData) {
        const { data, error } = await supabaseAdmin
            .from('publications')
            .insert({
                job_id: pubData.jobId,
                media_asset_id: pubData.mediaAssetId,
                platform: pubData.platform,
                status: pubData.status || 'pending',
                caption: pubData.caption,
                hashtags: pubData.hashtags || [],
                scheduled_at: pubData.scheduledAt,
            })
            .select()
            .single();

        if (error) throw new Error(`Create publication failed: ${error.message}`);
        return data;
    }

    /**
     * Batch tạo publications cho nhiều platforms
     */
    async createMulti(jobId, mediaAssetId, platforms, sharedData = {}) {
        const records = platforms.map((platform) => ({
            job_id: jobId,
            media_asset_id: mediaAssetId,
            platform,
            status: 'pending',
            caption: sharedData.caption,
            hashtags: sharedData.hashtags || [],
            scheduled_at: sharedData.scheduledAt,
        }));

        const { data, error } = await supabaseAdmin
            .from('publications')
            .insert(records)
            .select();

        if (error) throw new Error(`Create multi publications failed: ${error.message}`);
        return data;
    }

    /**
     * Cập nhật trạng thái sau khi đăng
     */
    async updatePublished(id, platformData) {
        const { data, error } = await supabaseAdmin
            .from('publications')
            .update({
                status: 'published',
                platform_post_id: platformData.postId,
                platform_url: platformData.url,
                platform_response: platformData.response || {},
                published_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Update published failed: ${error.message}`);
        return data;
    }

    /**
     * Đánh dấu lỗi đăng tải
     */
    async markFailed(id, errorMessage) {
        const { data: pub } = await supabaseAdmin
            .from('publications')
            .select('retry_count')
            .eq('id', id)
            .single();

        const { data, error } = await supabaseAdmin
            .from('publications')
            .update({
                status: 'failed',
                error_message: errorMessage,
                retry_count: (pub?.retry_count || 0) + 1,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Mark failed: ${error.message}`);
        return data;
    }

    /**
     * Cập nhật analytics (views, likes, ...)
     */
    async updateAnalytics(id, analytics) {
        const totalInteractions = (analytics.likes || 0) + (analytics.comments || 0) + (analytics.shares || 0);
        const engagementRate = analytics.views > 0
            ? totalInteractions / analytics.views
            : 0;

        const { data, error } = await supabaseAdmin
            .from('publications')
            .update({
                views: analytics.views,
                likes: analytics.likes,
                comments: analytics.comments,
                shares: analytics.shares,
                engagement_rate: engagementRate,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Update analytics failed: ${error.message}`);
        return data;
    }

    /**
     * Lấy publications theo job
     */
    async findByJobId(jobId) {
        const { data, error } = await supabaseAdmin
            .from('publications')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(`Find by job failed: ${error.message}`);
        return data;
    }

    /**
     * Lấy scheduled publications (cho cron job)
     */
    async getScheduled(beforeTime = null) {
        let query = supabaseAdmin
            .from('publications')
            .select(`
        *,
        workflow_jobs (id, title, product_id),
        media_assets (id, r2_url, r2_key, type)
      `)
            .eq('status', 'scheduled');

        if (beforeTime) {
            query = query.lte('scheduled_at', beforeTime);
        }

        const { data, error } = await query
            .order('scheduled_at', { ascending: true });

        if (error) throw new Error(`Get scheduled failed: ${error.message}`);
        return data;
    }

    /**
     * Analytics tổng theo platform
     */
    async getPlatformAnalytics() {
        const { data, error } = await supabaseAdmin
            .from('v_platform_analytics')
            .select('*');

        if (error) throw new Error(`Get platform analytics failed: ${error.message}`);
        return data;
    }

    /**
     * Top performing posts
     */
    async getTopPosts(limit = 10) {
        const { data, error } = await supabaseAdmin
            .from('publications')
            .select(`
        *,
        workflow_jobs (id, title),
        media_assets (id, r2_url, type)
      `)
            .eq('status', 'published')
            .order('engagement_rate', { ascending: false })
            .limit(limit);

        if (error) throw new Error(`Get top posts failed: ${error.message}`);
        return data;
    }
}

module.exports = new PublicationRepository();
