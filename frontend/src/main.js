import './style.css';
import {
    ListStandards,
    GetStandard,
    GetCurrentStandard,
    GetCurrentStandardID,
    SetCurrentStandard,
    LoadAssessment,
    SaveAssessment,
    ExportHTML,
    ImportHTML,
    ListHistory,
    RestoreVersion,
} from '../wailsjs/go/main/App';

// ============================================================
// State
// ============================================================
const state = {
    standardId: null,         // 当前 standard id（'jrt0358' / 'gbt37988'）
    standards: null,          // 当前 standard 的 Standards 对象
    standardsList: [],        // 所有可用标准（ListStandards 返回）
    dimensions: [],           // 当前 standard 的 dimensions
    assessment: null,
    selected: null,           // { subId, dim } | null
    theme: new URLSearchParams(location.search).get('t')
        || localStorage.getItem('theme')
        || 'warm',
};

const LEVEL_LABELS = ['', '等级一', '等级二', '等级三', '等级四', '等级五'];
const GROUP_COLORS = ['--grp-1', '--grp-2', '--grp-3', '--grp-4'];

// ============================================================
// Utilities
// ============================================================
function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// Init
// ============================================================
async function init() {
    const READ_ONLY = window.__READ_ONLY__ === true;

    applyTheme(state.theme);
    setActiveThemeButton();

    if (READ_ONLY && window.__INITIAL_STANDARDS__) {
        // 静态导出模式：直接吃注入数据，不调 Go 桥
        state.standardId = window.__INITIAL_STANDARD_ID__ || 'jrt0358';
        state.standards = window.__INITIAL_STANDARDS__;
        state.dimensions = state.standards.dimensions;
        state.columnLabels = state.standards.column_labels || state.dimensions;
        state.assessment = window.__INITIAL_ASSESSMENT__ || { version: 0, cells: {} };
        state.standardsList = [state.standards.metadata];
    } else {
        // 1. 拉所有可用标准 + 当前 standard id
        state.standardsList = await ListStandards();
        state.standardId = await GetCurrentStandardID();
        // 2. 拉当前 standard 的完整数据
        state.standards = await GetCurrentStandard();
        state.dimensions = state.standards.dimensions;
        state.columnLabels = state.standards.column_labels || state.dimensions;
        // 3. 拉当前 standard 的评估
        state.assessment = await LoadAssessment(state.standardId);
    }

    // 渲染下拉按钮（仅在非 READ_ONLY 模式下有意义；READ_ONLY 显示当前标准即可）
    renderStandardSwitcher();

    // 更新窗口 Title（生产模式：wails runtime；mock 模式：no-op）
    try { window.runtime?.WindowSetTitle?.(`数据安全能力评估 · ${state.standards.metadata.standard}`); } catch {}

    document.getElementById('subtitle').textContent =
        `${state.standards.metadata.standard} · ${state.standards.metadata.title}`;

    if (READ_ONLY) {
        // 隐藏所有编辑/工具入口（v0.3：modal-edit 已删，detail-view 自带只读态）
        document.getElementById('btn-export')?.remove();
        document.getElementById('btn-history')?.remove();
        document.getElementById('modal-history')?.remove();
        const brandTitle = document.querySelector('.brand-title');
        if (brandTitle) brandTitle.textContent = '数据安全能力评估报告';
    } else {
        // 主流程走 detail-view（v0.3 UI）
    }

    renderHeatmap();
    updateProgress();

    if (!READ_ONLY) {
        bindToolbar();
        bindModals();
    } else {
        // READ_ONLY 模式：只绑主题切换（export/history/edit modal 不绑）
        bindThemeSwitcher();
    }
    bindDetailView();
    bindTabBar();

    // 默认 tab：app = heatmap（用户在工作），export HTML = dashboard（评审看摘要）
    const defaultTab = window.__DEFAULT_TAB__ || (READ_ONLY ? 'dashboard' : 'heatmap');
    switchTab(defaultTab, { skipRender: true });

    // 仪表盘首次渲染（无论默认 tab 是哪个，都先算好数据）
    renderDashboard();

    // 注意：默认不自动 selectCell，避免启动时从底部弹出"等级说明"抽屉。
    // 用户点格子后才会 selectCell + 弹抽屉。
    // (历史 v0.1 行为：自动 select 第一个格子 → 抽屉默认弹出 → 用户反馈"太打扰")
}

// ============================================================
// Standard switcher (toolbar dropdown)
// ============================================================

function renderStandardSwitcher() {
    const trigger = document.getElementById('brand-text');
    const menu = document.getElementById('standard-menu');
    if (!trigger || !menu) return;
    const cur = state.standardsList.find(s => s.standard === state.standards?.metadata?.standard)
            || state.standardsList[0];
    if (!cur) return;
    // 菜单内容
    menu.innerHTML = state.standardsList.map(s => `
        <button class="standard-menu-item ${s.standard === cur.standard ? 'active' : ''}"
            data-std="${escapeHtml(s.standard)}" role="menuitem">
            <span class="standard-menu-item-code">${escapeHtml(s.standard)}</span>
            <span class="standard-menu-item-title">${escapeHtml(s.title || '')}</span>
        </button>
    `).join('');
    // 触发器：点击切换菜单
    trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = !menu.hidden;
        closeAllSwitcherMenus();
        menu.hidden = isOpen;
        // position: fixed → JS 算坐标
        if (!isOpen) positionStandardMenu();
        trigger.setAttribute('aria-expanded', String(!isOpen));
    };
    trigger.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
    };
    // 菜单项点击
    menu.querySelectorAll('.standard-menu-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            switchStandard(item.dataset.std);
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        };
    });
    // 点击外部关闭（只绑一次）
    if (!renderStandardSwitcher._docClickBound) {
        document.addEventListener('click', closeAllSwitcherMenus);
        window.addEventListener('resize', () => { if (!menu.hidden) positionStandardMenu(); });
        renderStandardSwitcher._docClickBound = true;
    }
}

