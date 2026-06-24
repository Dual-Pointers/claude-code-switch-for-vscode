# Claude Switch

VS Code sidebar extension for switching Claude Code API profiles — manage multiple API providers (Anthropic, DeepSeek, RightCode, custom) without manually editing `settings.json`.

## Features

- **Sidebar Management** — All profiles and current configuration visible in a dedicated sidebar view
- **One-Click Switching** — Click any profile to activate it; prompts to reload window for env changes
- **Create & Edit Profiles** — Full create/edit form with provider presets and model selection
- **Dynamic Model Fetching** — Enter API key and base URL, click "Fetch Available Models" to get real model list from the API
- **Max Context (1M) Toggle** — One checkbox appends `[1M]` suffix to all model fields
- **API Key Protection** — When editing a profile, the API key is always masked and read-only. A "Change" button allows updating it without ever revealing the current key.
- **Model Name Sync** — Opus/Sonnet/Haiku model names (`_MODEL_NAME` fields) automatically stay in sync with the selected models.
- **Multi-Provider Model Fetching** — Automatically falls back to the provider's root API path if the `/v1/models` endpoint isn't available at the custom base URL.
- **Quick Command Palette Access** — `Claude Switch: Switch API Profile` command available in `Ctrl+Shift+P`
- **Zero Pre-configuration** — Works on fresh installs; auto-creates profiles directory if missing

## How It Works

Profiles are stored as JSON files in `~/.claude/profiles/`. Each profile contains an `env` block with API credentials and model settings, plus optional keys like `enabledPlugins` and `theme`.

When you switch profiles, the extension merges the profile into `~/.claude/settings.json` and cleans up conflicting keys in `~/.claude/settings.local.json`.

```
~/.claude/
  profiles/
    anthropic.json
    deepseek.json
    rightcode-gpt55.json
  settings.json          ← merged profile writes here
  settings.local.json    ← conflicting keys cleaned here
```

## Usage

1. Click the **⇅ arrow-swap icon** in the VS Code Activity Bar to open the Claude Switch sidebar
2. **Current Profile** card shows your active API configuration (profile name, model, API key preview, all model roles)
3. **All Profiles** list shows every saved profile — click a row to switch, or use the Edit/Del buttons
4. Click **+ Create New Profile** to add a new provider:
   - Select a provider preset (Anthropic / DeepSeek / RightCode) to auto-fill the URL
   - Enter your API key (always masked in the UI)
   - Click **🔍 Fetch Available Models** to populate model dropdowns from the API
   - Pick models for Main / Opus / Sonnet / Haiku / Subagent roles
   - Toggle **Max Context (1M)** if you need the extended context suffix
   - Save

### Profile JSON Format

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-ant-...",
    "ANTHROPIC_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-8",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5",
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-haiku-4-5",
    "CLAUDE_CODE_EFFORT_LEVEL": "max",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

You can also include optional top-level keys like `enabledPlugins`, `extraKnownMarketplaces`, `model`, and `theme`.

## Commands

| Command | Description |
|---------|-------------|
| `Claude Switch: Switch API Profile` | Quick-pick profile switcher (command palette) |
| `Claude Switch: Create New Profile` | Focus the sidebar for creating a new profile |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeSwitch.profilesDir` | `~/.claude/profiles` | Override profiles directory path |
| `claudeSwitch.settingsFile` | `~/.claude/settings.json` | Override settings.json path |
| `claudeSwitch.localSettingsFile` | `~/.claude/settings.local.json` | Override settings.local.json path |

## Requirements

- VS Code 1.94.0 or later
- Claude Code CLI (the profiles and settings are part of Claude Code's configuration)

## Install

### From VSIX

```bash
# Build
cd claude-switch
npm install
npm run compile
npx @vscode/vsce package

# Install
code --install-extension claude-switch-0.3.1.vsix
```

Then reload VS Code (`Ctrl+Shift+P` → `Developer: Reload Window`).

## Changelog

### 0.3.2 (2025-06-24)

- **Fix model fetching for DeepSeek's new API**: Added `/models` path fallback (without `/v1` prefix) — the extension now tries both `/v1/models` and `/models` endpoints.
- **Smarter auth headers**: Anthropic-specific headers (`x-api-key`, `anthropic-version`) are now only sent to Anthropic or Anthropic-compatible endpoints, not to generic OpenAI-compatible APIs.
- **Detailed error messages**: When model fetching fails, the error message now includes the API response body (truncated to 200 characters) and the URL that was attempted, making it much easier to diagnose issues.
- **Console logging**: Model fetch results are logged to the VS Code DevTools console (`Help → Toggle Developer Tools → Console`) for easier debugging.
- **Field name compatibility**: Supports both `id` and `model` field names in model list API responses.

### 0.3.1 (2025-06-08)

- API key protection — masked and read-only in edit mode with a "Change" button
- Model name sync — `_MODEL_NAME` fields stay in sync with selected models
- Multi-provider model fetching with automatic `/v1/models` fallback

## Supported API Providers

Any provider that implements the Anthropic Messages API (`/v1/messages`) and Models API (`/v1/models`):

- **Anthropic** — `https://api.anthropic.com`
- **DeepSeek** — `https://api.deepseek.com/anthropic`
- **RightCode Claude** — `https://www.right.codes/claude-aws`
- **RightCode GPT** — `https://www.right.codes/codex`
- **Custom** — Enter any Anthropic-compatible base URL
