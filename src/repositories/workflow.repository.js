/**
 * ============================================
 * 🔄 Workflow Repository
 * CRUD + State Management cho Workflow Jobs
 * ============================================
 */

const { supabaseAdmin } = require('../db/database');

class WorkflowRepository {
    /**
     * Tạo workflow job mới
     */
    async create(jobData) {
        const { data, error } = await supabaseAdmin
            .from('workflow_jobs')
            .insert({
                product_id: jobData.productId,
                title: jobData.title,
                status: 'pending',
                priority: jobData.priority || 5,
                config: jobData.config || {},
                max_retries: jobData.maxRetries || 3,
                created_by: jobData.createdBy,
            })
            .select()
            .single();

        if (error) throw new Error(`Create workflow failed: ${error.message}`);

        // Log creation
        await this.addLog(data.id, 'init', 'info', `Workflow "${data.title}" đã được tạo`);

        return data;
    }

    /**
     * Lấy job theo ID (kèm relations)
     */
    async findById(id) {
        const { data, error } = await supabaseAdmin
            .from('workflow_jobs')
            .select(`
        *,
        products (*),
        scripts (*),
        media_assets (*),
        publications (*)
      `)
            .eq('id', id)
            .single();

        if (error) throw new Error(`Find workflow failed: ${error.message}`);
        return data;
    }

    /**
     * Cập nhật trạng thái workflow
     */
    async updateStatus(jobId, status, step = null, progressPct = null) {
        const { error } = await supabaseAdmin.rpc('update_workflow_progress', {
            p_job_id: jobId,
            p_status: status,
            p_step: step,
            p_progress: progressPct,
        });

        if (error) throw new Error(`Update workflow status failed: ${error.message}`);

        // Auto-log
        await this.addLog(jobId, step || status, 'info', `Status → ${status}${step ? ` (step: ${step})` : ''}`);
    }

    /**
     * Đánh dấu job thất bại
     */
    async markFailed(jobId, errorMessage, errorDetails = null) {
        const { data, error } = await supabaseAdmin
            .from('workflow_jobs')
            .update({
                status: 'failed',
                error_message: errorMessage,
                error_details: errorDetails,
                completed_at: new Date().toISOString(),
            })
            .eq('id', jobId)
            .select()
            .single();

        if (error) throw new Error(`Mark failed: ${error.message}`);

        await this.addLog(jobId, 'failed', 'error', errorMessage, errorDetails);

        return data;
    }

    /**
     * Retry job
     */
    async retry(jobId) {
        const job = await this.findById(jobId);

        if (job.retry_count >= job.max_retries) {
            throw new Error(`Job ${jobId} đã vượt quá số lần retry tối đa (${job.max_retries})`);
        }

        const { data, error } = await supabaseAdmin
            .from('workflow_jobs')
            .update({
                status: 'pending',
                retry_count: job.retry_count + 1,
                error_message: null,
                error_details: null,
                completed_at: null,
            })
            .eq('id', jobId)
            .select()
            .single();

        if (error) throw new Error(`Retry failed: ${error.message}`);

        await this.addLog(jobId, 'retry', 'info', `Retry lần ${data.retry_count}/${data.max_retries}`);

        return data;
    }

    /**
     * Lấy danh sách jobs đang pending (cho queue processor)
     */
    async getPendingJobs(limit = 10) {
        const { data, error } = await supabaseAdmin.rpc('get_pending_jobs', {
            p_limit: limit,
        });

        if (error) throw new Error(`Get pending jobs failed: ${error.message}`);
        return data;
    }

    /**
     * Liệt kê jobs với filter
     */
    async list({ page = 1, limit = 20, status = null, productId = null } = {}) {
        let query = supabaseAdmin
            .from('workflow_jobs')
            .select(`
        *,
        products (id, name, source_platform, price)
      `, { count: 'exact' });

        if (status) query = query.eq('status', status);
        if (productId) query = query.eq('product_id', productId);

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await query
            .order('priority', { ascending: true })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw new Error(`List workflows failed: ${error.message}`);
        return { data, total: count, page, limit };
    }

    /**
     * Dashboard view
     */
    async getDashboard() {
        const { data, error } = await supabaseAdmin
            .from('v_workflow_dashboard')
            .select('*');

        if (error) throw new Error(`Get dashboard failed: ${error.message}`);
        return data;
    }

    /**
     * Thống kê tổng
     */
    async getStats() {
        const { data, error } = await supabaseAdmin.rpc('get_dashboard_stats');

        if (error) throw new Error(`Get stats failed: ${error.message}`);
        return data;
    }

    /**
     * Thêm log cho workflow
     */
    async addLog(jobId, step, level, message, details = null) {
        const { error } = await supabaseAdmin
            .from('workflow_logs')
            .insert({
                job_id: jobId,
                step,
                level,
                message,
                details: details || {},
            });

        if (error) {
            console.warn(`⚠️ Failed to add log: ${error.message}`);
        }
    }

    /**
     * Lấy logs của một job
     */
    async getLogs(jobId, { limit = 50, level = null } = {}) {
        let query = supabaseAdmin
            .from('workflow_logs')
            .select('*')
            .eq('job_id', jobId);

        if (level) query = query.eq('level', level);

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw new Error(`Get logs failed: ${error.message}`);
        return data;
    }

    /**
     * Xóa workflow job
     */
    async delete(jobId) {
        const { error } = await supabaseAdmin
            .from('workflow_jobs')
            .delete()
            .eq('id', jobId);

        if (error) throw new Error(`Delete workflow failed: ${error.message}`);
        return { deleted: true };
    }
}

module.exports = new WorkflowRepository();