// 菜单 fixed 定位：根据 trigger 的 getBoundingClientRect 算 top/left
function positionStandardMenu() {
    const trigger = document.getElementById('brand-text');
    const menu = document.getElementById('standard-menu');
    if (!trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const w = menu.offsetWidth || 360;
    let left = r.left;
    let top = r.bottom + 6;
    // 防止菜单超出视口右边
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}

function closeAllSwitcherMenus() {
    document.querySelectorAll('.standard-menu').forEach(m => m.hidden = true);
    const trigger = document.getElementById('brand-text');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

async function switchStandard(newStandardCode) {
    if (newStandardCode === state.standards?.metadata?.standard) return;
    // 切换前确认未保存修改
    const doSwitch = async () => {
        // 找对应 standard_id
        const codeToId = {
            'JR/T 0358-2026': 'jrt0358',
            'GB/T 37988-2019': 'gbt37988',
        };
        const newId = codeToId[newStandardCode] || newStandardCode;
        try {
            await SetCurrentStandard(newId);
            state.standardId = newId;
            state.standards = await GetStandard(newId);
            state.dimensions = state.standards.dimensions;
            state.columnLabels = state.standards.column_labels || state.dimensions;
            state.assessment = await LoadAssessment(newId);
            // 关闭 detail view（如果开着）
            closeDetailView();
            // 重新渲染
            document.getElementById('subtitle').textContent =
                `${state.standards.metadata.standard} · ${state.standards.metadata.title}`;
            try { window.runtime?.WindowSetTitle?.(`数据安全能力评估 · ${state.standards.metadata.standard}`); } catch {}
            renderStandardSwitcher();
            renderHeatmap();
            updateProgress();
            if (typeof renderDashboard === 'function') renderDashboard();
            showToast(`已切换到 ${newStandardCode}`);
        } catch (err) {
            console.error('switchStandard failed:', err);
            showToast(`切换失败：${err.message || err}`);
        }
    };
    confirmIfDirty(doSwitch);
}

// ============================================================
// Heatmap (single continuous grid)
// ============================================================
function renderHeatmap() {
    const wrap = document.getElementById('heatmap');
    wrap.innerHTML = '';

    // 标准无数据占位（v0.2：DSMM OCR 还没填内容时显示友好提示）
    if (!state.standards.domains || state.standards.domains.length === 0) {
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.justifyContent = 'center';
        wrap.style.minHeight = '320px';
        const empty = document.createElement('div');
        empty.className = 'heatmap-empty';
        const isGBT = state.standardId === 'gbt37988';
        empty.innerHTML = `
            <div class="heatmap-empty-title">该标准的答案库暂无内容</div>
            <div class="heatmap-empty-sub">
                ${isGBT
                    ? 'GB/T 37988-2019 (DSMM) 30 PA × 4 维 × 5 级 = 600 格描述正在解析 GB/T 37988-2019 PDF 中，<br>完成后会自动填充。切回 JR/T 0358-2026 可继续评估。'
                    : '该标准尚无能力域数据。'}
            </div>
        `;
        wrap.appendChild(empty);
        return;
    }
    wrap.style.display = '';
    wrap.style.alignItems = '';
    wrap.style.justifyContent = '';
    wrap.style.minHeight = '';

    // header row (X axis) — 用 columnLabels 显示，dimensions 做 key
    const corner = document.createElement('div');
    corner.className = 'hg hg-corner';
    wrap.appendChild(corner);
    for (let i = 0; i < state.dimensions.length; i++) {
        const h = document.createElement('div');
        h.className = 'hg hg-axis';
        h.textContent = state.columnLabels[i] || state.dimensions[i];
        wrap.appendChild(h);
    }

    // data rows: all 19 subdomains in continuous order
    state.standards.domains.forEach((dom, domIdx) => {
        // 在大域的第一个子域前加一条分隔线
        const sep = document.createElement('div');
        sep.className = 'hg hg-domain-sep';
        sep.style.gridColumn = '1 / -1';
        if (domIdx === 0) sep.style.display = 'none'; // 第一组前不加分隔
        wrap.appendChild(sep);

        dom.subdomains.forEach((sub, subIdx) => {
            // 子域行（左侧 sticky）
            const nameCell = document.createElement('div');
            nameCell.className = 'hg hg-name';
            nameCell.dataset.subId = sub.id;
            const tag = document.createElement('span');
            tag.className = 'hg-name-tag';
            tag.style.background = `var(${GROUP_COLORS[domIdx]})`;
            const label = document.createElement('span');
            label.className = 'hg-name-label';
            label.textContent = sub.name;
            const note = document.createElement('span');
            note.className = 'hg-name-note';
            // 显示该子域已评数量（4 维度中已选等级的数量）
            let filledCount = 0;
            for (const dim of state.dimensions) {
                if ((state.assessment.cells[sub.id]?.[dim]?.level || 0) > 0) filledCount++;
            }
            if (filledCount > 0) note.textContent = `${filledCount}/4`;
            nameCell.appendChild(tag);
            nameCell.appendChild(label);
            nameCell.appendChild(note);
            // 大域的最后一个子域 → 加底分隔
            if (subIdx === dom.subdomains.length - 1 && domIdx < state.standards.domains.length - 1) {
                nameCell.classList.add('domain-end');
            }
            // 关键：name 必须在 4 cell 之前 append，否则 grid 自动布局会把 name 塞到 col 5
            // （sticky; left: 0 在父级有 backdrop-filter 时无法跨列贴左）
            wrap.appendChild(nameCell);
            // 4 维度格子
            for (const dim of state.dimensions) {
                const cell = state.assessment.cells[sub.id]?.[dim] || { level: 0, note: '' };
                const btn = document.createElement('button');
                btn.className = `hg-cell lv${cell.level}`;
                btn.dataset.subId = sub.id;
                btn.dataset.dim = dim;
                btn.textContent = cell.level === 0 ? '·' : String(cell.level);
                if (cell.note) btn.classList.add('has-note');
                if (state.selected?.subId === sub.id && state.selected?.dim === dim) {
                    btn.classList.add('selected');
                }
                // 点击格子 → 离开前确认未保存，再 selectCell
                btn.addEventListener('click', () => {
                    confirmIfDirty(() => selectCell(sub.id, dim));
                });
                wrap.appendChild(btn);
            }
        });  // end forEach sub
    });  // end forEach dom
}  // end renderHeatmap


// ============================================================
// Detail view (v0.3 UI：替换 ref-grid + bubble)
// 点击格子 → 整页替换为"左 = 你的评估 / 右 = 标准"双栏
// 左栏默认只读，"编辑"按钮进入编辑态；离开/切换前用 confirmIfDirty 确认未保存
// ============================================================
const LEVEL_OPTIONS = [
    { v: 0, label: '未评估' },
    { v: 1, label: 'Lv1' }, { v: 2, label: 'Lv2' }, { v: 3, label: 'Lv3' },
    { v: 4, label: 'Lv4' }, { v: 5, label: 'Lv5' },
];
let detailEditMode = false;      // 当前是否在编辑态
let detailSnapshot = null;         // 进入编辑态时的 {level, note} 快照（用于 dirty 检测）
let pendingUnsavedAction = null;   // confirmIfDirty 的回调：保存/丢弃/取消
let panelDetail, panelHeatmapWrap, detailNote, detailLevelRow, detailLevels, btnDetailEdit, btnDetailSave, btnDetailBack, btnDetailClear;

function getDetailEls() {
    if (!panelDetail) {
        panelDetail = document.getElementById('panel-detail');
        panelHeatmapWrap = document.getElementById('panel-heatmap-wrap');
        detailNote = document.getElementById('detail-note');
        detailLevelRow = document.getElementById('detail-level-row');
        detailLevels = document.getElementById('detail-levels');
        btnDetailEdit = document.getElementById('btn-detail-edit');
        btnDetailSave = document.getElementById('btn-detail-save');
        btnDetailBack = document.getElementById('btn-detail-back');
        btnDetailClear = document.getElementById('btn-detail-clear');
    }
    return { panelDetail, panelHeatmapWrap, detailNote, detailLevelRow, detailLevels, btnDetailEdit, btnDetailSave, btnDetailBack, btnDetailClear };
}

function selectCell(subId, dim) {
    state.selected = { subId, dim };
    // 局部更新 selected class
    document.querySelectorAll('.hg-cell.selected').forEach(el => el.classList.remove('selected'));
    const cellBtn = document.querySelector(`.hg-cell[data-sub-id="${subId}"][data-dim="${dim}"]`);
    if (cellBtn) cellBtn.classList.add('selected');
    openDetailView(subId, dim);
}

function openDetailView(subId, dim) {
    const els = getDetailEls();
    if (!els.panelDetail) return;
    const sub = findSubdomain(subId);
    if (!sub) return;
    const colLabel = state.columnLabels[state.dimensions.indexOf(dim)] || dim;
    document.getElementById('detail-sub-name').textContent = sub.name;
    document.getElementById('detail-dim-name').textContent = colLabel;
    document.getElementById('detail-standard-dim').textContent = colLabel;
    // 进入 detail 时强制退出编辑态（除非是同 sub/dim 的 reopen 保留 editMode — 简化处理：每次都退出）
    detailEditMode = false;
    detailSnapshot = null;
    renderDetailLevels(sub, dim);
    renderDetailUser(sub, dim);
    updateDetailChrome();
    // 浮动卡片：只显示 panel-detail，heatmap 保留在背后（被 backdrop 盖住）
    els.panelDetail.hidden = false;
}

function closeDetailView() {
    const els = getDetailEls();
    if (!els.panelDetail) return;
    els.panelDetail.hidden = true;
    // 清空选中
    document.querySelectorAll('.hg-cell.selected').forEach(el => el.classList.remove('selected'));
    state.selected = null;
    detailEditMode = false;
    detailSnapshot = null;
}

function renderDetailLevels(sub, dim) {
    const els = getDetailEls();
    const cell = state.assessment.cells[sub.id]?.[dim] || { level: 0, note: '' };
    const highlightLv = cell.level > 0 ? cell.level : 0;  // 0 = 全亮
    // 找通用 sub（仅 JRT 0358 有 "通用数据安全保障" 概念；DSMM 30 PA 全是专项，无 general_security）
    const generalSub = (sub.id !== 'general_security') ? findSubdomain('general_security') : null;
    els.detailLevels.innerHTML = '';
    for (let lv = 1; lv <= 5; lv++) {
        const txt = sub.levels?.[String(lv)]?.[dim] || null;
        const block = document.createElement('div');
        const isCurrent = highlightLv === lv;
        block.className = 'detail-level-block' + (isCurrent ? ' is-current' : '');
        const tag = document.createElement('div');
        tag.className = `detail-level-tag lv${lv}`;
        tag.textContent = `Lv${lv}`;
        const text = document.createElement('div');
        if (txt) {
            text.className = 'detail-level-text';
            text.textContent = txt;
            text.title = txt;
        } else {
            text.className = 'detail-level-text dash';
            text.textContent = lv === 1 ? '—' : '— 沿用低一级';
            // 专项 dash：hover 弹通用同等级能力描述（PDF 5.1 节 b 条：双继承）
            // 仅当通用 sub 存在，且通用同等级该 dim 有要求时才有意义
            if (generalSub) {
                const generalTxt = generalSub.levels?.[String(lv)]?.[dim];
                if (generalTxt) {
                    block.classList.add('has-inherit');
                    block.dataset.inheritLv = String(lv);
                    block.dataset.inheritDim = dim;
                }
            }
        }
        block.appendChild(tag);
        block.appendChild(text);
        els.detailLevels.appendChild(block);
    }
    // 绑定 hover 浮窗（仅当前存在 has-inherit 块时）
    if (els.detailLevels.querySelector('.has-inherit')) {
        bindInheritTooltip(els.detailLevels);
    }
}

// ============================================================
// 专项 dash 双继承 hover 浮窗（PDF 5.1 节 b 条）
//   hover 在专项 dash 块上 → 弹 tooltip，显示通用同等级能力描述
//   仅 hover 触发，不 click（避免误触）
//   DSMM 30 PA 全是专项，无 general_security → 不会触发
// ============================================================
let inheritTooltipEl = null;
let inheritHideTimer = null;

function bindInheritTooltip(container) {
    if (inheritTooltipEl) inheritTooltipEl.remove();
    inheritTooltipEl = null;
    const blocks = container.querySelectorAll('.has-inherit');
    blocks.forEach(block => {
        block.addEventListener('mouseenter', () => {
            clearTimeout(inheritHideTimer);
            showInheritTooltip(block);
        });
        block.addEventListener('mouseleave', () => {
            inheritHideTimer = setTimeout(hideInheritTooltip, 120);
        });
    });
}

function showInheritTooltip(anchor) {
    const lv = anchor.dataset.inheritLv;
    const dim = anchor.dataset.inheritDim;
    const generalSub = findSubdomain('general_security');
    const txt = generalSub?.levels?.[lv]?.[dim];
    if (!txt) return;
    if (!inheritTooltipEl) {
        inheritTooltipEl = document.createElement('div');
        inheritTooltipEl.className = 'inherit-tooltip';
        document.body.appendChild(inheritTooltipEl);
    }
    inheritTooltipEl.innerHTML = `
        <div class="inherit-tooltip-head">
            <span class="inherit-tooltip-tag">↪ 通用能力同等级</span>
            <span class="inherit-tooltip-meta">${escapeHtml(dim)} · Lv${lv}</span>
        </div>
        <div class="inherit-tooltip-body">${escapeHtml(txt)}</div>
        <div class="inherit-tooltip-foot">源：通用数据安全保障能力域</div>
    `;
    // 定位：anchor 右侧（放不下放左侧），垂直居中
    const r = anchor.getBoundingClientRect();
    inheritTooltipEl.style.visibility = 'hidden';
    inheritTooltipEl.classList.add('show');
    const tipR = inheritTooltipEl.getBoundingClientRect();
    const margin = 12;
    let left = r.right + margin;
    if (left + tipR.width > window.innerWidth - 8) {
        left = r.left - tipR.width - margin;  // 放左侧
    }
    let top = r.top + r.height / 2 - tipR.height / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - tipR.height - 8));
    inheritTooltipEl.style.left = `${left}px`;
    inheritTooltipEl.style.top = `${top}px`;
    inheritTooltipEl.style.visibility = '';
    // tooltip 自身 hover 不消失
    inheritTooltipEl.onmouseenter = () => clearTimeout(inheritHideTimer);
    inheritTooltipEl.onmouseleave = () => { inheritHideTimer = setTimeout(hideInheritTooltip, 120); };
}

