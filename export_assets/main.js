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
        state.assessment = window.__INITIAL_ASSESSMENT__ || { version: 0, cells: {} };
        state.standardsList = [state.standards.metadata];
    } else {
        // 1. 拉所有可用标准 + 当前 standard id
        state.standardsList = await ListStandards();
        state.standardId = await GetCurrentStandardID();
        // 2. 拉当前 standard 的完整数据
        state.standards = await GetCurrentStandard();
        state.dimensions = state.standards.dimensions;
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
        // 隐藏所有编辑/工具入口
        document.getElementById('btn-export')?.remove();
        document.getElementById('btn-history')?.remove();
        document.getElementById('modal-edit')?.remove();
        document.getElementById('modal-history')?.remove();
        const brandTitle = document.querySelector('.brand-title');
        if (brandTitle) brandTitle.textContent = '数据安全能力评估报告';
        const panelHint = document.querySelector('.panel-heatmap .panel-hint');
        if (panelHint) panelHint.textContent = '定稿版 · 鼠标点击格子查看说明，不可编辑';
    } else {
        buildEditLevelPicker();
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
    bindFloatingPanel();
    bindTabBar();

    // 默认 tab：app = heatmap（用户在工作），export HTML = dashboard（评审看摘要）
    const defaultTab = window.__DEFAULT_TAB__ || (READ_ONLY ? 'dashboard' : 'heatmap');
    switchTab(defaultTab, { skipRender: true });

    // 仪表盘首次渲染（无论默认 tab 是哪个，都先算好数据）
    renderDashboard();

    // 默认选中第一个子域的"第一个维度"（同时显示浮动面板）
    if (state.standards.domains.length > 0) {
        const firstDom = state.standards.domains[0];
        const firstSub = firstDom.subdomains[0];
        if (firstSub) selectCell(firstSub.id, state.dimensions[0]);
    }
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
    // 找对应 standard_id（metadata.standard 是 "GB/T 37988-2019"，但 state.standardId 是 "gbt37988"）
    // ListStandards 返回 metadata，没有 id 字段 → 我们用 code → id 映射
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
        state.assessment = await LoadAssessment(newId);
        // 重新渲染
        document.getElementById('subtitle').textContent =
            `${state.standards.metadata.standard} · ${state.standards.metadata.title}`;
        try { window.runtime?.WindowSetTitle?.(`数据安全能力评估 · ${state.standards.metadata.standard}`); } catch {}
        renderStandardSwitcher();
        renderHeatmap();
        updateProgress();
        renderReference(null);
        // 重新选第一个格子（如果 domains 非空）
        if (state.standards.domains.length > 0) {
            const firstDom = state.standards.domains[0];
            const firstSub = firstDom.subdomains[0];
            if (firstSub) selectCell(firstSub.id, state.dimensions[0]);
        }
        if (typeof renderDashboard === 'function') renderDashboard();
        showToast(`已切换到 ${newStandardCode}`);
    } catch (err) {
        console.error('switchStandard failed:', err);
        showToast(`切换失败：${err.message || err}`);
    }
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

    // header row (X axis)
    const corner = document.createElement('div');
    corner.className = 'hg hg-corner';
    wrap.appendChild(corner);
    for (const dim of state.dimensions) {
        const h = document.createElement('div');
        h.className = 'hg hg-axis';
        h.textContent = dim;
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
            nameCell.addEventListener('click', () => {
                // 单击子域名 → 弹出"建设目标"气泡（PDF X.X 目标段）
                // 注意：不联动 ref-grid（ref-grid 跟具体 cell 走，不跟子域走）
                if (bubbleEl) {
                    bubbleEl._target = nameCell;
                    // 重用 setBubbleMode 用 nameCell 作为 btn（getCellInfo 只读 subId/dim）
                }
                renderBubbleTarget(nameCell);
                if (typeof positionBubble === 'function') {
                    requestAnimationFrame(() => {
                        positionBubble(nameCell);
                        bubbleEl?.classList.add('show', 'pinned');
                    });
                }
            });
            nameCell.addEventListener('dblclick', () => {
                // 双击子域名 → 同样弹目标气泡（保持一致；READ_ONLY 模式没有 edit 入口）
                renderBubbleTarget(nameCell);
                requestAnimationFrame(() => {
                    positionBubble(nameCell);
                    bubbleEl?.classList.add('show', 'pinned');
                });
            });
            wrap.appendChild(nameCell);

            // 4 维度格子
            for (const dim of state.dimensions) {
                const cell = state.assessment.cells[sub.id]?.[dim] || { level: 0, note: '' };
                const btn = document.createElement('button');
                btn.className = `hg-cell lv${cell.level}`;
                if (cell.note) btn.classList.add('has-note');
                if (state.selected?.subId === sub.id && state.selected?.dim === dim) {
                    btn.classList.add('selected');
                }
                // 显示数字
                btn.textContent = cell.level === 0 ? '·' : String(cell.level);
                btn.dataset.subId = sub.id;
                btn.dataset.dim = dim;

                // hover → 出气泡预览（不 pinned → 移开就消失）
                btn.addEventListener('mouseenter', () => showHoverBubble(btn));
                btn.addEventListener('mouseleave', () => {
                    // 仅当气泡未 pinned 时才延迟消失
                    if (bubbleEl && !bubbleEl.classList.contains('pinned')) scheduleHideBubble(220);
                });

                // click → 再次点击同 cell 关闭浮动面板 + 清选中；否则 selectCell + 钉气泡
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (state.selected?.subId === sub.id && state.selected?.dim === dim) {
                        // 再点同 cell → 关闭
                        document.querySelectorAll('.hg-cell.selected').forEach(el => el.classList.remove('selected'));
                        state.selected = null;
                        if (typeof hideFloatingPanel === 'function') hideFloatingPanel();
                        if (typeof hideBubble === 'function') hideBubble();
                    } else {
                        selectCell(sub.id, dim);
                        showPinnedBubble(btn);
                    }
                });
                // 双击 = 直接进 edit 态（pinned 态下再次 dblclick = 重新聚焦 textarea）
                // READ_ONLY 模式下双击无效（只读，不可编辑）
                btn.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.__READ_ONLY__) return;
                    selectCell(sub.id, dim);
                    showPinnedBubble(btn);
                    // pinned 后再切到 edit 态（直接进编辑，省一次点击）
                    if (bubbleEl && bubbleEl._target === btn) {
                        setBubbleMode(bubbleEl, 'edit', btn);
                    }
                });
                wrap.appendChild(btn);
            }
        });
    });
}

