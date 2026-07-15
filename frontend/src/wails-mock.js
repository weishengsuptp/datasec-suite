/* Browser mock for preview screenshots */
window.runtime = {
    EventsOn: () => () => {}, EventsOff: () => {}, EventsEmit: () => {},
    LogPrint: console.log, LogTrace: console.trace, LogDebug: console.debug,
    LogInfo: console.info, LogWarning: console.warn, LogError: console.error, LogFatal: console.error,
};

// 从 PDF 真实描述（standards-pdf.js）构造 levels 对象
// 数据结构：{ subdomainId: { dimension: { level: 'desc' } } }
// → levels 格式：{ 1: { 组织建设: '...', ... }, 2: {...}, ... }
function mkLevelsFromPdf(subId) {
    const src = window.STANDARDS_PDF[subId];
    if (!src) return {};
    const out = {};
    for (const dim of ['组织建设', '制度流程', '技术能力', '人员能力']) {
        out[dim] = {};
        const srcDim = src[dim] || {};
        for (let lv = 1; lv <= 5; lv++) {
            const txt = srcDim[lv];
            out[dim][lv] = (txt === '—' || !txt) ? null : txt;
        }
    }
    // 转成 { '1': {...}, '2': {...} } 形态（与原 mock 兼容）
    return {
        '1': { '组织建设': out['组织建设'][1], '制度流程': out['制度流程'][1], '技术能力': out['技术能力'][1], '人员能力': out['人员能力'][1] },
        '2': { '组织建设': out['组织建设'][2], '制度流程': out['制度流程'][2], '技术能力': out['技术能力'][2], '人员能力': out['人员能力'][2] },
        '3': { '组织建设': out['组织建设'][3], '制度流程': out['制度流程'][3], '技术能力': out['技术能力'][3], '人员能力': out['人员能力'][3] },
        '4': { '组织建设': out['组织建设'][4], '制度流程': out['制度流程'][4], '技术能力': out['技术能力'][4], '人员能力': out['人员能力'][4] },
        '5': { '组织建设': out['组织建设'][5], '制度流程': out['制度流程'][5], '技术能力': out['技术能力'][5], '人员能力': out['人员能力'][5] },
    };
}

const SUBDOMAINS_FULL = [
    { id: 'general_security', name: '通用数据安全保障', domain: 0 },
    { id: 'classification', name: '数据分类分级管理', domain: 1 },
    { id: 'collect', name: '数据收集', domain: 2 },
    { id: 'storage', name: '数据存储', domain: 2 },
    { id: 'transit', name: '数据传输', domain: 2 },
    { id: 'usage', name: '数据使用', domain: 2 },
    { id: 'processing', name: '数据加工', domain: 2 },
    { id: 'provision', name: '数据提供', domain: 2 },
    { id: 'entrust', name: '数据委托处理', domain: 2 },
    { id: 'disclosure', name: '数据公开披露', domain: 2 },
    { id: 'delete', name: '数据删除', domain: 2 },
    { id: 'destroy', name: '数据销毁', domain: 2 },
    { id: 'permission', name: '权限安全管理', domain: 3 },
    { id: 'backup', name: '数据备份与恢复', domain: 3 },
    { id: 'newtech', name: '新技术应用风险防控', domain: 3 },
    { id: 'monitoring', name: '数据安全风险监测', domain: 3 },
    { id: 'assessment', name: '数据安全风险评估', domain: 3 },
    { id: 'audit', name: '数据安全合规审计', domain: 3 },
    { id: 'incident', name: '数据安全应急响应与事件处置', domain: 3 },
];

const DOMAIN_NAMES = ['通用数据安全保障', '数据分类分级管理', '数据生命周期安全', '数据安全运营保障'];