function hideInheritTooltip() {
    if (inheritTooltipEl) inheritTooltipEl.classList.remove('show');
}

function renderDetailUser(sub, dim) {
    const els = getDetailEls();
    const cell = state.assessment.cells[sub.id]?.[dim] || { level: 0, note: '' };
    // 渲染 6 个等级按钮
    els.detailLevelRow.innerHTML = '';
    for (const opt of LEVEL_OPTIONS) {
        const btn = document.createElement('button');
        btn.className = 'detail-level-btn';
        btn.dataset.lv = String(opt.v);
        if (cell.level === opt.v) btn.classList.add('is-active');
        if (!detailEditMode) btn.disabled = true;
        const num = document.createElement('div');
        num.className = 'lvl-num';
        num.textContent = opt.v === 0 ? '—' : `Lv${opt.v}`;
        const lbl = document.createElement('div');
        lbl.className = 'lvl-label';
        lbl.textContent = opt.label === '未评估' ? '未评' : opt.label;
        btn.appendChild(num);
        btn.appendChild(lbl);
        btn.addEventListener('click', () => {
            if (!detailEditMode) return;
            // toggle：再点同一档取消选择（设为 0）
            const cur = (state.assessment.cells[sub.id]?.[dim]?.level ?? 0);
            const next = (cur === opt.v) ? 0 : opt.v;
            if (!state.assessment.cells[sub.id]) state.assessment.cells[sub.id] = {};
            if (!state.assessment.cells[sub.id][dim]) state.assessment.cells[sub.id][dim] = { level: 0, note: '' };
            state.assessment.cells[sub.id][dim].level = next;
            // 重渲染只更新按钮 active + 等级条 + 右侧高亮
            renderDetailUser(sub, dim);
            renderDetailLevels(sub, dim);
        });
        els.detailLevelRow.appendChild(btn);
    }
    // 渲染 textarea
    els.detailNote.value = cell.note || '';
    els.detailNote.readOnly = !detailEditMode;
    els.detailNote.placeholder = detailEditMode
        ? '说明本机构在「组织建设 / 制度流程 / 技术能力 / 人员能力」方面的实际做法、可量化指标、佐证材料链接，以及选择该等级的理由…'
        : '（该格未填写）';
}