function selectCell(subId, dim) {
    state.selected = { subId, dim };
    // 局部更新 selected class —— 不重建 DOM（避免引用失效）
    document.querySelectorAll('.hg-cell.selected').forEach(el => el.classList.remove('selected'));
    const cellBtn = document.querySelector(`.hg-cell[data-sub-id="${subId}"][data-dim="${dim}"]`);
    if (cellBtn) cellBtn.classList.add('selected');
    renderReference(subId);
    showFloatingPanel();  // 选格子 → 等级说明浮动面板出现
}

function updateProgress() {
    let done = 0;
    // 理论总格数：subdomains_count × dimensions_count。
    // DSMM 模式 standards.gbt37988.json 的 domains=[] 时也按"理论 30 PA × 4 维"显示。
    const expectedSubs = expectedSubdomainCount(state.standardId);
    const total = expectedSubs * state.dimensions.length;
    for (const dom of state.standards.domains) {
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
        const dimLabel = state.standardId === 'gbt37988' ? '30 PA' : (state.standards.domains.reduce((n, d) => n + d.subdomains.length, 0) + ' 子域');
        prog.title = `已评估 / 总格子（${dimLabel} × ${state.dimensions.length} 维度）`;
    }
}

// 理论子域数（OCR 还没填时也能显示完整进度）
function expectedSubdomainCount(standardId) {
    if (standardId === 'gbt37988') return 30;
    if (standardId === 'jrt0358') return state.standards.domains.reduce((n, d) => n + d.subdomains.length, 0) || 19;
    return state.standards.domains.reduce((n, d) => n + d.subdomains.length, 0);
}

