package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Standards data is split per standard: data/standards.<id>.json
//
// Each standard owns a complete, independent answers database
// (subdomains × 5 levels × 4 dimensions). The exe bakes in all matching
// files at build time, so the user only needs the single .exe to run.
//
// To add a new standard: drop `data/standards.<id>.json` matching this
// schema, rebuild. The dropdown in the toolbar picks it up automatically.

//go:embed data/standards.*.json
var embeddedStandardsFS embed.FS

// =====================================================================
// Data types
// =====================================================================

// Standards is the top-level structure for standards.<id>.json.
type Standards struct {
	Metadata     StandardsMetadata `json:"metadata"`
	Dimensions   []string          `json:"dimensions"`              // level key (JRT/DSMM 都是「技术能力」)
	ColumnLabels []string          `json:"column_labels,omitempty"` // 列头显示标签 (DSMM 用「技术工具」, JRT 用「技术能力」)
	Domains      []Domain          `json:"domains"`
}

type StandardsMetadata struct {
	Standard      string `json:"standard"`
	Title         string `json:"title"`
	Issuer        string `json:"issuer"`
	IssueDate     string `json:"issue_date"`
	ExtractSource string `json:"extract_source,omitempty"`
	ExtractMethod string `json:"extract_method,omitempty"`
	Version       string `json:"version,omitempty"`
}

type Domain struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Subdomains []Subdomain `json:"subdomains"`
}

type Subdomain struct {
	ID       string           `json:"id"`
	Name     string           `json:"name"`
	TableNo  string           `json:"table_no,omitempty"`
	Note     string           `json:"note,omitempty"`
	Target   string           `json:"target,omitempty"` // PDF X.X 目标段
	Levels   map[string]Level `json:"levels"`           // keys are "1".."5"
}

// Level is a 4-dimension × 1 row. Each cell is a string or null (means "—").
//
// NOTE: keep the 4 JSON tags stable — they map to the 4 entries in the
// standards file's "dimensions" array, by position:
//
//	tag[0] = dimensions[0]  // 组织建设
//	tag[1] = dimensions[1]  // 制度流程
//	tag[2] = dimensions[2]  // 技术能力 (JRT) / 技术工具 (DSMM)
//	tag[3] = dimensions[3]  // 人员能力
//
// Each standard file is free to name its dimensions differently — the
// frontend uses Standards.Dimensions to render column headers, so the
// actual displayed label comes from the JSON file, not the struct field
// name.
//
// Why fixed tags instead of map[string]*string? Because Go's encoding/json
// has a long-standing issue where struct field names with non-ASCII chars
// silently fail to match JSON keys (field stays nil even when key exists).
// Workaround used in v0.1: keep the field name ASCII, put the Chinese
// label in the json tag. We extend that to "use JR/T 0358's 4 tags as the
// universal storage layout", with the standard's dimensions[] array
// providing the display layer.
type Level struct {
	ZZJG *string `json:"组织建设"`
	ZDLC *string `json:"制度流程"`
	JSNL *string `json:"技术能力"`
	RYNL *string `json:"人员能力"`
}

// Assessment is the user's evaluation state.
type Assessment struct {
	StandardID string                     `json:"standard_id"` // which standard this assessment belongs to
	Version    int                        `json:"version"`
	UpdatedAt  string                     `json:"updated_at"`
	Cells      map[string]map[string]Cell `json:"cells"` // cells[subdomain_id][dimension] = Cell
}

type Cell struct {
	Level int    `json:"level"` // 0 = unset, 1..5 = chosen level
	Note  string `json:"note"`  // free text
}

type HistoryEntry struct {
	Timestamp string `json:"timestamp"`
	Path      string `json:"path"`
	SizeBytes int64  `json:"size_bytes"`
}

// =====================================================================
// Globals
// =====================================================================

var (
	dataDir           string
	stdCache          = map[string]Standards{} // standard_id → Standards
	currentStandardID string
	currentStandard   Standards
)