function updateDetailChrome() {
    const els = getDetailEls();
    if (window.__READ_ONLY__) {
        // 导出 HTML：完全只读，编辑/保存/清空 全部隐藏或禁用
        els.btnDetailEdit.style.display = 'none';
        els.btnDetailSave.style.display = 'none';
        els.btnDetailClear.style.display = 'none';
    } else {
        els.btnDetailEdit.textContent = detailEditMode ? '取消编辑' : '编辑';
        els.btnDetailEdit.title = detailEditMode ? '退出编辑（未保存的修改会丢失）' : '进入编辑态';
        els.btnDetailSave.disabled = !detailEditMode;
        els.btnDetailClear.disabled = !detailEditMode;
    }
}

function toggleEditMode() {
    if (window.__READ_ONLY__) return;
    const els = getDetailEls();
    if (!state.selected) return;
    const { subId, dim } = state.selected;
    const sub = findSubdomain(subId);
    if (!sub) return;
    if (detailEditMode) {
        // 取消编辑：回退到快照
        if (detailSnapshot) {
            if (!state.assessment.cells[subId]) state.assessment.cells[subId] = {};
            if (!state.assessment.cells[subId][dim]) state.assessment.cells[subId][dim] = { level: 0, note: '' };
            state.assessment.cells[subId][dim].level = detailSnapshot.level;
            state.assessment.cells[subId][dim].note = detailSnapshot.note;
        }
        detailEditMode = false;
        detailSnapshot = null;
        renderDetailUser(sub, dim);
        renderDetailLevels(sub, dim);
        updateDetailChrome();
    } else {
        // 进入编辑：snapshot
        const cur = state.assessment.cells[subId]?.[dim] || { level: 0, note: '' };
        detailSnapshot = { level: cur.level, note: cur.note || '' };
        detailEditMode = true;
        renderDetailUser(sub, dim);
        renderDetailLevels(sub, dim);
        updateDetailChrome();
        // 自动 focus 到 textarea 方便输入
        setTimeout(() => els.detailNote.focus(), 50);
    }
}

async function saveDetail() {
    if (!state.selected) return;
    if (window.__READ_ONLY__) return;
    const { subId, dim } = state.selected;
    const els = getDetailEls();
    if (!state.assessment.cells[subId]) state.assessment.cells[subId] = {};
    if (!state.assessment.cells[subId][dim]) state.assessment.cells[subId][dim] = { level: 0, note: '' };
    state.assessment.cells[subId][dim].note = els.detailNote.value;
    // 持久化
    try {
        await SaveAssessment(state.standardId, state.assessment);
    } catch (e) {
        console.error('save failed', e);
        alert('保存失败：' + e);
        return;
    }
    // 退出编辑态 + 重渲染
    detailEditMode = false;
    detailSnapshot = null;
    const sub = findSubdomain(subId);
    if (sub) {
        renderDetailUser(sub, dim);
        renderDetailLevels(sub, dim);
        updateDetailChrome();
    }
    renderHeatmap();
    updateProgress();
    toast('已保存');
}

function clearDetail() {
    if (!state.selected) return;
    if (window.__READ_ONLY__) return;
    const { subId, dim } = state.selected;
    if (!state.assessment.cells[subId]) state.assessment.cells[subId] = {};
    if (!state.assessment.cells[subId][dim]) state.assessment.cells[subId][dim] = { level: 0, note: '' };
    state.assessment.cells[subId][dim].level = 0;
    state.assessment.cells[subId][dim].note = '';
    const sub = findSubdomain(subId);
    if (sub) {
        renderDetailUser(sub, dim);
        renderDetailLevels(sub, dim);
    }
}