// ============================================================
// Reference table (5 levels × 4 dimensions for selected subdomain)
// ============================================================
function renderReference(subId) {
    const ref = document.getElementById('ref-grid');
    ref.innerHTML = '';

    const subNameEl = document.getElementById('ref-sub-name');

    if (!subId) {
        subNameEl.textContent = '（请选择上方格子）';
        return;
    }

    const sub = findSubdomain(subId);
    if (!sub) return;
    subNameEl.textContent = `（${sub.name}）`;

    // header row (X axis)
    const corner = document.createElement('div');
    corner.className = 'rg rg-corner';
    ref.appendChild(corner);
    for (const dim of state.dimensions) {
        const h = document.createElement('div');
        h.className = 'rg rg-axis';
        h.textContent = dim;
        ref.appendChild(h);
    }

    // body rows: 5 levels × 4 dims
    const userLevel = state.selected?.dim
        ? (state.assessment.cells[subId]?.[state.selected.dim]?.level || 0)
        : 0;

    for (let lvl = 1; lvl <= 5; lvl++) {
        // Y axis label (header style, not level-color)
        const lvlCell = document.createElement('div');
        lvlCell.className = 'rg rg-axis-y rg-axis-y-level';
        lvlCell.textContent = `Lv${lvl}`;
        lvlCell.style.color = `var(--lv${lvl}-fg)`;
        lvlCell.style.background = `var(--lv${lvl}-bg)`;
        ref.appendChild(lvlCell);

        const level = sub.levels[String(lvl)];
        for (const dim of state.dimensions) {
            const cell = document.createElement('div');
            const txt = level?.[dim];
            const isCurrentDim = state.selected?.dim === dim;
            const isCurrentLevel = userLevel === lvl;
            if (!txt) {
                cell.className = 'rg rg-desc dash';
                cell.textContent = '— 沿用低一级';
                // PDF 5.1 节 b 条：专项能力"—" = 通用同等级 + 专项低一等级（双继承）
                // 专项子域（sub.id !== 'general_security'）且通用 sub 存在 → 标注可 hover
                if (sub.id !== 'general_security') {
                    const generalSub = findSubdomain('general_security');
                    const generalTxt = generalSub?.levels?.[String(lvl)]?.[dim];
                    if (generalTxt) {
                        cell.classList.add('has-inherit');
                        cell.dataset.inheritLv = String(lvl);
                        cell.dataset.inheritDim = dim;
                    }
                }
            } else {
                cell.className = 'rg rg-desc';
                cell.textContent = txt;
            }
            // 强调逻辑：
            // - 已选等级（userLevel > 0）：只高亮「选中的那一格」（行 × 列交叉）
            // - 未选等级（userLevel === 0）：高亮整列，展示该维度的所有等级
            if (userLevel > 0) {
                if (isCurrentDim && isCurrentLevel) cell.classList.add('current');
            } else {
                if (isCurrentDim) cell.classList.add('current');
            }
            ref.appendChild(cell);
        }
    }

    bindDashInheritHints(ref);
}

// ============================================================
// 专项"—"双继承提示（PDF 5.1 节 b 条）：
//   hover 在专项 dash 格上 → 弹小 tooltip，显示通用同等级能力描述
//   仅 hover 触发，不 click（避免误触）
// ============================================================
let dashInheritTooltipEl = null;
let dashInheritHideTimer = null;
function bindDashInheritHints(ref) {
    const cells = ref.querySelectorAll('.rg-desc.dash.has-inherit');
    cells.forEach(cell => {
        cell.addEventListener('mouseenter', () => {
            const lv = cell.dataset.inheritLv;
            const dim = cell.dataset.inheritDim;
            const generalSub = findSubdomain('general_security');
            const txt = generalSub?.levels?.[lv]?.[dim];
            if (!txt) return;
            showDashInheritTooltip(cell, dim, lv, txt);
        });
        cell.addEventListener('mouseleave', () => {
            dashInheritHideTimer = setTimeout(hideDashInheritTooltip, 180);
        });
    });
}
function showDashInheritTooltip(anchorEl, dim, lv, txt) {
    if (dashInheritHideTimer) { clearTimeout(dashInheritHideTimer); dashInheritHideTimer = null; }
    if (!dashInheritTooltipEl) {
        dashInheritTooltipEl = document.createElement('div');
        dashInheritTooltipEl.className = 'ref-tooltip';
        document.body.appendChild(dashInheritTooltipEl);
    }
    dashInheritTooltipEl.innerHTML = `
        <div class="ref-tooltip-head">
            <span class="ref-tooltip-tag">↪ 通用能力同等级</span>
            <span class="ref-tooltip-meta">${dim} · Lv${lv}</span>
        </div>
        <div class="ref-tooltip-body">${escapeHtml(txt)}</div>
        <div class="ref-tooltip-foot">源：通用数据安全保障能力域</div>
    `;
    // 定位：anchor 右边（如果放不下放左边），垂直居中
    const r = anchorEl.getBoundingClientRect();
    const tip = dashInheritTooltipEl;
    tip.style.visibility = 'hidden';
    tip.classList.add('show');
    const tw = tip.offsetWidth || 320;
    const th = tip.offsetHeight || 80;
    let left = r.right + 10;
    if (left + tw > window.innerWidth - 12) left = r.left - tw - 10;
    if (left < 12) left = 12;
    let top = r.top + r.height / 2 - th / 2;
    if (top < 12) top = 12;
    if (top + th > window.innerHeight - 12) top = window.innerHeight - th - 12;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.visibility = 'visible';
    // tooltip 自身也支持 hover（鼠标移到 tooltip 上不消失）
    tip.onmouseenter = () => { if (dashInheritHideTimer) { clearTimeout(dashInheritHideTimer); dashInheritHideTimer = null; } };
    tip.onmouseleave = () => { dashInheritHideTimer = setTimeout(hideDashInheritTooltip, 180); };
}
function hideDashInheritTooltip() {
    if (dashInheritTooltipEl) dashInheritTooltipEl.classList.remove('show');
}

