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
	// v0.2 多标准：导出当前激活的 standard（currentStandard + currentStandardID）
	asm, err := loadAssessment(currentStandardID)
	if err != nil {
		return "", err
	}

	exportedAt := time.Now()
	// 只导出当前 standard 的 standards（不导出全量 map）
	stdsJSON, err := json.Marshal(currentStandard)
	if err != nil {
		return "", err
	}
	asmJSON, err := json.Marshal(asm)
	if err != nil {
		return "", err
	}

	mainJS := stripImports(mainJSRaw)

	// HTML 框架（与 frontend/index.html 一致：v0.3 浮动 detail card，
	// 旧 v0.2 的 panel-ref / modal-edit / modal-history 已全部移除）
	var b strings.Builder
	b.WriteString("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n")
	fmt.Fprintf(&b, "<meta charset=\"UTF-8\">\n")
	fmt.Fprintf(&b, "<meta content=\"width=device-width, initial-scale=1.0\" name=\"viewport\">\n")
	fmt.Fprintf(&b, "<title>数据安全能力评估报告 · %s</title>\n",
		html.EscapeString(currentStandard.Metadata.Standard))
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
        <div class="brand-text" id="brand-text" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false" title="点击切换标准">
            <span class="brand-title">数据安全能力评估</span>
            <span class="brand-sub" id="subtitle">—</span>
            <span class="brand-sub-caret" aria-hidden="true">▾</span>
        </div>
        <div class="toolbar-spacer"></div>
        <div class="progress" title="已评估 / 总格子">
            <span class="progress-dot"></span>
            <span><span class="progress-num" id="progress-done">0</span><span class="progress-sep">/</span><span id="progress-total">76</span></span>
        </div>
        <nav class="tab-switcher" id="tab-bar">
            <button class="tab-btn active" data-tab="heatmap" type="button"
                data-tooltip="子域 × 4 维度的能力热力图 — 点击格子查看等级说明">
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
    </header>
    <main class="stage">
        <div class="pane pane-heatmap active" data-pane="heatmap">
            <section class="panel panel-heatmap" id="panel-heatmap-wrap">
                <div class="heatmap" id="heatmap"></div>
            </section>
            <section class="panel panel-detail" id="panel-detail" hidden>
                <div class="panel-detail-card" id="panel-detail-card">
                <header class="panel-head detail-head">
                    <h2>
                        <span class="detail-subname" id="detail-sub-name">—</span>
                        <span class="detail-sep">·</span>
                        <span class="detail-dimname" id="detail-dim-name">—</span>
                    </h2>
                    <button class="panel-ref-close" id="panel-detail-close" title="关闭（ESC）" aria-label="关闭详情页">×</button>
                </header>
                <div class="detail-body">
                    <div class="detail-pane detail-user">
                        <div class="detail-pane-head">
                            <h3>你的评估</h3>
                            <button class="btn btn-ghost" id="btn-detail-edit" title="进入编辑态">编辑</button>
                        </div>
                        <div class="detail-level-row" id="detail-level-row"></div>
                        <div class="detail-note">
                            <textarea id="detail-note" rows="8" readonly
                                placeholder="说明本机构在「组织建设 / 制度流程 / 技术能力 / 人员能力」方面的实际做法、可量化指标、佐证材料链接，以及选择该等级的理由…"></textarea>
                        </div>
                        <div class="detail-actions">
                            <button class="btn btn-ghost" id="btn-detail-clear" title="清空等级与描述（不会自动保存，需要点保存）">清空</button>
                            <span class="detail-hint" id="detail-hint">Ctrl+S 保存 · ESC 返回</span>
                            <button class="btn" id="btn-detail-back" title="返回热力图">返回</button>
                            <button class="btn btn-primary" id="btn-detail-save" title="保存修改">保存</button>
                        </div>
                    </div>
                    <div class="detail-pane detail-standard">
                        <div class="detail-pane-head">
                            <h3>标准 · <span id="detail-standard-dim">—</span></h3>
                            <span class="detail-pane-hint">"—" 表示沿用低一等级要求</span>
                        </div>
                        <div class="detail-levels" id="detail-levels"></div>
                    </div>
                </div>
                </div>
            </section>
        </div>
        <div class="pane pane-dashboard" data-pane="dashboard">
            <section class="panel panel-dashboard">
                <div class="dashboard" id="dashboard"></div>
            </section>
        </div>
    </main>
    <div id="modal-unsaved" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <div class="modal-title">有未保存的修改</div>
            </div>
            <div class="unsaved-body">
                <p>当前评估有未保存的修改，是否保存？</p>
            </div>
            <div class="modal-actions">
                <button class="btn" id="unsaved-cancel" data-close="modal-unsaved">取消</button>
                <button class="btn" id="unsaved-discard">不保存</button>
                <button class="btn btn-primary" id="unsaved-save">保存</button>
            </div>
        </div>
    </div>
    <div id="toast" class="toast">
        <span class="icon">✓</span>
        <span id="toast-msg"></span>
    </div>
</div>
<div class="standard-menu" id="standard-menu" role="menu" hidden></div>
`)

	// 注入 READ_ONLY 标志 + 初始数据
	fmt.Fprintf(&b, "<script>\n")
	fmt.Fprintf(&b, "window.__READ_ONLY__ = true;\n")
	fmt.Fprintf(&b, "window.__DEFAULT_TAB__ = 'dashboard';\n")
	fmt.Fprintf(&b, "window.__INITIAL_STANDARDS__ = %s;\n", stdsJSON)
	fmt.Fprintf(&b, "window.__INITIAL_STANDARD_ID__ = %q;\n", currentStandardID)
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