// dirty 检测：当前 textarea + level vs 快照不同
function isDirty() {
    if (!detailEditMode) return false;
    if (!state.selected || !detailSnapshot) return false;
    const { subId, dim } = state.selected;
    const cur = state.assessment.cells[subId]?.[dim] || { level: 0, note: '' };
    const els = getDetailEls();
    const noteVal = els.detailNote.value;
    return cur.level !== detailSnapshot.level || (noteVal || '') !== (detailSnapshot.note || '');
}

// 离开/切换前确认
// callback: 用户选择"保存"或"丢弃"后执行的操作
function confirmIfDirty(callback) {
    if (!isDirty()) { callback(); return; }
    pendingUnsavedAction = callback;
    showModal('modal-unsaved');
}

// 点空白 / ESC：detail 开着且 dirty 才弹，否则直接关
function closeDetailIfClean() {
    if (!state.selected) return;
    if (isDirty()) {
        pendingUnsavedAction = () => closeDetailView();
        showModal('modal-unsaved');
        return;
    }
    closeDetailView();
}

// 绑定 detail view 事件（在 init 时调用一次）
function bindDetailView() {
    const els = getDetailEls();
    if (!els.panelDetail) return;
    // 编辑/取消编辑
    els.btnDetailEdit.addEventListener('click', toggleEditMode);
    // 保存
    els.btnDetailSave.addEventListener('click', saveDetail);
    // 返回
    els.btnDetailBack.addEventListener('click', () => {
        if (isDirty()) {
            confirmIfDirty(() => closeDetailView());
        } else {
            closeDetailView();
        }
    });
    // 清空
    els.btnDetailClear.addEventListener('click', clearDetail);
    // × 关闭
    document.getElementById('panel-detail-close').addEventListener('click', closeDetailIfClean);
    // textarea input 触发 dirty 状态检测（不重渲染，只在 isDirty() 里按需查）
    // 未保存 modal 3 按钮
    document.getElementById('unsaved-save').addEventListener('click', async () => {
        hideModal('modal-unsaved');
        await saveDetail();
        const cb = pendingUnsavedAction;
        pendingUnsavedAction = null;
        if (cb) cb();
    });
    document.getElementById('unsaved-discard').addEventListener('click', () => {
        hideModal('modal-unsaved');
        // 回退到快照
        if (state.selected && detailSnapshot) {
            const { subId, dim } = state.selected;
            if (!state.assessment.cells[subId]) state.assessment.cells[subId] = {};
            if (!state.assessment.cells[subId][dim]) state.assessment.cells[subId][dim] = { level: 0, note: '' };
            state.assessment.cells[subId][dim].level = detailSnapshot.level;
            state.assessment.cells[subId][dim].note = detailSnapshot.note;
            detailEditMode = false;
            detailSnapshot = null;
        }
        const cb = pendingUnsavedAction;
        pendingUnsavedAction = null;
        if (cb) cb();
    });
    document.getElementById('unsaved-cancel').addEventListener('click', () => {
        hideModal('modal-unsaved');
        pendingUnsavedAction = null;
    });
    // 点 backdrop 空白处（panel-detail 自身，但不在 panel-detail-card 内）→ 关闭（带 dirty 检测）
    // 点 panel-detail-card 内部（按钮、textarea、滚动条）→ 不关
    // 用 CAPTURE 阶段：bubble 阶段判断会失效，因为子元素的 click handler 可能已经
    // 通过 renderDetailUser/renderDetailLevels 重渲染了内部 DOM（innerHTML=''），
    // 让 e.target 被 detached，closest() 返回 null → 误判为点 backdrop → 弹模态框
    els.panelDetail.addEventListener('click', (e) => {
        if (e.target.closest('.modal-overlay')) return;     // 模态框内点击不触发
        // 卡片内点击：直接用 panel-detail-card 引用 + contains 检查
        // （比 closest 更稳，不受 e.target 被 detached 影响——因为 capture 阶段
        //  e.target 还在 DOM 中，panel-detail-card.contains(e.target) 必为 true）
        const card = document.getElementById('panel-detail-card');
        if (card && card.contains(e.target)) return;  // 卡片内部不触发
        e.stopPropagation();
        closeDetailIfClean();
    }, true);  // capture 阶段，避免子元素重渲染后 detached 导致误判
    // textarea 快捷键：Ctrl+S 保存，ESC 关闭 detail
    els.detailNote.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (detailEditMode) saveDetail();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeDetailIfClean();
        }
    });
    // 全局 ESC（detail 打开时）也走 closeDetailIfClean
    // （keydown listener 在下面统一加）
}

// 全局 ESC：detail 打开 → closeDetailIfClean（已经会自己处理 dirty）；其他 modal 走 hideModal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (state.selected) {
            // detail 视图正在打开 → 走 closeDetailIfClean（里面会判 dirty）
            closeDetailIfClean();
            return;
        }
        // 关闭其他打开的 modal
        const openModal = document.querySelector('.modal-overlay.show');
        if (openModal) hideModal(openModal.id);
    }
});


// ============================================================
// History
// ============================================================
async function openHistoryModal() {
    const list = document.getElementById('history-list');
    list.innerHTML = '<div class="history-empty">加载中…</div>';
    showModal('modal-history');
    try {
        const items = await ListHistory(state.standardId);
        if (!items || items.length === 0) {
            list.innerHTML = '<div class="history-empty">暂无历史版本<br><small>每次保存时会自动创建快照</small></div>';
            return;
        }
        list.innerHTML = '';
        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'history-item';
            const left = document.createElement('div');
            const ts = document.createElement('div');
            ts.className = 'history-ts';
            ts.textContent = formatTimestamp(item.timestamp);
            const meta = document.createElement('div');
            meta.className = 'history-meta';
            meta.textContent = `${item.timestamp} · ${(item.size_bytes / 1024).toFixed(1)} KB`;
            left.appendChild(ts);
            left.appendChild(meta);

            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'btn btn-primary';
            restoreBtn.textContent = '还原';
            restoreBtn.addEventListener('click', async () => {
                if (!confirm(`确定还原到 ${formatTimestamp(item.timestamp)}？\n当前评估会自动备份。`)) return;
                try {
                    await RestoreVersion(state.standardId, item.timestamp);
                    state.assessment = await LoadAssessment(state.standardId);
                    renderHeatmap();
                    updateProgress();
hideModal('modal-history');
                    toast(`已还原到 ${formatTimestamp(item.timestamp)}`);
                } catch (e) {
                    alert('还原失败：' + e);
                }
            });

            row.appendChild(left);
            row.appendChild(restoreBtn);
            list.appendChild(row);
        }
    } catch (e) {
        list.innerHTML = '<div class="history-empty">加载失败：' + e + '</div>';
    }
}

