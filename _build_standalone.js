// Build a single standalone HTML file by inlining CSS + main.js (rewritten as classic script) + mock
const fs = require('fs');
const path = require('path');

const root = 'E:\\jinrongdata\\dsmm-tool-app';
const css = fs.readFileSync(path.join(root, 'frontend/src/style.css'), 'utf8');
const mainRaw = fs.readFileSync(path.join(root, 'frontend/src/main.js'), 'utf8');
const mockRaw = fs.readFileSync(path.join(root, 'frontend/src/wails-mock.js'), 'utf8');
const pdfRaw = fs.readFileSync(path.join(root, 'frontend/src/standards-pdf.js'), 'utf8');

let main = mainRaw
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '');

main = `// === injected for standalone build ===
const { GetStandards, LoadAssessment, SaveAssessment, ExportHTML, ListHistory, RestoreVersion } = window.go.main.App;
` + main;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>数据安全能力评估 · JR/T 0358-2026（standalone preview）</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app">
    <header class="toolbar">
        <div class="brand-mark">金</div>
        <div class="brand-text">
            <span class="brand-title">数据安全能力评估</span>
            <span class="brand-sub" id="subtitle">JR/T 0358-2026</span>
        </div>
        <div class="toolbar-spacer"></div>
        <div class="progress" title="已评估 / 总格子（19 子域 × 4 维度）">
            <span class="progress-dot"></span>
            <span><span class="progress-num" id="progress-done">0</span><span class="progress-sep">/</span><span id="progress-total">76</span></span>
        </div>
        <div class="theme-switcher" id="theme-switcher">
            <button class="theme-btn" data-theme="warm" title="暮光 · 琥珀">暖</button>
            <button class="theme-btn" data-theme="cool" title="极光 · 翠绿">青</button>
            <button class="theme-btn" data-theme="deep" title="星海 · 深蓝">海</button>
        </div>
        <button id="btn-export" class="btn btn-primary" title="导出静态 HTML 报告">导出</button>
        <button id="btn-history" class="btn" title="历史快照，可还原任意版本">历史</button>
    </header>
    <main class="stage">
        <section class="panel panel-heatmap">
            <header class="panel-head">
                <h2>能力评估热力图</h2>
                <span class="panel-hint">单击查看等级说明 · 双击编辑等级与机构描述</span>
            </header>
            <div class="heatmap" id="heatmap"></div>
        </section>
        <section class="panel panel-ref" id="panel-ref">
            <button class="panel-ref-close" id="panel-ref-close" title="关闭（ESC）" aria-label="关闭等级说明">×</button>
            <header class="panel-head">
                <h2>等级说明 <span class="ref-subname" id="ref-sub-name">（请选择上方格子）</span></h2>
                <span class="panel-hint">"—" 表示沿用低一等级要求</span>
            </header>
            <div class="ref-grid" id="ref-grid"></div>
        </section>
    </main>
    <div id="modal-edit" class="modal-overlay">
        <div class="modal modal-wide">
            <div class="modal-header">
                <div class="modal-title">编辑评估<small id="modal-edit-subtitle"></small></div>
                <button class="modal-close" data-close="modal-edit" aria-label="关闭">×</button>
            </div>
            <div class="edit-section">
                <div class="edit-label">① 选择等级</div>
                <div class="level-picker" id="edit-level-picker"></div>
            </div>
            <div class="edit-section">
                <div class="edit-label">② 填写本机构实际描述与选择依据</div>
                <textarea id="edit-note" rows="4" placeholder="说明本机构在「组织建设 / 制度流程 / 技术能力 / 人员能力」方面的实际做法、可量化指标、佐证材料链接，以及选择该等级的理由…"></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn" data-close="modal-edit">取消</button>
                <button id="edit-clear-note" class="btn btn-ghost">清空描述</button>
                <button id="edit-save" class="btn btn-primary">保存</button>
            </div>
        </div>
    </div>
    <div id="modal-history" class="modal-overlay">
        <div class="modal modal-wide">
            <div class="modal-header">
                <div class="modal-title">历史版本<small id="modal-history-subtitle">每次保存前自动快照</small></div>
                <button class="modal-close" data-close="modal-history" aria-label="关闭">×</button>
            </div>
            <div id="history-list" class="history-list"></div>
        </div>
    </div>
    <div id="toast" class="toast">
        <span class="icon">✓</span>
        <span id="toast-msg"></span>
    </div>
</div>
<script>
${pdfRaw}
</script>
<script>
${mockRaw}
</script>
<script>
${main}
</script>
</body>
</html>
`;

const out = path.join(root, 'preview-v3-standalone.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Wrote', out, '(' + html.length + ' bytes)');