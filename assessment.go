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
// Assessment loading / saving
// =====================================================================

// loadAssessment reads the current assessment.json. If absent, returns an empty one.
func loadAssessment() (Assessment, error) {
	path := assessmentPath()
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return newEmptyAssessment(), nil
		}
		return Assessment{}, fmt.Errorf("read assessment: %w", err)
	}
	var a Assessment
	if err := json.Unmarshal(raw, &a); err != nil {
		return Assessment{}, fmt.Errorf("parse assessment: %w", err)
	}
	if a.Cells == nil {
		a.Cells = map[string]map[string]Cell{}
	}
	return a, nil
}

// saveAssessment writes assessment.json. Before overwriting, snapshots the
// existing file into history/ (so users can always roll back).
func saveAssessment(a Assessment) error {
	// 1. snapshot current (if exists) BEFORE overwriting
	if cur, err := os.ReadFile(assessmentPath()); err == nil && len(cur) > 0 {
		if err := writeHistorySnapshot(cur); err != nil {
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
	if err := os.WriteFile(assessmentPath(), raw, 0o644); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return nil
}

// newEmptyAssessment returns an Assessment with no cells filled in.
func newEmptyAssessment() Assessment {
	return Assessment{
		Version:   0,
		UpdatedAt: "",
		Cells:     map[string]map[string]Cell{},
	}
}

// =====================================================================
// History snapshots
// =====================================================================

func writeHistorySnapshot(raw []byte) error {
	ts := time.Now().Format("20060102-150405")
	name := ts + ".json"
	path := filepath.Join(historyDir(), name)
	return os.WriteFile(path, raw, 0o644)
}

// listHistory returns snapshots newest first.
func listHistory() ([]HistoryEntry, error) {
	entries, err := os.ReadDir(historyDir())
	if err != nil {
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
			Path:      filepath.Join(historyDir(), e.Name()),
			SizeBytes: info.Size(),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Timestamp > out[j].Timestamp
	})
	return out, nil
}

// restoreVersion replaces the current assessment with the snapshot at `timestamp`.
// It also writes a fresh snapshot BEFORE restore (so the user can roll forward again).
func restoreVersion(timestamp string) error {
	src := filepath.Join(historyDir(), timestamp+".json")
	raw, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read snapshot: %w", err)
	}
	// snapshot current before restore
	if cur, err := os.ReadFile(assessmentPath()); err == nil && len(cur) > 0 {
		if err := writeHistorySnapshot(cur); err != nil {
			return fmt.Errorf("snapshot current: %w", err)
		}
	}
	return os.WriteFile(assessmentPath(), raw, 0o644)
}