function findSubdomain(id) {
    for (const dom of state.standards.domains) {
        for (const sub of dom.subdomains) {
            if (sub.id === id) return sub;
        }
    }
    return null;
}

// ============================================================
// Modals
// ============================================================
let pendingCell = null;

function openEditModal(subId, dim) {
    pendingCell = { subId, dim };
    state.selected = { subId, dim };
    const cell = state.assessment.cells[subId]?.[dim] || { level: 0, note: '' };
    const sub = findSubdomain(subId);
    document.getElementById('modal-edit-subtitle').textContent =
        `${sub?.name || ''} · ${dim}`;

    // 等级选择高亮当前
    document.querySelectorAll('#edit-level-picker .level-option').forEach(el => {
        const v = parseInt(el.dataset.level, 10);
        el.classList.toggle('selected', v === (cell.level || 0));
    });

    // 描述填入
    document.getElementById('edit-note').value = cell.note || '';

    showModal('modal-edit');
}

function buildEditLevelPicker() {
    const picker = document.getElementById('edit-level-picker');
    picker.innerHTML = '';
    const options = [
        { v: 0, label: '未评估' },
        { v: 1, label: 'Lv1' },
        { v: 2, label: 'Lv2' },
        { v: 3, label: 'Lv3' },
        { v: 4, label: 'Lv4' },
        { v: 5, label: 'Lv5' },
    ];
    for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = `level-option lv${opt.v}`;
        btn.dataset.level = opt.v;
        const num = document.createElement('div');
        num.className = 'num';
        num.textContent = opt.v === 0 ? '—' : opt.v;
        const lbl = document.createElement('div');
        lbl.className = 'label';
        lbl.textContent = opt.label;
        btn.appendChild(num);
        btn.appendChild(lbl);
        btn.addEventListener('click', () => {
            // 高亮当前选择（不立即保存，等点"保存"）
            document.querySelectorAll('#edit-level-picker .level-option').forEach(el => {
                el.classList.toggle('selected', parseInt(el.dataset.level, 10) === opt.v);
            });
        });
        picker.appendChild(btn);
    }
}

document.getElementById('edit-save').addEventListener('click', async () => {
    if (!pendingCell) return;
    const { subId, dim } = pendingCell;
    const selectedEl = document.querySelector('#edit-level-picker .level-option.selected');
    const lvl = selectedEl ? parseInt(selectedEl.dataset.level, 10) : 0;
    const note = document.getElementById('edit-note').value.trim();
    if (!state.assessment.cells[subId]) state.assessment.cells[subId] = {};
    if (!state.assessment.cells[subId][dim]) {
        state.assessment.cells[subId][dim] = { level: 0, note: '' };
    }
    state.assessment.cells[subId][dim].level = lvl;
    state.assessment.cells[subId][dim].note = note;
    await persist();
    hideBubble();
    renderHeatmap();
    updateProgress();
    renderReference(subId);
    hideModal('modal-edit');
    pendingCell = null;
    const hasLevel = lvl > 0;
    const hasNote = note.length > 0;
    if (hasLevel && hasNote) toast(`已保存：${LEVEL_LABELS[lvl]} + 描述`);
    else if (hasLevel) toast(`已保存等级：${LEVEL_LABELS[lvl]}`);
    else if (hasNote) toast('已保存描述');
    else toast('已清空评估');
});

