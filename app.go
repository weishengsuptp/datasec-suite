package main

import (
	"context"
	"fmt"
)

// App is the Wails app struct. All methods on *App will be exposed to JS
// via the wailsjs/go/main/App.js binding.
type App struct {
	ctx context.Context
}

// NewApp creates a new App.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := ensureDataDir(); err != nil {
		fmt.Println("ensureDataDir:", err)
	}
	if err := loadStandards(); err != nil {
		fmt.Println("loadStandards:", err)
	}
}

// =====================================================================
// Public bindings (called from frontend via wailsjs)
//
// v0.2 多标准架构：所有接口都带 standard_id 参数，数据按标准完全隔离。
// =====================================================================

// ListStandards returns metadata for every available standard (used to
// render the toolbar dropdown).
func (a *App) ListStandards() []StandardsMetadata {
	return listStandards()
}

// GetStandard returns the full standards tree (subdomains, levels, etc.)
// for a specific standard.
func (a *App) GetStandard(id string) (Standards, error) {
	return getStandard(id)
}

// GetCurrentStandardID returns the standard_id last persisted in data/.current.
func (a *App) GetCurrentStandardID() string {
	return getCurrentStandardID()
}

// GetCurrentStandard returns the full Standards object for the currently
// active standard. Convenience method so the frontend doesn't need two
// round-trips on startup.
func (a *App) GetCurrentStandard() Standards {
	return getCurrentStandard()
}

// SetCurrentStandard switches the active standard and persists the choice.
// The frontend should also call LoadAssessment(<new id>) after this to
// load the per-standard evaluation data.
func (a *App) SetCurrentStandard(id string) error {
	return setCurrentStandard(id)
}

// GetDataDir returns the absolute path of the data directory.
func (a *App) GetDataDir() string {
	return dataDir
}

// LoadAssessment loads the assessment JSON for the given standard.
// Returns an empty Assessment if none exists.
func (a *App) LoadAssessment(id string) (Assessment, error) {
	return loadAssessment(id)
}

// SaveAssessment writes the assessment for the given standard to disk,
// snapshotting the previous version into history/<id>/.
func (a *App) SaveAssessment(id string, asm Assessment) error {
	return saveAssessment(id, asm)
}

// ExportHTML writes a self-contained, read-only HTML rendering of the
// current standard + assessment. The exported HTML is bound to its
// originating standard — importing a GB/T 37988 report into JR/T 0358
// mode (or vice versa) is rejected by ImportHTML.
func (a *App) ExportHTML() (string, error) {
	return exportHTML()
}

// ImportHTML opens a file picker for an exported .html report, parses
// the embedded __INITIAL_STANDARDS__ + __INITIAL_STANDARD_ID__ + __INITIAL_ASSESSMENT__,
// and:
//   1. verifies the report's standard_id matches the current standard;
//   2. if mismatch, returns an error (user must switch standard first);
//   3. if match, writes it as the current assessment with a history
//      snapshot of the previous file.
//
// Returns the imported Assessment so the frontend can hot-reload state.
func (a *App) ImportHTML() (Assessment, error) {
	importCtx = a.ctx
	return importHTML()
}

// ListHistory returns history snapshots for the given standard, newest first.
func (a *App) ListHistory(id string) ([]HistoryEntry, error) {
	return listHistory(id)
}

// RestoreVersion replaces the current assessment for the given standard
// with the snapshot at the given timestamp. After restore, it also writes
// a fresh snapshot (so the user can roll forward again).
func (a *App) RestoreVersion(id string, timestamp string) error {
	return restoreVersion(id, timestamp)
}
