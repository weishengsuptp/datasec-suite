# datasec-suite · AGENTS.md

> 给未来（包括明天）的 agent 用的项目状态备忘 + 接活指南。

## 项目身份

- **datasec-suite**（Wails v2 单 exe 桌面应用，Go + WebView2）
- 仓库根：`E:\jinrongdata\dsmm-tool-app\`
- 数据/工具目录：`E:\jinrongdata\_pdf_extract_dsmm\`（PDF 提取 + OCR 流水线）
- v0.1 已发布：JR/T 0358-2026（金融数据安全 数据安全能力体系）
- v0.2 在做：多标准支持，**JR/T 0358-2026 + GB/T 37988-2019 (DSMM) 双标准并存**

## 当前状态（截至 2026-07-14 18:00）

### ✅ 已完成

| 改动 | 文件 |
|---|---|
| 数据迁移：standards.json / assessment.json 拆双份，history 按 id 分子目录 | `data/` |
| 后端 4 个文件按 standard_id 全面重构 | `standards.go` `app.go` `assessment.go` `main.go` |
| 前端 main.js / wails-mock.js / index.html / style.css 改多 standard | `frontend/src/` |
| build 脚本 + 导出/导入按 standard 隔离 | `build_and_stage.ps1` `export.go` `import.go` |
| UI：标题区可点击下拉切换标准（brand-text 触发），小三角 ▾ | `frontend/src/style.css` |
| 默认 standard = jrt0358（Go 端 preferred 优先） | `standards.go` |
| 进度条总格数动态算（DSMM 0/120 而非硬编码 0/76） | `frontend/src/main.js` `updateProgress()` |
| DSMM 模式无内容时友好占位 | `frontend/src/main.js` `renderHeatmap()` |
| **菜单 bug 修：挪到 `<body>` 末尾 + `position: fixed` + `z-index: 9999`** | `frontend/index.html` `style.css` `main.js` |
| `wails build` 通过，exe 8.86MB | `build/bin/datasec-suite-app.exe` |
| DSMM PDF OCR 识别（飞浆 PaddleOCR-VL-1.6）已完成，61 页 markdown | `_pdf_extract_dsmm/ocr_md/page_01..61.md` |

### ⏳ 待做（明天）

**OCR 解析 → `data/standards.gbt37988.json`**：

- 从 `_pdf_extract_dsmm/ocr_md/page_01..61.md` 抽取 30 PA × 4 维 × 5 级 = 600 格描述
- DSMM 4 维：**组织建设 / 制度流程 / 技术工具 / 人员能力**（注意第 3 维是"技术工具"，不是"技术能力"）
- 整理成 `Standards` 结构（参考 `data/standards.jrt0358.json` schema）
- 重新 build（OCR 内容用 //go:embed 进二进制）
- 写一个 `build_dsmm_standards.py` 脚本（参考 `dsmm-tool/build_standards.py`）

参考样本（page_14 = PA03）：
```
#### 6.3.2.1 等级1：非正式执行
组织建设：未对任何业务的采集数据源进行有效管理...
##### 6.3.2.2 等级2：计划跟踪
a）组织建设：应由业务团队相关人员负责数据源鉴别和记录（BP.03.02）；
b）制度流程：核心业务系统的在线数据采集...
c） 技术工具：核心业务应具有技术工具支持对数据源的鉴别和记录（BP.03.04）。
```

## 关键架构决策（不要推翻）

1. **`Level` struct 4 字段固定**（ZZJG/ZDLC/JSNL/RYNL），json tag 用 JR/T 0358 那套（"组织建设"/"制度流程"/"技术能力"/"人员能力"）
   - **DSMM 第 3 维"技术工具"的内容塞到 JSNL（json tag = "技术能力"）字段里**
   - 展示层用 `Standards.Dimensions` 数组决定列标题
2. **数据完全隔离**：`standards.<id>.json` / `assessment.<id>.json` / `history/<id>/` 各自独立
3. **导入校验 standard_id** 不匹配直接拒绝（`import.go` 调 `extractQuotedString` 读 `__INITIAL_STANDARD_ID__`）
4. **//go:embed pattern**：`data/standards.*.json` —— 不匹配 `data/standards.json`（v0.1 备份，保留但不入 binary）
5. **当前 standard 持久化**：`data/.current` 文件存 standard_id（被 Python 复制时已清掉，下次启动用默认 jrt0358）

## 踩过的坑（不要重犯）

- **Wails 前端 `import` 行**：`wails build` 时 Vite/Rollup 会处理；export_assets 里的 main.js 复制前端后由 `stripImports` 在运行时去掉。所以 `Copy-Item` 前端 main.js → export_assets/ 即可，不需要预处理。
- **`pdfplumber` / `pymupdf` 读 GB/T 37988-2019 拿不到真中文**：PDF 用 CID 字体 + 无 ToUnicode CMap，机器读出来是 `(cid:xxx)` 占位符。**用 PaddleOCR-VL-1.6 OCR**（异步 API，20000/天 额度）。脚本在 `_pdf_extract_dsmm/ocr_pipeline.py`。
- **CSS stacking context 坑**：`.toolbar` 有 `backdrop-filter` 会强制创建 stacking context，**且** fixed 子元素以 `.toolbar` 为 containing block（被新规范改变）。**菜单要浮在所有内容之上，必须挪到 `<body>` 末尾 + `position: fixed` + 高 z-index（9999）**。
- **PowerShell 5.1 跨行 `ForEach-Object { ... }` 解析失败**：用 Python 替代跨行 shell 操作（`build_and_stage.ps1` 跨行写法在 PS 5.1 报 ParserError）。
- **Go encoding/json 中文 field name bug**：field name 含中文静默失败（unmarshal 时字段 nil），保持 ASCII field name + 中文 json tag（已解决，见 Level struct 注释）。
- **Mavis CLI 不可用**：`mavis mcp call matrix matrix_describe_images` 路径 `D:\MiniMax Code\resources\resources\daemon\cli.js` 找不到。**OCR 必须走 PaddleOCR HTTP API**。

## 明天接活的入口

```powershell
# 1. 看项目状态
cd E:\jinrongdata\dsmm-tool-app
Get-ChildItem -Force

