/**
 * ============================================
 * 🤖 AI Workflow Dashboard v2.2
 * Server API + Chart.js + Job Detail + Cancel + Delete + History
 * ============================================
 */

const API_BASE = window.location.origin;

// ── Pipeline Steps Definition ───────────────
const PIPELINE_STEPS = [
    { key: 'pending', icon: 'hourglass_empty', label: 'Pending', pct: 0 },
    { key: 'scraping', icon: 'travel_explore', label: 'Scraping', pct: 15 },
    { key: 'generating_script', icon: 'edit_note', label: 'Script', pct: 30 },
    { key: 'generating_media', icon: 'palette', label: 'Media', pct: 50 },
    { key: 'editing', icon: 'content_cut', label: 'Editing', pct: 75 },
    { key: 'ready_to_publish', icon: 'check_circle', label: 'Ready', pct: 90 },
];

// ── Status Config ───────────────────────────
const STATUS_MAP = {
    pending: { icon: 'schedule', label: 'Pending', bg: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600' },
    scraping: { icon: 'travel_explore', label: 'Scraping', bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 animate-pulse' },
    analyzing: { icon: 'search', label: 'Analyzing', bg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800 animate-pulse' },
    generating_script: { icon: 'edit_note', label: 'Scripting', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800 animate-pulse' },
    generating_media: { icon: 'palette', label: 'Media Gen', bg: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400 border-pink-200 dark:border-pink-800 animate-pulse' },
    editing: { icon: 'content_cut', label: 'Editing', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800 animate-pulse' },
    ready_to_publish: { icon: 'check_circle', label: 'Ready', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
    publishing: { icon: 'send', label: 'Publishing', bg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 animate-pulse' },
    published: { icon: 'verified', label: 'Completed', bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800' },
    failed: { icon: 'error', label: 'Failed', bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' },
    cancelled: { icon: 'block', label: 'Cancelled', bg: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600' },
};

const PROGRESS_COLORS = {
    pending: 'bg-gray-400', scraping: 'bg-yellow-500', analyzing: 'bg-cyan-500',
    generating_script: 'bg-purple-500', generating_media: 'bg-pink-500',
    editing: 'bg-blue-500', ready_to_publish: 'bg-emerald-500',
    publishing: 'bg-indigo-500', published: 'bg-green-500',
    failed: 'bg-red-500', cancelled: 'bg-gray-400',
};

const LOG_DOT_COLORS = {
    success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500', warn: 'bg-yellow-500',
};

const STEP_DESCRIPTIONS = {
    pending: 'Job đang chờ xử lý trong hàng đợi',
    scraping: 'AI đang phân tích trang web, trích xuất thông tin sản phẩm',
    analyzing: 'AI đang phân tích nội dung sản phẩm',
    generating_script: 'AI đang viết kịch bản video, tạo nội dung sáng tạo',
    generating_media: 'Đang tạo hình ảnh, video, voiceover bằng AI',
    editing: 'Đang ghép video, thêm hiệu ứng, render final',
    ready_to_publish: 'Video hoàn thành, sẵn sàng đăng tải',
    publishing: 'Đang đăng tải video lên các nền tảng',
    published: 'Đã đăng tải thành công lên tất cả nền tảng!',
    failed: 'Pipeline gặp lỗi, có thể retry',
    cancelled: 'Job đã bị hủy bởi người dùng',
};

// ── State ───────────────────────────────────
let connected = false;
let statusChart = null;
let jobs = [];
let currentFilter = '';
let selectedJobId = null;
let detailRefreshTimer = null;
let historyJobs = [];
let historyPage = 1;
let historyFilter = '';

// ── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initDarkMode();
    checkConnection();
    bindEvents();
    setInterval(loadData, 10000);
});

function initDarkMode() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
    }
}

function initChart() {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;
    const isDark = document.documentElement.classList.contains('dark');
    statusChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Completed', 'Processing', 'Failed', 'Queued'],
            datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#10b981', '#3b82f6', '#ef4444', '#6b7280'], borderWidth: 2, borderColor: isDark ? '#1e232e' : '#ffffff', hoverOffset: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1f2937', padding: 12, cornerRadius: 8, titleFont: { family: 'Inter', size: 13 }, bodyFont: { family: 'Inter', size: 13 } } } }
    });

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
            if (m.attributeName === 'class' && statusChart) {
                statusChart.data.datasets[0].borderColor = document.documentElement.classList.contains('dark') ? '#1e232e' : '#ffffff';
                statusChart.update();
            }
        });
    });
    observer.observe(document.documentElement, { attributes: true });
}

async function checkConnection() {
    const statusEl = document.getElementById('connection-status');
    try {
        const resp = await fetch(API_BASE + '/api/health');
        if (resp.ok) {
            const data = await resp.json();
            connected = true;
            statusEl.className = 'hidden md:flex items-center px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium';
            statusEl.innerHTML = '<span class="w-2 h-2 mr-2 rounded-full bg-green-500"></span>Connected';
            addLog('success', 'Server connected • Supabase: ' + (data.supabase ? '✅' : '❌'));
            loadData();
        } else throw new Error('');
    } catch (e) {
        connected = false;
        statusEl.className = 'hidden md:flex items-center px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium';
        statusEl.innerHTML = '<span class="w-2 h-2 mr-2 rounded-full bg-red-500 animate-pulse"></span>Disconnected';
        addLog('error', 'Chạy: npm run server');
        renderDemoData();
    }
}

// ── Events ──────────────────────────────────
function bindEvents() {
    document.getElementById('btn-refresh').addEventListener('click', () => checkConnection());
    document.getElementById('btn-new-job').addEventListener('click', () => toggleModal(true));
    document.getElementById('modal-close').addEventListener('click', () => toggleModal(false));
    document.getElementById('modal-cancel').addEventListener('click', () => toggleModal(false));
    document.getElementById('modal-submit').addEventListener('click', createJob);
    document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) toggleModal(false); });
    document.getElementById('filter-status').addEventListener('change', (e) => { currentFilter = e.target.value; renderJobs(); });

    // Job Detail
    document.getElementById('detail-close').addEventListener('click', closeJobDetail);
    document.getElementById('job-detail-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeJobDetail(); });
    document.getElementById('detail-cancel-job').addEventListener('click', () => cancelJob(selectedJobId));
    document.getElementById('detail-retry-job').addEventListener('click', () => retryJob(selectedJobId));
    document.getElementById('detail-publish-job').addEventListener('click', () => publishJob(selectedJobId));
    const detailDeleteBtn = document.getElementById('detail-delete-job');
    if (detailDeleteBtn) detailDeleteBtn.addEventListener('click', () => deleteJob(selectedJobId));

    // Assets Manager
    document.getElementById('assets-close').addEventListener('click', closeAssetsManager);
    document.getElementById('assets-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeAssetsManager(); });
    document.getElementById('assets-filter').addEventListener('change', (e) => { loadAssets(e.target.value); });

    // Pipeline History
    const historyCloseBtn = document.getElementById('history-close');
    if (historyCloseBtn) historyCloseBtn.addEventListener('click', closePipelineHistory);
    const historyOverlay = document.getElementById('history-overlay');
    if (historyOverlay) historyOverlay.addEventListener('click', (e) => { if (e.target === e.currentTarget) closePipelineHistory(); });
    const historyFilterEl = document.getElementById('history-filter');
    if (historyFilterEl) historyFilterEl.addEventListener('change', (e) => { historyFilter = e.target.value; historyPage = 1; loadPipelineHistory(); });
}

// ── Load Data ───────────────────────────────
async function loadData() {
    if (!connected) return;
    try {
        const [statsResp, jobsResp, analyticsResp] = await Promise.allSettled([
            fetch(API_BASE + '/api/stats').then(r => r.ok ? r.json() : null),
            fetch(API_BASE + '/api/jobs?limit=50').then(r => r.ok ? r.json() : null),
            fetch(API_BASE + '/api/analytics').then(r => r.ok ? r.json() : null),
        ]);
        const stats = statsResp.status === 'fulfilled' ? statsResp.value : null;
        const jobsData = jobsResp.status === 'fulfilled' ? jobsResp.value : null;
        const analytics = analyticsResp.status === 'fulfilled' ? analyticsResp.value : null;
        if (stats) renderStats(stats);
        if (jobsData) { jobs = Array.isArray(jobsData) ? jobsData : (jobsData.data || []); renderJobs(); }
        if (analytics) renderAnalytics(Array.isArray(analytics) ? analytics : []);
    } catch (e) { /* silent */ }
}

// ── Render Stats ────────────────────────────

function renderStats(s) {
    setText('stat-total-jobs', (s.total_jobs || 0).toLocaleString());
    setText('stat-active-jobs', s.active_jobs || 0);
    setText('stat-published', s.published_today || 0);
    setText('stat-total-views', formatCompact(s.total_views || 0));
    setText('stat-total-likes', formatCompact(s.total_likes || 0));
    setText('stat-media-count', (s.media_count || 0).toLocaleString());
    updateChart(s);
}

function updateChart(s) {
    if (!statusChart) return;
    const bd = s.status_breakdown || {};
    const completed = (bd.published || 0) + (bd.ready_to_publish || 0);
    const processing = (bd.scraping || 0) + (bd.analyzing || 0) + (bd.generating_script || 0) + (bd.generating_media || 0) + (bd.editing || 0) + (bd.publishing || 0);
    const failed = bd.failed || 0;
    const queued = (bd.pending || 0) + (bd.cancelled || 0);
    const total = completed + processing + failed + queued || 1;
    statusChart.data.datasets[0].data = [completed, processing, failed, queued];
    statusChart.update();
    setText('chart-center-value', Math.round((completed / total) * 100) + '%');
}

// ── Render Jobs Table ───────────────────────

function renderJobs() {
    const tbody = document.getElementById('jobs-tbody');
    if (!tbody) return;
    const filtered = currentFilter ? jobs.filter(j => j.status === currentFilter) : jobs;

    if (filtered.length === 0) {
        tbody.innerHTML = `
      <tr class="bg-surface-light dark:bg-surface-dark-elevated">
        <td colspan="6" class="px-6 py-16">
          <div class="flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
              <span class="material-icons-round text-4xl text-gray-400 dark:text-gray-600">${currentFilter ? 'filter_alt' : 'inbox'}</span>
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">${currentFilter ? 'Không có jobs' : 'Chưa có jobs nào'}</h3>
            <p class="text-sm text-text-light-secondary dark:text-text-dark-secondary max-w-xs">${currentFilter ? 'Thử filter khác' : "Nhấn 'New Job' để bắt đầu"}</p>
          </div>
        </td>
      </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(job => {
        const info = STATUS_MAP[job.status] || STATUS_MAP.pending;
        const pColor = PROGRESS_COLORS[job.status] || 'bg-gray-400';
        const pct = job.progress_pct || 0;
        const timeAgo = formatTimeAgo(job.created_at);
        const jobId = (job.id || '').substring(0, 8);
        const isActive = ['scraping', 'analyzing', 'generating_script', 'generating_media', 'editing', 'publishing'].includes(job.status);

        return `
      <tr class="bg-surface-light dark:bg-surface-dark-elevated hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer" onclick="openJobDetail('${job.id}')">
        <td class="px-6 py-4 font-medium text-gray-900 dark:text-white">#${esc(jobId)}</td>
        <td class="px-6 py-4">
          <div class="flex items-center space-x-2">
            <div class="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
              <span class="material-icons-round text-primary text-xs">${info.icon}</span>
            </div>
            <span class="truncate max-w-[150px]">${esc(job.product_name || job.title || '—')}</span>
          </div>
        </td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.bg} border">${info.label}</span>
        </td>
        <td class="px-6 py-4 w-48">
          ${pct > 0 ? `<div class="flex items-center justify-between text-xs mb-1"><span>${pct}%</span></div>` : ''}
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div class="${pColor} h-1.5 rounded-full relative overflow-hidden transition-all" style="width:${pct}%">
              ${isActive ? '<div class="absolute inset-0 w-full h-full bg-white/20 animate-shimmer"></div>' : ''}
            </div>
          </div>
          ${job.status === 'failed' && job.error_message ? `<span class="text-[10px] text-red-500 mt-1 block truncate max-w-[180px]">${esc(job.error_message)}</span>` : ''}
        </td>
        <td class="px-6 py-4 text-xs">${timeAgo}</td>
        <td class="px-6 py-4 text-right" onclick="event.stopPropagation()">
          ${job.status === 'failed' ? `<button onclick="retryJob('${job.id}')" class="text-gray-400 hover:text-primary transition-colors p-1" title="Retry"><span class="material-icons-round text-lg">replay</span></button>` : ''}
          ${job.status === 'ready_to_publish' ? `<button onclick="publishJob('${job.id}')" class="text-gray-400 hover:text-green-500 transition-colors p-1" title="Publish"><span class="material-icons-round text-lg">rocket_launch</span></button>` : ''}
          ${isActive ? `<button onclick="cancelJob('${job.id}')" class="text-gray-400 hover:text-red-500 transition-colors p-1" title="Cancel"><span class="material-icons-round text-lg">cancel</span></button>` : ''}
          ${['published', 'failed', 'cancelled', 'pending'].includes(job.status) ? `<button onclick="deleteJob('${job.id}')" class="text-gray-400 hover:text-red-500 transition-colors p-1" title="Xóa"><span class="material-icons-round text-lg">delete_outline</span></button>` : ''}
          <button onclick="openJobDetail('${job.id}')" class="text-gray-400 hover:text-primary transition-colors p-1" title="Detail"><span class="material-icons-round text-lg">chevron_right</span></button>
        </td>
      </tr>`;
    }).join('');
}

function renderAnalytics(data) {
    let total = 0;
    const platforms = {};
    for (const item of data) { platforms[item.platform] = item.total_views || 0; total += item.total_views || 0; }
    total = total || 1;
    const map = { tiktok: { text: 'analytics-tiktok', bar: 'bar-tiktok' }, instagram_reels: { text: 'analytics-instagram', bar: 'bar-instagram' }, facebook_reels: { text: 'analytics-facebook', bar: 'bar-facebook' } };
    for (const [platform, els] of Object.entries(map)) {
        const views = platforms[platform] || 0;
        const pct = Math.round((views / total) * 100);
        setText(els.text, pct + '%');
        const barEl = document.getElementById(els.bar);
        if (barEl) barEl.style.width = pct + '%';
    }
}

function renderDemoData() {
    ['stat-total-jobs', 'stat-active-jobs', 'stat-published', 'stat-total-views', 'stat-total-likes', 'stat-media-count'].forEach(id => setText(id, '0'));
}

// ── Job Detail Modal ────────────────────────

async function openJobDetail(jobId) {
    selectedJobId = jobId;
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    const overlay = document.getElementById('job-detail-overlay');
    overlay.style.display = 'flex';

    renderJobDetail(job);

    // Load logs + media
    loadJobLogs(jobId);
    loadJobMedia(jobId);

    // Auto-refresh detail if job is active
    clearInterval(detailRefreshTimer);
    const isActive = !['published', 'failed', 'cancelled', 'ready_to_publish'].includes(job.status);
    if (isActive) {
        detailRefreshTimer = setInterval(async () => {
            await loadData();
            const updatedJob = jobs.find(j => j.id === jobId);
            if (updatedJob) {
                renderJobDetail(updatedJob);
                loadJobLogs(jobId);
                loadJobMedia(jobId);
            }
        }, 3000);
    }
}

function renderJobDetail(job) {
    const info = STATUS_MAP[job.status] || STATUS_MAP.pending;

    // Header
    setText('detail-title', job.title || job.product_name || 'Job Detail');
    setText('detail-subtitle', '#' + (job.id || '').substring(0, 12) + ' • ' + formatTimeAgo(job.created_at));

    const badge = document.getElementById('detail-status-badge');
    badge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + info.bg + ' border';
    badge.textContent = info.label;

    // Pipeline Steps
    renderPipelineSteps(job);

    // Current step description
    setText('detail-step-desc', STEP_DESCRIPTIONS[job.status] || 'Unknown step');
    const currentStepBox = document.getElementById('detail-current-step');
    if (['published', 'cancelled'].includes(job.status)) {
        currentStepBox.style.display = 'none';
    } else if (job.status === 'failed') {
        currentStepBox.style.display = 'block';
        currentStepBox.className = 'mb-6 p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800';
        currentStepBox.querySelector('div').innerHTML = '<span class="material-icons-round text-red-500 text-sm">error</span><span class="text-sm font-medium text-red-700 dark:text-red-400 ml-2">Pipeline Failed</span>';
    } else {
        currentStepBox.style.display = 'block';
        currentStepBox.className = 'mb-6 p-4 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20';
        currentStepBox.querySelector('div').innerHTML = '<div class="w-3 h-3 bg-primary rounded-full animate-pulse"></div><span class="text-sm font-medium text-gray-900 dark:text-white ml-2">' + info.label + '</span>';
    }

    // Info grid
    const config = job.config || {};
    setText('detail-url', config.source_url || '—');
    setText('detail-style', config.video_style || '—');
    setText('detail-created', job.created_at ? new Date(job.created_at).toLocaleString('vi-VN') : '—');

    const pct = job.progress_pct || 0;
    setText('detail-progress-text', pct + '%');
    const pBar = document.getElementById('detail-progress-bar');
    if (pBar) pBar.style.width = pct + '%';

    // Error box
    const errorBox = document.getElementById('detail-error-box');
    if (job.status === 'failed' && job.error_message) {
        errorBox.style.display = 'block';
        setText('detail-error-msg', job.error_message);
    } else {
        errorBox.style.display = 'none';
    }

    // Footer actions visibility
    const cancelBtn = document.getElementById('detail-cancel-job');
    const retryBtn = document.getElementById('detail-retry-job');
    const publishBtn = document.getElementById('detail-publish-job');
    const deleteBtn = document.getElementById('detail-delete-job');
    const isActive = !['published', 'failed', 'cancelled', 'ready_to_publish'].includes(job.status);
    cancelBtn.style.display = (isActive || job.status === 'pending') ? 'flex' : 'none';
    retryBtn.style.display = job.status === 'failed' ? 'flex' : 'none';
    publishBtn.style.display = job.status === 'ready_to_publish' ? 'flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = ['published', 'failed', 'cancelled', 'pending'].includes(job.status) ? 'flex' : 'none';
}

function renderPipelineSteps(job) {
    const container = document.getElementById('detail-steps');
    const track = document.getElementById('detail-progress-track');
    if (!container) return;

    // Find current step index
    const statusOrder = PIPELINE_STEPS.map(s => s.key);
    let currentIdx = statusOrder.indexOf(job.status);
    if (job.status === 'published' || job.status === 'publishing') currentIdx = statusOrder.length;
    if (job.status === 'failed') currentIdx = Math.max(0, statusOrder.indexOf(job.current_step || 'pending'));
    if (job.status === 'cancelled') currentIdx = -1;

    const trackPct = currentIdx >= 0 ? Math.min(100, (currentIdx / (PIPELINE_STEPS.length - 1)) * 100) : 0;
    if (track) track.style.width = trackPct + '%';

    container.innerHTML = PIPELINE_STEPS.map((step, i) => {
        let state = 'upcoming'; // gray
        if (i < currentIdx) state = 'completed';
        if (i === currentIdx && !['failed', 'cancelled', 'published'].includes(job.status)) state = 'current';
        if (job.status === 'failed' && i === currentIdx) state = 'failed';
        if (job.status === 'published' || job.status === 'publishing') state = 'completed';
        if (job.status === 'cancelled') state = 'cancelled';

        const colors = {
            completed: 'bg-green-500 text-white',
            current: 'bg-primary text-white ring-4 ring-primary/30 animate-pulse',
            failed: 'bg-red-500 text-white',
            cancelled: 'bg-gray-400 text-white',
            upcoming: 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
        };

        return `
      <div class="flex flex-col items-center" style="width:${100 / PIPELINE_STEPS.length}%">
        <div class="w-10 h-10 rounded-full flex items-center justify-center text-xs ${colors[state]} transition-all duration-300">
          <span class="material-icons-round text-base">${state === 'completed' ? 'check' : step.icon}</span>
        </div>
        <span class="text-[10px] mt-1.5 font-medium text-center ${state === 'current' ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}">${step.label}</span>
      </div>`;
    }).join('');
}

async function loadJobLogs(jobId) {
    const logsEl = document.getElementById('detail-logs');
    if (!logsEl) return;

    try {
        const resp = await fetch(API_BASE + '/api/jobs/' + jobId + '/logs');
        if (!resp.ok) throw new Error('Failed');
        const logs = await resp.json();

        if (!logs || logs.length === 0) {
            logsEl.innerHTML = '<p class="text-xs text-gray-400 italic">Chưa có logs</p>';
            return;
        }

        logsEl.innerHTML = logs.slice(0, 20).map(log => {
            const dotColor = log.level === 'error' ? 'bg-red-500' : log.level === 'info' ? 'bg-blue-500' : 'bg-green-500';
            const time = log.created_at ? new Date(log.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
            return `
        <div class="flex items-start space-x-2 text-xs">
          <div class="w-1.5 h-1.5 ${dotColor} rounded-full mt-1.5 shrink-0"></div>
          <span class="text-gray-400 shrink-0 font-mono">${time}</span>
          <span class="text-gray-700 dark:text-gray-300">${esc(log.message)}</span>
        </div>`;
        }).join('');
    } catch (e) {
        logsEl.innerHTML = '<p class="text-xs text-gray-400 italic">Logs không khả dụng</p>';
    }
}

function closeJobDetail() {
    document.getElementById('job-detail-overlay').style.display = 'none';
    selectedJobId = null;
    clearInterval(detailRefreshTimer);
}

async function loadJobMedia(jobId) {
    const mediaEl = document.getElementById('detail-media');
    if (!mediaEl) return;

    try {
        const resp = await fetch(API_BASE + '/api/jobs/' + jobId + '/media');
        if (!resp.ok) throw new Error('Failed');
        const media = await resp.json();

        if (!media || media.length === 0) {
            mediaEl.innerHTML = '<p class="text-xs text-gray-400 italic">Chưa có media assets</p>';
            return;
        }

        mediaEl.innerHTML = media.map(m => {
            const isImage = (m.type || '').includes('image');
            const isVideo = (m.type || '').includes('video');
            const isAudio = (m.type || '').includes('audio');
            const typeLabel = (m.type || '').replace(/_/g, ' ');

            if (isVideo && m.r2_url && !m.r2_url.includes('placeholder')) {
                return `
                <div class="relative group rounded-lg overflow-hidden border border-border-light dark:border-border-dark">
                    <video src="${esc(m.r2_url)}" controls preload="metadata" class="w-full h-auto max-h-40 bg-black rounded-lg"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"></video>
                    <div class="items-center justify-center p-4 bg-gray-100 dark:bg-white/5" style="display:none">
                        <span class="material-icons-round text-purple-500 mr-2">movie</span>
                        <span class="text-xs text-gray-500">${typeLabel}</span>
                    </div>
                    <div class="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white">${typeLabel}</div>
                    ${m.r2_url ? `<a href="${esc(m.r2_url)}" target="_blank" class="absolute bottom-1 right-1 p-1 bg-black/50 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-icons-round text-xs">open_in_new</span></a>` : ''}
                </div>`;
            }

            if (isImage && m.r2_url) {
                return `
                <div class="relative group rounded-lg overflow-hidden border border-border-light dark:border-border-dark">
                    <img src="${esc(m.r2_url)}" alt="" class="w-full h-auto max-h-40 object-cover bg-gray-100 dark:bg-white/5 rounded-lg"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="items-center justify-center p-4 bg-gray-100 dark:bg-white/5" style="display:none">
                        <span class="material-icons-round text-blue-500 mr-2">image</span>
                        <span class="text-xs text-gray-500">${typeLabel}</span>
                    </div>
                    <div class="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white">${typeLabel}</div>
                    ${m.r2_url ? `<a href="${esc(m.r2_url)}" target="_blank" class="absolute bottom-1 right-1 p-1 bg-black/50 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-icons-round text-xs">open_in_new</span></a>` : ''}
                </div>`;
            }

            if (isAudio && m.r2_url) {
                return `
                <div class="p-3 rounded-lg border border-border-light dark:border-border-dark bg-gray-50 dark:bg-white/5">
                    <div class="flex items-center space-x-2 mb-2">
                        <span class="material-icons-round text-orange-500 text-sm">audiotrack</span>
                        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">${typeLabel}</span>
                    </div>
                    <audio controls preload="metadata" class="w-full h-8" style="min-width:0">
                        <source src="${esc(m.r2_url)}" type="audio/mpeg">
                    </audio>
                </div>`;
            }

            // Fallback - unknown type
            return `
            <div class="p-3 rounded-lg border border-border-light dark:border-border-dark bg-gray-50 dark:bg-white/5 flex items-center space-x-2">
                <span class="material-icons-round text-gray-400">insert_drive_file</span>
                <div>
                    <p class="text-xs font-medium text-gray-700 dark:text-gray-300">${typeLabel}</p>
                    <p class="text-[10px] text-gray-400">${formatFileSize(m.file_size)}</p>
                </div>
                ${m.r2_url ? `<a href="${esc(m.r2_url)}" target="_blank" class="ml-auto text-gray-400 hover:text-primary"><span class="material-icons-round text-sm">open_in_new</span></a>` : ''}
            </div>`;
        }).join('');
    } catch (e) {
        mediaEl.innerHTML = '<p class="text-xs text-gray-400 italic">Media không khả dụng</p>';
    }
}

// ── Actions ─────────────────────────────────

async function createJob() {
    const url = document.getElementById('input-url').value.trim();
    if (!url) { showToast('error', 'Nhập URL sản phẩm!'); return; }
    if (!connected) { showToast('error', 'Server chưa kết nối!'); return; }

    const style = document.getElementById('input-style').value;
    const duration = parseInt(document.getElementById('input-duration').value) || 30;
    const useVeo = document.getElementById('chk-veo')?.checked || false;
    const platforms = [];
    if (document.getElementById('chk-tiktok').checked) platforms.push('tiktok');
    if (document.getElementById('chk-instagram').checked) platforms.push('instagram_reels');
    if (document.getElementById('chk-facebook').checked) platforms.push('facebook_reels');

    try {
        const resp = await fetch(API_BASE + '/api/pipeline/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, options: { videoStyle: style, videoDuration: duration, platforms, useVeo } }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Server error');
        showToast('success', '🚀 Pipeline started!');
        addLog('success', 'Pipeline: ' + url.substring(0, 50));
        toggleModal(false);
        document.getElementById('input-url').value = '';
        loadData();
        setTimeout(loadData, 3000);
    } catch (err) {
        showToast('error', 'Lỗi: ' + err.message);
    }
}

async function retryJob(jobId) {
    try {
        await fetch(API_BASE + '/api/jobs/' + jobId + '/retry', { method: 'POST' });
        showToast('success', '🔄 Retry started');
        addLog('info', 'Retry job #' + jobId.substring(0, 8));
        loadData();
        closeJobDetail();
    } catch (err) { showToast('error', 'Retry failed: ' + err.message); }
}

async function cancelJob(jobId) {
    if (!confirm('Bạn có chắc muốn hủy job này?')) return;
    try {
        await fetch(API_BASE + '/api/jobs/' + jobId + '/cancel', { method: 'POST' });
        showToast('info', '🚫 Job đã hủy');
        addLog('warn', 'Cancelled job #' + jobId.substring(0, 8));
        loadData();
        closeJobDetail();
    } catch (err) { showToast('error', 'Cancel failed: ' + err.message); }
}

async function publishJob(jobId) {
    try {
        await fetch(API_BASE + '/api/jobs/' + jobId + '/publish', { method: 'POST' });
        showToast('success', '📡 Publishing...');
        addLog('info', 'Publish job #' + jobId.substring(0, 8));
        loadData();
        closeJobDetail();
    } catch (err) { showToast('error', 'Publish failed: ' + err.message); }
}

async function deleteJob(jobId) {
    if (!confirm('Bạn có chắc muốn XÓA job này? Thao tác này không thể hoàn tác!')) return;
    try {
        const resp = await fetch(API_BASE + '/api/jobs/' + jobId, { method: 'DELETE' });
        if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || 'Server error'); }
        showToast('success', '🗑️ Đã xóa job thành công');
        addLog('warn', 'Deleted job #' + jobId.substring(0, 8));
        jobs = jobs.filter(j => j.id !== jobId);
        renderJobs();
        loadData();
        closeJobDetail();
    } catch (err) { showToast('error', 'Xóa thất bại: ' + err.message); }
}

// ── Pipeline History ────────────────────────

async function openPipelineHistory() {
    const overlay = document.getElementById('history-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    historyPage = 1;
    historyFilter = '';
    const filterEl = document.getElementById('history-filter');
    if (filterEl) filterEl.value = '';
    await loadPipelineHistory();
}

function closePipelineHistory() {
    const overlay = document.getElementById('history-overlay');
    if (overlay) overlay.style.display = 'none';
}

async function loadPipelineHistory() {
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = '<div class="flex items-center justify-center py-16"><span class="material-icons-round animate-spin text-2xl text-primary">autorenew</span></div>';

    try {
        let url = API_BASE + '/api/pipeline-history?page=' + historyPage + '&limit=30';
        if (historyFilter) url += '&status=' + historyFilter;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed');
        const result = await resp.json();
        historyJobs = result.data || [];
        renderPipelineHistory(historyJobs, result.total || 0);
    } catch (err) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center py-16"><span class="material-icons-round text-4xl text-gray-400 mb-2">cloud_off</span><p class="text-sm text-gray-400">Không tải được lịch sử pipeline</p></div>';
    }
}

function renderPipelineHistory(data, total) {
    const container = document.getElementById('history-list');
    const countEl = document.getElementById('history-count');
    if (countEl) countEl.textContent = total + ' quy trình';

    if (data.length === 0) {
        container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16">
            <div class="w-20 h-20 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                <span class="material-icons-round text-4xl text-gray-400 dark:text-gray-600">history</span>
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">Chưa có quy trình nào</h3>
            <p class="text-sm text-text-light-secondary dark:text-text-dark-secondary">Tạo job mới để bắt đầu</p>
        </div>`;
        return;
    }

    container.innerHTML = data.map(job => {
        const info = STATUS_MAP[job.status] || STATUS_MAP.pending;
        const pct = job.progress_pct || 0;
        const created = job.created_at ? new Date(job.created_at).toLocaleString('vi-VN') : '—';
        const completed = job.completed_at ? new Date(job.completed_at).toLocaleString('vi-VN') : '—';
        const duration = (job.created_at && job.completed_at)
            ? formatDuration(new Date(job.completed_at) - new Date(job.created_at))
            : '—';
        const config = job.config || {};
        const logs = job.logs || [];
        const jobIdShort = (job.id || '').substring(0, 8);

        const logsHtml = logs.length > 0
            ? logs.slice(0, 15).map(log => {
                const dotColor = log.level === 'error' ? 'bg-red-500' : log.level === 'info' ? 'bg-blue-500' : 'bg-green-500';
                const time = log.created_at ? new Date(log.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                return `<div class="flex items-start space-x-2 text-xs py-0.5">
                    <div class="w-1.5 h-1.5 ${dotColor} rounded-full mt-1.5 shrink-0"></div>
                    <span class="text-gray-400 shrink-0 font-mono">${time}</span>
                    <span class="text-gray-700 dark:text-gray-300">${esc(log.message)}</span>
                </div>`;
            }).join('')
            : '<p class="text-xs text-gray-400 italic">Không có logs</p>';

        return `
        <div class="border border-border-light dark:border-border-dark rounded-xl overflow-hidden hover:border-primary/30 transition-all mb-3">
            <div class="p-4 bg-surface-light dark:bg-surface-dark-elevated">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                        <span class="material-icons-round text-primary text-sm">tag</span>
                        <span class="font-medium text-gray-900 dark:text-white text-sm">#${esc(jobIdShort)}</span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${info.bg} border">${info.label}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="openJobDetail('${job.id}')" class="text-gray-400 hover:text-primary transition-colors p-1" title="Chi tiết">
                            <span class="material-icons-round text-sm">open_in_new</span>
                        </button>
                        ${['published', 'failed', 'cancelled', 'pending'].includes(job.status) ? `<button onclick="deleteJobFromHistory('${job.id}')" class="text-gray-400 hover:text-red-500 transition-colors p-1" title="Xóa">
                            <span class="material-icons-round text-sm">delete_outline</span>
                        </button>` : ''}
                    </div>
                </div>
                <p class="text-xs text-gray-700 dark:text-gray-300 mb-2 truncate">${esc(job.title || '—')}</p>
                <div class="grid grid-cols-4 gap-2 text-[10px]">
                    <div class="p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                        <p class="text-gray-400 uppercase tracking-wider">Bắt đầu</p>
                        <p class="text-gray-800 dark:text-gray-200 mt-0.5">${created}</p>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                        <p class="text-gray-400 uppercase tracking-wider">Kết thúc</p>
                        <p class="text-gray-800 dark:text-gray-200 mt-0.5">${completed}</p>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                        <p class="text-gray-400 uppercase tracking-wider">Thời gian</p>
                        <p class="text-gray-800 dark:text-gray-200 mt-0.5">${duration}</p>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                        <p class="text-gray-400 uppercase tracking-wider">Tiến độ</p>
                        <p class="text-gray-800 dark:text-gray-200 mt-0.5">${pct}%</p>
                    </div>
                </div>
                ${config.source_url ? `<p class="text-[10px] text-gray-400 mt-2 truncate font-mono">🔗 ${esc(config.source_url)}</p>` : ''}
                ${job.error_message ? `<div class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"><p class="text-[10px] text-red-600 dark:text-red-300">❌ ${esc(job.error_message)}</p></div>` : ''}
            </div>
            <details class="group">
                <summary class="px-4 py-2 bg-gray-50 dark:bg-black/20 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex items-center space-x-1.5 select-none">
                    <span class="material-icons-round text-xs group-open:rotate-90 transition-transform">chevron_right</span>
                    <span>Logs (${logs.length} entries)</span>
                </summary>
                <div class="px-4 py-3 bg-gray-50/50 dark:bg-black/10 max-h-48 overflow-y-auto space-y-1">
                    ${logsHtml}
                </div>
            </details>
        </div>`;
    }).join('');

    // Pagination
    const totalPages = Math.ceil(total / 30);
    if (totalPages > 1) {
        container.innerHTML += `
        <div class="flex items-center justify-center space-x-2 py-4">
            <button onclick="historyPage = Math.max(1, historyPage - 1); loadPipelineHistory()" class="px-3 py-1.5 text-xs rounded-lg border border-border-light dark:border-border-dark hover:bg-gray-100 dark:hover:bg-white/5 transition-colors ${historyPage <= 1 ? 'opacity-50 pointer-events-none' : ''}">← Trước</button>
            <span class="text-xs text-gray-500">Trang ${historyPage} / ${totalPages}</span>
            <button onclick="historyPage = Math.min(${totalPages}, historyPage + 1); loadPipelineHistory()" class="px-3 py-1.5 text-xs rounded-lg border border-border-light dark:border-border-dark hover:bg-gray-100 dark:hover:bg-white/5 transition-colors ${historyPage >= totalPages ? 'opacity-50 pointer-events-none' : ''}">Tiếp →</button>
        </div>`;
    }
}

async function deleteJobFromHistory(jobId) {
    if (!confirm('Bạn có chắc muốn XÓA quy trình này?')) return;
    try {
        const resp = await fetch(API_BASE + '/api/jobs/' + jobId, { method: 'DELETE' });
        if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || 'Server error'); }
        showToast('success', '🗑️ Đã xóa quy trình');
        await loadPipelineHistory();
        loadData();
    } catch (err) { showToast('error', 'Xóa thất bại: ' + err.message); }
}

function formatDuration(ms) {
    if (!ms || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
}

// ── Helpers ─────────────────────────────────

function toggleModal(show) {
    const m = document.getElementById('modal-overlay');
    if (m) m.style.display = show ? 'flex' : 'none';
    if (show) document.getElementById('input-url')?.focus();
}

function addLog(level, msg) {
    const feed = document.getElementById('log-feed');
    if (!feed) return;
    const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const dotColor = LOG_DOT_COLORS[level] || 'bg-gray-400';
    const entry = document.createElement('div');
    entry.className = 'mb-4 pl-5 relative log-entry';
    entry.innerHTML = `
    <div class="absolute w-2.5 h-2.5 ${dotColor} rounded-full -left-[5.5px] top-1.5 ring-4 ring-surface-light dark:ring-surface-dark-elevated"></div>
    <p class="text-sm text-gray-800 dark:text-gray-200 font-medium">${esc(msg)}</p>
    <span class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 block">${now}</span>
  `;
    if (feed.firstChild) feed.insertBefore(entry, feed.firstChild);
    else feed.appendChild(entry);
    while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

function showToast(type, msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 200); }, 4000);
}

function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function formatCompact(num) { if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'; if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'; return num.toString(); }
function formatTimeAgo(d) { if (!d) return '—'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return 'vừa xong'; if (m < 60) return m + ' phút trước'; const h = Math.floor(m / 60); if (h < 24) return h + ' giờ trước'; return Math.floor(h / 24) + ' ngày trước'; }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function formatFileSize(bytes) { if (!bytes) return '—'; if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'; if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB'; return bytes + ' B'; }

// ── Assets Manager ──────────────────────────

let assetsData = [];

async function openAssetsManager() {
    document.getElementById('assets-overlay').style.display = 'flex';
    document.getElementById('assets-filter').value = '';
    loadAssets();
}

// ── AI Labs ─────────────────────────────────

function openAILabs() {
    document.getElementById('ai-labs-overlay').style.display = 'flex';
}

function closeAILabs() {
    document.getElementById('ai-labs-overlay').style.display = 'none';
}

function previewLabUpload(input) {
    const preview = document.getElementById('lab-upload-preview');
    const hint = document.getElementById('lab-upload-hint');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            hint.classList.add('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function labGenerateImage() {
    const prompt = document.getElementById('lab-gen-prompt').value.trim();
    const btn = document.getElementById('btn-lab-generate');
    const resultArea = document.getElementById('lab-gen-result');

    if (!prompt) { showToast('error', 'Nhập mô tả ảnh muốn tạo!'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round animate-spin text-sm mr-2">sync</span> Đang tạo ảnh...';

    try {
        const resp = await fetch(API_BASE + '/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Lỗi tạo ảnh');

        resultArea.innerHTML = `
            <div class="relative group rounded-lg overflow-hidden border border-border-light dark:border-border-dark">
                <img src="${esc(data.r2_url)}" class="w-full h-auto rounded-lg shadow-inner">
                <div class="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href="${esc(data.r2_url)}" target="_blank" class="p-1.5 bg-black/60 text-white rounded hover:bg-black"><span class="material-icons-round text-sm">open_in_new</span></a>
                </div>
                <p class="mt-2 text-[10px] text-gray-500 italic p-1">"${esc(prompt)}"</p>
            </div>
        `;
        resultArea.classList.remove('hidden');
        showToast('success', 'Đã tạo ảnh thành công!');
        loadData(); // Refresh stats
    } catch (e) {
        showToast('error', e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round text-sm mr-2">auto_awesome</span> Tạo ảnh ngay';
    }
}

async function labEditImage() {
    const prompt = document.getElementById('lab-edit-prompt').value.trim();
    const fileInput = document.getElementById('lab-edit-file');
    const btn = document.getElementById('btn-lab-edit');
    const resultArea = document.getElementById('lab-edit-result');

    if (!fileInput.files[0]) { showToast('error', 'Hãy tải ảnh sản phẩm lên!'); return; }
    if (!prompt) { showToast('error', 'Cần nhập yêu cầu chỉnh sửa!'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round animate-spin text-sm mr-2">sync</span> Đang sửa ảnh...';

    try {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        formData.append('prompt', prompt);

        const resp = await fetch(API_BASE + '/api/ai/edit-image', {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Lỗi sửa ảnh');

        const editedUrl = data.edited?.r2_url;

        resultArea.innerHTML = `
            <div class="grid grid-cols-2 gap-2 mb-2">
                <div class="text-center">
                    <p class="text-[9px] uppercase text-gray-400 mb-1">Ảnh gốc</p>
                    <img src="${esc(data.original)}" class="w-full h-32 object-cover rounded border border-border-light dark:border-border-dark">
                </div>
                <div class="text-center">
                    <p class="text-[9px] uppercase text-purple-500 mb-1 font-bold">AI Đã Sửa</p>
                    <img src="${esc(editedUrl)}" class="w-full h-32 object-cover rounded border-2 border-purple-500 shadow-glow-sm">
                </div>
            </div>
            <div class="relative group">
                <img src="${esc(editedUrl)}" class="w-full h-auto rounded-lg">
                <a href="${esc(editedUrl)}" target="_blank" class="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100"><span class="material-icons-round text-sm">open_in_new</span></a>
            </div>
        `;
        resultArea.classList.remove('hidden');
        showToast('success', 'Đã sửa ảnh thành công!');
        loadData();
    } catch (e) {
        showToast('error', e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round text-sm mr-2">brush</span> Bắt đầu sửa ảnh';
    }
}

function closeAssetsManager() {
    document.getElementById('assets-overlay').style.display = 'none';
}

async function loadAssets(typeFilter) {
    const grid = document.getElementById('assets-grid');
    if (!grid) return;
    grid.innerHTML = '<p class="col-span-full text-center text-sm text-gray-400 py-10"><span class="material-icons-round animate-spin text-lg">autorenew</span><br>Đang tải...</p>';

    try {
        const url = API_BASE + '/api/media' + (typeFilter ? '?type=' + typeFilter : '');
        const resp = await fetch(url);
        assetsData = await resp.json();
        renderAssets(assetsData);
    } catch (err) {
        grid.innerHTML = '<p class="col-span-full text-center text-sm text-red-400 py-10">Không tải được assets</p>';
    }
}

function renderAssets(assets) {
    const grid = document.getElementById('assets-grid');
    setText('assets-count', assets.length + ' files');

    if (assets.length === 0) {
        grid.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-16">
        <div class="w-20 h-20 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
          <span class="material-icons-round text-4xl text-gray-400 dark:text-gray-600">cloud_off</span>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">Chưa có assets</h3>
        <p class="text-sm text-text-light-secondary dark:text-text-dark-secondary">Tạo job mới để bắt đầu tạo media</p>
      </div>`;
        return;
    }

    grid.innerHTML = assets.map(a => {
        const isImage = (a.type || '').includes('image');
        const isVideo = (a.type || '').includes('video');
        const isAudio = (a.type || '').includes('audio');
        const icon = isImage ? 'image' : isVideo ? 'movie' : isAudio ? 'audiotrack' : 'insert_drive_file';
        const iconColor = isImage ? 'text-blue-500' : isVideo ? 'text-purple-500' : isAudio ? 'text-orange-500' : 'text-gray-500';
        const bgColor = isImage ? 'bg-blue-500/10' : isVideo ? 'bg-purple-500/10' : isAudio ? 'bg-orange-500/10' : 'bg-gray-500/10';
        const typeLabel = (a.type || 'unknown').replace(/_/g, ' ');
        const fileName = a.r2_key ? a.r2_key.split('/').pop() : 'untitled';

        return `
      <div class="group relative bg-white dark:bg-white/5 rounded-xl border border-border-light dark:border-border-dark overflow-hidden hover:shadow-lg transition-all hover:border-primary/30">
        <div class="aspect-square flex items-center justify-center ${bgColor} relative">
          ${isImage && a.r2_url ? `<img src="${esc(a.r2_url)}" alt="" class="absolute inset-0 w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="items-center justify-center" style="display:none"><span class="material-icons-round text-4xl ${iconColor}">${icon}</span></div>` : `<span class="material-icons-round text-4xl ${iconColor}">${icon}</span>`}
          ${a.r2_url ? `<a href="${esc(a.r2_url)}" target="_blank" class="absolute top-2 right-2 p-1.5 bg-black/50 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70" title="Open"><span class="material-icons-round text-sm">open_in_new</span></a>` : ''}
        </div>
        <div class="p-3">
          <p class="text-xs font-medium text-gray-900 dark:text-white truncate" title="${esc(fileName)}">${esc(fileName)}</p>
          <div class="flex items-center justify-between mt-1">
            <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${bgColor} ${iconColor} font-medium">${typeLabel}</span>
            <span class="text-[10px] text-gray-400">${formatFileSize(a.file_size)}</span>
          </div>
          <p class="text-[10px] text-gray-400 mt-1">${formatTimeAgo(a.created_at)}</p>
        </div>
      </div>`;
    }).join('');
}
