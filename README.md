# AuraFocus - 口袋专注机 (Portable & Standalone)

一款美观、轻量、免安装、零外部音频资源依赖的 Windows 桌面复古掌机悬浮专注伴侣。

---

## 🌟 核心特性（v2.0）

1. **双形态低存在感桌面交互**
   - **极简胶囊态（`290×68`）**：无边框悬浮、支持跨显示器拖拽与边缘吸附，重启自动记住停靠坐标；可选**鼠标移开半透明**、**靠边自动缩为 `20×68` 细条耳标**及**隐匿精确秒数**，减少遮挡与时间焦虑。
   - **复古口袋掌机面板（`400×640`）**：包含「专注」「闹钟」「统计」「设置」四个页签；内置 **6 套基础配色**（雾灰、经典绿、暖砂、雾紫、深夜黑曜石、复古夜光绿）与 **2 套正向累计解锁彩蛋外壳**（经典透明紫 `120m`、复古掌机红 `300m`）。
   - **全局快捷键 & 系统托盘驻留**（纯 Win32 原生实现）：支持 `Alt+Shift+Space`（启停专注）、`Alt+Shift+F`（展开/收起）、`Alt+Shift+N`（一键暂存杂念）、`Alt+Shift+M`（静音环境音），支持关闭后驻留系统托盘继续运行闹钟与声景。

2. **三合一心流计时引擎（Pomodoro + Flowtime + Break）**
   - 支持 `15 / 25 / 45 / 60` 分钟预设、**自定义时长（1–180 分钟）**与**自由正计时模式**。
   - **默认「心流顺延」**：倒计时到达 `00:00` 时轻响提示并无缝转入 `+00:00` 顺延计时，不粗暴打断深度心流；手动点「收工」结算完整时长并推荐短休或长休，也可在设置中切回“到点自动弹窗”。
   - **开工微仪式（可选）**：启动前 3 秒 LCD 呼吸入定过渡，配复古卡带咔哒音效。

3. **零体积纯算法多轨声学屏障（Web Audio DSP）**
   - 无需任何 MP3/WAV 文件，纯代码实时合成 9 条环境音轨并支持**多轨自由叠混**：细雨、篝火、咖啡馆、白噪音、和风、**人声掩蔽（Voice Shield）**、**深夜列车**、**安静书房**与可选**耳机 40Hz 专注律动**。
   - 提供 4 个一键场景预设（雨夜壁炉、办公降噪、深夜列车、像素禅房），支持**随专注自动淡入淡出**并持久化混音偏好。

4. **数字防打扰 & 内部杂念吸收**
   - **纯本地分心守卫**：专注期间低频检测前台窗口标题与进程名（完全本地、不联网），超过设定宽限（默认 15 秒）由像素伴侣切换盯梢表情轻提醒；可选「严格护航」弹出拉回卡并支持「临时放行 3 分钟」；一键跳转 Windows 系统勿扰设置。
   - **念头暂存箱（Distraction Parking Lot）**：专注中冒出杂念时通过胶囊按钮或热键一键敲下回车收起，收工后集中勾选或一键转为闹钟提醒。
   - **分级闹钟防打断**：支持每日、工作日、单次闹钟并区分**普通**与**紧急**级别；专注中普通闹钟静默排队，收工后集中弹出，紧急闹钟准点穿透。

5. **像素伴侣微生态、实体彩蛋与每日热敏小票**
   - **4 位伴侣 × 6 态像素演变**（篝火、猫猫、咖啡、树苗）：随待机、起步、心流旺盛、圆满、分心盯梢、休息自动切换像素神态。
   - **16 种主题像素收藏品**：每完成 1 轮专注在「收藏架」铸造 1 件专属像素成果。
   - **掌机实体彩蛋**：点击 LCD 屏幕循环切换「大数字 / 极简进度 / 实时音频像素条」；点击外壳扬声器格栅一键静音/恢复环境音。
   - **每日复古热敏小票**：汇总当日专注时间轴、任务明细、顺延奖励与伴侣评语，支持**一键复制 Markdown** 与 **纯 Canvas 导出 PNG 小票卡片**。

---

## 🚀 快速使用

### 方式 1：直接下载绿色免安装版（推荐）
前往本仓库右侧的 **[Releases](https://github.com/THao712/AuraFocus/releases)** 页面下载最新版本的 `AuraFocus.exe`，双击即可运行（需要 Windows 10/11 及 Microsoft Edge WebView2 Runtime）。

### 方式 2：从源码运行
```powershell
pip install -r requirements.txt
python app.py
```

---

## 🛠️ 项目目录结构

```text
AuraFocus/
├── ui/
│   ├── index.html            # 离线前端界面与内置 SVG 图标
│   ├── styles.css            # 400×640 掌机外壳、LCD 屏与 6+2 套 WCAG AA 配色
│   ├── audio.js              # 9 轨纯 Web Audio DSP 混音台、频谱分析与复古音效
│   ├── mascots.js            # 4×6 伴侣像素生态、16 种收藏品与热敏小票 Canvas 渲染器
│   ├── app.js                # 状态引擎（v3）、心流计时、念头暂存与分级闹钟
│   └── icon.ico              # 多分辨率透明像素掌机图标（16×16–256×256）
├── app.py                    # PyWebView 桌面宿主、原子 StateStore 与 BridgeApi
├── win32_native.py           # 纯 Win32 ctypes 原生能力（热键、托盘、分心守卫、透明度、耳标）
├── build_exe.py              # PyInstaller 单文件打包脚本
├── AuraFocus.spec            # PyInstaller 打包配置
├── 启动AuraFocus.bat          # Windows 一键启动脚本
├── 打包单文件EXE.bat          # Windows 一键打包脚本
├── tests/                    # 前端/原生单元测试及真实 WebView2 / EXE 冒烟测试
└── LICENSE                   # MIT License
```

---

## 💾 数据保存与便携配置

- 默认保存在 `%LOCALAPPDATA%\AuraFocus\state.json`，更换或升级 EXE 不会丢失设置、闹钟、统计与收藏。
- 可通过环境变量 `AURAFOCUS_DATA_DIR` 指定自定义或 U 盘目录实现全便携携带。
- 写入采用临时文件 + `fsync` + 原子替换，自动兼容迁移旧版 `v2` 数据。

---

## 🧪 开发测试与打包

```powershell
# 安装运行与打包依赖
pip install -r requirements-dev.txt

# 前端单元测试（Node.js）
node --test tests/frontend.test.cjs

# Python / Win32 单元测试
python -m unittest discover -s tests -p test_native.py -v

# 真实 WebView2 双次启动冒烟（检查持久化、8 套配色对比度与布局、Canvas 小票与键盘焦点）
python tests/smoke_webview.py

# 重新打包单文件绿色 EXE（产物位于 dist/AuraFocus.exe）
python build_exe.py

# 校验打包资源与源码一致，并实机验证 EXE 启动、保存与关闭
python tests/smoke_exe.py
```

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。