const MOCK_STANDARDS = {
    metadata: { standard: 'JR/T 0358-2026', title: '金融数据安全 数据安全能力体系', issuer: '中国人民银行', issue_date: '2026-06-06', version: '1.0' },
    dimensions: ['组织建设', '制度流程', '技术能力', '人员能力'],
    domains: [
        { id: 'general_security', name: DOMAIN_NAMES[0], subdomains: SUBDOMAINS_FULL.filter(s => s.domain === 0).map(s => ({ ...s, levels: mkLevelsFromPdf(s.id, 'jrt0358') })) },
        { id: 'classification', name: DOMAIN_NAMES[1], subdomains: SUBDOMAINS_FULL.filter(s => s.domain === 1).map(s => ({ ...s, levels: mkLevelsFromPdf(s.id, 'jrt0358') })) },
        { id: 'lifecycle', name: DOMAIN_NAMES[2], subdomains: SUBDOMAINS_FULL.filter(s => s.domain === 2).map(s => ({ ...s, levels: mkLevelsFromPdf(s.id, 'jrt0358') })) },
        { id: 'operations', name: DOMAIN_NAMES[3], subdomains: SUBDOMAINS_FULL.filter(s => s.domain === 3).map(s => ({ ...s, levels: mkLevelsFromPdf(s.id, 'jrt0358') })) },
    ],
};

// v0.2 多标准：DSMM（GB/T 37988-2019）占位
// 30 PA × 4 维 × 5 级 = 600 格，由 OCR 解析 build_standards.py 填充。
// 当前占位：空 domains（UI 显示"该标准暂无数据"）。
const MOCK_STANDARDS_GBT = {
    metadata: { standard: 'GB/T 37988-2019', title: '信息安全技术 数据安全能力成熟度模型', issuer: '国家标准化管理委员会', issue_date: '2019-08-30', version: '0.1-placeholder' },
    dimensions: ['组织建设', '制度流程', '技术工具', '人员能力'],
    domains: [], // 30 PA 待 OCR 解析后填充
};

// 真实业务场景的模拟评估（demo 用）
const MOCK_CELLS = {
    'general_security': { '组织建设': { level: 3, note: '已建立数据安全管理委员会' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 2, note: '' }, '人员能力': { level: 3, note: '' } },
    'classification': { '组织建设': { level: 3, note: '' }, '制度流程': { level: 4, note: '' }, '技术能力': { level: 4, note: '' }, '人员能力': { level: 3, note: '' } },
    'collect': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 0, note: '' } },
    'storage': { '组织建设': { level: 4, note: '' }, '制度流程': { level: 4, note: '' }, '技术能力': { level: 5, note: '已部署加密存储 + KMS' }, '人员能力': { level: 4, note: '' } },
    'transit': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 4, note: '' }, '人员能力': { level: 0, note: '' } },
    'usage': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 4, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 0, note: '' } },
    'processing': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 2, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 0, note: '' } },
    'provision': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 0, note: '' } },
    'entrust': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 0, note: '' } },
    'disclosure': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 2, note: '' }, '技术能力': { level: 2, note: '' }, '人员能力': { level: 0, note: '' } },
    'delete': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 2, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 0, note: '' } },
    'destroy': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 2, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 0, note: '' } },
    'permission': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 4, note: '' }, '技术能力': { level: 5, note: '零信任架构已上线' }, '人员能力': { level: 3, note: '' } },
    'backup': { '组织建设': { level: 4, note: '' }, '制度流程': { level: 4, note: '' }, '技术能力': { level: 4, note: '' }, '人员能力': { level: 4, note: '' } },
    'newtech': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 2, note: '' }, '人员能力': { level: 2, note: '' } },
    'monitoring': { '组织建设': { level: 0, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 4, note: '' }, '人员能力': { level: 2, note: '' } },
    'assessment': { '组织建设': { level: 3, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 3, note: '' }, '人员能力': { level: 3, note: '' } },
    'audit': { '组织建设': { level: 3, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 2, note: '' }, '人员能力': { level: 2, note: '' } },
    'incident': { '组织建设': { level: 3, note: '' }, '制度流程': { level: 3, note: '' }, '技术能力': { level: 2, note: '' }, '人员能力': { level: 2, note: '' } },
};

