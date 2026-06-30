//go:build testimport
// +build testimport

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
)

func main() {
	// locate dataDir next to the binary (same as export_test_runner)
	exe, err := os.Executable()
	if err == nil {
		for i := len(exe) - 1; i >= 0; i-- {
			if exe[i] == '\\' || exe[i] == '/' {
				dataDir = exe[:i] + `\data`
				break
			}
		}
	}
	// 1. 准备一个已存在的 assessment 写入 + 标记一个"原始旧值"
	if err := loadStandards(); err != nil {
		fmt.Println("loadStandards err:", err)
		os.Exit(1)
	}
	oldAsm, err := loadAssessment()
	if err != nil {
		fmt.Println("loadAssessment err:", err)
		os.Exit(1)
	}
	if oldAsm.Cells == nil {
		oldAsm.Cells = map[string]map[string]Cell{}
	}
	oldAsm.Cells["collect"] = map[string]Cell{
		"组织建设": {Level: 1, Note: "BEFORE_IMPORT_MARKER"},
	}
	if err := saveAssessment(oldAsm); err != nil {
		fmt.Println("save old err:", err)
		os.Exit(1)
	}
	fmt.Println("Step1: wrote 'BEFORE_IMPORT_MARKER' to collect/组织建设")

	// 2. 模拟"从别人的导出 HTML 拿到一份新评估"
	newAsm := oldAsm
	newAsm.Cells["collect"] = map[string]Cell{
		"组织建设": {Level: 4, Note: "AFTER_IMPORT_FROM_HTML"},
	}
	newAsm.Cells["storage"] = map[string]Cell{
		"技术能力": {Level: 5, Note: "INJECTED_KEY"},
	}
	rawNew, _ := json.MarshalIndent(newAsm, "", "  ")
	htmlPath := `E:\jinrongdata\dsmm-tool-app\_import_test.html`
	htmlContent := `<!DOCTYPE html><html><head><title>test</title></head><body>
<script id="initial-assessment" type="application/json">` + string(rawNew) + `</script>
</body></html>`
	if err := os.WriteFile(htmlPath, []byte(htmlContent), 0644); err != nil {
		fmt.Println("write html err:", err)
		os.Exit(1)
	}
	fmt.Println("Step2: wrote fake export HTML to", htmlPath)

	// 3. 用 import.go 的 regex + parse 流程（不走 file dialog）
	raw, _ := os.ReadFile(htmlPath)
	re := regexp.MustCompile(
		`<script id="initial-assessment" type="application/json">([\s\S]*?)</script>`,
	)
	m := re.FindSubmatch(raw)
	if m == nil {
		fmt.Println("no initial-assessment tag")
		os.Exit(1)
	}
	var imported Assessment
	if err := json.Unmarshal(m[1], &imported); err != nil {
		fmt.Println("unmarshal err:", err)
		os.Exit(1)
	}
	if err := saveAssessment(imported); err != nil {
		fmt.Println("save imported err:", err)
		os.Exit(1)
	}
	fmt.Println("Step3: imported assessment written")

	// 4. 重新 load 验证
	verify, _ := loadAssessment()
	c1 := verify.Cells["collect"]["组织建设"]
	c2 := verify.Cells["storage"]["技术能力"]
	fmt.Println("Step4 verify:")
	fmt.Println("  collect/组织建设 =", c1.Level, "/", c1.Note)
	fmt.Println("  storage/技术能力 =", c2.Level, "/", c2.Note)
	if c1.Note == "AFTER_IMPORT_FROM_HTML" && c2.Note == "INJECTED_KEY" {
		fmt.Println("\n✅ PASS: import flow works end-to-end")
	} else {
		fmt.Println("\n❌ FAIL: data didn't round-trip correctly")
		os.Exit(1)
	}
}
