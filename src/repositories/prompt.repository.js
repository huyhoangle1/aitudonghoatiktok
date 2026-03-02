/**
 * ============================================
 * 🤖 AI Prompts Repository
 * Quản lý thư viện prompts
 * ============================================
 */

const { supabaseAdmin } = require('../db/database');

class PromptRepository {
    /**
     * Lấy prompt theo tên
     */
    async findByName(name) {
        const { data, error } = await supabaseAdmin
            .from('ai_prompts')
            .select('*')
            .eq('name', name)
            .eq('is_active', true)
            .single();

        if (error) throw new Error(`Prompt "${name}" not found: ${error.message}`);
        return data;
    }

    /**
     * Lấy prompt và render với variables
     * @param {string} name - Tên prompt
     * @param {Object} variables - { product_name: "iPhone", price: "25tr" }
     * @returns {string} Prompt đã render
     */
    async render(name, variables = {}) {
        const prompt = await this.findByName(name);

        let rendered = prompt.template;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            rendered = rendered.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
        }

        // Tăng usage count
        await supabaseAdmin
            .from('ai_prompts')
            .update({ usage_count: prompt.usage_count + 1 })
            .eq('id', prompt.id);

        return {
            text: rendered,
            model: prompt.model,
            temperature: parseFloat(prompt.temperature),
            maxTokens: prompt.max_tokens,
        };
    }

    /**
     * Liệt kê prompts theo category
     */
    async listByCategory(category) {
        const { data, error } = await supabaseAdmin
            .from('ai_prompts')
            .select('*')
            .eq('category', category)
            .eq('is_active', true)
            .order('usage_count', { ascending: false });

        if (error) throw new Error(`List prompts failed: ${error.message}`);
        return data;
    }

    /**
     * Tạo prompt mới
     */
    async create(promptData) {
        const { data, error } = await supabaseAdmin
            .from('ai_prompts')
            .insert({
                name: promptData.name,
                category: promptData.category,
                description: promptData.description,
                template: promptData.template,
                variables: promptData.variables || [],
                model: promptData.model,
                temperature: promptData.temperature || 0.7,
                max_tokens: promptData.maxTokens,
            })
            .select()
            .single();

        if (error) throw new Error(`Create prompt failed: ${error.message}`);
        return data;
    }

    /**
     * Cập nhật quality rating
     */
    async updateQuality(id, qualityScore) {
        const prompt = await this.findById(id);
        const currentAvg = prompt.avg_quality || 0;
        const currentCount = prompt.usage_count || 1;
        const newAvg = ((currentAvg * (currentCount - 1)) + qualityScore) / currentCount;

        const { data, error } = await supabaseAdmin
            .from('ai_prompts')
            .update({ avg_quality: Math.round(newAvg * 100) / 100 })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Update quality failed: ${error.message}`);
        return data;
    }

    async findById(id) {
        const { data, error } = await supabaseAdmin
            .from('ai_prompts')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(`Find prompt failed: ${error.message}`);
        return data;
    }
}

module.exports = new PromptRepository();
