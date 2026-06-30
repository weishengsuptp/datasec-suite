//go:build testexport
// +build testexport

package main

import (
	"fmt"
	"os"
)

func main() {
	exe, err := os.Executable()
	if err == nil {
		for i := len(exe) - 1; i >= 0; i-- {
			if exe[i] == '\\' || exe[i] == '/' {
				dataDir = exe[:i] + `\data`
				break
			}
		}
	}
	if err := loadStandards(); err != nil {
		fmt.Println("loadStandards err:", err)
		os.Exit(1)
	}
	path, err := exportHTML()
	if err != nil {
		fmt.Println("export err:", err)
		os.Exit(1)
	}
	fmt.Println("exported:", path)
	fi, _ := os.Stat(path)
	fmt.Println("size:", fi.Size(), "bytes")
}
