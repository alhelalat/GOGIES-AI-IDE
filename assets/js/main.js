import { postRequest } from './api.js';
import { ModalManager } from './modals.js';
import { TabManager } from './tabManager.js';
import { FileTreeManager } from './fileTree.js';
import { ToastManager } from './toastManager.js';
import { LoadingIndicator } from './loadingIndicator.js';

document.addEventListener('DOMContentLoaded', async function() {
    // --- Editor & State ---
    let editor;
    let ideSettings = {};
    let welcomeSession;

    // --- UI Elements ---
    const saveFileBtn = document.getElementById('save-file-btn');
    const reloadFileBtn = document.getElementById('reload-file-btn');
    const settingsMenuBtn = document.getElementById('show-settings-menu');

    // --- Ace Editor Setup ---
    function initializeEditor() {
        ace.config.set("basePath", App.aceBasePath);
        editor = ace.edit("editor"); 
        // Set gogies as the default theme
        editor.setTheme("ace/theme/gogies");
        editor.session.setMode("ace/mode/text");
        editor.setShowPrintMargin(false);

        ace.require("ace/ext/language_tools");
        const beautify = ace.require("ace/ext/beautify");
        ace.require("ace/ext/settings_menu").init();

        editor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true
        });

        welcomeSession = new ace.EditSession("Welcome to your GOGIES{IDE}!\n\nSelect a file from the workspace to begin editing.");
        welcomeSession.setMode("ace/mode/text");
        welcomeSession.setUseWrapMode(true);

        editor.commands.addCommand({
            name: 'save',
            bindKey: {win: 'Ctrl-S', mac: 'Command-S'},
            exec: function(editor) {
                saveCurrentFile();
            }
        });

        editor.commands.addCommand({
            name: "beautify",
            bindKey: {win: "Ctrl-Shift-F", mac: "Command-Shift-F"},
            exec: function(editor) {
                beautify.beautify(editor.session);
            }
        });
    }

    // --- Settings Persistence ---
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    async function loadIdeSettings() {
        try {
            const response = await fetch(`${App.url}/api.php?action=get_settings`);
            if (!response.ok) {
                console.warn(`Could not load IDE settings: ${response.statusText}`);
                return;
            }
            const settings = await response.json();
            if (settings && typeof settings === 'object' && Object.keys(settings).length > 0) {
                ideSettings = settings;
                editor.setOptions(ideSettings);
            }
        } catch (error) {
            console.warn('Could not load IDE settings.', error);
        }
    }

    const saveCurrentSettings = debounce(async () => {
        try {
            const formData = new FormData();
            formData.append('action', 'save_settings');
            formData.append('settings', JSON.stringify(ideSettings));
            await postRequest(formData);
            // Settings are saved silently on success to avoid being too noisy.
            ToastManager.show('IDE settings saved.', 'success', 2000);
        } catch (error) {
            console.error('Failed to save IDE settings:', error);
            ToastManager.show(`Failed to save settings: ${error.message}`, 'error');
        }
    }, 1000);

    // --- Core Application Logic ---

    async function saveCurrentFile() {
        if (!TabManager.activeTabPath || !TabManager.openTabs.has(TabManager.activeTabPath) || TabManager.activeTabPath === '[Error Log]') return;
        
        const tabData = TabManager.openTabs.get(TabManager.activeTabPath);
        if (!tabData.isDirty) return;

        const content = tabData.session.getValue();
        const formData = new FormData();
        formData.append('action', 'save_file_content');
        formData.append('path', TabManager.activeTabPath);
        formData.append('content', content);

        try {
            LoadingIndicator.show();
            await postRequest(formData);
            tabData.isDirty = false;
            TabManager.updateFileStatus();
            ToastManager.show(`<strong>${TabManager.activeTabPath.split('/').pop()}</strong> saved successfully.`, 'success');
        } catch (error) {
            ToastManager.show(`Failed to save file: ${error.message}`, 'error');
        } finally {
            LoadingIndicator.hide();
        }
    }    

    async function reloadCurrentFile() {
        if (!TabManager.activeTabPath || !TabManager.openTabs.has(TabManager.activeTabPath) || TabManager.activeTabPath === '[Error Log]') return;

        const tabData = TabManager.openTabs.get(TabManager.activeTabPath);

        const doReload = async () => {
            // This is the key change. Instead of removing and re-opening, we just reload the content.
            // This preserves tab order and active state.
            await TabManager.reloadFile(TabManager.activeTabPath);
        };

        if (tabData.isDirty) {
            ModalManager.showConfirm(
                'Reload File',
                `Are you sure you want to reload <strong>${TabManager.activeTabPath.split('/').pop()}</strong>? All unsaved changes will be lost.`,
                doReload
            );
        } else {
            await doReload();
        }
    }

    // --- Event Listeners ---

    // Attach event listeners for actions that remain global
    saveFileBtn.addEventListener('click', saveCurrentFile);
    reloadFileBtn.addEventListener('click', reloadCurrentFile);
    settingsMenuBtn.addEventListener('click', () => editor.showSettingsMenu());

    // Dynamic Admin Panel Modal Loader
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) {
        adminBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const { AdminManager } = await import('./adminManager.js');
            AdminManager.show();
        });
    }

    // Dynamic Database Explorer Panel Loader
    const dbBtn = document.getElementById('db-btn');
    if (dbBtn) {
        dbBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Lazy load the stylesheet if not already loaded
            if (!document.getElementById('db-manager-style')) {
                const link = document.createElement('link');
                link.id = 'db-manager-style';
                link.rel = 'stylesheet';
                link.href = `${App.url}/db-manager/db-styles.css?v=${Date.now()}`;
                document.head.appendChild(link);
            }
            // Lazy load the dynamic ES6 module with absolute path
            const { DBManager } = await import(`${App.url}/db-manager/dbManager.js?v=${Date.now()}`);
            DBManager.show();
        });
    }

    // Workspace Header Dropdown Actions
    const wsNewFileBtn = document.getElementById('ws-new-file');
    const wsNewDirBtn = document.getElementById('ws-new-dir');
    const wsRefreshBtn = document.getElementById('ws-refresh');

    if (wsNewFileBtn) {
        wsNewFileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const manager = window.FileTreeManager || FileTreeManager;
            manager.newFileRoot();
        });
    }
    if (wsNewDirBtn) {
        wsNewDirBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const manager = window.FileTreeManager || FileTreeManager;
            manager.newDirRoot();
        });
    }
    if (wsRefreshBtn) {
        wsRefreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const manager = window.FileTreeManager || FileTreeManager;
            manager.refresh();
        });
    }

    function cleanPhpError(responseText) {
        let errorMessage = 'An unexpected server error occurred.';
        const match = responseText.match(/<b>(Fatal error|Warning|Parse error)<\/b>:(.*?)in/i);
        if (match) {
            errorMessage = `${match[1]}:${match[2]}`.replace(/<[^>]*>/g, '').trim();
        } else {
            const cleanText = responseText.replace(/<[^>]*>/g, '').trim();
            if (cleanText.length > 0) {
                errorMessage = cleanText.substring(0, 300) + (cleanText.length > 300 ? '...' : '');
            }
        }
        return errorMessage;
    }

    async function loadBackupsList() {
        const tbody = document.getElementById('backup-list-tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted"><div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>Loading existing backups...</td></tr>';
        
        try {
            const response = await fetch(`${App.url}/api.php?action=list_backups`);
            const text = await response.text();
            let result;
            try {
                result = JSON.parse(text);
            } catch(e) {
                throw new Error(cleanPhpError(text));
            }
            
            if (result.status === 'success') {
                tbody.innerHTML = '';
                if (result.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No backups found for this workspace.</td></tr>';
                    return;
                }
                
                result.data.forEach(backup => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="text-info font-monospace small" style="word-break: break-all;">${backup.filename}</td>
                        <td class="small">${backup.createdAt}</td>
                        <td class="small">${backup.size}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-primary btn-restore me-2" data-filename="${backup.filename}">
                                <i class="bi bi-arrow-counterclockwise"></i> Restore
                            </button>
                            <button class="btn btn-sm btn-danger btn-delete" data-filename="${backup.filename}">
                                <i class="bi bi-trash"></i> Delete
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
                
                bindBackupActions();
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to load backups: ${result.message}</td></tr>`;
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error: ${err.message}</td></tr>`;
        }
    }

    function bindBackupActions() {
        document.querySelectorAll('.btn-restore').forEach(btn => {
            btn.onclick = async () => {
                const filename = btn.getAttribute('data-filename');
                if (!confirm(`WARNING: Are you sure you want to restore the workspace to backup snapshot "${filename}"?\n\nThis will completely OVERWRITE your current source code and database connections to this backup state!`)) {
                    return;
                }
                
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Restoring...';
                
                try {
                    LoadingIndicator.show();
                    ToastManager.show('Restoring backup snapshot...', 'info');
                    
                    const formData = new FormData();
                    formData.append('filename', filename);
                    
                    const response = await fetch(`${App.url}/api.php?action=restore_backup`, {
                        method: 'POST',
                        body: formData
                    });
                    const text = await response.text();
                    let result;
                    try {
                        result = JSON.parse(text);
                    } catch(e) {
                        throw new Error(cleanPhpError(text));
                    }
                    
                    if (result.status === 'success') {
                        ToastManager.show(result.message, 'success');
                        const manager = window.FileTreeManager || FileTreeManager;
                        if (manager && typeof manager.refresh === 'function') {
                            manager.refresh();
                        }
                    } else {
                        ToastManager.show(result.message || 'Restore failed.', 'error');
                    }
                } catch (err) {
                    ToastManager.show(err.message, 'error');
                } finally {
                    LoadingIndicator.hide();
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Restore';
                }
            };
        });
        
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = async () => {
                const filename = btn.getAttribute('data-filename');
                if (!confirm(`Are you sure you want to permanently delete the backup "${filename}"?`)) {
                    return;
                }
                
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>...';
                
                try {
                    const formData = new FormData();
                    formData.append('filename', filename);
                    
                    const response = await fetch(`${App.url}/api.php?action=delete_backup`, {
                        method: 'POST',
                        body: formData
                    });
                    const text = await response.text();
                    let result;
                    try {
                        result = JSON.parse(text);
                    } catch(e) {
                        throw new Error(cleanPhpError(text));
                    }
                    
                    if (result.status === 'success') {
                        ToastManager.show(result.message, 'success');
                        loadBackupsList();
                    } else {
                        ToastManager.show(result.message || 'Delete failed.', 'error');
                    }
                } catch (err) {
                    ToastManager.show(err.message, 'error');
                }
            };
        });
    }

    const wsBackupBtn = document.getElementById('ws-backup');
    if (wsBackupBtn) {
        wsBackupBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (wsBackupBtn.classList.contains('disabled')) return;
            
            wsBackupBtn.classList.add('disabled');
            const originalHTML = wsBackupBtn.innerHTML;
            wsBackupBtn.innerHTML = '<span class="spinner-border spinner-border-sm text-success me-2" role="status"></span> Backing up...';
            
            try {
                LoadingIndicator.show();
                ToastManager.show('Generating full workspace & database backup...', 'info');
                const response = await fetch(`${App.url}/api.php?action=backup_workspace`);
                const text = await response.text();
                let result;
                try {
                    result = JSON.parse(text);
                } catch(e) {
                    throw new Error(cleanPhpError(text));
                }
                
                if (result.status === 'success') {
                    ToastManager.show(result.message, 'success');
                    // Refresh current backup list table in background if modal is open
                    const modalEl = document.getElementById('backupModal');
                    if (modalEl && modalEl.classList.contains('show')) {
                        loadBackupsList();
                    }
                } else {
                    ToastManager.show(result.message || 'Backup generation failed.', 'error');
                }
            } catch (err) {
                ToastManager.show(err.message, 'error');
            } finally {
                LoadingIndicator.hide();
                wsBackupBtn.classList.remove('disabled');
                wsBackupBtn.innerHTML = originalHTML;
            }
        });
    }

    const wsRestoreMgrBtn = document.getElementById('ws-restore-mgr');
    if (wsRestoreMgrBtn) {
        wsRestoreMgrBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalEl = document.getElementById('backupModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                modal.show();
                loadBackupsList();
            }
        });
    }

    // Initial load
    initializeEditor();
    ModalManager.init();
    ToastManager.init();
    LoadingIndicator.init();
    await loadIdeSettings();

    // --- Settings Persistence Trigger ---
    // We monkey-patch the OptionPanel's setOption method. This is more reliable
    // than listening to the editor's "setOption" event, which was not firing
    // when expected. This ensures that any change made in the settings menu
    // triggers our save logic.
    const OptionPanel = ace.require("ace/ext/options").OptionPanel;
    if (OptionPanel) {
        const originalSetOption = OptionPanel.prototype.setOption;
        OptionPanel.prototype.setOption = function(option, value) {
            // Call the original function first to let Ace update the editor
            originalSetOption.call(this, option, value);

            // Now, trigger our save logic. 'this' is the OptionPanel instance.
            const editorInstance = this.editor;
            const optionName = typeof option == "string" ? option : option.path;

            // Check if it's a valid, known option before saving
            if (optionName && editorInstance && editorInstance.$options[optionName]) {
                ideSettings[optionName] = editorInstance.getOption(optionName);
                saveCurrentSettings();
            }
        }
    }

    await FileTreeManager.init();
    await TabManager.init(editor, welcomeSession);

    // A final, explicit update after everything is loaded and rendered.
    TabManager.updateTabScrollers();
    window.addEventListener('load', () => TabManager.updateTabScrollers());
});
