/**
 * ============================================
 * 🎬 Media Repository
 * CRUD cho media_assets + tích hợp Cloudflare R2
 * ============================================
 */

const { supabaseAdmin } = require('../db/database');
const r2 = require('../storage/cloudflare-r2');

class MediaRepository {
    /**
     * Lưu media asset mới (đã upload lên R2)
     */
    async create(assetData) {
        const { data, error } = await supabaseAdmin
            .from('media_assets')
            .insert({
                job_id: assetData.jobId,
                product_id: assetData.productId,
                type: assetData.type,
                filename: assetData.filename,
                mime_type: assetData.mimeType,
                file_size: assetData.fileSize,
                r2_key: assetData.r2Key,
                r2_url: assetData.r2Url,
                r2_bucket: assetData.r2Bucket || r2.r2Client.config?.bucket,
                width: assetData.width,
                height: assetData.height,
                duration: assetData.duration,
                aspect_ratio: assetData.aspectRatio,
                ai_model: assetData.aiModel,
                ai_prompt: assetData.aiPrompt,
                ai_params: assetData.aiParams || {},
                generation_time: assetData.generationTime,
                quality_score: assetData.qualityScore,
                is_selected: assetData.isSelected || false,
                metadata: assetData.metadata || {},
            })
            .select()
            .single();

        if (error) throw new Error(`Create media asset failed: ${error.message}`);
        return data;
    }

    /**
     * Upload + lưu ảnh AI generated
     */
    async uploadAndSaveImage(buffer, jobId, productId, options = {}) {
        const filename = options.filename || `generated_${Date.now()}.png`;

        // Upload lên R2
        const r2Result = await r2.uploadGeneratedImage(buffer, jobId, filename);

        // Lưu vào DB
        return this.create({
            jobId,
            productId,
            type: options.type || 'image_generated',
            filename,
            mimeType: r2Result.contentType,
            fileSize: r2Result.size,
            r2Key: r2Result.key,
            r2Url: r2Result.url,
            width: options.width,
            height: options.height,
            aspectRatio: options.aspectRatio || '9:16',
            aiModel: options.aiModel,
            aiPrompt: options.aiPrompt,
            generationTime: options.generationTime,
            qualityScore: options.qualityScore,
        });
    }

    /**
     * Upload + lưu video clip
     */
    async uploadAndSaveVideo(buffer, jobId, productId, options = {}) {
        const filename = options.filename || `clip_${Date.now()}.mp4`;

        const r2Result = await r2.uploadVideoClip(buffer, jobId, filename);

        return this.create({
            jobId,
            productId,
            type: options.type || 'video_clip',
            filename,
            mimeType: r2Result.contentType,
            fileSize: r2Result.size,
            r2Key: r2Result.key,
            r2Url: r2Result.url,
            width: options.width || 1080,
            height: options.height || 1920,
            duration: options.duration,
            aspectRatio: options.aspectRatio || '9:16',
            aiModel: options.aiModel,
            aiPrompt: options.aiPrompt,
            generationTime: options.generationTime,
        });
    }

    /**
     * Upload + lưu audio voiceover
     */
    async uploadAndSaveAudio(buffer, jobId, productId, options = {}) {
        const filename = options.filename || `voiceover_${Date.now()}.mp3`;

        const r2Result = await r2.uploadAudio(buffer, jobId, filename);

        return this.create({
            jobId,
            productId,
            type: options.type || 'audio_voiceover',
            filename,
            mimeType: r2Result.contentType,
            fileSize: r2Result.size,
            r2Key: r2Result.key,
            r2Url: r2Result.url,
            duration: options.duration,
            aiModel: 'elevenlabs',
            aiParams: { voiceId: options.voiceId },
        });
    }

    /**
     * Upload + lưu final video
     */
    async uploadAndSaveFinalVideo(buffer, jobId, productId, options = {}) {
        const filename = options.filename || `final_${Date.now()}.mp4`;

        const r2Result = await r2.uploadFinalVideo(buffer, jobId, filename);

        return this.create({
            jobId,
            productId,
            type: 'video_final',
            filename,
            mimeType: r2Result.contentType,
            fileSize: r2Result.size,
            r2Key: r2Result.key,
            r2Url: r2Result.url,
            width: options.width || 1080,
            height: options.height || 1920,
            duration: options.duration,
            aspectRatio: '9:16',
            isSelected: true,
        });
    }

    /**
     * Lấy media theo ID
     */
    async findById(id) {
        const { data, error } = await supabaseAdmin
            .from('media_assets')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(`Find media failed: ${error.message}`);
        return data;
    }

    /**
     * Lấy tất cả media của một job
     */
    async findByJobId(jobId, type = null) {
        let query = supabaseAdmin
            .from('media_assets')
            .select('*')
            .eq('job_id', jobId);

        if (type) query = query.eq('type', type);

        const { data, error } = await query.order('created_at', { ascending: true });

        if (error) throw new Error(`Find media by job failed: ${error.message}`);
        return data;
    }

    /**
     * Lấy media được chọn (selected) cho final video
     */
    async getSelectedMedia(jobId) {
        const { data, error } = await supabaseAdmin
            .from('media_assets')
            .select('*')
            .eq('job_id', jobId)
            .eq('is_selected', true)
            .order('created_at', { ascending: true });

        if (error) throw new Error(`Get selected media failed: ${error.message}`);
        return data;
    }

    /**
     * Đánh dấu media là selected
     */
    async markSelected(id, selected = true) {
        const { data, error } = await supabaseAdmin
            .from('media_assets')
            .update({ is_selected: selected })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Mark selected failed: ${error.message}`);
        return data;
    }

    /**
     * Xóa media (cả R2 + DB)
     */
    async delete(id) {
        const asset = await this.findById(id);

        // Xóa file trên R2
        if (asset.r2_key) {
            await r2.deleteFile(asset.r2_key);
        }

        // Xóa record
        const { error } = await supabaseAdmin
            .from('media_assets')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Delete media failed: ${error.message}`);
        return { deleted: true };
    }

    /**
     * Xóa tất cả media của một job (cleanup)
     */
    async deleteByJobId(jobId) {
        const assets = await this.findByJobId(jobId);

        // Xóa files trên R2
        for (const asset of assets) {
            if (asset.r2_key) {
                await r2.deleteFile(asset.r2_key).catch(() => { });
            }
        }

        // Xóa records
        const { error } = await supabaseAdmin
            .from('media_assets')
            .delete()
            .eq('job_id', jobId);

        if (error) throw new Error(`Delete job media failed: ${error.message}`);
        return { deleted: assets.length };
    }
}

module.exports = new MediaRepository();