document.getElementById('edit-clear-note').addEventListener('click', () => {
    document.getElementById('edit-note').value = '';
});

// ============================================================
// Bubble (hover + click fixed)
// ============================================================
let bubbleEl = null;
let hideTimer = null;

function ensureBubble() {
    if (bubbleEl) return bubbleEl;
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    // 鼠标进入气泡 → 取消隐藏（仅在非 pinned 时）；移出 → 延迟隐藏
    bubbleEl.addEventListener('mouseenter', () => {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    bubbleEl.addEventListener('mouseleave', () => {
        if (!bubbleEl.classList.contains('pinned')) scheduleHideBubble(220);
    });
    document.body.appendChild(bubbleEl);
    return bubbleEl;
}

function getCellInfo(btn) {
    const subId = btn.dataset.subId;
    const dim = btn.dataset.dim;
    const sub = findSubdomain(subId);
    const cell = state.assessment.cells[subId]?.[dim] || { level: 0, note: '' };
    return { sub, dim, subId, cell };
}

function levelColorPill(lv) {
    if (lv === 0) return `<span class="pill">未评估</span>`;
    return `<span class="pill">Lv${lv} · ${LEVEL_LABELS[lv]}</span>`;
}

function positionBubble(btn) {
    const b = ensureBubble();
    const r = btn.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();

    // 默认贴格子上方（箭头朝下指向格子）
    let top = r.top - bRect.height - 8;
    let left = r.left + r.width / 2 - bRect.width / 2;
    let arrow = 'down';

    // 上方空间不够 → 改贴下方（箭头朝上）
    if (top < 12) {
        top = r.bottom + 8;
        arrow = 'up';
    }

    // 左右边界裁剪
    left = Math.max(8, Math.min(left, window.innerWidth - bRect.width - 8));

    b.style.position = 'fixed';
    b.style.top = `${top}px`;
    b.style.left = `${left}px`;

    // 箭头方向 + 水平位置跟随格子中心
    const arrowEl = b.querySelector('.bubble-arrow');
    if (arrowEl) {
        arrowEl.className = `bubble-arrow ${arrow}`;
        const cellCenterX = r.left + r.width / 2;
        const arrowX = Math.max(8, Math.min(cellCenterX - left - 6, bRect.width - 16));
        arrowEl.style.left = `${arrowX}px`;
    }

    // 挂在 body 上，避免被 panel 裁切
    if (b.parentElement !== document.body) document.body.appendChild(b);
}

// 气泡内容渲染：双层模式
// ① read 态（默认）：hover 预览 / click 钉住 —— 只读 + 底部"编辑"入口按钮
// ② edit 态：用户点"编辑"或按 e / Enter 触发 —— 6 等级 + textarea + 保存/取消/清空
// 切换用 .is-editing class；容器 max-width transition 让放大平滑
function renderBubblePreview(btn) {
    const b = ensureBubble();
    const { sub, dim, cell } = getCellInfo(btn);
    setBubbleMode(b, 'read', btn);
}

function renderBubbleEdit(btn) {
    const b = ensureBubble();
    setBubbleMode(b, 'edit', btn);
}

// 渲染"建设目标"气泡（用于子域名行 click/dblclick）
// btn 传 nameCell（.hg-name）即可，内部用 getCellInfo 取 subId
function renderBubbleTarget(nameBtn) {
    const b = ensureBubble();
    setBubbleMode(b, 'target', nameBtn);
}

function setBubbleMode(b, mode, btn) {
    // READ_ONLY 模式下：忽略 edit 模式，强制 read
    if (window.__READ_ONLY__ && mode === 'edit') return;
    const { sub, dim, cell } = getCellInfo(btn);

    // 锁定当前高度，让 innerHTML 重写 + max-width 变化时不"咔嚓"
    const lockedH = b.offsetHeight;
    b.style.minHeight = lockedH + 'px';

    // 任何模式切换前先清掉所有 is-* 状态 class
    b.classList.remove('is-editing', 'is-target');

    if (mode === 'target') {
        // 子域建设目标气泡（单击子域名行）
        // 优先用 Go 端 standards.json 注入的 sub.target，回退到 inline 的 SUB_TARGETS
        const targetText = sub?.target || (window.SUB_TARGETS || {})[sub?.id] || '（暂无目标描述）';
        b.innerHTML = `
            <button class="bubble-close" aria-label="关闭">×</button>
            <div class="bubble-arrow ${b.dataset.arrow || 'down'}"></div>
            <div class="bubble-title">${sub?.name || '未知子域'} · 建设目标</div>
            <div class="bubble-meta">JR/T 0358-2026 · 本能力域/子域的总体目标</div>
            <div class="bubble-target">${escapeHtml(targetText)}</div>
            <div class="bubble-foot"><span class="bubble-foot-hint">ESC 关闭</span></div>
        `;
        b.classList.add('is-target');
        bindBubbleEvents(b, btn);
        return;
    }

    if (mode === 'read') {
        const descHtml = cell.note
            ? `<div class="bubble-section">本机构描述</div>
               <div class="bubble-desc">${escapeHtml(cell.note)}</div>`
            : `<div class="bubble-desc empty">（该格未填写）</div>`;
        // READ_ONLY：foot 不渲染"编辑"按钮，只剩关闭提示
        const footHtml = window.__READ_ONLY__
            ? `<div class="bubble-foot"><span class="bubble-foot-hint">定稿版 · 只读</span></div>`
            : `<div class="bubble-foot">
                <button type="button" class="bubble-edit-toggle" data-action="enter-edit">
                    <span class="ico">✎</span><span>编辑等级与描述</span>
                </button>
                <span class="bubble-foot-hint">ESC 关闭</span>
            </div>`;
        b.innerHTML = `
            <button class="bubble-close" aria-label="关闭">×</button>
            <div class="bubble-arrow ${b.dataset.arrow || 'down'}"></div>
            <div class="bubble-title">${sub?.name || '未知子域'}</div>
            <div class="bubble-meta">${dim} ${levelColorPill(cell.level)}</div>
            ${descHtml}
            ${footHtml}
        `;
    } else {
        const levels = [
            { v: 0, label: '未评估' },
            { v: 1, label: 'Lv1' }, { v: 2, label: 'Lv2' }, { v: 3, label: 'Lv3' },
            { v: 4, label: 'Lv4' }, { v: 5, label: 'Lv5' },
        ];
        const pillsHtml = levels.map(o => {
            const num = o.v === 0 ? '—' : String(o.v);
            return `<button type="button" class="bubble-lv-pill lv${o.v}${o.v === cell.level ? ' selected' : ''}" data-level="${o.v}">
                <span class="num">${num}</span><span class="label">${o.label}</span>
            </button>`;
        }).join('');

        b.innerHTML = `
            <div class="bubble-drag-handle" title="拖动气泡"></div>
            <button class="bubble-close" aria-label="返回预览">×</button>
            <div class="bubble-arrow ${b.dataset.arrow || 'down'}"></div>
            <div class="bubble-title">${sub?.name || '未知子域'}</div>
            <div class="bubble-meta">${dim}</div>
            <div class="bubble-lv-row">${pillsHtml}</div>
            <textarea class="bubble-textarea" rows="4"
                placeholder="说明本机构在「组织建设/制度流程/技术能力/人员能力」方面的实际做法、可量化指标、佐证材料链接，以及选择该等级的理由…"
            >${escapeHtml(cell.note || '')}</textarea>
            <div class="bubble-actions">
                <button type="button" class="bubble-btn ghost" data-action="clear">清空</button>
                <button type="button" class="bubble-btn" data-action="back">返回</button>
                <button type="button" class="bubble-btn primary" data-action="save">保存</button>
            </div>
            <div class="bubble-foot hint">
                <span><kbd>Ctrl/⌘+Enter</kbd> 保存</span>
                <span><kbd>ESC</kbd> 返回预览</span>
            </div>
        `;
        b.classList.add('is-editing');
    }

    bindBubbleEvents(b, btn);

    // 两帧后解除 min-height 锁定，让内容自然撑开
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            b.style.minHeight = '';
        });
    });
}

