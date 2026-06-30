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
// =====================================================================

// GetStandards returns the in-memory standards tree (19 subdomains, 5 levels × 4 dimensions).
func (a *App) GetStandards() Standards {
	return stdCache
}

// GetDataDir returns the absolute path of the data directory.
func (a *App) GetDataDir() string {
	return dataDir
}

// LoadAssessment loads the current assessment JSON (or returns an empty one).
func (a *App) LoadAssessment() (Assessment, error) {
	return loadAssessment()
}

// SaveAssessment writes the assessment to disk and snapshots the previous version.
func (a *App) SaveAssessment(asm Assessment) error {
	return saveAssessment(asm)
}

// ExportHTML writes a static HTML rendering of the current assessment and returns the saved path.
func (a *App) ExportHTML() (string, error) {
	return exportHTML()
}

// ImportHTML opens a file picker for an exported .html report, parses the
// embedded __INITIAL_ASSESSMENT__ JSON, writes it as the current assessment
// (with automatic history snapshot of the previous file), and returns the
// loaded assessment so the frontend can hot-reload state.
func (a *App) ImportHTML() (Assessment, error) {
	// reuse the importHTML() implementation, but pass the app's context
	// for the file dialog
	importCtx = a.ctx
	return importHTML()
}

// ListHistory returns history snapshots, newest first.
func (a *App) ListHistory() ([]HistoryEntry, error) {
	return listHistory()
}

// RestoreVersion replaces the current assessment with the snapshot at the given timestamp.
// After restore, it also writes a fresh snapshot (so the user can roll forward again).
func (a *App) RestoreVersion(timestamp string) error {
	return restoreVersion(timestamp)
}