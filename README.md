<div align="center">
  <img src="assets/logo.png" alt="AuraFocus Logo" width="112" />
  <h1>AuraFocus · 口袋专注机</h1>
  <p><b>轻量、免安装、零音频体积的 Windows 复古掌机悬浮专注伴侣</b></p>
  <p>
    <a href="https://github.com/THao712/AuraFocus/releases/latest"><img src="https://img.shields.io/github/v/release/THao712/AuraFocus?style=flat-square&color=46573b&label=Release" alt="Release" /></a>
    <img src="https://img.shields.io/badge/Platform-Windows%2010%2F11-56614e?style=flat-square" alt="Windows" />
    <img src="https://img.shields.io/badge/Audio-Pure%20Web%20Audio%20DSP-70513b?style=flat-square" alt="Pure Web Audio DSP" />
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-605071?style=flat-square" alt="MIT License" /></a>
  </p>
  <p>
    <a href="https://github.com/THao712/AuraFocus/releases/latest"><b>⬇️ 下载便携单文件版（EXE）</b></a>
    &nbsp;·&nbsp;
    <a href="#核心亮点">核心亮点</a>
    &nbsp;·&nbsp;
    <a href="#快捷键">快捷键</a>
    &nbsp;·&nbsp;
    <a href="#开发与构建">开发与构建</a>
  </p>
</div>

---

## 核心亮点

| 模块 | 能力一览 |
| :--- | :--- |
| **⏱️ 三合一心流计时** | `15/25/45/60m` 预设 + `1–180m` 自定义 + 自由正计时；默认**心流顺延（`+00:00`）**不打断思路，收工后推荐短/长休息，可选 3 秒呼吸入定开工仪式。 |
| **🎧 9 轨声学屏障** | 零 MP3/WAV 依赖，Web Audio 实时混音：**细雨、篝火、咖啡馆、白噪音、和风、人声掩蔽、深夜列车、安静书房、40Hz 律动**；4 组一键预设，随专注自动淡入淡出。 |
| **🛡️ 温和防打扰** | 纯本地前景窗口**分心守卫**（温柔盯梢 / 严格拉回 + 临时放行 3 分钟）；**念头暂存箱**随时回车收起杂念，收工一键转闹钟；闹钟支持普通静默排队与紧急穿透。 |
| **👾 掌机陪伴与小票** | 4 位像素伴侣 × 6 态实时演变、16 种微缩收藏品、6 套基础主题（含深夜黑曜石/夜光绿）+ 2 套正向累计解锁彩蛋外壳；生成**每日复古热敏小票**（复制 Markdown / 导出 PNG）。 |
| **🪟 低存在感悬浮** | `290×68` 胶囊态与 `400×640` 掌机态自由切换；支持记忆窗口坐标、边缘吸附、鼠标移开半透明、靠边缩为 `20×68` 细条耳标、隐匿秒数与系统托盘驻留。 |

> **掌机彩蛋**：点击 LCD 屏幕可循环切换「大数字 / 极简进度 / 实时音频像素条」；点击外壳扬声器格栅可一键静音环境音。

---

## 快速开始

### 直接使用（推荐）
1. 前往 **[Releases](https://github.com/THao712/AuraFocus/releases/latest)** 下载 `AuraFocus.exe`。
2. 双击即可运行，无需安装，随 U 盘便携携带。

> 运行环境：Windows 10 / 11（内置 Microsoft Edge WebView2 Runtime）。

### 从源码运行
```powershell
pip install -r requirements.txt
python app.py
```

---

## 快捷键

全局快捷键基于原生 Win32 实现，可在「设置 → 窗口热键」中一键开关：

| 快捷键 | 功能 |
| :--- | :--- |
| `Alt + Shift + Space` | 开始 / 暂停专注 |
| `Alt + Shift + F` | 展开掌机 / 收起胶囊 |
| `Alt + Shift + N` | 一键呼出「念头暂存箱」 |
| `Alt + Shift + M` | 静音 / 恢复环境音 |

---

## 开发与构建

<details>
<summary><b>展开查看项目结构、数据目录、测试与打包命令</b></summary>

### 目录结构
```text
AuraFocus/
├── app.py              # PyWebView 桌面宿主、原子持久化 StateStore 与 BridgeApi
├── win32_native.py     # 纯 Win32 ctypes 原生能力（热键、托盘、分心守卫、透明度、耳标）
├── ui/
│   ├── index.html      # 离线前端结构与内置 SVG 图标
│   ├── styles.css      # 400×640 掌机外壳与 6+2 套 WCAG AA 配色
│   ├── audio.js        # 9 轨纯 Web Audio DSP 混音台与频谱分析
│   ├── mascots.js      # 4×6 伴侣像素生态、16 种收藏品与热敏小票 Canvas 渲染
│   ├── app.js          # 状态引擎（v3）、心流计时、念头暂存与分级闹钟
│   └── icon.ico        # 多分辨率透明像素掌机图标
├── build_exe.py        # PyInstaller 单文件打包脚本（配合 AuraFocus.spec）
└── tests/              # 前端/原生单元测试与真实 WebView2 / EXE 冒烟测试
```

### 数据保存
- 默认路径：`%LOCALAPPDATA%\AuraFocus\state.json`（可通过环境变量 `AURAFOCUS_DATA_DIR` 指定 U 盘等便携目录）。
- 采用临时文件 + `fsync` + 原子替换写入，自动无损迁移旧版 `v2` 数据。

### 测试与打包
```powershell
# 安装开发与打包依赖
pip install -r requirements-dev.txt

# 前端单元测试（Node.js）
node --test tests/frontend.test.cjs

# Python / Win32 单元测试
python -m unittest discover -s tests -p test_native.py -v

# 真实 WebView2 冒烟（持久化、8 套配色对比度与布局、Canvas 小票与键盘焦点）
python tests/smoke_webview.py

# 打包单文件便携 EXE（产物：dist/AuraFocus.exe）
python build_exe.py

# 校验打包资源并实机验证 EXE 启动与关闭
python tests/smoke_exe.py
```

</details>

---

<div align="center">
  <sub>MIT License © 2026 <a href="https://github.com/THao712">THao712</a> · 留一刻，给自己</sub>
</div>