# 2. 看 OCR 识别结果（DSMM PDF 61 页结构化 markdown）
Get-ChildItem E:\jinrongdata\_pdf_extract_dsmm\ocr_md -Force | Select-Object Name, Length

# 3. 抽样验证 OCR 质量
Get-Content E:\jinrongdata\_pdf_extract_dsmm\ocr_md\page_14.md

# 4. 启动 exe 跑当前 v0.2
.\build\bin\datasec-suite-app.exe
```

## 复制的 exe 路径

`E:\jinrongdata\dsmm-tool-app\build\bin\datasec-suite-app.exe`（8.86 MB）

## 用户偏好（项目相关）

- 说话直接，不喜欢被反复问
- UI 审美高（玻璃态、渐变、微动效；不要工程师审美）
- 项目愿景：像 V2Ray 那样成为经典开源软件（架构按"可被外部开发者读懂"标准）
- 需要白话解释，不堆术语
- 长期架构优先（v0.1 跑通后会停一下思考"整体走向"再开 v0.2）
- v0.2 之前 PDF OCR 那次（JR/T 0358）也是用户自己搞定的（vision API 路线），这次换 PaddleOCR 路线（更稳）

## 相关链接

- GB/T 37988-2019 PDF：`E:\jinrongdata\_pdf_extract_dsmm\gbt37988.pdf`
- PaddleOCR 客户端（保留的 OCR 能力）：`E:\jinrongdata\_pdf_extract_dsmm\ocr_pipeline.py`
- PaddleOCR token：`E:\jinrongdata\paddle.txt`（用户私钥，不要提交到 git）
- 标准 ID 映射：
  - `jrt0358` ↔ `JR/T 0358-2026`（金融行业 / 4 维"组织/制度/技术/人员"）
  - `gbt37988` ↔ `GB/T 37988-2019`（国标 DSMM / 4 维"组织/制度/技术工具/人员"）