function bindBubbleEvents(b, btn) {
    const isEdit = b.classList.contains('is-editing');

    // 关闭/返回按钮（×）
    b.querySelector('.bubble-close').addEventListener('click', (e) => {
        e.stopPropagation();
        if (isEdit) setBubbleMode(b, 'read', btn); // edit 态：返回 read
        else hideBubble();                         // read 态：关闭
    });

    if (!isEdit) {
        // read 态：编辑入口按钮（READ_ONLY 模式下该按钮不渲染）
        const enterEditBtn = b.querySelector('[data-action="enter-edit"]');
        if (enterEditBtn) {
            enterEditBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setBubbleMode(b, 'edit', btn);
            });
        }
    } else {
        // edit 态：拖手 → 启动拖动
        makeBubbleDraggable(b);

        // edit 态：3 个动作按钮
        b.querySelectorAll('.bubble-btn').forEach(btnEl => {
            btnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btnEl.dataset.action;
                if (action === 'save') saveBubbleEdit(btn);
                else if (action === 'back') setBubbleMode(b, 'read', btn);
                else if (action === 'clear') {
                    b.querySelector('.bubble-textarea').value = '';
                    b.querySelectorAll('.bubble-lv-pill').forEach(x => x.classList.remove('selected'));
                    b.querySelector('.bubble-lv-pill[data-level="0"]').classList.add('selected');
                }
            });
        });

        // 等级 pill 点击
        b.querySelectorAll('.bubble-lv-pill').forEach(p => {
            p.addEventListener('click', (e) => {
                e.stopPropagation();
                b.querySelectorAll('.bubble-lv-pill').forEach(x => x.classList.remove('selected'));
                p.classList.add('selected');
            });
        });

        // 键盘：Ctrl/⌘+Enter 保存、ESC 返回 read 态
        const ta = b.querySelector('.bubble-textarea');
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveBubbleEdit(btn);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setBubbleMode(b, 'read', btn);
            }
            e.stopPropagation();
        });

        // 自动聚焦 textarea
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
        });
    }
}

