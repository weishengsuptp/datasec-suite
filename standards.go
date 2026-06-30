package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// embeddedStandards is the standards data baked into the binary at compile
// time. This makes the exe self-contained: no need to ship data/standards.json
// alongside the binary. The external data/standards.json (if present) is
// ignored in the normal flow but kept for reference / manual override if
// embeddedStandards is ever empty.
//
//go:embed data/standards.json
var embeddedStandards []byte

// =====================================================================
// Data types
// =====================================================================

// Standards is the top-level structure for standards.json.
type Standards struct {
	Metadata   StandardsMetadata `json:"metadata"`
	Dimensions []string          `json:"dimensions"`
	Domains    []Domain          `json:"domains"`
}

type StandardsMetadata struct {
	Standard       string `json:"standard"`
	Title          string `json:"title"`
	Issuer         string `json:"issuer"`
	IssueDate      string `json:"issue_date"`
	ExtractSource  string `json:"extract_source"`
	ExtractMethod  string `json:"extract_method"`
	Version        string `json:"version"`
}

type Domain struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Subdomains []Subdomain `json:"subdomains"`
}

type Subdomain struct {
	ID       string             `json:"id"`
	Name     string             `json:"name"`
	TableNo  string             `json:"table_no,omitempty"`
	Note     string             `json:"note,omitempty"`
	Target   string             `json:"target,omitempty"` // PDF X.X 目标段
	Levels   map[string]Level   `json:"levels"` // keys are "1".."5"
}

// Level is a 4-dimension × 1 row. Each cell is a string or null (means "—").
//
// Note: Go's encoding/json has a long-standing issue where struct field
// names containing non-ASCII (e.g. Chinese) characters silently fail to
// match the corresponding JSON key — the field stays nil even when the
// JSON key exists. Workaround: keep the field name ASCII and put the
// Chinese label in the json tag only.
type Level struct {
	ZZJG *string `json:"组织建设"`
	ZDLC *string `json:"制度流程"`
	JSNL *string `json:"技术能力"`
	RYNL *string `json:"人员能力"`
}

// Assessment is the user's evaluation state.
type Assessment struct {
	Version   int                        `json:"version"`
	UpdatedAt string                     `json:"updated_at"`
	Cells     map[string]map[string]Cell `json:"cells"` // cells[subdomain_id][dimension] = Cell
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
	dataDir string
	stdCache Standards
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
	if err := os.MkdirAll(filepath.Join(dir, "history"), 0o755); err != nil {
		return err
	}
	dataDir = dir
	return nil
}

func standardsPath() string  { return filepath.Join(dataDir, "standards.json") }
func assessmentPath() string { return filepath.Join(dataDir, "assessment.json") }
func historyDir() string     { return filepath.Join(dataDir, "history") }

// =====================================================================
// Standards loading (read once at startup, cached in memory)
// =====================================================================

func loadStandards() error {
	// 单 exe 发布：standards.json 在编译期 embed 进二进制（embeddedStandards）。
	// 优先用 embed 字节 → 无需 data/standards.json 即可运行（开箱即用）。
	// 兼容旧版：data/standards.json 仍可作为外部覆盖源，便于升级标准 / 多版本切换。
	raw := embeddedStandards
	if len(raw) == 0 {
		var err error
		raw, err = os.ReadFile(standardsPath())
		if err != nil {
			return fmt.Errorf("read standards.json: %w", err)
		}
	}
	var s Standards
	if err := json.Unmarshal(raw, &s); err != nil {
		return fmt.Errorf("parse standards.json: %w", err)
	}
	stdCache = s
	return nil
}