// =====================================================================
// Paths
// =====================================================================

// dataDir is <exe dir>/data in production, or cwd/data in dev.
func ensureDataDir() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	dir := filepath.Join(filepath.Dir(exe), "data")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(dir, "history", "jrt0358"), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(dir, "history", "gbt37988"), 0o755); err != nil {
		return err
	}
	dataDir = dir
	return nil
}

func standardsFilePath(id string) string  { return filepath.Join(dataDir, "standards."+id+".json") }
func assessmentPath(id string) string     { return filepath.Join(dataDir, "assessment."+id+".json") }
func historyDir(id string) string         { return filepath.Join(dataDir, "history", id) }
func currentStandardFilePath() string     { return filepath.Join(dataDir, ".current") }

// =====================================================================
// Standards loading (read once at startup, cached in memory)
// =====================================================================

// loadStandards loads every embedded standards.<id>.json into stdCache.
// External data/standards.<id>.json (if present alongside the exe) takes
// precedence — useful for upgrading standards without rebuilding.
func loadStandards() error {
	entries, err := embeddedStandardsFS.ReadDir("data")
	if err != nil {
		return fmt.Errorf("read embedded data dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasPrefix(name, "standards.") || !strings.HasSuffix(name, ".json") {
			continue
		}
		id := strings.TrimSuffix(strings.TrimPrefix(name, "standards."), ".json")
		if id == "" {
			continue
		}
		raw, err := embeddedStandardsFS.ReadFile("data/" + name)
		if err != nil {
			return fmt.Errorf("read embedded %s: %w", name, err)
		}
		// Allow external override (next to exe) for live editing without rebuild.
		if ext, err := os.ReadFile(standardsFilePath(id)); err == nil && len(ext) > 0 {
			raw = ext
		}
		var s Standards
		if err := json.Unmarshal(raw, &s); err != nil {
			return fmt.Errorf("parse %s: %w", name, err)
		}
		stdCache[id] = s
	}
	if len(stdCache) == 0 {
		return fmt.Errorf("no standards.<id>.json found in embed (data/)")
	}

	// Default standard: 每次启动都从 preferred 顺序的第一个开始（jrt0358 优先）。
	// v0.2.2 行为变更：忽略 .current 持久化，避免"上次切到 DSMM 测了之后默认就变 DSMM"。
	// 用户的 SetCurrentStandard 在 session 内仍然生效；关 app 不再记忆。
	preferred := []string{"jrt0358", "gbt37988"}
	picked := ""
	for _, id := range preferred {
		if _, ok := stdCache[id]; ok {
			picked = id
			break
		}
	}
	if picked == "" {
		ids := make([]string, 0, len(stdCache))
		for id := range stdCache {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		picked = ids[0]
	}
	currentStandardID = picked
	_ = persistCurrentStandard(currentStandardID)
	currentStandard = stdCache[currentStandardID]
	return nil
}

func persistCurrentStandard(id string) error {
	return os.WriteFile(currentStandardFilePath(), []byte(id), 0o644)
}

// =====================================================================
// Public accessors (called from app.go)
// =====================================================================

func listStandards() []StandardsMetadata {
	out := make([]StandardsMetadata, 0, len(stdCache))
	for _, s := range stdCache {
		out = append(out, s.Metadata)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Standard < out[j].Standard })
	return out
}

func getStandard(id string) (Standards, error) {
	s, ok := stdCache[id]
	if !ok {
		return Standards{}, fmt.Errorf("unknown standard: %s", id)
	}
	return s, nil
}

func getCurrentStandardID() string { return currentStandardID }

func getCurrentStandard() Standards { return currentStandard }

func setCurrentStandard(id string) error {
	if _, ok := stdCache[id]; !ok {
		return fmt.Errorf("unknown standard: %s", id)
	}
	currentStandardID = id
	currentStandard = stdCache[id]
	return persistCurrentStandard(id)
}
