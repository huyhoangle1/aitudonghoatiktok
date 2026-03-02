/**
 * ============================================
 * 🗄️ Supabase Database Client
 * Kết nối và khởi tạo Supabase
 * ============================================
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// ── Client cho frontend (RLS enabled) ─────────
const supabase = createClient(
    config.supabase.url,
    config.supabase.anonKey,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: false,
        },
        db: {
            schema: 'public',
        },
    }
);

// ── Admin client (bypass RLS, dùng cho backend) ──
const supabaseAdmin = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        db: {
            schema: 'public',
        },
    }
);

/**
 * Test kết nối Supabase
 */
async function testConnection() {
    try {
        const { data, error } = await supabase
            .from('workflow_jobs')
            .select('count', { count: 'exact', head: true });

        if (error && error.code === '42P01') {
            console.log('⚠️  Supabase connected, nhưng chưa có tables. Hãy chạy migration.');
            return true;
        }
        if (error) throw error;

        console.log('✅ Supabase kết nối thành công!');
        return true;
    } catch (err) {
        console.error('❌ Supabase connection failed:', err.message);
        return false;
    }
}

module.exports = {
    supabase,
    supabaseAdmin,
    testConnection,
};