function saveBubbleEdit(btn) {
    if (window.__READ_ONLY__) return; // 只读模式不写
    const b = ensureBubble();
    const { subId, dim } = getCellInfo(btn);
    if (!subId) { console.error('[saveBubbleEdit] subId undefined, btn=', btn); return; }
    const selected = b.querySelector('.bubble-lv-pill.selected');
    const lvl = selected ? parseInt(selected.dataset.level, 10) : 0;
    const note = b.querySelector('.bubble-textarea').value.trim();

    if (!state.assessment.cells[subId]) state.assessment.cells[subId] = {};
    if (!state.assessment.cells[subId][dim]) {
        state.assessment.cells[subId][dim] = { level: 0, note: '' };
    }
    state.assessment.cells[subId][dim].level = lvl;
    state.assessment.cells[subId][dim].note = note;
    persist();
    renderHeatmap();
    updateProgress();
    renderReference(subId);
    hideBubble();

    const hasLevel = lvl > 0;
    const hasNote = note.length > 0;
    if (hasLevel && hasNote) toast(`已保存：${LEVEL_LABELS[lvl]} + 描述`);
    else if (hasLevel) toast(`已保存等级：${LEVEL_LABELS[lvl]}`);
    else if (hasNote) toast('已保存描述');
    else toast('已清空评估');
}

// 兼容旧调用（如果别处还在用 renderBubbleContent）
function renderBubbleContent(btn) { renderBubblePreview(btn); }

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// hover 出气泡（不 pinned → 鼠标移开格子就消失）—— 只读预览
function showHoverBubble(btn) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    const b = ensureBubble();
    if (b.classList.contains('pinned')) return; // 已 pinned → 不覆盖
    renderBubblePreview(btn);
    b._target = btn;
    requestAnimationFrame(() => {
        positionBubble(btn);
        b.classList.add('show');
    });
}

function scheduleHideBubble(delay = 220) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        const b = ensureBubble();
        if (!b.classList.contains('pinned')) hideBubble();
    }, delay);
}

