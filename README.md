# Claude Switch

> VS Code 侧边栏插件 — 一键切换 Claude Code 的 API 配置，无需手动编辑 `settings.json`。

[![VS Code](https://img.shields.io/badge/VS%20Code-1.94+-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

---

## 项目简介

**Claude Switch** 是一个 VS Code 扩展，在活动栏（Activity Bar）提供一个专用侧边栏，用来管理 Claude Code 的 API 配置（Profiles）。它支持多个 API 提供商——包括 Anthropic 官方、DeepSeek、RightCode，以及任意兼容 Anthropic Messages API 的自定义服务。

有了它，你就能在 VS Code 里面**一键切换** Claude Code 背后的模型/API，再也不用去 `~/.claude/settings.json` 里手动改 JSON 了。

---

## 核心功能

- **侧边栏总览** — 所有已保存的配置和当前生效的配置一目了然，全都展示在侧边栏里
- **一键切换** — 点击列表里的任意配置即可激活，切换后提示是否重新加载窗口让环境变量生效
- **创建与编辑配置** — 提供完整的创建/编辑表单，内置多家 API 提供商的预设，可下拉选择模型
- **动态获取模型列表** — 填入 API Key 和 Base URL 后，点击「获取可用模型」直接从 API 拉取真实模型列表
- **Max Context (1M) 开关** — 支持一键勾选，自动给所有模型名称追加 `[1M]` 后缀，启用超长上下文
- **API Key 保护** — 编辑已有配置时，API Key 始终以密文方式显示且只读；点击「修改」按钮可更换密钥，但不会暴露当前密钥
- **模型名称同步** — 切换主模型后，Opus / Sonnet / Haiku / Subagent 等角色的模型字段会自动保持一致
- **多提供商兼容** — 自动适配不同提供商的模型接口路径；如果 `/v1/models` 在自定义 Base URL 下不可用，会自动回退到根路径
- **命令面板集成** — 按 `Ctrl+Shift+P` 输入 "Claude Switch: Switch API Profile" 即可用下拉菜单快速切换
- **零配置上手** — 全新安装后即刻可用，profiles 目录不存在时会自动创建

---

## 安装

### 方式一：从源码编译安装（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/Dual-Pointers/claude-code-switch-for-vscode.git
cd claude-code-switch-for-vscode

# 2. 安装依赖
npm install

# 3. 编译 TypeScript
npm run compile

# 4. 打包为 VSIX
npx @vscode/vsce package

# 5. 安装到 VS Code
code --install-extension claude-switch-0.3.2.vsix
```

安装完成后，重新加载 VS Code 窗口（`Ctrl+Shift+P` → `Developer: Reload Window`）。

### 方式二：直接安装预编译的 VSIX 文件

如果你已经有编译好的 `.vsix` 文件：

```bash
code --install-extension claude-switch-0.3.2.vsix
```

### 方式三：VS Code 扩展市场（待上架）

> 计划上架到 VS Code Marketplace，敬请期待。

---

## 使用指南

### 1. 打开侧边栏

安装并重新加载 VS Code 后，**活动栏**（左侧竖排图标栏）会出现一个 **⇅ 箭头交换图标**，点击即可打开 Claude Switch 侧边栏。

### 2. 界面布局

侧边栏分为三个区域：

| 区域 | 说明 |
|------|------|
| **Current Profile（当前配置）** | 卡片形式展示当前生效的配置：配置名、API 地址、密钥预览、各角色模型分配 |
| **All Profiles（全部配置）** | 已保存的所有配置列表，当前活跃的配置带绿色圆点标记，点击即可切换 |
| **+ Create New Profile（创建按钮）** | 点击展开创建/编辑表单 |

### 3. 创建新配置

点击 **+ Create New Profile** 按钮，展开配置表单：

1. **Profile Name** — 给配置起个名字，例如 `my-anthropic`、`company-deepseek`
2. **API Provider** — 选择预设提供商，会自动填写 Base URL：
   - **Anthropic** — `https://api.anthropic.com`
   - **DeepSeek** — `https://api.deepseek.com/anthropic`
   - **RightCode Claude** — `https://www.right.codes/claude-aws`
   - **RightCode GPT** — `https://www.right.codes/codex`
   - **自定义** — 手动输入任意 Anthropic 兼容的 API 地址
3. **API Key** — 填入你的 API 密钥（输入时以密文显示）
4. **获取模型列表** — 点击 **🔍 Fetch Available Models** 按钮，从 API 拉取可用模型
5. **选择模型** — 从下拉列表中选择模型，或直接手动输入自定义模型名：
   - **Model**（主模型）— 默认对话使用
   - **Opus Model** — 编代码等重型任务
   - **Sonnet Model** — 一般任务
   - **Haiku Model** — 轻量快速任务
   - **Subagent Model** — 子代理使用
6. **Max Context (1M)** — 如需启用 1M 超长上下文，勾选此复选框（自动给所有模型名追加 `[1M]`）
7. 点击 **Save** 保存

### 4. 切换配置

在 **All Profiles** 列表中，点击任意配置行即可切换。切换成功后弹出提示询问是否重新加载窗口——选择 **Reload Window** 使新的环境变量立即生效。

### 5. 编辑/删除配置

- **编辑** — 鼠标悬停在配置行上会显示 **Edit** 按钮，点击后表单自动填充现有配置内容
  - 编辑时 API Key 密文显示且只读；如需更换密钥，点击旁边的 **Change** 按钮
  - 旧 API Key 永远不会以明文展示，安全放心
- **删除** — 点击 **Del** 按钮并确认即可删除（当前活跃配置不可删除，需要先切换到其他配置）

### 6. 命令面板快捷操作

按 `Ctrl+Shift+P`，输入以下命令：

| 命令 | 功能 |
|------|------|
| `Claude Switch: Switch API Profile` | 用下拉菜单快速选择和切换 API 配置 |
| `Claude Switch: Create New Profile` | 快速聚焦侧边栏，准备创建新配置 |

---

## 如何工作

### 文件结构

```
~/.claude/
├── profiles/              ← 配置文件夹（一个 JSON 文件 = 一个配置）
│   ├── anthropic.json
│   ├── deepseek.json
│   └── rightcode-gpt55.json
├── settings.json          ← Claude Code 主设置（切换配置时写入这里）
└── settings.local.json    ← Claude Code 本地设置（切换配置时清理冲突字段）
```

### 工作机制

1. 每个配置保存为一个独立的 JSON 文件，存放在 `~/.claude/profiles/` 目录
2. 切换配置时，插件将选中配置的内容合并写入 `~/.claude/settings.json`，同时清理 `~/.claude/settings.local.json` 中可能冲突的字段
3. Claude Code CLI 启动时自动读取 `settings.json` 中的 `env` 字段作为环境变量

### Profile JSON 格式

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-ant-api03-xxxxxxxxxxxxx",
    "ANTHROPIC_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-8",
    "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME": "claude-opus-4-8",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME": "claude-haiku-4-5",
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-haiku-4-5",
    "CLAUDE_CODE_EFFORT_LEVEL": "max",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

如需启用 1M 超长上下文，模型名会自动追加 `[1M]` 后缀：

```json
"ANTHROPIC_MODEL": "claude-sonnet-4-6[1M]"
```

除了 `env` 外，你还可以手动添加以下可选字段：

| 字段 | 说明 |
|------|------|
| `enabledPlugins` | 启用的插件列表 |
| `extraKnownMarketplaces` | 额外的扩展市场地址 |
| `model` | 覆盖模型设置 |
| `theme` | 终端主题设置 |

---

## 更新日志

### 0.3.2 (2025-06-24)

- **修复 DeepSeek 新 API 获取模型失败问题**：新增 `/models` 路径回退（不带 `/v1` 前缀）—— 现在会同时尝试 `/v1/models` 和 `/models` 两个端点
- **智能认证头**：Anthropic 专用头（`x-api-key`、`anthropic-version`）现在只发送给 Anthropic 或 Anthropic 兼容端点（`*/anthropic`、`*/claude`），不再发送给通用 OpenAI 兼容 API
- **详细错误信息**：模型获取失败时，错误消息中会包含 API 返回的响应体（截断为 200 字符）以及实际请求的 URL，大幅提升排障效率
- **控制台日志**：模型获取的成功/失败结果会记录到 VS Code DevTools 控制台（`帮助 → 切换开发人员工具 → 控制台`）
- **字段名兼容**：同时支持 `id` 和 `model` 两种字段名格式的模型列表响应

### 0.3.1 (2025-06-08)

- API Key 保护 — 编辑模式下以密文显示且只读，提供「修改」按钮安全更换密钥
- 模型名称同步 — `_MODEL_NAME` 字段与选中模型自动保持一致
- 多提供商模型获取 — 自动回退到根路径尝试获取模型列表

---

## 支持的 API 提供商

任何实现了 Anthropic Messages API（`/v1/messages`）和 Models API（`/v1/models` 或 `/models`）的服务都可以使用：

| 提供商 | Base URL | 说明 |
|--------|----------|------|
| **Anthropic** | `https://api.anthropic.com` | Anthropic 官方 API |
| **DeepSeek** | `https://api.deepseek.com/anthropic` | DeepSeek 的 Anthropic 兼容接口 |
| **RightCode Claude** | `https://www.right.codes/claude-aws` | RightCode 的 Claude/AWS 通道 |
| **RightCode GPT** | `https://www.right.codes/codex` | RightCode 的 GPT 通道 |
| **自定义** | 任意 URL | 任何兼容 Anthropic API 的服务 |

---

## VS Code 配置项

在 VS Code 设置（`settings.json`）中可以覆盖以下配置项来自定义路径：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `claudeSwitch.profilesDir` | `~/.claude/profiles` | 覆盖 profiles 存储目录路径 |
| `claudeSwitch.settingsFile` | `~/.claude/settings.json` | 覆盖 Claude Code 主设置文件路径 |
| `claudeSwitch.localSettingsFile` | `~/.claude/settings.local.json` | 覆盖 Claude Code 本地设置文件路径 |

---

## 系统要求

- **VS Code** `1.94.0` 及以上版本
- **Claude Code CLI**（插件管理的是 Claude Code 自身的配置文件和目录）
- **Node.js** `18+`（仅从源码编译时需要）

---

## 开发

### 项目结构

```
claude-code-switch-for-vscode/
├── src/
│   └── extension.ts        # 插件主逻辑：侧边栏面板、WebView、命令处理
├── out/                     # 编译输出（git 已包含）
├── package.json             # 插件元信息、命令、配置项
├── tsconfig.json            # TypeScript 编译配置
├── .vscodeignore            # VSIX 打包排除规则
├── .gitignore
└── README.md
```

### 编译与调试

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式（开发时使用）
npm run watch
```

按 `F5` 在 VS Code 中启动扩展开发宿主（Extension Development Host）进行调试。

### 打包发布

```bash
npm run package
```

生成的 `.vsix` 文件可以直接安装或手动上架到 VS Code Marketplace。

---

## 技术实现

插件主要技术组件：

- **WebviewView Provider** — 在活动栏侧边栏中渲染自定义 HTML 界面，使用 VS Code 的原生 WebView + CSP（内容安全策略）
- **文件系统操作** — 使用 Node.js `fs` 模块直接读写 `~/.claude/` 目录下的 JSON 配置文件
- **动态模型获取** — 在 WebView 中通过 VS Code 代理发起 HTTP 请求，调用各提供商的 `/v1/models` 接口
- **多条回退路径** — 如果自定义 Base URL 下没有 `/v1/models`，自动尝试根路径（origin-only），兼容 DeepSeek 等特殊路由结构

---

## 许可协议

[MIT License](./LICENSE)

---

## 贡献

欢迎提交 Issue 和 Pull Request！

如果你遇到了问题或有功能建议，请在 [GitHub Issues](https://github.com/Dual-Pointers/claude-code-switch-for-vscode/issues) 中提出。

---

*Made with ❤️ by the community.*
