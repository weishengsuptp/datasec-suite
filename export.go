package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

//go:embed export_assets/style.css
var styleCSS string

//go:embed export_assets/standards-pdf.js
var standardsPDF string

//go:embed export_assets/main.js
var mainJSRaw string

// 去掉 main.js 顶部的 ESM import 行（浏览器原生 script 不支持 import）
var importRe = regexp.MustCompile(`(?m)^\s*import\s+(?:\{\s*[\s\S]*?\}\s+from\s+|['"][^'"]+['"])\s*[^;]*;?\s*$`)

// inline JS 时，字符串字面量里的 </script> 会被 HTML 解析器误判为 script 结束标签
// → 替换为 <\/script>（JS 端运行时反斜杠会被吞掉，输出仍为 </script>）
var scriptCloseRe = regexp.MustCompile(`</script>`)

func stripImports(src string) string {
	src = importRe.ReplaceAllString(src, "")
	src = scriptCloseRe.ReplaceAllString(src, `<\/script>`)
	return src
}

// exportHTML writes a self-contained, **read-only** HTML rendering of the
// current assessment. All interactive UI (hover/click bubble, ref-grid,
// theme switcher) is preserved — but editing is disabled (no edit mode,
// no save, no dblclick-into-edit, no edit button). Opens in any modern
// browser with zero external dependencies.
func exportHTML() (string, error) {
	asm, err := loadAssessment()
	if err != nil {
		return "", err
	}

	exportedAt := time.Now()
	stdsJSON, err := json.Marshal(stdCache)
	if err != nil {
		return "", err
	}
	asmJSON, err := json.Marshal(asm)
	if err != nil {
		return "", err
	}

	mainJS := stripImports(mainJSRaw)

	// HTML 框架（与 standalone 类似，但 modal-edit/modal-history 仍渲染，
	// 由 main.js init() 在 READ_ONLY 模式下 .remove() 掉）
	var b strings.Builder
	b.WriteString("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n")
	fmt.Fprintf(&b, "<meta charset=\"UTF-8\">\n")
	fmt.Fprintf(&b, "<meta content=\"width=device-width, initial-scale=1.0\" name=\"viewport\">\n")
	fmt.Fprintf(&b, "<title>数据安全能力评估报告 · %s</title>\n",
		html.EscapeString(stdCache.Metadata.Standard))
	b.WriteString("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n")
	b.WriteString("<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n")
	b.WriteString(`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">`)
	b.WriteString("<style>\n")
	b.WriteString(styleCSS)
	b.WriteString("\n</style>\n")
	b.WriteString("</head>\n<body>\n")
	b.WriteString(`<div id="app">
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
        <nav class="tab-switcher" id="tab-bar">
            <button class="tab-btn" data-tab="heatmap" type="button"
                data-tooltip="19 子域 × 4 维度的能力热力图 — 点击格子查看等级说明，双击编辑">
                <span class="tab-icon">▦</span>
                <span class="tab-label">评估热力图</span>
            </button>
            <button class="tab-btn" data-tab="dashboard" type="button"
                data-tooltip="整体评分 · 4 维度雷达图 · 4 能力域得分 · 等级分布 · TOP/BOTTOM 5 项">
                <span class="tab-icon">◈</span>
                <span class="tab-label">分析仪表盘</span>
            </button>
        </nav>
        <div class="theme-switcher" id="theme-switcher">
            <button class="theme-btn" data-theme="warm" title="暮光 · 琥珀">暖</button>
            <button class="theme-btn" data-theme="cool" title="极光 · 翠绿">青</button>
            <button class="theme-btn" data-theme="deep" title="星海 · 深蓝">海</button>
        </div>
        <button id="btn-export" class="btn btn-primary" title="导出静态 HTML 报告">导出</button>
        <button id="btn-history" class="btn" title="历史快照，可还原任意版本">历史</button>
    </header>
    <main class="stage">
        <div class="pane pane-heatmap" data-pane="heatmap">
            <section class="panel panel-heatmap">
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
        </div>
        <div class="pane pane-dashboard" data-pane="dashboard">
            <section class="panel panel-dashboard">
                <div class="dashboard" id="dashboard"></div>
            </section>
        </div>
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
`)

	// 注入 READ_ONLY 标志 + 初始数据
	fmt.Fprintf(&b, "<script>\n")
	fmt.Fprintf(&b, "window.__READ_ONLY__ = true;\n")
	fmt.Fprintf(&b, "window.__DEFAULT_TAB__ = 'dashboard';\n")
	fmt.Fprintf(&b, "window.__INITIAL_STANDARDS__ = %s;\n", stdsJSON)
	fmt.Fprintf(&b, "window.__INITIAL_ASSESSMENT__ = %s;\n", asmJSON)
	fmt.Fprintf(&b, "window.__EXPORTED_AT__ = '%s';\n", exportedAt.Format("2006-01-02 15:04:05"))
	b.WriteString("</script>\n")

	// standards-pdf 数据
	fmt.Fprintf(&b, "<script>\n%s\n</script>\n", standardsPDF)

	// main.js (去除 import 行)
	fmt.Fprintf(&b, "<script>\n%s\n</script>\n", mainJS)

	b.WriteString("</body>\n</html>\n")

	// 写文件
	exportDir := filepath.Join(dataDir, "exports")
	if err := os.MkdirAll(exportDir, 0o755); err != nil {
		return "", err
	}
	fname := fmt.Sprintf("assessment-%s.html", exportedAt.Format("20060102-150405"))
	fpath := filepath.Join(exportDir, fname)
	if err := os.WriteFile(fpath, []byte(b.String()), 0o644); err != nil {
		return "", err
	}
	return fpath, nil
}