function formatTimestamp(ts) {
    if (!ts || ts.length !== 15) return ts;
    return `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)} ${ts.slice(9,11)}:${ts.slice(11,13)}:${ts.slice(13,15)}`;
}

// ============================================================
// Find / Progress (v0.3 工具函数)
// ============================================================
function findSubdomain(id) {
    if (!state.standards?.domains) return null;
    for (const dom of state.standards.domains) {
        for (const sub of dom.subdomains) {
            if (sub.id === id) return sub;
        }
    }
    return null;
}

function expectedSubdomainCount(standardId) {
    if (standardId === 'gbt37988') return 30;  // DSMM 30 PA 硬编码
    if (state.standards?.domains) {
        return state.standards.domains.reduce((n, d) => n + d.subdomains.length, 0);
    }
    return 19;
}

function updateProgress() {
    let done = 0;
    const expectedSubs = expectedSubdomainCount(state.standardId);
    const total = expectedSubs * state.dimensions.length;
    for (const dom of state.standards?.domains || []) {
        for (const sub of dom.subdomains) {
            for (const dim of state.dimensions) {
                if ((state.assessment.cells[sub.id]?.[dim]?.level || 0) > 0) done++;
            }
        }
    }
    document.getElementById('progress-done').textContent = String(done);
    document.getElementById('progress-total').textContent = String(total);
    // 同步 progress title
    const prog = document.querySelector('.progress');
    if (prog) {
        const dimLabel = state.standardId === 'gbt37988' ? '30 PA' : (state.standards?.domains?.reduce((n, d) => n + d.subdomains.length, 0) + ' 子域');
        prog.title = `已评估 / 总格子（${dimLabel} × ${state.dimensions.length} 维度）`;
    }
}

// ============================================================
// Toolbar
// ============================================================
function bindToolbar() {
    bindThemeSwitcher();

    document.getElementById('btn-export').addEventListener('click', async () => {
        try {
            const path = await ExportHTML();
            toast(`已导出 → ${path.split(/[\\\/]/).pop()}`);
        } catch (e) {
            alert('导出失败：' + e);
        }
    });

    document.getElementById('btn-import').addEventListener('click', async () => {
        if (!confirm('导入将覆盖当前评估数据（旧版本会自动保存到历史快照，可随时还原），确定继续？')) return;
        try {
            const newAsm = await ImportHTML();
            state.assessment = newAsm;
            // 导入前先关掉 detail（避免在导入的新数据上遗留旧选中）
            closeDetailView();
            state.selected = null;
            updateProgress();
            renderHeatmap();
            // 重新载入当前选中的 sub 的详情页
            const subId = state.assessment.last_sub_id || state.assessment.lastSubId;
            if (subId) {
                selectCell(subId, state.dimensions[0]);
            }
            toast('已导入 · 当前评估数据已替换为所选报告');
        } catch (e) {
            const msg = String(e?.message || e);
            if (msg.includes('__CANCELLED__')) return; // 用户取消，安静返回
            if (msg.includes('未找到评估数据')) {
                alert('导入失败：该文件不是有效的导出报告（没有评估数据标记）');
            } else {
                alert('导入失败：' + msg);
            }
        }
    });

    document.getElementById('btn-history').addEventListener('click', openHistoryModal);
}

// READ_ONLY 模式只绑主题切换
function bindThemeSwitcher() {
    document.getElementById('theme-switcher').addEventListener('click', (e) => {
        const btn = e.target.closest('.theme-btn');
        if (!btn) return;
        state.theme = btn.dataset.theme;
        try { localStorage.setItem('theme', state.theme); } catch {}
        applyTheme(state.theme);
        setActiveThemeButton();
    });
}

function applyTheme(theme) { document.documentElement.dataset.theme = theme; }
function setActiveThemeButton() {
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === state.theme);
    });
}

// ============================================================
// Modal generic
// ============================================================
function bindModals() {
    document.querySelectorAll('[data-close]').forEach(el => {
        el.addEventListener('click', () => {
            hideModal(el.dataset.close);
            pendingCell = null;
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', (e) => {
            if (e.target === m) {
                hideModal(m.id);
                pendingCell = null;
            }
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(m => {
                hideModal(m.id);
                pendingCell = null;
            });
        }
    });
}
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }

// ============================================================
// Persistence
// ============================================================
async function persist() {
    try {
        await SaveAssessment(state.standardId, state.assessment);
    } catch (e) {
        console.error('SaveAssessment failed:', e);
        alert('保存失败：' + e);
    }
}

// ============================================================
// Toast
// ============================================================
let toastTimer = null;
function toast(msg) {
    const el = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ============================================================
// Tab system (heatmap vs dashboard) + hover tooltip
// ============================================================
let tabTooltipEl = null;
let tabTooltipHideTimer = null;

function showTabTooltip(btn) {
    const text = btn.dataset.tooltip;
    if (!text) return;
    if (!tabTooltipEl) {
        tabTooltipEl = document.createElement('div');
        tabTooltipEl.className = 'tab-tooltip';
        document.body.appendChild(tabTooltipEl);
    }
    tabTooltipEl.textContent = text;
    // 定位：按钮正下方居中
    tabTooltipEl.style.visibility = 'hidden';
    tabTooltipEl.classList.add('show');
    const r = btn.getBoundingClientRect();
    const tw = tabTooltipEl.offsetWidth;
    const th = tabTooltipEl.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    let top = r.bottom + 6;
    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    if (top + th > window.innerHeight - 8) top = r.top - th - 6;
    tabTooltipEl.style.left = left + 'px';
    tabTooltipEl.style.top = top + 'px';
    tabTooltipEl.style.visibility = 'visible';
    if (tabTooltipHideTimer) { clearTimeout(tabTooltipHideTimer); tabTooltipHideTimer = null; }
}
function hideTabTooltip() {
    if (tabTooltipEl) tabTooltipEl.classList.remove('show');
}

function bindTabBar() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        btn.addEventListener('mouseenter', () => showTabTooltip(btn));
        btn.addEventListener('mouseleave', () => {
            tabTooltipHideTimer = setTimeout(hideTabTooltip, 120);
        });
    });
    // tooltip 自身也支持 hover（鼠标移上去不消失）
    if (tabTooltipEl) {
        tabTooltipEl.addEventListener('mouseenter', () => {
            if (tabTooltipHideTimer) { clearTimeout(tabTooltipHideTimer); tabTooltipHideTimer = null; }
        });
        tabTooltipEl.addEventListener('mouseleave', () => {
            tabTooltipHideTimer = setTimeout(hideTabTooltip, 120);
        });
    }
}

