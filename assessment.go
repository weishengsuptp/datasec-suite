package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// =====================================================================
// Assessment loading / saving (per-standard isolation)
// =====================================================================

// loadAssessment reads the current assessment.<id>.json. If absent, returns
// an empty one tagged with the given standard id.
func loadAssessment(id string) (Assessment, error) {
	if id == "" {
		return Assessment{}, fmt.Errorf("standard id required")
	}
	path := assessmentPath(id)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return newEmptyAssessment(id), nil
		}
		return Assessment{}, fmt.Errorf("read assessment: %w", err)
	}
	var a Assessment
	if err := json.Unmarshal(raw, &a); err != nil {
		return Assessment{}, fmt.Errorf("parse assessment: %w", err)
	}
	// 防御：旧 v0.1 文件没 standard_id 字段，按调用方传入的 id 补齐
	if a.StandardID == "" {
		a.StandardID = id
	}
	if a.Cells == nil {
		a.Cells = map[string]map[string]Cell{}
	}
	return a, nil
}

// saveAssessment writes assessment.<id>.json. Before overwriting, snapshots
// the existing file into history/<id>/ (so users can always roll back).
func saveAssessment(id string, a Assessment) error {
	if id == "" {
		return fmt.Errorf("standard id required")
	}
	// 强制覆盖 standard_id 字段（防止前端误传别的 id）
	a.StandardID = id

	// 1. snapshot current (if exists) BEFORE overwriting
	if cur, err := os.ReadFile(assessmentPath(id)); err == nil && len(cur) > 0 {
		if err := writeHistorySnapshot(id, cur); err != nil {
			return fmt.Errorf("snapshot: %w", err)
		}
	}
	// 2. update metadata
	a.Version++
	a.UpdatedAt = time.Now().Format(time.RFC3339)
	// 3. marshal & write
	raw, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if err := os.WriteFile(assessmentPath(id), raw, 0o644); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return nil
}

// newEmptyAssessment returns an Assessment with no cells filled in.
func newEmptyAssessment(id string) Assessment {
	return Assessment{
		StandardID: id,
		Version:    0,
		UpdatedAt:  "",
		Cells:      map[string]map[string]Cell{},
	}
}

// =====================================================================
// History snapshots (per-standard isolation)
// =====================================================================

func writeHistorySnapshot(id string, raw []byte) error {
	ts := time.Now().Format("20060102-150405")
	name := ts + ".json"
	path := filepath.Join(historyDir(id), name)
	return os.WriteFile(path, raw, 0o644)
}

// listHistory returns snapshots for the given standard, newest first.
func listHistory(id string) ([]HistoryEntry, error) {
	if id == "" {
		return nil, fmt.Errorf("standard id required")
	}
	entries, err := os.ReadDir(historyDir(id))
	if err != nil {
		if os.IsNotExist(err) {
			return []HistoryEntry{}, nil
		}
		return nil, fmt.Errorf("read history dir: %w", err)
	}
	var out []HistoryEntry
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if filepath.Ext(e.Name()) != ".json" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		ts := e.Name()[:len(e.Name())-len(".json")]
		out = append(out, HistoryEntry{
			Timestamp: ts,
			Path:      filepath.Join(historyDir(id), e.Name()),
			SizeBytes: info.Size(),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Timestamp > out[j].Timestamp
	})
	return out, nil
}

// restoreVersion replaces the current assessment for the given standard
// with the snapshot at `timestamp`. It also writes a fresh snapshot BEFORE
// restore (so the user can roll forward again).
func restoreVersion(id string, timestamp string) error {
	if id == "" {
		return fmt.Errorf("standard id required")
	}
	src := filepath.Join(historyDir(id), timestamp+".json")
	raw, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read snapshot: %w", err)
	}
	// snapshot current before restore
	if cur, err := os.ReadFile(assessmentPath(id)); err == nil && len(cur) > 0 {
		if err := writeHistorySnapshot(id, cur); err != nil {
			return fmt.Errorf("snapshot current: %w", err)
		}
	}
	return os.WriteFile(assessmentPath(id), raw, 0o644)
}