const MOCK_ASSESSMENT = { version: 1, updated_at: '2026-06-25T11:50:00+08:00', cells: MOCK_CELLS };
// v0.2：DSMM 评估独立（空）
const MOCK_CELLS_GBT = {};

// 浏览器端模拟：把当前 assessment 渲染成只读 HTML 并下载
function buildExportHTML() {
    const stds = MOCK_STANDARDS;
    const asm = MOCK_ASSESSMENT;
    const dims = stds.dimensions;
    const groupColors = ['--grp-1', '--grp-2', '--grp-3', '--grp-4'];
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const css = Array.from(document.styleSheets).map(s => { try { return Array.from(s.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');

    let done = 0, total = 0;
    stds.domains.forEach(d => d.subdomains.forEach(s => dims.forEach(dim => { total++; if ((asm.cells[s.id]?.[dim]?.level || 0) > 0) done++; })));

    let defSub = null;
    outer: for (const d of stds.domains) for (const s of d.subdomains) for (const dim of dims) {
        if ((asm.cells[s.id]?.[dim]?.level || 0) > 0) { defSub = s; break outer; }
    }
    if (!defSub) defSub = stds.domains[0].subdomains[0];

    let heat = `<div class="hg hg-corner"></div>`;
    dims.forEach(dim => { heat += `<div class="hg hg-axis">${esc(dim)}</div>`; });
    stds.domains.forEach((dom, domIdx) => {
        if (domIdx > 0) heat += `<div class="hg hg-domain-sep" style="grid-column: 1 / -1"></div>`;
        dom.subdomains.forEach((sub, subIdx) => {
            let filled = 0;
            dims.forEach(dim => { if ((asm.cells[sub.id]?.[dim]?.level || 0) > 0) filled++; });
            const note = filled > 0 ? `<span class="hg-name-note">${filled}/4</span>` : '';
            let cls = 'hg hg-name';
            if (subIdx === dom.subdomains.length - 1 && domIdx < stds.domains.length - 1) cls += ' domain-end';
            heat += `<div class="${cls}" data-sub-id="${esc(sub.id)}">
                <span class="hg-name-tag" style="background: var(${groupColors[domIdx % 4]})"></span>
                <span class="hg-name-label">${esc(sub.name)}</span>${note}
            </div>`;
            dims.forEach(dim => {
                const cell = asm.cells[sub.id]?.[dim] || { level: 0, note: '' };
                let lvCls = `hg-cell lv${cell.level}`;
                if (cell.note) lvCls += ' has-note';
                const text = cell.level === 0 ? '·' : String(cell.level);
                heat += `<div class="${lvCls}" data-sub-id="${esc(sub.id)}" data-dim="${esc(dim)}">${text}</div>`;
            });
        });
    });

    let ref = `<div class="rg rg-corner"></div>`;
    dims.forEach(dim => { ref += `<div class="rg rg-axis">${esc(dim)}</div>`; });
    for (let lvl = 1; lvl <= 5; lvl++) {
        const levelData = defSub.levels[String(lvl)] || {};
        ref += `<div class="rg rg-axis-y rg-axis-y-level" style="color: var(--lv${lvl}-fg); background: var(--lv${lvl}-bg)">Lv${lvl}</div>`;
        dims.forEach(dim => {
            const txt = levelData[dim];
            if (txt) ref += `<div class="rg rg-desc">${esc(txt)}</div>`;
            else ref += `<div class="rg rg-desc dash">— 沿用低一级</div>`;
        });
    }

    return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<title>数据安全能力评估报告 · ${esc(stds.metadata.standard)}</title>
<style>${css}</style>
</head><body>
<div id="app" data-theme="${window.localStorage.getItem('theme') || 'warm'}">
<header class="toolbar">
    <div class="brand-mark">金</div>
    <div class="brand-text">
        <span class="brand-title">数据安全能力评估报告</span>
        <span class="brand-sub">${esc(stds.metadata.standard)} · ${esc(stds.metadata.title)}</span>
    </div>
    <div class="toolbar-spacer"></div>
    <div class="report-meta">
        <span>导出时间 ${new Date().toLocaleString('zh-CN')}</span>
        <span>评估版本 v${asm.version}</span>
        <span>进度 <strong>${done} / ${total}</strong></span>
    </div>
    <div class="theme-switcher" id="theme-switcher">
        <button class="theme-btn" data-theme="warm">暖</button>
        <button class="theme-btn" data-theme="cool">青</button>
        <button class="theme-btn" data-theme="deep">海</button>
    </div>
</header>
<main class="stage">
    <section class="panel panel-heatmap">
        <header class="panel-head"><h2>能力评估热力图</h2><span class="panel-hint">定稿版 · 仅供阅读，不可编辑</span></header>
        <div class="heatmap">${heat}</div>
    </section>
    <section class="panel panel-ref show" id="panel-ref">
        <header class="panel-head"><h2>等级说明 <span class="ref-subname">（${esc(defSub.name)}）</span></h2><span class="panel-hint">"—" 表示沿用低一等级要求</span></header>
        <div class="ref-grid">${ref}</div>
    </section>
</main>
<div id="toast" class="toast"><span class="icon">✓</span><span id="toast-msg"></span></div>
</div>
<script>
(function() {
    const switcher = document.getElementById('theme-switcher');
    const root = document.getElementById('app');
    function setActive(theme) {
        root.dataset.theme = theme;
        switcher.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    }
    switcher.addEventListener('click', e => {
        const btn = e.target.closest('.theme-btn');
        if (btn) setActive(btn.dataset.theme);
    });
    setActive(root.dataset.theme);
})();
<\/script>
</body></html>`;
}

function triggerDownload(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// v0.2 多标准 mock state
let __mockCurrentStandardId = 'jrt0358';
function __mockGetStandardsById(id) {
    return id === 'jrt0358' ? MOCK_STANDARDS : MOCK_STANDARDS_GBT;
}
function __mockGetCellsById(id) {
    return id === 'jrt0358' ? MOCK_CELLS : MOCK_CELLS_GBT;
}

window.go = {
    main: {
        App: {
            // v0.2 多标准 API
            ListStandards: async () => [MOCK_STANDARDS.metadata, MOCK_STANDARDS_GBT.metadata],
            GetStandard: async (id) => __mockGetStandardsById(id),
            GetCurrentStandardID: async () => __mockCurrentStandardId,
            GetCurrentStandard: async () => __mockGetStandardsById(__mockCurrentStandardId),
            SetCurrentStandard: async (id) => { __mockCurrentStandardId = id; return null; },
            LoadAssessment: async (id) => ({
                standard_id: id,
                version: 1,
                updated_at: '2026-06-25T11:50:00+08:00',
                cells: __mockGetCellsById(id),
            }),
            SaveAssessment: async (id, asm) => {
                if (id === 'jrt0358') Object.assign(MOCK_CELLS, asm.cells || {});
                else Object.assign(MOCK_CELLS_GBT, asm.cells || {});
                return null;
            },
            ListHistory: async (id) => [],
            RestoreVersion: async (id, ts) => null,
            // 兼容老代码
            GetStandards: async () => __mockGetStandardsById(__mockCurrentStandardId),
            GetDataDir: async () => 'E:\\jinrongdata\\preview',
            ExportHTML: async () => {
                const html = buildExportHTML();
                const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
                const fname = `assessment-${ts}.html`;
                triggerDownload(html, fname);
                return 'C:\\\\Users\\\\You\\\\Downloads\\\\' + fname;
            },
        },
    },
};