import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOME = os.homedir();
const DEFAULT_PROFILES_DIR = path.join(HOME, '.claude', 'profiles');
const DEFAULT_SETTINGS_FILE = path.join(HOME, '.claude', 'settings.json');
const DEFAULT_LOCAL_SETTINGS_FILE = path.join(HOME, '.claude', 'settings.local.json');

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function readJsonFile(filePath: string): Record<string, unknown> | null {
    try {
        if (!fs.existsSync(filePath)) { return null; }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`[Claude-Switch] Failed to read ${filePath}:`, e);
        return null;
    }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): boolean {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        return true;
    } catch (e) {
        console.error(`[Claude-Switch] Failed to write ${filePath}:`, e);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Config path helpers
// ---------------------------------------------------------------------------

function getProfilesDir(): string {
    const c = vscode.workspace.getConfiguration('claudeSwitch');
    return (c.get('profilesDir') as string) || DEFAULT_PROFILES_DIR;
}

function getSettingsFile(): string {
    const c = vscode.workspace.getConfiguration('claudeSwitch');
    return (c.get('settingsFile') as string) || DEFAULT_SETTINGS_FILE;
}

function getLocalSettingsFile(): string {
    const c = vscode.workspace.getConfiguration('claudeSwitch');
    return (c.get('localSettingsFile') as string) || DEFAULT_LOCAL_SETTINGS_FILE;
}

// ---------------------------------------------------------------------------
// Profile management
// ---------------------------------------------------------------------------

interface ProfileInfo {
    name: string;
    filePath: string;
    data: Record<string, unknown>;
    env: Record<string, string>;
    model: string;
    baseUrl: string;
}

function listProfiles(): ProfileInfo[] {
    const dir = getProfilesDir();
    if (!fs.existsSync(dir)) { return []; }
    try {
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const name = path.basename(f, '.json');
                const filePath = path.join(dir, f);
                const data = readJsonFile(filePath) || {};
                const env = (data.env && typeof data.env === 'object')
                    ? data.env as Record<string, string> : {};
                return {
                    name,
                    filePath,
                    data,
                    env,
                    model: env.ANTHROPIC_MODEL || 'unknown',
                    baseUrl: env.ANTHROPIC_BASE_URL || 'unknown',
                } satisfies ProfileInfo;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
}

function detectCurrentProfile(profiles: ProfileInfo[]): ProfileInfo | null {
    const settings = readJsonFile(getSettingsFile());
    const currentUrl = settings?.env &&
        typeof settings.env === 'object' &&
        (settings.env as Record<string, unknown>).ANTHROPIC_BASE_URL;
    if (!currentUrl || typeof currentUrl !== 'string') { return null; }
    return profiles.find(p => p.baseUrl === currentUrl) || null;
}

function applyProfile(filePath: string): boolean {
    const profile = readJsonFile(filePath);
    if (!profile) { return false; }

    const settings = readJsonFile(getSettingsFile()) || {};
    const result: Record<string, unknown> = { ...settings };

    // Clean up top-level keys from the old active profile that the new
    // profile does NOT carry.
    const oldProfiles = listProfiles();
    const oldActive = detectCurrentProfile(oldProfiles);
    if (oldActive) {
        const newTopKeys = new Set(Object.keys(profile).filter(k => k !== 'env'));
        for (const key of Object.keys(oldActive.data)) {
            if (key !== 'env' && !newTopKeys.has(key) && key in result) {
                delete result[key];
            }
        }
    }

    for (const [key, value] of Object.entries(profile)) {
        if (key === 'env' && typeof value === 'object' && value !== null) {
            // Fully replace env — no merge, so stale keys don't leak
            result.env = { ...(value as Record<string, unknown>) };
        } else {
            result[key] = value;
        }
    }

    if (!writeJsonFile(getSettingsFile(), result)) { return false; }

    const localSettings = readJsonFile(getLocalSettingsFile());
    if (localSettings) {
        let changed = false;
        for (const key of Object.keys(profile)) {
            if (key in localSettings) { delete localSettings[key]; changed = true; }
        }
        if (changed) { writeJsonFile(getLocalSettingsFile(), localSettings); }
    }

    return true;
}

function buildProfileData(profiles: ProfileInfo[], current: ProfileInfo | null) {
    return {
        current: current ? {
            name: current.name,
            model: current.model,
            baseUrl: current.baseUrl,
            hostname: safeHostname(current.baseUrl),
            tokenPreview: maskToken(current.env.ANTHROPIC_AUTH_TOKEN || ''),
        } : null,
        profiles: profiles.map(p => ({
            name: p.name,
            model: p.model,
            baseUrl: p.baseUrl,
            hostname: safeHostname(p.baseUrl),
            isCurrent: current?.name === p.name,
            tokenPreview: maskToken(p.env.ANTHROPIC_AUTH_TOKEN || ''),
            enabledPlugins: p.data.enabledPlugins || null,
            extraKnownMarketplaces: p.data.extraKnownMarketplaces || null,
            extraModel: p.data.model || null,
            theme: p.data.theme || null,
        })),
    };
}

function safeHostname(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
}

function maskToken(token: string): string {
    if (!token) { return ''; }
    if (token.length <= 8) { return '*'.repeat(token.length); }
    return token.slice(0, 4) + '****' + token.slice(-4);
}

// ---------------------------------------------------------------------------
// Webview HTML content
// ---------------------------------------------------------------------------

function getWebviewContent(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = `
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}';
        font-src ${webview.cspSource};
        img-src ${webview.cspSource} https:;
    `.replace(/\s+/g, ' ').trim();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family, -apple-system, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground);
        padding: 0;
        user-select: none;
    }
    .container { padding: 14px; display: flex; flex-direction: column; gap: 14px; }
    .section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 6px;
    }

    /* ---- current profile card ---- */
    .current-card {
        background: var(--vscode-textCodeBlock-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 8px;
        overflow: hidden;
    }
    .current-card .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        gap: 8px;
    }
    .current-card .card-header .profile-name-label {
        font-size: 14px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .current-card .card-header .badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 10px;
        background: var(--vscode-testing-iconPassed-background, #1a7a3a);
        color: var(--vscode-testing-iconPassed-foreground, #fff);
        letter-spacing: 0.3px;
    }
    .current-card .card-body {
        padding: 0 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .current-card .info-line {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
    }
    .current-card .info-line .inf-label {
        color: var(--vscode-descriptionForeground);
        flex-shrink: 0;
        min-width: 42px;
        font-size: 11px;
    }
    .current-card .info-line .inf-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
    }
    .current-card .divider-row {
        height: 1px;
        background: var(--vscode-widget-border);
        margin: 2px 0;
    }
    .current-card .model-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        padding: 1px 0;
    }
    .current-card .model-row .mrole {
        color: var(--vscode-descriptionForeground);
        width: 52px;
        flex-shrink: 0;
    }
    .current-card .model-row .mval {
        font-family: var(--vscode-editor-font-family, monospace);
        color: var(--vscode-textLink-foreground);
        font-size: 11px;
    }
    .current-card .no-profile {
        padding: 20px;
        text-align: center;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        line-height: 1.6;
    }

    /* ---- profile list ---- */
    .profile-list { display: flex; flex-direction: column; gap: 2px; }
    .profile-item {
        display: flex;
        align-items: center;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.1s;
        border: 1px solid transparent;
    }
    .profile-item:hover { background: var(--vscode-list-hoverBackground); }
    .profile-item.active {
        background: var(--vscode-list-activeSelectionBackground);
        border-color: var(--vscode-focusBorder);
    }
    .profile-item.active .profile-name { color: var(--vscode-list-activeSelectionForeground); }
    .profile-item .profile-info {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .profile-item .profile-name {
        font-weight: 500;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .profile-item.active .profile-name::before { content: '● '; }
    .profile-item .profile-sub {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .profile-item .actions {
        display: flex;
        gap: 4px;
        margin-left: 8px;
        flex-shrink: 0;
    }
    .profile-item .actions button {
        background: var(--vscode-button-secondaryBackground);
        border: 1px solid var(--vscode-button-border, transparent);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 500;
        font-family: var(--vscode-font-family);
        white-space: nowrap;
        transition: background 0.1s;
    }
    .profile-item .actions button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .profile-item .actions button.delete-btn { color: var(--vscode-errorForeground); }
    .profile-item .actions button.delete-btn:hover { background: var(--vscode-inputValidation-errorBackground); }

    /* ---- buttons ---- */
    .btn {
        display: block;
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 5px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        text-align: center;
        transition: background 0.1s;
    }
    .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn.primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
    }
    .btn.primary:hover { background: var(--vscode-button-hoverBackground); }

    /* ---- form ---- */
    .form-panel {
        display: none;
        background: var(--vscode-textCodeBlock-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 8px;
        padding: 14px;
        flex-direction: column;
        gap: 10px;
    }
    .form-panel.visible { display: flex; }
    .form-panel label {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        text-transform: uppercase;
        font-weight: 500;
    }
    .form-panel input, .form-panel textarea, .form-panel select {
        width: 100%;
        padding: 6px 10px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font-size: 13px;
        font-family: var(--vscode-font-family);
    }
    .form-panel input:focus, .form-panel textarea:focus, .form-panel select:focus {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
    .form-panel input.error {
        border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }
    .form-row {
        display: flex;
        gap: 8px;
    }
    .form-row button { flex: 1; }
    .form-panel .hint {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
    }
    .checkbox-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 0;
    }
    .checkbox-row input[type="checkbox"] {
        width: auto;
        accent-color: var(--vscode-focusBorder);
    }
    .checkbox-row label {
        text-transform: none;
        font-size: 12px;
        color: var(--vscode-foreground);
        cursor: pointer;
    }

    /* ---- empty state ---- */
    .empty-state {
        text-align: center;
        padding: 28px 12px;
        color: var(--vscode-descriptionForeground);
        border: 1px dashed var(--vscode-widget-border);
        border-radius: 8px;
    }
    .empty-state p { margin-bottom: 8px; font-size: 12px; }
    .empty-state p:last-child { margin-bottom: 0; }

    /* ---- divider ---- */
    .divider {
        height: 1px;
        background: var(--vscode-widget-border);
        margin: 2px 0;
    }

    /* ---- fetch status ---- */
    .fetch-status {
        font-size: 11px;
        display: none;
        padding: 2px 0;
    }
    .fetch-status.visible { display: block; }

    /* ---- token field ---- */
    .token-wrap {
        display: flex;
        gap: 6px;
    }
    .token-wrap input { flex: 1; }
    .token-wrap input:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
    .token-wrap .toggle-token {
        flex-shrink: 0;
        background: var(--vscode-button-secondaryBackground);
        border: 1px solid var(--vscode-button-border, transparent);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-family: var(--vscode-font-family);
        white-space: nowrap;
    }
    .token-wrap .toggle-token:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>
<div class="container">

    <!-- Current Profile -->
    <div>
        <div class="section-title">Current Profile</div>
        <div id="currentCard" class="current-card">
            <div class="no-profile">Loading...</div>
        </div>
    </div>

    <div class="divider"></div>

    <!-- Profile List -->
    <div>
        <div class="section-title">All Profiles</div>
        <div id="profileList" class="profile-list"></div>
    </div>

    <!-- Create Button -->
    <button id="createBtn" class="btn">+ Create New Profile</button>

    <!-- Form (hidden by default) -->
    <div id="formPanel" class="form-panel">
        <div class="section-title" id="formTitle">Create Profile</div>

        <label>Profile Name *</label>
        <input type="text" id="fName" placeholder="e.g. my-provider" />

        <label>API Provider</label>
        <select id="fProvider">
            <option value="">-- Custom URL --</option>
            <option value="anthropic">Anthropic (api.anthropic.com)</option>
            <option value="deepseek">DeepSeek (api.deepseek.com)</option>
            <option value="rightcode-claude">RightCode Claude (right.codes/claude-aws)</option>
            <option value="rightcode-gpt">RightCode GPT (right.codes/codex)</option>
        </select>

        <label>API Base URL *</label>
        <input type="text" id="fBaseUrl" placeholder="https://api.example.com/anthropic" />

        <label>API Key *</label>
        <div class="token-wrap">
            <input type="password" id="fToken" placeholder="sk-..." />
            <button class="toggle-token" id="fTokenChange" title="Change API Key" style="display:none;">Change</button>
        </div>

        <div class="fetch-status" id="fFetchStatus"></div>
        <button id="fFetchBtn" class="btn" type="button">🔍 Fetch Available Models</button>

        <div class="checkbox-row">
            <input type="checkbox" id="fMaxContext" />
            <label for="fMaxContext">Max Context (1M) — appends [1M] suffix to all models</label>
        </div>

        <label>Model *</label>
        <select id="fModelSelect">
            <option value="">-- Fetch models first --</option>
        </select>
        <input type="text" id="fModel" placeholder="Or type custom model..." style="margin-top:4px;" />

        <label>Opus Model</label>
        <select id="fOpusModel">
            <option value="">-- Same as Model --</option>
        </select>

        <label>Sonnet Model</label>
        <select id="fSonnetModel">
            <option value="">-- Same as Model --</option>
        </select>

        <label>Haiku Model</label>
        <select id="fHaikuModel">
            <option value="">-- Same as Model --</option>
        </select>

        <label>Subagent Model</label>
        <select id="fSubagentModel">
            <option value="">-- Same as Model --</option>
        </select>

        <div class="form-row">
            <button id="fSaveBtn" class="btn primary">Save</button>
            <button id="fCancelBtn" class="btn">Cancel</button>
        </div>
    </div>

</div>

<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let editingProfile = null;

    const $ = function(id) { return document.getElementById(id); };

    // ---- render ----
    function render(data) {
        var current = data.current, profiles = data.profiles;

        // ---- current card ----
        var card = $('currentCard');
        if (current) {
            var env = current.env || {};
            var roles = [
                ['Main',     current.model],
                ['Opus',     env.ANTHROPIC_DEFAULT_OPUS_MODEL || current.model],
                ['Sonnet',   env.ANTHROPIC_DEFAULT_SONNET_MODEL || current.model],
                ['Haiku',    env.ANTHROPIC_DEFAULT_HAIKU_MODEL || current.model],
                ['Subagent', env.CLAUDE_CODE_SUBAGENT_MODEL || current.model]
            ];
            var modelRows = '';
            for (var r = 0; r < roles.length; r++) {
                modelRows +=
                    '<div class="model-row">' +
                        '<span class="mrole">' + escHtml(roles[r][0]) + '</span>' +
                        '<span class="mval">' + escHtml(roles[r][1]) + '</span>' +
                    '</div>';
            }

            card.innerHTML =
                '<div class="card-header">' +
                    '<span class="profile-name-label">' + escHtml(current.name) + '</span>' +
                    '<span class="badge">● ACTIVE</span>' +
                '</div>' +
                '<div class="card-body">' +
                    '<div class="info-line">' +
                        '<span class="inf-label">URL</span>' +
                        '<span class="inf-value" title="' + escAttr(current.baseUrl) + '">' + escHtml(current.hostname) + '</span>' +
                    '</div>' +
                    '<div class="info-line">' +
                        '<span class="inf-label">API Key</span>' +
                        '<span class="inf-value">' + escHtml(current.tokenPreview || '—') + '</span>' +
                    '</div>' +
                    '<div class="divider-row"></div>' +
                    modelRows +
                '</div>';
        } else {
            card.innerHTML =
                '<div class="no-profile">' +
                    'No active profile detected.<br>' +
                    'Click a profile below to activate it, or create a new one.' +
                '</div>';
        }

        // ---- profile list ----
        var list = $('profileList');
        if (profiles.length === 0) {
            list.innerHTML =
                '<div class="empty-state">' +
                    '<p>No profiles found</p>' +
                    '<p style="font-size:10px; color:var(--vscode-descriptionForeground);">' +
                    'Profiles are JSON files in<br><code>~/.claude/profiles/</code></p>' +
                '</div>';
        } else {
            var html = '';
            for (var i = 0; i < profiles.length; i++) {
                var p = profiles[i];
                var cls = p.isCurrent ? 'profile-item active' : 'profile-item';
                var sub = p.hostname + ' · Key: ' + (p.tokenPreview || '—');
                html +=
                    '<div class="' + cls + '" data-name="' + escAttr(p.name) + '">' +
                        '<div class="profile-info">' +
                            '<span class="profile-name">' + escHtml(p.name) + '</span>' +
                            '<span class="profile-sub">' + escHtml(sub) + '</span>' +
                        '</div>' +
                        '<span class="actions">' +
                            '<button class="edit-btn">Edit</button>' +
                            (p.isCurrent ? '' : '<button class="delete-btn">Del</button>') +
                        '</span>' +
                    '</div>';
            }
            list.innerHTML = html;
        }
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function escAttr(s) {
        return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ---- events (delegated) ----
    $('profileList').addEventListener('click', function(e) {
        var row = e.target.closest('.profile-item');
        if (!row) return;
        var name = row.dataset.name;
        var btn = e.target.closest('button');
        if (btn) {
            if (btn.classList.contains('edit-btn')) {
                editProfile(name);
            } else if (btn.classList.contains('delete-btn')) {
                deleteProfile(name);
            }
            return;
        }
        // click row = switch
        vscode.postMessage({ type: 'switchProfile', name: name });
    });

    $('createBtn').addEventListener('click', function() { showForm(null); });
    $('fCancelBtn').addEventListener('click', hideForm);
    $('fSaveBtn').addEventListener('click', saveForm);
    $('fFetchBtn').addEventListener('click', fetchModels);

    var originalToken = ''; // stored in showForm for edit mode

    // "Change API Key" button handler
    $('fTokenChange').addEventListener('click', function() {
        if ($('fTokenChange').classList.contains('keeping')) {
            // "Keep Original" — revert to stored token
            $('fToken').value = originalToken;
            $('fToken').disabled = true;
            $('fTokenChange').textContent = 'Change';
            $('fTokenChange').classList.remove('keeping');
        } else {
            // "Change" — clear and enable editing
            $('fToken').value = '';
            $('fToken').disabled = false;
            $('fToken').focus();
            $('fTokenChange').textContent = 'Keep Original';
            $('fTokenChange').classList.add('keeping');
        }
    });

    // Provider -> auto-fill base URL
    var PROVIDER_URLS = {
        'anthropic': 'https://api.anthropic.com',
        'deepseek': 'https://api.deepseek.com/anthropic',
        'rightcode-claude': 'https://www.right.codes/claude-aws',
        'rightcode-gpt': 'https://www.right.codes/codex',
    };
    $('fProvider').addEventListener('change', function() {
        var url = PROVIDER_URLS[this.value] || '';
        if (url) { $('fBaseUrl').value = url; }
    });

    function editProfile(name) {
        vscode.postMessage({ type: 'getProfileDetail', name: name });
    }

    function deleteProfile(name) {
        vscode.postMessage({ type: 'deleteProfile', name: name });
    }

    // Fetch models from API
    function fetchModels() {
        var baseUrl = $('fBaseUrl').value.trim();
        var token = $('fToken').value.trim();
        var status = $('fFetchStatus');
        if (!baseUrl || !token) {
            status.className = 'fetch-status visible';
            status.style.color = 'var(--vscode-errorForeground)';
            status.textContent = 'Please enter API Base URL and API Token first.';
            return;
        }
        status.className = 'fetch-status visible';
        status.style.color = 'var(--vscode-descriptionForeground)';
        status.textContent = 'Fetching models...';
        $('fFetchBtn').disabled = true;
        vscode.postMessage({ type: 'fetchModels', baseUrl: baseUrl, token: token });
    }

    function populateModelSelects(models) {
        var selects = ['fModelSelect', 'fOpusModel', 'fSonnetModel', 'fHaikuModel', 'fSubagentModel'];
        for (var i = 0; i < selects.length; i++) {
            var sel = $(selects[i]);
            if (!sel) continue;
            var currentVal = sel.value;
            sel.innerHTML = '';
            var d = document.createElement('option');
            d.value = '';
            d.textContent = selects[i] === 'fModelSelect' ? '-- Select model --' : '-- Same as Model --';
            sel.appendChild(d);
            for (var j = 0; j < models.length; j++) {
                var o = document.createElement('option');
                o.value = models[j];
                o.textContent = models[j];
                sel.appendChild(o);
            }
            if (currentVal) {
                for (var k = 0; k < sel.options.length; k++) {
                    if (sel.options[k].value === currentVal) { sel.selectedIndex = k; break; }
                }
            }
        }
    }

    function detectProvider(url) {
        if (!url) return '';
        if (url.indexOf('api.anthropic.com') >= 0 && url.indexOf('deepseek') < 0) return 'anthropic';
        if (url.indexOf('deepseek.com') >= 0) return 'deepseek';
        if (url.indexOf('right.codes/claude-aws') >= 0) return 'rightcode-claude';
        if (url.indexOf('right.codes/codex') >= 0) return 'rightcode-gpt';
        return '';
    }

    function hasMaxContext(model) {
        return /\\[1[mM]\\]/.test(model || '');
    }

    function stripMaxContext(model) {
        return (model || '').replace(/\\[1[mM]\\]/g, '').trim();
    }

    function applyMaxContext(model) {
        if (!model) return '';
        if (hasMaxContext(model)) return model;
        return model + '[1M]';
    }

    function showForm(profile) {
        editingProfile = profile ? profile.name : null;
        $('formTitle').textContent = profile ? 'Edit Profile: ' + profile.name : 'Create Profile';
        $('fName').value = profile ? profile.name : '';
        $('fName').disabled = !!profile;
        $('fBaseUrl').value = profile ? profile.baseUrl : '';
        $('fProvider').value = profile ? detectProvider(profile.baseUrl) : '';

        // Token field: edit mode vs create mode
        $('fToken').type = 'password';
        $('fTokenChange').classList.remove('keeping');
        originalToken = '';
        if (profile) {
            // Edit mode: store real token, keep disabled, visually masked by type=password
            originalToken = (profile && profile.token) || '';
            $('fToken').value = originalToken;
            $('fToken').disabled = true;
            $('fTokenChange').textContent = 'Change';
            $('fTokenChange').style.display = '';
        } else {
            // Create mode: empty, enabled, no Change button
            $('fToken').value = '';
            $('fToken').disabled = false;
            $('fTokenChange').style.display = 'none';
        }

        var model = profile ? profile.model : '';
        $('fModel').value = '';
        $('fMaxContext').checked = hasMaxContext(model);

        $('fFetchStatus').className = 'fetch-status';
        $('fFetchBtn').disabled = false;

        function setModelSelect(selId, envKey) {
            var sel = $(selId);
            var m = profile && profile.env ? (profile.env[envKey] || '') : '';
            var val = stripMaxContext(m);
            if (hasMaxContext(m)) { $('fMaxContext').checked = true; }
            var found = false;
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === val) { sel.selectedIndex = i; found = true; break; }
            }
            if (!found && val) {
                var opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                sel.appendChild(opt);
                sel.value = val;
            } else if (!found) {
                sel.value = '';
            }
        }

        setModelSelect('fModelSelect', 'ANTHROPIC_MODEL');
        setModelSelect('fOpusModel', 'ANTHROPIC_DEFAULT_OPUS_MODEL');
        setModelSelect('fSonnetModel', 'ANTHROPIC_DEFAULT_SONNET_MODEL');
        setModelSelect('fHaikuModel', 'ANTHROPIC_DEFAULT_HAIKU_MODEL');
        setModelSelect('fSubagentModel', 'CLAUDE_CODE_SUBAGENT_MODEL');

        $('formPanel').classList.add('visible');
        ['fName','fBaseUrl','fToken'].forEach(function(id) { $(id).classList.remove('error'); });
    }

    function hideForm() {
        $('formPanel').classList.remove('visible');
        editingProfile = null;
    }

    function saveForm() {
        var name = $('fName').value.trim();
        var baseUrl = $('fBaseUrl').value.trim();
        var token = $('fToken').value.trim();
        var useMax = $('fMaxContext').checked;

        var ok = true;
        if (!name) { $('fName').classList.add('error'); ok = false; }
        if (!baseUrl) { $('fBaseUrl').classList.add('error'); ok = false; }
        // For edit mode: if token is masked placeholder (unchanged), pass empty to preserve old
        // For create mode: token is required
        var tokenUnchanged = editingProfile && $('fToken').disabled;
        if (!token && !tokenUnchanged) { $('fToken').classList.add('error'); ok = false; }
        if (!ok) return;

        var model = $('fModelSelect').value || $('fModel').value.trim() || '';
        function getModel(v) { return v || model; }
        var opusModel = getModel($('fOpusModel').value);
        var sonnetModel = getModel($('fSonnetModel').value);
        var haikuModel = getModel($('fHaikuModel').value);
        var subagentModel = getModel($('fSubagentModel').value);

        if (useMax) {
            model = applyMaxContext(model);
            opusModel = applyMaxContext(opusModel);
            sonnetModel = applyMaxContext(sonnetModel);
            haikuModel = applyMaxContext(haikuModel);
            subagentModel = applyMaxContext(subagentModel);
        }

        var env = {
            ANTHROPIC_BASE_URL: baseUrl,
            ANTHROPIC_AUTH_TOKEN: token,
            ANTHROPIC_MODEL: model,
            ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
            ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
            ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: opusModel,
            ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: sonnetModel,
            ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: haikuModel,
            CLAUDE_CODE_SUBAGENT_MODEL: subagentModel,
            CLAUDE_CODE_EFFORT_LEVEL: 'max',
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        };

        vscode.postMessage({
            type: 'saveProfile',
            name: name,
            isEdit: !!editingProfile,
            oldName: editingProfile,
            env: env
        });
        hideForm();
    }

    // ---- listen for data from extension ----
    window.addEventListener('message', function(e) {
        var msg = e.data;
        if (msg.type === 'updateData') {
            render(msg.data);
        } else if (msg.type === 'fillForm') {
            showForm(msg.profile);
        } else if (msg.type === 'modelsResult') {
            $('fFetchBtn').disabled = false;
            var status = $('fFetchStatus');
            if (msg.error) {
                status.style.color = 'var(--vscode-errorForeground)';
                status.textContent = 'Error: ' + msg.error;
            } else if (msg.models && msg.models.length > 0) {
                status.style.color = 'var(--vscode-testing-iconPassed-foreground, #89d185)';
                status.textContent = '✓ Found ' + msg.models.length + ' models.';
                populateModelSelects(msg.models);
            }
        } else if (msg.type === 'error') {
            var card = $('currentCard');
            var orig = card.innerHTML;
            card.innerHTML = '<div style="color:var(--vscode-errorForeground);padding:12px;">' + escHtml(msg.message) + '</div>';
            setTimeout(function() { vscode.postMessage({ type: 'ready' }); }, 2500);
        }
    });

    // initial data request
    vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// ---------------------------------------------------------------------------
// WebviewView Provider
// ---------------------------------------------------------------------------

class ClaudeSwitchProvider implements vscode.WebviewViewProvider {
    private _view: vscode.WebviewView | null = null;

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getWebviewContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            try {
                await this.handleMessage(msg, webviewView.webview);
            } catch (e: any) {
                webviewView.webview.postMessage({ type: 'error', message: e.message || String(e) });
            }
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this._view) {
                this.pushData();
            }
        });
    }

    pushData(): void {
        if (!this._view) { return; }
        const profiles = listProfiles();
        const current = detectCurrentProfile(profiles);
        const data = buildProfileData(profiles, current);
        this._view.webview.postMessage({ type: 'updateData', data });
    }

    private async handleMessage(
        msg: { type: string; [key: string]: unknown },
        webview: vscode.Webview
    ): Promise<void> {
        switch (msg.type) {
            case 'ready': {
                this.pushData();
                break;
            }
            case 'fetchModels': {
                const baseUrl = (msg.baseUrl as string || '').replace(/\/+$/, '');
                const token = msg.token as string || '';
                if (!baseUrl || !token) {
                    webview.postMessage({ type: 'modelsResult', error: 'Please enter API Base URL and API Token first.' });
                    return;
                }

                // Determine if this is an Anthropic-compatible API URL that needs
                // x-api-key + anthropic-version headers.
                // - api.anthropic.com: native Anthropic API
                // - */anthropic or */claude paths: Anthropic-compatible proxies
                const isAnthropic =
                    (baseUrl.includes('anthropic.com') && !baseUrl.includes('deepseek')) ||
                    /\/anthropic(\/|$)/.test(baseUrl) ||
                    /\/claude(\/|$)/.test(baseUrl);

                // Build URLs to try: {baseUrl}/v1/models, {baseUrl}/models,
                // {origin}/v1/models, {origin}/models
                const urlsToTry = [
                    `${baseUrl}/v1/models`,
                    `${baseUrl}/models`,
                ];
                try {
                    const u = new URL(baseUrl);
                    const originOnly = `${u.protocol}//${u.host}`;
                    if (originOnly !== baseUrl) {
                        urlsToTry.push(`${originOnly}/v1/models`);
                        urlsToTry.push(`${originOnly}/models`);
                    }
                } catch { /* keep only the first two URLs */ }

                // Deduplicate
                const uniqueUrls = [...new Set(urlsToTry)];

                let lastError = '';
                for (const url of uniqueUrls) {
                    try {
                        // Build headers: always include Bearer auth + Accept JSON.
                        // Only include Anthropic-specific headers for Anthropic endpoints.
                        const headers: Record<string, string> = {
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        };
                        if (isAnthropic) {
                            headers['x-api-key'] = token;
                            headers['anthropic-version'] = '2023-06-01';
                        }

                        const resp = await fetch(url, { headers });
                        if (!resp.ok) {
                            let errBody = '';
                            try { errBody = await resp.text(); } catch { /* ignore */ }
                            if (errBody && errBody.length > 200) {
                                errBody = errBody.substring(0, 200) + '...';
                            }
                            lastError = `${url}: API returned ${resp.status}${errBody ? ' — ' + errBody : ''}`;
                            continue;
                        }

                        const json = await resp.json() as { data?: Array<{ id?: string; model?: string }> };
                        // Support both `id` and `model` field names in model objects
                        const models = (json.data || [])
                            .map((m) => m.id || m.model || '')
                            .filter((id: string) => id && typeof id === 'string')
                            .sort();
                        if (models.length === 0) {
                            lastError = `${url}: No models returned from API.`;
                            continue;
                        }
                        console.log(`[Claude-Switch] Fetched ${models.length} models from ${url}`);
                        webview.postMessage({ type: 'modelsResult', models });
                        return;
                    } catch (e: any) {
                        lastError = `${url}: Failed to fetch models: ${e.message || e}`;
                    }
                }
                console.error(`[Claude-Switch] All model fetch attempts failed. Last error: ${lastError}`);
                webview.postMessage({ type: 'modelsResult', error: lastError || 'Failed to fetch models.' });
                break;
            }
            case 'switchProfile': {
                const name = msg.name as string;
                const profiles = listProfiles();
                const profile = profiles.find(p => p.name === name);
                if (!profile) {
                    webview.postMessage({ type: 'error', message: `Profile "${name}" not found.` });
                    return;
                }
                const ok = applyProfile(profile.filePath);
                if (!ok) {
                    webview.postMessage({ type: 'error', message: `Failed to switch to "${name}". Check file permissions.` });
                    return;
                }
                this.pushData();

                const action = await vscode.window.showInformationMessage(
                    `Switched to profile "${name}". Reload window to apply environment changes?`,
                    'Reload Window', 'Later'
                );
                if (action === 'Reload Window') {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
                break;
            }
            case 'deleteProfile': {
                const name = msg.name as string;
                const profiles = listProfiles();
                const current = detectCurrentProfile(profiles);
                if (current?.name === name) {
                    webview.postMessage({ type: 'error', message: `Cannot delete the active profile. Switch to another first.` });
                    return;
                }
                const filePath = path.join(getProfilesDir(), `${name}.json`);
                if (!fs.existsSync(filePath)) {
                    webview.postMessage({ type: 'error', message: `Profile "${name}" does not exist.` });
                    return;
                }
                const confirm = await vscode.window.showWarningMessage(
                    `Delete profile "${name}"? This cannot be undone.`,
                    { modal: true },
                    'Delete'
                );
                if (confirm !== 'Delete') { return; }
                try {
                    fs.unlinkSync(filePath);
                } catch (e: any) {
                    webview.postMessage({ type: 'error', message: `Failed to delete: ${e.message}` });
                    return;
                }
                this.pushData();
                vscode.window.showInformationMessage(`Profile "${name}" deleted.`);
                break;
            }
            case 'getProfileDetail': {
                const name = msg.name as string;
                const filePath = path.join(getProfilesDir(), `${name}.json`);
                const data = readJsonFile(filePath);
                if (!data) {
                    webview.postMessage({ type: 'error', message: `Cannot read profile "${name}".` });
                    return;
                }
                const env = (data.env && typeof data.env === 'object')
                    ? data.env as Record<string, string> : {};
                webview.postMessage({
                    type: 'fillForm',
                    profile: {
                        name,
                        model: env.ANTHROPIC_MODEL || '',
                        baseUrl: env.ANTHROPIC_BASE_URL || '',
                        hostname: safeHostname(env.ANTHROPIC_BASE_URL || ''),
                        tokenPreview: maskToken(env.ANTHROPIC_AUTH_TOKEN || ''),
                        token: env.ANTHROPIC_AUTH_TOKEN || '',  // real token for masked field
                        env: env,
                    }
                });
                break;
            }
            case 'saveProfile': {
                const { name, isEdit, oldName, env } = msg as unknown as {
                    name: string; isEdit: boolean; oldName: string | null;
                    env: Record<string, string>;
                };
                const filePath = path.join(getProfilesDir(), `${name}.json`);

                let profileData: Record<string, unknown>;
                if (isEdit && oldName) {
                    const oldPath = path.join(getProfilesDir(), `${oldName}.json`);
                    const oldData = readJsonFile(oldPath) || {};
                    const oldEnv = (oldData.env && typeof oldData.env === 'object')
                        ? oldData.env as Record<string, string> : {};
                    const mergedEnv = { ...env };
                    if (!mergedEnv.ANTHROPIC_AUTH_TOKEN) {
                        mergedEnv.ANTHROPIC_AUTH_TOKEN = oldEnv.ANTHROPIC_AUTH_TOKEN || '';
                    }
                    profileData = { ...oldData, env: mergedEnv };
                    if (oldName !== name && fs.existsSync(oldPath)) {
                        try { fs.unlinkSync(oldPath); } catch { /* ok */ }
                    }
                } else {
                    if (fs.existsSync(filePath)) {
                        const confirm = await vscode.window.showWarningMessage(
                            `Profile "${name}" already exists. Overwrite?`,
                            { modal: true },
                            'Overwrite'
                        );
                        if (confirm !== 'Overwrite') { return; }
                    }
                    profileData = {
                        env,
                        CLAUDE_CODE_EFFORT_LEVEL: 'max',
                        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
                    };
                }

                if (!writeJsonFile(filePath, profileData)) {
                    webview.postMessage({ type: 'error', message: `Failed to save profile "${name}".` });
                    return;
                }
                this.pushData();
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

let provider: ClaudeSwitchProvider;

async function switchProfileHandler(): Promise<void> {
    const profiles = listProfiles();
    const current = detectCurrentProfile(profiles);

    const items: (vscode.QuickPickItem & { profileName: string })[] = profiles.map(p => ({
        label: p.name === current?.name ? `$(check) ${p.name}` : `$(blank) ${p.name}`,
        profileName: p.name,
        description: p.name === current?.name ? '(Current)' : '',
        detail: `Model: ${p.model}  |  ${safeHostname(p.baseUrl)}`,
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Claude API profile to switch to',
        title: 'Claude Switch',
        matchOnDetail: true,
    });
    if (!selection || selection.profileName === current?.name) { return; }

    const profile = profiles.find(p => p.name === selection.profileName);
    if (!profile) { return; }

    const ok = applyProfile(profile.filePath);
    if (!ok) {
        vscode.window.showErrorMessage(`Failed to switch to "${selection.profileName}".`);
        return;
    }

    provider.pushData();

    const action = await vscode.window.showInformationMessage(
        `Switched to profile "${selection.profileName}". Reload window?`,
        'Reload Window', 'Later'
    );
    if (action === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
    provider = new ClaudeSwitchProvider();

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('claude-switch.view', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-switch.switchProfile', switchProfileHandler)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-switch.createProfile', () => {
            vscode.commands.executeCommand('claude-switch-sidebar.focus');
        })
    );

    console.log('[Claude-Switch] Extension activated');
}

export function deactivate(): void {
    // subscriptions auto-disposed
}