function switchTab(tabId, opts = {}) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.pane').forEach(p => {
        p.classList.toggle('active', p.dataset.pane === tabId);
    });
    if (!opts.skipRender && tabId === 'dashboard' && typeof renderDashboard === 'function') {
        renderDashboard();
    }
    hideTabTooltip();
}

// ============================================================
// Analytics Dashboard
// ============================================================

// 等级 → CSS 变量名（与 style.css --lv0-bg..--lv5-bg 一致）
function lvColor(level) {
    return `var(--lv${level}-bg)`;
}
function lvFgColor(level) {
    return `var(--lv${level}-fg)`;
}

// computeDashboard: 纯函数。从 state.assessment.cells 派生所有指标
function computeDashboard(state) {
    const dims = state.dimensions;
    const cells = state.assessment.cells || {};

    // 1) 4 维度评分：每维度所有 sub 的等级平均（Lv0 也算入，会拉低分数）
    const dimScores = {};
    for (const dim of dims) {
        let sum = 0, n = 0;
        for (const dom of state.standards.domains) {
            for (const sub of dom.subdomains) {
                const lvl = cells[sub.id]?.[dim]?.level || 0;
                sum += lvl; n++;
            }
        }
        dimScores[dim] = n > 0 ? sum / n : 0;
    }
    // 整体 = 4 维度平均
    const dimVals = Object.values(dimScores);
    const overall = dimVals.length > 0
        ? dimVals.reduce((a, b) => a + b, 0) / dimVals.length
        : 0;

    // 2) 4 大能力域评分：每域所有 sub 所有维度等级平均
    const domainScores = {};
    for (const dom of state.standards.domains) {
        let sum = 0, n = 0;
        for (const sub of dom.subdomains) {
            for (const dim of dims) {
                const lvl = cells[sub.id]?.[dim]?.level || 0;
                sum += lvl; n++;
            }
        }
        domainScores[dom.id] = {
            name: dom.name,
            score: n > 0 ? sum / n : 0,
            subCount: dom.subdomains.length
        };
    }

    // 3) 覆盖率 + 等级分布
    const total = state.standards.domains.reduce((s, d) => s + d.subdomains.length, 0) * dims.length;
    let filled = 0;
    const distribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const dom of state.standards.domains) {
        for (const sub of dom.subdomains) {
            for (const dim of dims) {
                const lvl = cells[sub.id]?.[dim]?.level || 0;
                distribution[lvl]++;
                if (lvl >= 1) filled++;
            }
        }
    }
    const coverage = { filled, total, pct: total > 0 ? filled / total : 0 };

    // 4) TOP 5 强项 / BOTTOM 5 弱项（Lv0 不算"弱项"，算"未评估"）
    const all = [];
    for (const dom of state.standards.domains) {
        for (const sub of dom.subdomains) {
            for (const dim of dims) {
                const lvl = cells[sub.id]?.[dim]?.level || 0;
                all.push({ subId: sub.id, subName: sub.name, domainName: dom.name, dim, level: lvl });
            }
        }
    }
    const top5 = [...all].filter(x => x.level >= 1).sort((a, b) => b.level - a.level || a.subName.localeCompare(b.subName)).slice(0, 5);
    const bottom5 = [...all].filter(x => x.level >= 1).sort((a, b) => a.level - b.level || a.subName.localeCompare(b.subName)).slice(0, 5);
    const unassessed = all.filter(x => x.level === 0).length;

    return { overall, coverage, dimScores, domainScores, distribution, top5, bottom5, unassessed, dims };
}

// renderDashboard: 渲染到 #dashboard
function renderDashboard() {
    const root = document.getElementById('dashboard');
    if (!root) return;

    const d = computeDashboard(state);

    // 全部空状态
    if (d.coverage.filled === 0) {
        root.innerHTML = `
            <div class="dash-empty">
                <div class="dash-empty-icon">▦</div>
                还没有任何评估数据。<br>
                <span style="opacity:.7">回到「评估热力图」开始填写等级，仪表盘会自动更新。</span>
            </div>`;
        return;
    }

    const overallPct = (d.overall / 5) * 100;
    const dims = d.dims;
    const fmt = v => v.toFixed(2);

    root.innerHTML = `
        <!-- Overview card: 整体评分 + 覆盖率 + 维度评分明细 -->
        <div class="dash-card dash-overview">
            <div class="dash-overview-ring">
                <svg viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
                    <circle cx="80" cy="80" r="68" fill="none" stroke="var(--accent)" stroke-width="10"
                        stroke-linecap="round"
                        stroke-dasharray="${(overallPct/100 * 2 * Math.PI * 68).toFixed(2)} ${(2 * Math.PI * 68).toFixed(2)}"
                        transform="rotate(-90 80 80)"
                        style="filter: drop-shadow(0 0 6px color-mix(in oklab, var(--accent) 60%, transparent));"/>
                </svg>
                <div class="dash-overview-ring-text">
                    <div class="dash-overview-score">${fmt(d.overall)}</div>
                    <div class="dash-overview-max">/ 5.0</div>
                </div>
            </div>
            <div class="dash-overview-stats">
                <div class="dash-overview-stat">
                    <div class="dash-overview-stat-value">${d.coverage.filled} / ${d.coverage.total}</div>
                    <div class="dash-overview-stat-label">覆盖率 · ${(d.coverage.pct * 100).toFixed(0)}%</div>
                </div>
                ${dims.map(dim => `
                <div class="dash-overview-stat">
                    <div class="dash-overview-stat-value">${fmt(d.dimScores[dim])}</div>
                    <div class="dash-overview-stat-label">${dim}</div>
                </div>
                `).join('')}
            </div>
        </div>

        <!-- Radar: 4 维度分布 (col 1, row 2) -->
        <div class="dash-card dash-radar">
            <div class="dash-card-title">4 维度分布（雷达图）</div>
            ${renderRadarSvg(d.dimScores, dims)}
        </div>

        <!-- Distribution pie (col 2, row 2) -->
        ${renderPieCard(d.distribution, d.coverage.total)}

        <!-- Bars: 4 能力域得分 (col 1, row 3) -->
        <div class="dash-card dash-bars">
            <div class="dash-card-title">4 能力域得分</div>
            ${Object.entries(d.domainScores).map(([id, info]) => {
                const lvl = Math.round(info.score);
                return `
                <div class="dash-bar-row">
                    <div class="dash-bar-label" title="${info.name}">${info.name}</div>
                    <div class="dash-bar-track">
                        <div class="dash-bar-fill" style="width:${(info.score/5*100).toFixed(1)}%; --fill: ${lvColor(lvl)}; background: ${lvColor(lvl)};"></div>
                    </div>
                    <div class="dash-bar-value">${fmt(info.score)}</div>
                </div>`;
            }).join('')}
        </div>

        <!-- TOP/BOTTOM (col 2, row 3) -->
        ${renderExtremesCard(d)}
    `;
}

