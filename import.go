package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// extractAssignmentObject locates `marker = ` in raw HTML and returns the
// balanced `{...}` object literal that follows. Used to read
// window.__INITIAL_ASSESSMENT__ / window.__INITIAL_STANDARDS__ values that
// export.go embeds inline as JS assignments.
func extractAssignmentObject(raw []byte, marker string) ([]byte, error) {
	startRe := regexp.MustCompile(regexp.QuoteMeta(marker) + `\s*=`)
	loc := startRe.FindIndex(raw)
	if loc == nil {
		return nil, fmt.Errorf("未找到标记 %q", marker)
	}
	// find the opening '{' after the '=' (skip any whitespace)
	i := loc[1]
	for i < len(raw) && (raw[i] == ' ' || raw[i] == '\t' || raw[i] == '\n' || raw[i] == '\r') {
		i++
	}
	if i >= len(raw) || raw[i] != '{' {
		return nil, fmt.Errorf("标记 %q 后面没有对象字面量", marker)
	}
	// brace-balance to find matching '}'
	depth := 0
	inStr := byte(0) // 0 = not in string, '"' or '\'' = in string
	escape := false
	for j := i; j < len(raw); j++ {
		c := raw[j]
		if escape {
			escape = false
			continue
		}
		if inStr != 0 {
			if c == '\\' {
				escape = true
				continue
			}
			if c == inStr {
				inStr = 0
			}
			continue
		}
		switch c {
		case '"', '\'':
			inStr = c
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return raw[i : j+1], nil
			}
		}
	}
	return nil, fmt.Errorf("标记 %q 的对象字面量未闭合", marker)
}

// importCtx is set by the App.ImportHTML wrapper so the free function below
// can show a native file dialog. Wails requires a context for dialog calls.
var importCtx context.Context

// importHTML opens a file picker for an exported .html, parses the embedded
// __INITIAL_ASSESSMENT__ JSON, and writes it as the current assessment.
//
// Before overwriting, saveAssessment() automatically snapshots the previous
// file into data/history/, so the user can roll back via the history modal.
//
// Returns the imported Assessment so the frontend can hot-reload state.
func importHTML() (Assessment, error) {
	if importCtx == nil {
		return Assessment{}, fmt.Errorf("导入功能未初始化（context 缺失）")
	}
	// 1. file picker
	path, err := runtime.OpenFileDialog(importCtx, runtime.OpenDialogOptions{
		Title:            "选择导出的 HTML 报告",
		DefaultDirectory: "",
		Filters: []runtime.FileFilter{
			{DisplayName: "导出的 HTML 报告 (*.html;*.htm)", Pattern: "*.html;*.htm"},
		},
		CanCreateDirectories: false,
	})
	if err != nil {
		return Assessment{}, fmt.Errorf("打开文件对话框失败：%w", err)
	}
	if path == "" {
		// user cancelled
		return Assessment{}, fmt.Errorf("__CANCELLED__")
	}

	// 2. read file
	raw, err := os.ReadFile(path)
	if err != nil {
		return Assessment{}, fmt.Errorf("读取文件失败：%w", err)
	}

	// 3. extract embedded assessment JSON by brace-balancing from the
	//    `window.__INITIAL_ASSESSMENT__ = ` marker.
	jsonBytes, err := extractAssignmentObject(raw, "window.__INITIAL_ASSESSMENT__")
	if err != nil {
		return Assessment{}, fmt.Errorf("该文件不是有效的导出报告：%w", err)
	}

	// 3.5 v0.2 多标准：校验 standard_id 匹配
	reportStandardID, err := extractQuotedString(raw, "window.__INITIAL_STANDARD_ID__")
	if err != nil {
		return Assessment{}, fmt.Errorf("该报告缺少 standard_id 标记（v0.1 旧版报告？请重新导出）：%w", err)
	}
	if reportStandardID != currentStandardID {
		return Assessment{}, fmt.Errorf(
			"该报告属于 %q 标准，当前激活的是 %q。请先在工具栏下拉切换到对应标准后再导入",
			reportStandardID, currentStandardID,
		)
	}

	// 4. parse JSON
	var asm Assessment
	if err := json.Unmarshal(jsonBytes, &asm); err != nil {
		return Assessment{}, fmt.Errorf("评估数据格式错误：%w", err)
	}
	// 防御：cells 不能为空 map，否则前端某些遍历会崩
	if asm.Cells == nil {
		asm.Cells = map[string]map[string]Cell{}
	}

	// 5. write (saveAssessment 自动 snapshot 旧版本)
	if err := saveAssessment(currentStandardID, asm); err != nil {
		return Assessment{}, fmt.Errorf("保存评估失败：%w", err)
	}

	return asm, nil
}

// extractQuotedString reads a `marker = "value"` style assignment and returns
// the unquoted string value. Used for __INITIAL_STANDARD_ID__ = "jrt0358".
func extractQuotedString(raw []byte, marker string) (string, error) {
	startRe := regexp.MustCompile(regexp.QuoteMeta(marker) + `\s*=\s*"`)
	loc := startRe.FindIndex(raw)
	if loc == nil {
		return "", fmt.Errorf("未找到标记 %q", marker)
	}
	i := loc[1]
	for i < len(raw) && raw[i] != '"' {
		if raw[i] == '\\' && i+1 < len(raw) {
			i += 2
			continue
		}
		i++
	}
	if i >= len(raw) || raw[i] != '"' {
		return "", fmt.Errorf("标记 %q 的字符串未闭合", marker)
	}
	// 简化：不解析转义（standard_id 不含特殊字符）
	return string(raw[loc[1]:i]), nil
}