// click 出气泡 → pinned + read 态（只读预览，底部"编辑"按钮触发 edit 态）
function showPinnedBubble(btn) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    const b = ensureBubble();

    // 如果气泡已经 pinned 在同一格子上 —— 不重 render（避免闪烁），保留 is-editing 态
    if (b._target === btn && b.classList.contains('show') && b.classList.contains('pinned')) {
        return;
    }

    // 如果气泡当前在 hover 状态显示在同一格子（未 pinned），转 pinned
    // 内容从 read 切 read 不需重 render，但保险起见重 render 一次确保正确
    renderBubblePreview(btn);
    b._target = btn;
    b.classList.add('pinned');
    requestAnimationFrame(() => {
        positionBubble(btn);
        b.classList.add('show');
    });
}

function hideBubble() {
    const b = ensureBubble();
    b.classList.remove('show', 'pinned');
    b._target = null;
    // 清除用户拖动后的 left/top，下次 click cell 从默认位置重新锚定
    b.style.left = '';
    b.style.top = '';
    delete b.dataset.userDragged;
}

// 让气泡可拖动（仅 edit 态生效）—— 拖动后脱锚，下次 click cell 重新锚定
function makeBubbleDraggable(b) {
    const handle = b.querySelector('.bubble-drag-handle');
    if (!handle) return;
    let offsetX = 0, offsetY = 0, dragging = false;

    const onMove = (e) => {
        if (!dragging) return;
        const newLeft = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - b.offsetWidth));
        const newTop = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - b.offsetHeight));
        b.style.left = `${newLeft}px`;
        b.style.top = `${newTop}px`;
        b.dataset.userDragged = '1';
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        b.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    handle.addEventListener('mousedown', (e) => {
        // 只响应左键
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = b.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        dragging = true;
        b.classList.add('dragging');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// 全局点击空白 / ESC 关闭
document.addEventListener('click', (e) => {
    if (!bubbleEl) return;
    if (e.target.closest('.bubble')) return;
    if (e.target.closest('.hg-cell')) return; // 让 cell 自己处理（重新 click 同格子 = 切换 pinned）
    if (e.target.closest('.hg-name')) return; // name 也是热力图核心控件，不算空白
    hideBubble();
    // 点空白 → 浮动面板也关闭（但要排除 panel-ref 内部点击，已 stopPropagation）
    if (floatingPanel && floatingPanel.classList.contains('show') && !e.target.closest('.panel-ref')) {
        hideFloatingPanel();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideBubble();
        if (floatingPanel && floatingPanel.classList.contains('show')) {
            hideFloatingPanel();
        }
    }
});

// 重排（窗口尺寸变 / 滚动时）让气泡跟着格子
window.addEventListener('resize', () => {
    if (bubbleEl?.classList.contains('show') && bubbleEl._target) {
        positionBubble(bubbleEl._target);
    }
});
document.querySelector('.heatmap')?.addEventListener('scroll', () => {
    if (bubbleEl?.classList.contains('show') && bubbleEl._target) {
        positionBubble(bubbleEl._target);
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
                    renderReference(state.selected?.subId);
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
            // 刷新：进度 / 选中 / 等级条
            state.selected = null;
            updateProgress();
            renderHeatmap();
            // 关掉浮动面板（之前的 sub 可能在新数据里情况不同）
            hideFloatingPanel();
            hideBubble();
            // 重新载入当前选中的 sub 的参考表
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
// Floating reference panel (bottom slide-up, show on selectCell)
// ============================================================
let floatingPanel = null;

function bindFloatingPanel() {
    floatingPanel = document.getElementById('panel-ref');
    if (!floatingPanel) return;

    // × 按钮关闭
    document.getElementById('panel-ref-close').addEventListener('click', (e) => {
        e.stopPropagation();
        hideFloatingPanel();
    });

    // 点 panel 内部不冒泡触发"空白关闭"
    floatingPanel.addEventListener('click', (e) => e.stopPropagation());
}

function showFloatingPanel() {
    if (floatingPanel) floatingPanel.classList.add('show');
}

function hideFloatingPanel() {
    if (floatingPanel) floatingPanel.classList.remove('show');
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
    // 切到仪表盘 → 关掉浮动面板（仪表盘不需要 ref-grid）
    if (tabId === 'dashboard' && typeof hideFloatingPanel === 'function') {
        hideFloatingPanel();
        if (typeof hideBubble === 'function') hideBubble();
    }
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