// 4 维度雷达图（手写 SVG）
function renderRadarSvg(dimScores, dims) {
    const cx = 160, cy = 130, r = 90;
    const n = dims.length;
    // 网格层（5 个嵌套四边形）
    const grids = [1, 2, 3, 4, 5].map(level => {
        const pts = dims.map((_, i) => {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2;
            const rr = (level / 5) * r;
            return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
        }).join(' ');
        return `<polygon class="dash-radar-grid" points="${pts}"/>`;
    }).join('');
    // 轴线
    const axes = dims.map((_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return `<line class="dash-radar-axis" x1="${cx}" y1="${cy}" x2="${(cx + r * Math.cos(a)).toFixed(1)}" y2="${(cy + r * Math.sin(a)).toFixed(1)}"/>`;
    }).join('');
    // 数据多边形
    const dataPts = dims.map((dim, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const v = (dimScores[dim] || 0) / 5;
        const rr = v * r;
        return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
    });
    const dataPath = dataPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dataDots = dataPts.map(p => `<circle class="dash-radar-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"/>`).join('');
    // 标签 — 留更多余量避免被裁
    const labels = dims.map((dim, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const lr = r + 22;
        const x = cx + lr * Math.cos(a);
        const y = cy + lr * Math.sin(a) + 4;
        return `<text class="dash-radar-axis-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${dim}</text>`;
    }).join('');
    return `
        <svg viewBox="0 0 320 260" preserveAspectRatio="xMidYMid meet">
            ${grids}
            ${axes}
            <polygon class="dash-radar-shape" points="${dataPath}"/>
            ${dataDots}
            ${labels}
        </svg>
    `;
}

// 等级分布饼图（手写 SVG arc）+ 图例
function renderPieCard(dist, total) {
    // SVG 弧路径：M cx,cy L x1,y1 A r,r 0 large 1 x2,y2 Z
    const cx = 80, cy = 80, r = 60;
    let cumAngle = -Math.PI / 2; // 从正上方开始
    const segs = [];
    const lvMeta = [
        { lv: 0, label: '未评估' },
        { lv: 1, label: 'Lv1' },
        { lv: 2, label: 'Lv2' },
        { lv: 3, label: 'Lv3' },
        { lv: 4, label: 'Lv4' },
        { lv: 5, label: 'Lv5' }
    ];
    for (const { lv } of lvMeta) {
        const n = dist[lv] || 0;
        if (n === 0) continue;
        const angle = (n / total) * 2 * Math.PI;
        const next = cumAngle + angle;
        const x1 = cx + r * Math.cos(cumAngle);
        const y1 = cy + r * Math.sin(cumAngle);
        const x2 = cx + r * Math.cos(next);
        const y2 = cy + r * Math.sin(next);
        const large = angle > Math.PI ? 1 : 0;
        const d = `M ${cx},${cy} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
        segs.push(`<path d="${d}" fill="${lvColor(lv)}" stroke="var(--surface-lo)" stroke-width="1.5"/>`);
        cumAngle = next;
    }
    // 中央数字（已评估总数）
    const legend = lvMeta.map(({ lv, label }) => {
        const n = dist[lv] || 0;
        if (lv >= 1 && n === 0) return '';
        const pct = total > 0 ? (n / total * 100).toFixed(0) : 0;
        return `
            <div class="dash-pie-legend-row">
                <div class="dash-pie-legend-swatch" style="background:${lvColor(lv)};"></div>
                <div class="dash-pie-legend-label">${label}</div>
                <div class="dash-pie-legend-count">${n}</div>
                <div class="dash-pie-legend-pct">${pct}%</div>
            </div>`;
    }).join('');
    return `
        <div class="dash-card">
            <div class="dash-card-title">等级分布</div>
            <div class="dash-pie">
                <svg viewBox="0 0 160 160" preserveAspectRatio="xMidYMid meet">
                    ${segs.join('')}
                    <circle cx="${cx}" cy="${cy}" r="32" fill="var(--surface-lo)"/>
                    <text x="${cx}" y="${cy + 2}" text-anchor="middle" fill="var(--text)" font-size="18" font-weight="700">${total - (dist[0] || 0)}</text>
                    <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--text-dim)" font-size="9">已评估</text>
                </svg>
                <div class="dash-pie-legend">${legend}</div>
            </div>
        </div>
    `;
}

// TOP 5 / BOTTOM 5 列表
function renderExtremesCard(d) {
    const rowHtml = (item, rank) => `
        <div class="dash-extreme-row">
            <div class="dash-extreme-rank">${rank}</div>
            <div>
                <span class="dash-extreme-name">${item.subName}</span>
                <span class="dash-extreme-dim">· ${item.dim}</span>
            </div>
            <div class="dash-extreme-level" style="--lv-bg:${lvColor(item.level)}; --lv-fg:${lvFgColor(item.level)}; background:${lvColor(item.level)}; color:${lvFgColor(item.level)};">${item.level || '—'}</div>
        </div>`;
    const topHtml = d.top5.length > 0
        ? d.top5.map((x, i) => rowHtml(x, i + 1)).join('')
        : `<div class="dash-empty-card">暂无评估数据</div>`;
    const bottomHtml = d.bottom5.length > 0
        ? d.bottom5.map((x, i) => rowHtml(x, i + 1)).join('')
        : `<div class="dash-empty-card">全部 ≥ Lv1 后会显示最弱 5 项</div>`;
    return `
        <div class="dash-card dash-extremes-wrap">
            <div class="dash-card-title" style="margin-bottom: 8px;">TOP / BOTTOM 5</div>
            <div class="dash-extremes">
                <div class="dash-extreme-col">
                    <div class="dash-extreme-col-title" style="color: color-mix(in oklab, var(--lv4-bg) 80%, var(--text))">▴ 强项</div>
                    ${topHtml}
                </div>
                <div class="dash-extreme-col">
                    <div class="dash-extreme-col-title" style="color: color-mix(in oklab, var(--lv1-bg) 80%, var(--text))">▾ 弱项</div>
                    ${bottomHtml}
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// Go
// ============================================================
init().catch(e => {
    document.getElementById('app').innerHTML = `<pre style="color:#fbbf24;padding:40px;font-family:monospace;">启动失败：${e}\n${e.stack || ''}</pre>`;
    console.error(e);
});