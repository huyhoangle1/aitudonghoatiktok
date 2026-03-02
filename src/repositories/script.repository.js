/**
 * ============================================
 * 📝 Script Repository
 * CRUD cho bảng scripts (kịch bản AI)
 * ============================================
 */

const { supabaseAdmin } = require('../db/database');

class ScriptRepository {
    /**
     * Tạo kịch bản mới
     */
    async create(scriptData) {
        const { data, error } = await supabaseAdmin
            .from('scripts')
            .insert({
                job_id: scriptData.jobId,
                product_id: scriptData.productId,
                title: scriptData.title,
                hook: scriptData.hook,
                narrative: scriptData.narrative,
                scenes: scriptData.scenes || [],
                total_duration: scriptData.totalDuration,
                word_count: scriptData.wordCount,
                hashtags: scriptData.hashtags || [],
                cta_text: scriptData.ctaText,
                model_used: scriptData.modelUsed,
                prompt_used: scriptData.promptUsed,
                generation_time: scriptData.generationTime,
                version: scriptData.version || 1,
            })
            .select()
            .single();

        if (error) throw new Error(`Create script failed: ${error.message}`);
        return data;
    }

    /**
     * Lấy script theo job ID (lấy version mới nhất)
     */
    async findByJobId(jobId) {
        const { data, error } = await supabaseAdmin
            .from('scripts')
            .select('*')
            .eq('job_id', jobId)
            .order('version', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Find script failed: ${error.message}`);
        }
        return data;
    }

    /**
     * Lấy tất cả versions của script cho một job
     */
    async findAllVersions(jobId) {
        const { data, error } = await supabaseAdmin
            .from('scripts')
            .select('*')
            .eq('job_id', jobId)
            .order('version', { ascending: false });

        if (error) throw new Error(`Find script versions failed: ${error.message}`);
        return data;
    }

    /**
     * Cập nhật script
     */
    async update(id, updateData) {
        const { data, error } = await supabaseAdmin
            .from('scripts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Update script failed: ${error.message}`);
        return data;
    }

    /**
     * Tạo version mới (giữ lại version cũ)
     */
    async createNewVersion(jobId, scriptData) {
        const existing = await this.findByJobId(jobId);
        const newVersion = existing ? existing.version + 1 : 1;

        return this.create({
            ...scriptData,
            jobId,
            version: newVersion,
        });
    }

    /**
     * Xóa script
     */
    async delete(id) {
        const { error } = await supabaseAdmin
            .from('scripts')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Delete script failed: ${error.message}`);
        return { deleted: true };
    }
}

module.exports = new ScriptRepository();
