//go:build !testexport && !testimport && !testimport_real
// +build !testexport,!testimport,!testimport_real

package main

import (
	"embed"
	"fmt"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	// 窗口 Title 跟当前标准走（v0.2：双标准支持）
	// 注意：loadStandards() 在 app.startup() 里调，main 里 currentStandard
	// 还是零值；所以 Title 用 generic 的，等前端 GetCurrentStandard() 后
	// 通过 runtime.Title() 更新（Wails v2 不直接支持运行时改 Title，下面
	// 暂时用占位标题，前端 init 时通过 SetTitle 重新设置）。
	title := "数据安全能力评估"

	if err := wails.Run(&options.App{
		Title:            title,
		Width:            1024,
		Height:           768,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind:             []interface{}{app},
	}); err != nil {
		println("Error:", err.Error())
		fmt.Println(err)
	}
}
