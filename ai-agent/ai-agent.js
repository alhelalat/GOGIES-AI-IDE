import { ToastManager } from '../assets/js/toastManager.js';
import { TabManager } from '../assets/js/tabManager.js';
import AceDiff from 'https://cdn.jsdelivr.net/npm/ace-diff/+esm';

/**
 * AI Agent Resizable Panel and Unlimited Models Settings Integration
 */
document.addEventListener('DOMContentLoaded', () => {
    const aiPanel = document.getElementById('ai-panel');

    // Restore saved width if present
    const savedWidth = localStorage.getItem('ai_panel_width');
    if (savedWidth && aiPanel) {
        aiPanel.style.width = `${savedWidth}px`;
    }

    const resizeHandle = document.getElementById('ai-resize-handle');
    const aiInput = document.getElementById('ai-input');
    const toggleBtn = document.getElementById('ai-toggle-btn');
    const hideBtn = document.getElementById('ai-hide-btn');
    const deleteBtn = document.getElementById('ai-delete-btn');
    const historyBtn = document.getElementById('ai-history-btn');
    const newChatBtn = document.getElementById('ai-new-chat-btn');
    const messagesContainer = document.getElementById('ai-messages');
    const modelSelect = document.getElementById('ai-model-select');
    const approvalSelect = document.getElementById('ai-approval-select');
    const autoscrollCheckbox = document.getElementById('ai-autoscroll-checkbox');
    const settingsForm = document.getElementById('ai-settings-form');
    const addModelBtn = document.getElementById('ai-add-model-btn');
    const modelsContainer = document.getElementById('ai-models-container');

    let activeAbortController = null;

    function setAgentThinkingState(isThinking) {
        const sendBtn = document.getElementById('ai-send-btn');
        const stopBtn = document.getElementById('ai-stop-btn');
        const inputField = document.getElementById('ai-input');

        if (inputField) {
            inputField.disabled = isThinking;
            inputField.placeholder = isThinking ? 'AI is working...' : 'Ask anything...';
            if (!isThinking) {
                setTimeout(() => inputField.focus(), 100);
            }
        }

        if (isThinking) {
            if (sendBtn) sendBtn.classList.add('d-none');
            if (stopBtn) stopBtn.classList.remove('d-none');
        } else {
            if (sendBtn) sendBtn.classList.remove('d-none');
            if (stopBtn) stopBtn.classList.add('d-none');
        }
    }

    if (!aiPanel || !resizeHandle) return;

    // Initialize AI proposed file mock system
    window.aiProposedFiles = new Map();
    window.aiProposedFilesOriginals = new Map();

    // --- Premium Chat History Manager (User & Workspace Server-Backed Engine) ---
    let currentChatSessionId = localStorage.getItem('ai_current_chat_session_id') || null;
    let cachedHistory = {
        sessions: [],
        selected_model: 'auto',
        selected_approval_mode: 'ask'
    };

    function getChatSessions() {
        return cachedHistory.sessions;
    }

    function saveChatSessions(sessions) {
        if (sessions.length > 10) {
            sessions = sessions.slice(0, 10);
        }
        cachedHistory.sessions = sessions;
        saveHistoryToServer();
    }

    let saveHistoryTimeout = null;
    function saveHistoryToServer() {
        clearTimeout(saveHistoryTimeout);
        saveHistoryTimeout = setTimeout(async () => {
            try {
                cachedHistory.selected_model = modelSelect ? modelSelect.value : 'auto';
                cachedHistory.selected_approval_mode = approvalSelect ? approvalSelect.value : 'ask';

                // Hot backup locally
                localStorage.setItem('ai_chat_sessions', JSON.stringify(cachedHistory.sessions));
                localStorage.setItem('ai_current_chat_session_id', currentChatSessionId);

                await fetch('ai-agent/agent-api.php?action=save_history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cachedHistory)
                });
            } catch (err) {
                console.error('Failed to save chat history to server:', err);
            }
        }, 500);
    }

    async function loadChatHistoryFromServer() {
        try {
            const response = await fetch('ai-agent/agent-api.php?action=get_history');
            if (response.ok) {
                const data = await response.json();
                cachedHistory = {
                    sessions: data.sessions || [],
                    selected_model: data.selected_model || 'auto',
                    selected_approval_mode: data.selected_approval_mode || 'ask'
                };

                // Restore selections
                if (modelSelect) {
                    modelSelect.value = cachedHistory.selected_model;
                }
                if (approvalSelect) {
                    approvalSelect.value = cachedHistory.selected_approval_mode;
                }

                // Restore active chat session
                if (currentChatSessionId && cachedHistory.sessions.some(s => s.id === currentChatSessionId)) {
                    loadChatSession(currentChatSessionId);
                } else if (cachedHistory.sessions.length > 0) {
                    loadChatSession(cachedHistory.sessions[0].id);
                } else {
                    startNewChatSession();
                }
            }
        } catch (err) {
            console.error('Failed to load chat history from server:', err);
            // Fallback to local storage
            cachedHistory.sessions = JSON.parse(localStorage.getItem('ai_chat_sessions') || '[]');
            startNewChatSession();
        }
    }

    function saveCurrentChatToHistory() {
        if (!messagesContainer) return;
        const bubbles = document.querySelectorAll('.ai-message');
        const messageList = [];

        bubbles.forEach(bubble => {
            const isUser = bubble.classList.contains('user');
            const isAgent = bubble.classList.contains('agent');
            const isSystem = bubble.classList.contains('system');

            let role = 'assistant';
            if (isUser) role = 'user';
            else if (isSystem) role = 'system';

            // Clone the bubble to strip heavy elements before saving
            const clone = bubble.cloneNode(true);
            clone.querySelectorAll('.acediff-container').forEach(el => el.innerHTML = '');
            clone.querySelectorAll('.ai-mini-terminal .ai-terminal-body').forEach(el => {
                if (el.textContent.length > 500) {
                    el.textContent = el.textContent.substring(0, 500) + '\n... [output truncated]';
                }
            });

            messageList.push({ role, content: clone.innerHTML });
        });

        if (messageList.length === 0) return;

        let sessions = getChatSessions();
        if (!currentChatSessionId) {
            currentChatSessionId = 'chat_' + Date.now();
            localStorage.setItem('ai_current_chat_session_id', currentChatSessionId);
        }

        let session = sessions.find(s => s.id === currentChatSessionId);
        const firstUserMsg = messageList.find(m => m.role === 'user');
        let title = 'New Chat Session';
        if (firstUserMsg) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = firstUserMsg.content;
            const plainText = tempDiv.textContent || tempDiv.innerText || '';
            title = plainText.substring(0, 30) + (plainText.length > 30 ? '...' : '');
        }

        if (!session) {
            session = {
                id: currentChatSessionId,
                title: title,
                timestamp: Date.now(),
                messages: []
            };
            sessions.unshift(session);
        } else if (session.title === 'New Chat Session' && title !== 'New Chat Session') {
            session.title = title;
        }

        session.messages = messageList;
        session.timestamp = Date.now();

        sessions.sort((a, b) => b.timestamp - a.timestamp);
        saveChatSessions(sessions);
    }

    function startNewChatSession() {
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
        setAgentThinkingState(false);

        window.aiProposedFiles.clear();
        window.aiProposedFilesOriginals.clear();

        currentChatSessionId = 'chat_' + Date.now();
        localStorage.setItem('ai_current_chat_session_id', currentChatSessionId);

        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="ai-message system">
                    Hello! I am your AI Assistant. How can I help you today?
                </div>
            `;
        }
        saveCurrentChatToHistory();
    }

    function loadChatSession(id) {
        const sessions = getChatSessions();
        const session = sessions.find(s => s.id === id);
        if (!session) return;

        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
        setAgentThinkingState(false);

        window.aiProposedFiles.clear();
        window.aiProposedFilesOriginals.clear();

        currentChatSessionId = id;
        localStorage.setItem('ai_current_chat_session_id', currentChatSessionId);

        if (messagesContainer) {
            // Temporarily disable the observer so it doesn't double-save during load
            if (chatObserver) chatObserver.disconnect();

            messagesContainer.innerHTML = '';
            session.messages.forEach(msg => {
                const bubble = document.createElement('div');
                bubble.className = `ai-message ${msg.role}`;
                bubble.innerHTML = msg.content;
                messagesContainer.appendChild(bubble);
            });

            // Re-observe
            if (chatObserver) {
                chatObserver.observe(messagesContainer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }
        }

        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    function deleteCurrentChatSession() {
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
        setAgentThinkingState(false);

        window.aiProposedFiles.clear();
        window.aiProposedFilesOriginals.clear();

        if (currentChatSessionId) {
            let sessions = getChatSessions();
            sessions = sessions.filter(s => s.id !== currentChatSessionId);
            saveChatSessions(sessions);
        }

        currentChatSessionId = 'chat_' + Date.now();
        localStorage.setItem('ai_current_chat_session_id', currentChatSessionId);

        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="ai-message system">
                    Hello! I am your AI Assistant. How can I help you today?
                </div>
            `;
        }

        saveCurrentChatToHistory();
        ToastManager.show('Chat and session context cleared successfully.', 'success', 2000);
    }

    function showChatHistoryModal() {
        const sessions = getChatSessions();

        const existing = document.getElementById('ai-history-modal');
        if (existing) existing.remove();

        let listHtml = '';
        if (sessions.length === 0) {
            listHtml = '<div class="text-center  p-4">📭 No chat history found yet. Start messaging to build history!</div>';
        } else {
            sessions.forEach(s => {
                const isCurrent = String(s.id).trim() == String(currentChatSessionId).trim();
                const formattedDate = new Date(s.timestamp).toLocaleString();
                listHtml += `
                    <div class="d-flex align-items-center justify-content-between p-3 border-bottom border-secondary rounded mb-2 ${isCurrent ? 'bg-primary bg-opacity-25' : 'bg-dark bg-opacity-50'}" style="border: 1px solid #1a2f4c !important;">
                        <div class="cursor-pointer flex-grow-1 me-3" style="min-width: 0;" onclick="window.aiLoadChatSession('${s.id}')">
                            <h6 class="text-white text-truncate mb-1" style="font-size: 13px;">${s.title} ${isCurrent ? '<span class="text-success ms-2 font-monospace" style="font-size: 11px;">(Active Chat)</span>' : ''}</h6>
                            <span class="text-info small" style="font-size: 11px;"><i class="bi bi-calendar3 me-1"></i> ${formattedDate}</span>
                        </div>
                        ${isCurrent ? '' : `
                        <button class="btn btn-link text-danger p-0 ms-2" onclick="window.aiDeleteChatSessionFromList('${s.id}', event)" title="Delete session">
                            <i class="bi bi-trash"></i>
                        </button>
                        `}
                    </div>
                `;
            });
        }

        const modalEl = document.createElement('div');
        modalEl.id = 'ai-history-modal';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered text-light" style="max-width: 500px;">
                <div class="modal-content border border-secondary" style="background-color: #071322 !important; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
                    <div class="modal-header border-bottom border-secondary py-3">
                        <h5 class="modal-title d-flex align-items-center text-white" style="font-size: 16px;">
                            <i class="bi bi-clock-history text-primary me-2"></i> Chat History
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body" style="max-height: 400px; overflow-y: auto; padding: 15px;">
                        ${listHtml}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);

        window.aiLoadChatSession = (id) => {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadChatSession(id);
            ToastManager.show('Loaded chat session.', 'success', 2000);
        };

        window.aiDeleteChatSessionFromList = (id, event) => {
            event.stopPropagation();
            let currentSessions = getChatSessions();
            currentSessions = currentSessions.filter(s => s.id !== id);
            saveChatSessions(currentSessions);

            if (id === currentChatSessionId) {
                deleteCurrentChatSession();
            } else {
                ToastManager.show('Deleted chat history session.', 'success', 2000);
            }
            showChatHistoryModal();
        };

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }

    // Setup automated MutationObserver to auto-persist conversation states dynamically
    let chatObserver = null;
    if (messagesContainer) {
        let observerTimeout = null;
        chatObserver = new MutationObserver(() => {
            clearTimeout(observerTimeout);
            observerTimeout = setTimeout(() => {
                const bubbles = document.querySelectorAll('.ai-message');
                if (bubbles.length > 0) {
                    saveCurrentChatToHistory();
                }
            }, 500);
        });

        chatObserver.observe(messagesContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // Helper to compute line differences using dynamic programming (LCS) with prefix/suffix trimming
    function computeLineDiff(original, modified) {
        const origLines = (original || '').split('\n');
        const modLines = (modified || '').split('\n');

        const addedLines = new Set();
        const removedPositions = new Set();

        const N = origLines.length;
        const M = modLines.length;

        // Common prefix
        let prefix = 0;
        while (prefix < N && prefix < M && origLines[prefix] === modLines[prefix]) {
            prefix++;
        }

        // Common suffix
        let suffix = 0;
        while (suffix < N - prefix && suffix < M - prefix && origLines[N - 1 - suffix] === modLines[M - 1 - suffix]) {
            suffix++;
        }

        // Now diff the middle part
        const origMiddle = origLines.slice(prefix, N - suffix);
        const modMiddle = modLines.slice(prefix, M - suffix);

        // If the middle parts are extremely large, fall back to avoid locking the UI/RAM
        const maxLen = 1000;
        if (origMiddle.length > maxLen || modMiddle.length > maxLen) {
            for (let j = 0; j < modMiddle.length; j++) {
                addedLines.add(prefix + j);
            }
            for (let i = 0; i < origMiddle.length; i++) {
                removedPositions.add(prefix + Math.min(i, modMiddle.length));
            }
            return { addedLines, removedPositions };
        }

        const dN = origMiddle.length;
        const dM = modMiddle.length;

        if (dN === 0) {
            for (let j = 0; j < dM; j++) {
                addedLines.add(prefix + j);
            }
            return { addedLines, removedPositions };
        }
        if (dM === 0) {
            for (let i = 0; i < dN; i++) {
                removedPositions.add(prefix);
            }
            return { addedLines, removedPositions };
        }

        // Safe DP on small slice
        const dp = Array(dN + 1).fill(null).map(() => Array(dM + 1).fill(0));

        for (let i = 1; i <= dN; i++) {
            for (let j = 1; j <= dM; j++) {
                if (origMiddle[i - 1] === modMiddle[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        let i = dN;
        let j = dM;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && origMiddle[i - 1] === modMiddle[j - 1]) {
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                addedLines.add(prefix + j - 1);
                j--;
            } else {
                removedPositions.add(prefix + j);
                i--;
            }
        }

        return { addedLines, removedPositions };
    }

    if (typeof TabManager !== 'undefined') {
        const originalOpenFile = TabManager.openFile;
        TabManager.openFile = async function (path, activate = true) {
            // If it's a proposed draft file, mock content fetching to avoid network errors
            if (window.aiProposedFiles && window.aiProposedFiles.has(path)) {
                let tabData = this.openTabs.get(path);
                if (!tabData) {
                    const tabEl = this.createTabElement(path);
                    tabData = { tabElement: tabEl, isDirty: false, session: null, isReadOnly: false };
                    this.openTabs.set(path, tabData);
                    this.saveOpenTabsToStorage();
                }

                if (activate) this.setActiveTab(path);

                try {
                    const content = window.aiProposedFiles.get(path);
                    let mode = 'ace/mode/text';
                    try {
                        const modelist = ace.require("ace/ext/modelist");
                        if (modelist) {
                            mode = modelist.getModeForPath(path).mode;
                        }
                    } catch (e) {
                        console.warn('Failed to load modelist:', e);
                    }

                    const session = new ace.EditSession(content);
                    session.setMode(mode);
                    session.setUseWrapMode(true);

                    // Add visual diff markers if we have original content
                    let originalContent = '';
                    if (window.aiProposedFilesOriginals && window.aiProposedFilesOriginals.has(path)) {
                        originalContent = window.aiProposedFilesOriginals.get(path);
                    }

                    if (originalContent) {
                        try {
                            const { addedLines, removedPositions } = computeLineDiff(originalContent, content);
                            const Range = ace.require("ace/range").Range;

                            addedLines.forEach(lineNum => {
                                session.addMarker(new Range(lineNum, 0, lineNum, 1), "ace-proposed-added-line", "fullLine");
                                session.addGutterDecoration(lineNum, "ace-proposed-added-gutter");
                            });

                            removedPositions.forEach(lineNum => {
                                const targetLine = Math.min(lineNum, content.split('\n').length - 1);
                                session.addGutterDecoration(targetLine, "ace-proposed-removed-gutter");
                            });
                        } catch (diffErr) {
                            console.error('Failed to compute and add editor diff markers:', diffErr);
                        }
                    }

                    tabData.session = session;
                    tabData.isReadOnly = false;

                    session.on('change', () => {
                        if (!tabData.isDirty) {
                            tabData.isDirty = true;
                            this.updateFileStatus();
                        }
                    });

                    if (this.activeTabPath === path) {
                        this.editor.setSession(session);
                        this.editor.setReadOnly(false);
                        if (this.saveFileBtn) this.saveFileBtn.style.display = 'block';
                    }
                } catch (error) {
                    console.error(`Failed to mock load content for ${path}:`, error);
                    this.removeTab(path);
                }
                return;
            }

            // Otherwise, delegate to the original openFile method
            return originalOpenFile.call(this, path, activate);
        };
    }

    // Cache of configured models
    let configuredModels = [];

    // --- Panel Drag Resizing Logic ---
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(document.defaultView.getComputedStyle(aiPanel).width, 10);
        resizeHandle.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        aiPanel.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const newWidth = startWidth - dx;
        const minWidth = 200;
        const maxWidth = 600;

        if (newWidth >= minWidth && newWidth <= maxWidth) {
            aiPanel.style.width = `${newWidth}px`;
            window.dispatchEvent(new Event('resize'));
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        resizeHandle.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        aiPanel.style.transition = '';

        // Persist the final resized width
        const currentWidth = parseInt(aiPanel.style.width, 10);
        if (!isNaN(currentWidth)) {
            localStorage.setItem('ai_panel_width', currentWidth);
        }
    });

    // --- Hide & Toggle Event Listeners ---
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (aiPanel.style.display === 'none') {
                aiPanel.style.display = 'flex';
                window.dispatchEvent(new Event('resize'));
            } else {
                aiPanel.style.display = 'none';
                window.dispatchEvent(new Event('resize'));
            }
        });
    }

    if (hideBtn) {
        hideBtn.addEventListener('click', (e) => {
            e.preventDefault();
            aiPanel.style.display = 'none';
            window.dispatchEvent(new Event('resize'));
        });
    }

    // --- New Chat Event Listener ---
    if (newChatBtn && messagesContainer) {
        newChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            startNewChatSession();
            ToastManager.show('Started a new chat session.', 'success', 2000);
        });
    }

    // --- Clear Chat / Delete Event Listener ---
    if (deleteBtn && messagesContainer) {
        deleteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const { ModalManager } = await import('../assets/js/modals.js');
                ModalManager.showConfirm(
                    'Clear Chat & Context',
                    'Are you sure you want to delete this chat session? This will abort any running agent, wipe all unapproved mock edits, and clear the conversation context.',
                    () => {
                        deleteCurrentChatSession();
                    }
                );
            } catch (err) {
                if (confirm('Are you sure you want to delete this chat and clear its context?')) {
                    deleteCurrentChatSession();
                }
            }
        });
    }

    // --- Chat History Event Listener ---
    if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showChatHistoryModal();
        });
    }

    // --- Basic UI Textarea Auto-Grow Logic ---
    if (aiInput) {
        aiInput.addEventListener('input', () => {
            aiInput.style.height = 'auto';
            aiInput.style.height = `${Math.min(aiInput.scrollHeight, 120)}px`;
        });
    }

    // --- Dynamic Model Selection Dropdown Rebuilder ---
    function updateModelSelect(settings) {
        if (!modelSelect) return;
        const currentValue = modelSelect.value;
        modelSelect.innerHTML = `<option value="auto">✨ Auto</option>`;

        const providerIcons = {
            local: '💻',
            openai: '🧠',
            anthropic: '🦉',
            gemini: '✨'
        };

        if (Array.isArray(settings)) {
            settings.forEach(model => {
                if (model.name && model.model) {
                    const opt = document.createElement('option');
                    opt.value = model.id;
                    const icon = providerIcons[model.provider] || '🤖';
                    opt.textContent = `${icon} ${model.name}`;
                    modelSelect.appendChild(opt);
                }
            });
        }

        if (currentValue) {
            modelSelect.value = currentValue;
        }
    }

    // --- Create Custom Model Card DOM ---
    function createModelCard(modelData = null) {
        if (!modelsContainer) return;

        const data = modelData || {
            id: 'model_' + Date.now() + Math.random().toString(36).substr(2, 5),
            name: '',
            provider: 'openai',
            model: '',
            url: '',
            key: '',
            thinking: false
        };

        const card = document.createElement('div');
        card.className = 'ai-model-card';
        card.dataset.id = data.id;

        card.innerHTML = `
            <button type="button" class="btn-close btn-close-white btn-sm position-absolute top-0 end-0 m-2 ai-delete-model-card-btn" aria-label="Delete"></button>
            
            <div class="row g-2 mb-2">
                <div class="col-6">
                    <label class="form-label text-white-50 small mb-1">Friendly Name / Label</label>
                    <input type="text" class="form-control form-control-sm bg-dark text-white border-secondary ai-card-name" placeholder="e.g. My OpenAI" value="${data.name || ''}" required>
                </div>
                <div class="col-6">
                    <label class="form-label text-white-50 small mb-1">Provider</label>
                    <select class="form-select form-select-sm bg-dark text-white border-secondary ai-card-provider">
                        <option value="local" ${data.provider === 'local' ? 'selected' : ''}>💻 Local AI</option>
                        <option value="openai" ${data.provider === 'openai' ? 'selected' : ''}>🧠 OpenAI</option>
                        <option value="anthropic" ${data.provider === 'anthropic' ? 'selected' : ''}>🦉 Anthropic</option>
                        <option value="gemini" ${data.provider === 'gemini' ? 'selected' : ''}>✨ Gemini</option>
                    </select>
                </div>
            </div>
            
            <div class="row g-2 mb-2 align-items-end">
                <div class="col-8">
                    <label class="form-label text-white-50 small mb-1">Model ID</label>
                    <input type="text" class="form-control form-control-sm bg-dark text-white border-secondary ai-card-model" placeholder="e.g. gpt-4o" value="${data.model || ''}" required>
                </div>
                <div class="col-4 pb-2">
                    <div class="form-check form-switch m-0">
                        <input class="form-check-input ai-card-thinking" type="checkbox" ${data.thinking ? 'checked' : ''}>
                        <label class="form-check-label text-white-50 small">Reasoning</label>
                    </div>
                </div>
            </div>
            
            <div class="row g-2 mb-2">
                <div class="col-6">
                    <label class="form-label text-white-50 small mb-1">Base URL (Optional)</label>
                    <input type="text" class="form-control form-control-sm bg-dark text-white border-secondary ai-card-url" placeholder="e.g. https://api.openai.com/v1" value="${data.url || ''}">
                </div>
                <div class="col-6">
                    <label class="form-label text-white-50 small mb-1">API Key</label>
                    <input type="password" class="form-control form-control-sm bg-dark text-white border-secondary ai-card-key" placeholder="API Key" value="${data.key || ''}">
                </div>
            </div>
        `;

        // Bind delete action
        const deleteBtn = card.querySelector('.ai-delete-model-card-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                card.remove();
            });
        }

        modelsContainer.appendChild(card);
        modelsContainer.scrollTop = modelsContainer.scrollHeight;
    }

    // --- Add Model Button Trigger ---
    if (addModelBtn) {
        addModelBtn.addEventListener('click', () => {
            createModelCard();
        });
    }

    // --- Load AI Settings ---
    function loadSettings() {
        return fetch('ai-agent/agent-api.php?action=get_settings')
            .then(res => {
                if (!res.ok) throw new Error('HTTP error ' + res.status);
                return res.json();
            })
            .then(data => {
                if (!modelsContainer) return;
                modelsContainer.innerHTML = '';

                // If no configurations exist, supply premium preset templates
                if (!Array.isArray(data) || data.length === 0) {
                    configuredModels = [
                        { id: 'tpl_local', name: 'Local Ollama', provider: 'local', model: 'qwen2.5-coder:7b', url: 'http://localhost:11434/v1', key: '', thinking: false },
                        { id: 'tpl_openai', name: 'OpenAI GPT-4o', provider: 'openai', model: 'gpt-4o', url: 'https://api.openai.com/v1', key: '', thinking: false }
                    ];
                } else {
                    configuredModels = data;
                }

                // Render each card in the drawer
                configuredModels.forEach(model => createModelCard(model));

                // Rebuild active selection select
                updateModelSelect(configuredModels);
            })
            .catch(err => {
                console.error('Failed to load AI settings:', err);
                updateModelSelect(configuredModels);
            });
    }

    // --- Save AI Settings ---
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const cards = document.querySelectorAll('.ai-model-card');
            const settingsArray = [];

            cards.forEach(card => {
                const nameVal = card.querySelector('.ai-card-name').value.trim();
                const providerVal = card.querySelector('.ai-card-provider').value;
                const modelVal = card.querySelector('.ai-card-model').value.trim();
                const urlVal = card.querySelector('.ai-card-url').value.trim();
                const keyVal = card.querySelector('.ai-card-key').value.trim();
                const thinkingCheck = card.querySelector('.ai-card-thinking').checked;

                if (nameVal && modelVal) {
                    settingsArray.push({
                        id: card.dataset.id,
                        name: nameVal,
                        provider: providerVal,
                        model: modelVal,
                        url: urlVal,
                        key: keyVal,
                        thinking: thinkingCheck
                    });
                }
            });

            fetch('ai-agent/agent-api.php?action=save_settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settingsArray)
            })
                .then(res => {
                    if (!res.ok) throw new Error('HTTP error ' + res.status);
                    return res.json();
                })
                .then(data => {
                    if (data.status === 'success') {
                        configuredModels = settingsArray;
                        updateModelSelect(configuredModels);

                        // Close offcanvas using Bootstrap API
                        const offcanvasEl = document.getElementById('ai-settings-offcanvas');
                        if (offcanvasEl) {
                            const offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl) || new bootstrap.Offcanvas(offcanvasEl);
                            offcanvas.hide();
                        }

                        ToastManager.show('All AI model configurations saved.', 'success', 2000);
                    } else {
                        throw new Error(data.message || 'Failed to save configurations');
                    }
                })
                .catch(err => {
                    console.error('Failed to save AI settings:', err);
                    ToastManager.show('Error saving settings: ' + err.message, 'error', 3000);
                });
        });
    }

    // --- Message Rendering Helper ---
    function appendMessage(content, sender = 'agent') {
        if (!messagesContainer) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-message ${sender}`;

        // Suppress HTML injection for user messages, allow markdown rendering for agent
        if (sender === 'user') {
            msgDiv.textContent = content;
        } else {
            msgDiv.innerHTML = content;
        }

        messagesContainer.appendChild(msgDiv);

        if (autoscrollCheckbox && autoscrollCheckbox.checked) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        return msgDiv;
    }

    // --- Dynamic AceDiff side-by-side editor renderer ---
    function renderAceDiffCard(path, originalContent, newContent) {
        if (!messagesContainer) return null;

        const containerId = 'diff_' + Date.now() + Math.random().toString(36).substr(2, 5);
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-acediff-wrapper';
        wrapper.style.height = '220px';

        wrapper.innerHTML = `
            <div class="ai-acediff-header px-3 py-1-5 d-flex justify-content-between align-items-center">
                <span><i class="bi bi-file-earmark-diff-fill text-primary me-1"></i> Visual Diff: ${path}</span>
            </div>
            <div id="${containerId}" class="acediff-container"></div>
        `;

        // Detect correct programming mode using GOGIES Ace modelist extension
        let aceMode = 'ace/mode/text';
        try {
            const modelist = ace.require("ace/ext/modelist");
            if (modelist) {
                aceMode = modelist.getModeForPath(path).mode;
            }
        } catch (e) {
            console.warn('Failed to load Ace modelist:', e);
        }

        // Initialize AceDiff with timeout to ensure DOM layout has rendered
        setTimeout(() => {
            try {
                const ad = new AceDiff({
                    element: '#' + containerId,
                    theme: 'ace/theme/gogies',
                    mode: aceMode,
                    left: {
                        content: originalContent,
                        editable: false,
                        copyLinkEnabled: false
                    },
                    right: {
                        content: newContent,
                        editable: false,
                        copyLinkEnabled: false
                    }
                });

                // Adjust typography and clean margins on internal Ace instances
                const editors = ad.getEditors();
                if (editors) {
                    editors.left.setFontSize(11);
                    editors.right.setFontSize(11);
                    editors.left.setShowPrintMargin(false);
                    editors.right.setShowPrintMargin(false);
                }
            } catch (err) {
                console.error('Failed to initialize AceDiff:', err);
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = `<div class="p-3 text-danger small">Failed to load side-by-side diff: ${err.message}</div>`;
                }
            }
        }, 100);

        return wrapper;
    }

    // --- Interactive File Approval Card with embedded AceDiff ---
    function renderFileApprovalCard(path, originalContent, newContent, onApproved, onRejected) {
        if (!messagesContainer) return;

        const card = document.createElement('div');
        card.className = 'ai-tool-card';
        card.innerHTML = `
            <div class="ai-tool-header">
                <i class="bi bi-shield-lock-fill text-warning"></i>
                <span>Gogies AI Agent Request</span>
            </div>
            <div class="ai-tool-body">Write to File: ${path}</div>
            <div class="ai-tool-actions d-flex justify-content-between align-items-center mt-2">
                <button type="button" class="btn btn-outline-info btn-xs btn-sm ai-btn-view"><i class="bi bi-eye"></i> Review</button>
                <div>
                    <button type="button" class="btn btn-success btn-xs btn-sm ai-btn-approve me-1">Approve ✅</button>
                    <button type="button" class="btn btn-danger btn-xs btn-sm ai-btn-reject">Reject ❌</button>
                </div>
            </div>
        `;

        messagesContainer.appendChild(card);
        if (autoscrollCheckbox && autoscrollCheckbox.checked) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        const viewBtn = card.querySelector('.ai-btn-view');
        const approveBtn = card.querySelector('.ai-btn-approve');
        const rejectBtn = card.querySelector('.ai-btn-reject');
        const actionsDiv = card.querySelector('.ai-tool-actions');

        viewBtn.addEventListener('click', async () => {
            try {
                viewBtn.disabled = true;
                viewBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Opening...';

                // Add the file and its proposed content to the mock registry
                if (window.aiProposedFiles) {
                    window.aiProposedFiles.set(path, newContent);
                }
                if (window.aiProposedFilesOriginals) {
                    window.aiProposedFilesOriginals.set(path, originalContent);
                }

                await TabManager.openFile(path);
                if (TabManager.editor) {
                    ToastManager.show(`Loaded proposed changes for ${path} into main IDE editor.`, 'info', 3000);
                }
            } catch (err) {
                console.error('Failed to open file in IDE:', err);
                ToastManager.show('Error opening file: ' + err.message, 'error', 3000);
            } finally {
                viewBtn.disabled = false;
                viewBtn.innerHTML = '<i class="bi bi-eye"></i> Review';
            }
        });

        approveBtn.addEventListener('click', () => {
            approveBtn.disabled = true;
            rejectBtn.disabled = true;
            viewBtn.disabled = true;
            actionsDiv.innerHTML = '<span class="text-success small"><i class="bi bi-check-circle-fill"></i> Changes Approved by User</span>';

            // Clean up mock registry entries
            if (window.aiProposedFiles) {
                window.aiProposedFiles.delete(path);
            }
            if (window.aiProposedFilesOriginals) {
                window.aiProposedFilesOriginals.delete(path);
            }
            onApproved();
        });

        rejectBtn.addEventListener('click', () => {
            approveBtn.disabled = true;
            rejectBtn.disabled = true;
            viewBtn.disabled = true;
            actionsDiv.innerHTML = '<span class="text-danger small"><i class="bi bi-x-circle-fill"></i> Changes Rejected by User</span>';

            // Clean up mock registry entries
            if (window.aiProposedFiles) {
                window.aiProposedFiles.delete(path);
            }
            if (window.aiProposedFilesOriginals) {
                window.aiProposedFilesOriginals.delete(path);
            }

            onRejected();

            // Force reload GOGIES editor tab from disk to wipe visual diff and restore original file content
            if (typeof TabManager !== 'undefined' && TabManager.openTabs.has(path)) {
                TabManager.reloadFile(path);
            }
        });
    }

    // --- Interactive Tool Request Approval Card ---
    function renderToolApprovalCard(toolName, command, onApproved, onRejected) {
        if (!messagesContainer) return;

        const commandName = command.trim().split(/\s+/)[0];
        const card = document.createElement('div');
        card.className = 'ai-tool-card';
        card.innerHTML = `
            <div class="ai-tool-header">
                <i class="bi bi-shield-lock-fill text-warning"></i>
                <span>Gogies AI Agent Request</span>
            </div>
            <div class="ai-tool-body">
                <div class="mb-1">> Run Command: <strong class="text-warning">${commandName}</strong></div>
                <pre class="bg-dark text-warning p-2 rounded small m-0 mt-2 font-monospace" style="font-size: 10.5px; border: 1px solid rgba(255,193,7,0.15); white-space: pre-wrap; word-break: break-all; max-height: 150px; overflow-y: auto; text-align: left;"><code>${command}</code></pre>
            </div>
            <div class="ai-tool-actions text-end mt-2">
                <button type="button" class="btn btn-success btn-xs btn-sm ai-btn-approve">Approve ✅</button>
                <button type="button" class="btn btn-danger btn-xs btn-sm ai-btn-reject">Reject ❌</button>
            </div>
        `;

        messagesContainer.appendChild(card);

        if (autoscrollCheckbox && autoscrollCheckbox.checked) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        const approveBtn = card.querySelector('.ai-btn-approve');
        const rejectBtn = card.querySelector('.ai-btn-reject');
        const actionsDiv = card.querySelector('.ai-tool-actions');

        approveBtn.addEventListener('click', () => {
            approveBtn.disabled = true;
            rejectBtn.disabled = true;
            actionsDiv.innerHTML = '<span class="text-success small"><i class="bi bi-check-circle-fill"></i> Command Approved by User</span>';
            onApproved();
        });

        rejectBtn.addEventListener('click', () => {
            approveBtn.disabled = true;
            rejectBtn.disabled = true;
            actionsDiv.innerHTML = '<span class="text-danger small"><i class="bi bi-x-circle-fill"></i> Command Rejected by User</span>';
            onRejected();
        });
    }

    // --- Refresh IDE File Explorer Tree ---
    async function refreshFileTree() {
        try {
            const module = await import('../assets/js/fileTree.js');
            const FileTreeManager = module.FileTreeManager;
            if (!FileTreeManager) return;

            const fileTreeEl = document.getElementById('file-tree');
            const fileContextMenu = document.getElementById('file-context-menu');
            const dirContextMenu = document.getElementById('dir-context-menu');

            const targets = [fileTreeEl, fileContextMenu, dirContextMenu, window];
            const savedListeners = targets.map(t => (t && typeof t.addEventListener === 'function') ? t.addEventListener : null);

            // Temporarily silence event listeners during re-init to avoid double-binding
            targets.forEach(t => {
                if (t) {
                    try { t.addEventListener = function() {}; } catch(e) {}
                }
            });

            if (fileTreeEl) fileTreeEl.innerHTML = '';
            await FileTreeManager.init();

            // Restore original event listener functions
            targets.forEach((t, i) => {
                if (t && savedListeners[i]) {
                    try { t.addEventListener = savedListeners[i]; } catch(e) {}
                }
            });
        } catch (err) {
            console.error('Failed to reload file tree dynamically:', err);
        }
    }

    // --- Execute Terminal Command & Display live Mini-Terminal ---
    function executeTerminalCommand(command, originalResponseText = '', onComplete = null) {
        if (!messagesContainer) return;

        // Render the stunning Mini-Terminal
        const terminal = document.createElement('div');
        terminal.className = 'ai-mini-terminal';
        terminal.innerHTML = `
            <div class="ai-terminal-header">
                <span class="ai-terminal-title"><i class="bi bi-terminal-fill text-primary"></i> Bash Shell</span>
                <span class="ai-terminal-status running">Running</span>
            </div>
            <div class="ai-terminal-body">> ${command}\nExecuting command in workspace...</div>
        `;

        messagesContainer.appendChild(terminal);
        if (autoscrollCheckbox && autoscrollCheckbox.checked) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        const statusLabel = terminal.querySelector('.ai-terminal-status');
        const terminalBody = terminal.querySelector('.ai-terminal-body');

        // Fire the AJAX request to backend tools execution layer
        fetch('ai-agent/agent-api.php?action=execute_tool', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tool: 'run_command',
                arguments: { command: command }
            })
        })
            .then(res => {
                if (!res.ok) throw new Error('HTTP error ' + res.status);
                return res.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    const exitCode = data.exit_code;

                    // Update terminal status and class
                    statusLabel.classList.remove('running');
                    if (exitCode === 0) {
                        statusLabel.classList.add('done');
                        statusLabel.textContent = 'Done';
                    } else {
                        statusLabel.classList.add('failed');
                        statusLabel.textContent = `Exit ${exitCode}`;
                    }

                    // Render exit code and outputs
                    let output = `> ${command}\n`;
                    if (data.stdout) output += data.stdout;
                    if (data.stderr) output += `\n[STDERR]\n${data.stderr}`;
                    if (!data.stdout && !data.stderr) output += `[Command finished with exit code ${exitCode} (No output)]`;

                    terminalBody.textContent = output;

                    // Force safe reload GOGIES file tree explorer
                    refreshFileTree();

                    // Automatically continue autonomous agent loop with exit code and terminal output
                    const toolOutput = `[TOOL OUTPUT for run_command "${command}"]: Exit Code ${exitCode}\nSTDOUT:\n${data.stdout || '(no output)'}\nSTDERR:\n${data.stderr || '(no output)'}`;
                    if (onComplete) {
                        onComplete(toolOutput);
                    } else {
                        triggerAiNextTurn(originalResponseText || `I will run the command: ${command}`, toolOutput);
                    }
                } else {
                    throw new Error(data.message || 'Unknown execution error');
                }
            })
            .catch(err => {
                statusLabel.classList.remove('running');
                statusLabel.classList.add('failed');
                statusLabel.textContent = 'Error';
                terminalBody.textContent = `> ${command}\n\n[EXECUTION ERROR]\n${err.message}`;
                const toolOutput = `[TOOL ERROR for run_command "${command}"]: ${err.message}`;
                if (onComplete) {
                    onComplete(toolOutput);
                } else {
                    triggerAiNextTurn(originalResponseText || `I will run the command: ${command}`, toolOutput);
                }
            })
            .finally(() => {
                if (autoscrollCheckbox && autoscrollCheckbox.checked) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            });
    }

    // --- Save Modified File Content Trigger ---
    function executeWriteFile(path, originalContent, newContent, autoApproved = false, originalResponseText = '', onComplete = null) {
        if (autoApproved) {
            const card = document.createElement('div');
            card.className = 'ai-tool-card';
            card.innerHTML = `
                <div class="ai-tool-header">
                    <i class="bi bi-shield-check text-success"></i>
                    <span>Gogies AI Agent Request</span>
                </div>
                <div class="ai-tool-body">Write to File: ${path}</div>
                <div class="ai-tool-actions d-flex justify-content-between align-items-center mt-2 px-1">
                    <span class="text-success small"><i class="bi bi-check-circle-fill"></i> Changes Auto-Approved by Policy</span>
                    <button type="button" class="btn btn-outline-info btn-xs btn-sm ai-btn-view"><i class="bi bi-eye"></i> Review</button>
                </div>
            `;
            messagesContainer.appendChild(card);

            const viewBtn = card.querySelector('.ai-btn-view');
            viewBtn.addEventListener('click', async () => {
                try {
                    viewBtn.disabled = true;
                    viewBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Opening...';

                    if (window.aiProposedFiles) {
                        window.aiProposedFiles.set(path, newContent);
                    }
                    if (window.aiProposedFilesOriginals) {
                        window.aiProposedFilesOriginals.set(path, originalContent);
                    }

                    await TabManager.openFile(path);
                } catch (err) {
                    console.error('Failed to open file in IDE:', err);
                    ToastManager.show('Error opening file: ' + err.message, 'error', 3000);
                } finally {
                    viewBtn.disabled = false;
                    viewBtn.innerHTML = '<i class="bi bi-eye"></i> Review';
                }
            });
        }

        // Send tools write AJAX call
        fetch('ai-agent/agent-api.php?action=execute_tool', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tool: 'write_file',
                arguments: { path: path, content: newContent }
            })
        })
            .then(res => {
                if (!res.ok) throw new Error('HTTP error ' + res.status);
                return res.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    setTimeout(() => {
                        const action = data.action || 'modified';
                        const isCreated = action === 'created';
                        const alertHtml = `
                            <div class="alert alert-success d-flex align-items-center justify-content-between p-2 mb-2 border-0" style="background-color: rgba(25, 135, 84, 0.08); border-left: 3px solid #198754 !important; border-radius: 6px; font-size: 12px; width: 100%;">
                                <span class="text-info d-flex align-items-center gap-2">
                                    <i class="bi ${isCreated ? 'bi-file-earmark-plus' : 'bi-file-earmark-check'} text-success" style="font-size: 14px;"></i>
                                    <span class="text-info">File <strong>${path.split('/').pop()}</strong> was successfully <strong>${isCreated ? 'Created' : 'Modified'}</strong></span>
                                </span>
                                <span class="badge rounded-pill bg-success text-white px-2 py-1" style="font-size: 9px; letter-spacing: 0.5px; font-weight: 600; text-transform: uppercase;">${action}</span>
                            </div>
                        `;
                        appendMessage(alertHtml, 'agent');
                    }, 100);

                    // Force reload GOGIES editor tab from disk to show the new approved file content cleanly
                    if (typeof TabManager !== 'undefined' && TabManager.openTabs.has(path)) {
                        TabManager.reloadFile(path);
                    }

                    // Force safe reload GOGIES file tree explorer
                    refreshFileTree();

                    // Automatically continue autonomous agent loop after successful write
                    const toolOutput = `[TOOL OUTPUT for write_file "${path}"]: File written successfully.`;
                    if (onComplete) {
                        onComplete(toolOutput);
                    } else {
                        triggerAiNextTurn(originalResponseText || `I will write to file: ${path}`, toolOutput);
                    }
                } else {
                    throw new Error(data.message || 'Unknown write error');
                }
            })
            .catch(err => {
                appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> Error writing file: ${err.message}`, 'agent');
                const toolOutput = `[TOOL ERROR for write_file "${path}"]: ${err.message}`;
                if (onComplete) {
                    onComplete(toolOutput);
                } else {
                    triggerAiNextTurn(originalResponseText || `I will write to file: ${path}`, toolOutput);
                }
            })
            .finally(() => {
                if (autoscrollCheckbox && autoscrollCheckbox.checked) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            });
    }

    function executePatchFile(path, search, replace, originalContent, newContent, autoApproved = false, originalResponseText = '', onComplete = null) {
        if (autoApproved) {
            const card = document.createElement('div');
            card.className = 'ai-tool-card';
            card.innerHTML = `
                <div class="ai-tool-header">
                    <i class="bi bi-shield-check text-success"></i>
                    <span>Gogies AI Agent Request</span>
                </div>
                <div class="ai-tool-body">Patch File: ${path}</div>
                <div class="ai-tool-actions d-flex justify-content-between align-items-center mt-2 px-1">
                    <span class="text-success small"><i class="bi bi-check-circle-fill"></i> Changes Auto-Approved by Policy</span>
                    <button type="button" class="btn btn-outline-info btn-xs btn-sm ai-btn-view"><i class="bi bi-eye"></i> Review</button>
                </div>
            `;
            messagesContainer.appendChild(card);

            const viewBtn = card.querySelector('.ai-btn-view');
            viewBtn.addEventListener('click', async () => {
                try {
                    viewBtn.disabled = true;
                    viewBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Opening...';

                    if (window.aiProposedFiles) {
                        window.aiProposedFiles.set(path, newContent);
                    }
                    if (window.aiProposedFilesOriginals) {
                        window.aiProposedFilesOriginals.set(path, originalContent);
                    }

                    await TabManager.openFile(path);
                } catch (err) {
                    console.error('Failed to open file in IDE:', err);
                    ToastManager.show('Error opening file: ' + err.message, 'error', 3000);
                } finally {
                    viewBtn.disabled = false;
                    viewBtn.innerHTML = '<i class="bi bi-eye"></i> Review';
                }
            });
        }

        // Send tools patch AJAX call
        fetch('ai-agent/agent-api.php?action=execute_tool', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tool: 'patch_file',
                arguments: { path: path, search: search, replace: replace }
            })
        })
            .then(res => {
                if (!res.ok) throw new Error('HTTP error ' + res.status);
                return res.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    setTimeout(() => {
                        const alertHtml = `
                            <div class="alert alert-success d-flex align-items-center justify-content-between p-2 mb-2 border-0" style="background-color: rgba(25, 135, 84, 0.08); border-left: 3px solid #198754 !important; border-radius: 6px; font-size: 12px; width: 100%;">
                                <span class="text-info d-flex align-items-center gap-2">
                                    <i class="bi bi-file-earmark-diff text-success" style="font-size: 14px;"></i>
                                    <span class="text-info">File <strong>${path.split('/').pop()}</strong> was successfully <strong>Patched</strong></span>
                                </span>
                                <span class="badge rounded-pill bg-success text-white px-2 py-1" style="font-size: 9px; letter-spacing: 0.5px; font-weight: 600; text-transform: uppercase;">patched</span>
                            </div>
                        `;
                        appendMessage(alertHtml, 'agent');
                    }, 100);

                    // Force reload GOGIES editor tab from disk to show the new approved file content cleanly
                    if (typeof TabManager !== 'undefined' && TabManager.openTabs.has(path)) {
                        TabManager.reloadFile(path);
                    }

                    // Force safe reload GOGIES file tree explorer
                    refreshFileTree();

                    // Automatically continue autonomous agent loop after successful write
                    const toolOutput = `[TOOL OUTPUT for patch_file "${path}"]: File patched successfully.`;
                    if (onComplete) {
                        onComplete(toolOutput);
                    } else {
                        triggerAiNextTurn(originalResponseText || `I will patch file: ${path}`, toolOutput);
                    }
                } else {
                    throw new Error(data.message || 'Unknown patch error');
                }
            })
            .catch(err => {
                appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> Error patching file: ${err.message}`, 'agent');
                const toolOutput = `[TOOL ERROR for patch_file "${path}"]: ${err.message}`;
                if (onComplete) {
                    onComplete(toolOutput);
                } else {
                    triggerAiNextTurn(originalResponseText || `I will patch file: ${path}`, toolOutput);
                }
            })
            .finally(() => {
                if (autoscrollCheckbox && autoscrollCheckbox.checked) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            });
    }

    // --- Multi-Turn Autonomous Tool Execution Loop & Response Parser ---
    function handleAiToolExecution(toolName, args, originalResponseText, onComplete = null) {
        // Show status bubble
        const statusBubble = appendMessage(`<span class="spinner-border spinner-border-sm me-2 text-info" role="status"></span> GOGIES AI is running <code>${toolName}</code>...`, 'agent');

        fetch('ai-agent/agent-api.php?action=execute_tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool: toolName,
                arguments: args
            })
        })
            .then(res => res.json())
            .then(data => {
                if (statusBubble && statusBubble.parentNode) {
                    statusBubble.remove();
                }

                // Render the tool outputs directly in the chat panel with a rich visual presentation
                if (data.status === 'success') {
                    let toolOutputText = '';
                    if (toolName === 'read_file') {
                        const escapedContent = data.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                        appendMessage(`<i class="bi bi-file-earmark-code text-info me-1"></i> Content of <strong>${args.path}</strong>:<br><pre class="bg-dark text-info p-2 rounded small mt-2" style="max-height: 250px; overflow-y: auto; text-align: left;"><code>${escapedContent}</code></pre>`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for read_file "${args.path}"]:\n${data.content}`;
                    } else if (toolName === 'list_dir') {
                        const itemsList = data.items.map(item => `<li>${item.type === 'directory' ? '📁' : '📄'} <code>${item.name}</code></li>`).join('');
                        appendMessage(`<i class="bi bi-folder2-open text-info me-1"></i> Directory list for <strong>${args.path}</strong>:<br><ul class="mt-2 text-start small list-unstyled">${itemsList}</ul>`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for list_dir "${args.path}"]:\n` + data.items.map(item => `- ${item.name} (${item.type})`).join('\n');
                    } else if (toolName === 'search_files') {
                        const matchesList = data.matches.map(m => `<li>📄 <code>${m.file}</code> (Line ${m.line}): <pre class="bg-dark text-info p-1 m-0 rounded font-monospace small" style="font-size:10px; text-align: left;"><code>${m.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre></li>`).join('');
                        appendMessage(`<i class="bi bi-search text-info me-1"></i> Matches for query "<strong>${args.query}</strong>":<br><ul class="mt-2 text-start small list-unstyled d-flex flex-column gap-2">${matchesList}</ul>`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for search_files "${args.query}" in "${args.path}"]:\n` + data.matches.map(m => `- ${m.file}:${m.line}: ${m.content}`).join('\n');
                    } else if (toolName === 'git_status') {
                        let styledOutput = '';
                        if (!data.output.trim()) {
                            styledOutput = `<span class="text-success"><i class="bi bi-check-circle-fill"></i> Working tree clean. No changes detected.</span>`;
                        } else {
                            const lines = data.output.trim().split('\n');
                            const listItems = lines.map(line => {
                                const status = line.substring(0, 2).trim();
                                const file = line.substring(3).trim();
                                let badge = '';
                                if (status === 'M') badge = '<span class="badge bg-warning text-dark me-1">M</span>';
                                else if (status === 'A' || status === '??') badge = '<span class="badge bg-success me-1">A</span>';
                                else if (status === 'D') badge = '<span class="badge bg-danger me-1">D</span>';
                                else badge = `<span class="badge bg-secondary me-1">${status}</span>`;
                                return `<li>${badge} <code>${file}</code></li>`;
                            }).join('');
                            styledOutput = `<ul class="mt-2 text-start small list-unstyled d-flex flex-column gap-1">${listItems}</ul>`;
                        }
                        appendMessage(`<i class="bi bi-git text-info me-1"></i> Git status details:<br>${styledOutput}`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for git_status]:\n${data.output || 'Working tree clean.'}`;
                    } else if (toolName === 'git_diff') {
                        let styledOutput = '';
                        if (!data.output.trim()) {
                            styledOutput = `<span class="text-success"><i class="bi bi-info-circle-fill"></i> No differences.</span>`;
                        } else {
                            const escapedDiff = data.output.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                            styledOutput = `<pre class="bg-dark text-info p-2 rounded small mt-2" style="max-height: 250px; overflow-y: auto; text-align: left; font-size:10px;"><code>${escapedDiff}</code></pre>`;
                        }
                        appendMessage(`<i class="bi bi-file-diff text-info me-1"></i> Git diff details:<br>${styledOutput}`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for git_diff]:\n${data.output || 'No differences.'}`;
                    } else if (toolName === 'grep_search') {
                        const matchesList = data.matches.map(m => `<li>📄 <code>${m.file}</code> (Line ${m.line}): <pre class="bg-dark text-info p-1 m-0 rounded font-monospace small" style="font-size:10px; text-align: left;"><code>${m.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre></li>`).join('');
                        appendMessage(`<i class="bi bi-search text-info me-1"></i> Grep matches for query "<strong>${args.query}</strong>":<br><ul class="mt-2 text-start small list-unstyled d-flex flex-column gap-2">${matchesList || '<li>No matches found.</li>'}</ul>`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for grep_search "${args.query}" in "${args.path}"]:\n` + data.matches.map(m => `- ${m.file}:${m.line}: ${m.content}`).join('\n');
                    } else if (toolName === 'get_code_outline') {
                        const outlineList = data.outline.map(o => {
                            let icon = '⚙️';
                            if (o.type === 'structure') icon = '📦';
                            else if (o.type === 'method') icon = '🔵';
                            else if (o.type === 'css_rule') icon = '🎨';
                            return `<li class="font-monospace" style="font-size:11px;">${icon} <strong>L${o.line}</strong>: <code>${o.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></li>`;
                        }).join('');
                        appendMessage(`<i class="bi bi-bezier2 text-info me-1"></i> Outline of <strong>${args.path}</strong>:<br><ul class="mt-2 text-start small list-unstyled d-flex flex-column gap-1" style="max-height: 250px; overflow-y: auto;">${outlineList || '<li>No outlines found or file extension unsupported.</li>'}</ul>`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for get_code_outline "${args.path}"]:\n` + data.outline.map(o => `- L${o.line}: ${o.name} (${o.type})`).join('\n');
                    } else if (toolName === 'list_db_profiles') {
                        let profilesList = '';
                        if (data.profiles.length === 0) {
                            profilesList = '<li>No database profiles configured.</li>';
                        } else {
                            profilesList = data.profiles.map(p => `<li>🗄️ <strong>${p.name}</strong> (Type: <code>${p.type}</code>, DB: <code>${p.database}</code>) - ID: <code>${p.id}</code></li>`).join('');
                        }
                        appendMessage(`<i class="bi bi-database text-info me-1"></i> Configured DB profiles:<br><ul class="mt-2 text-start small list-unstyled d-flex flex-column gap-1">${profilesList}</ul>`, 'agent');
                        toolOutputText = `[TOOL OUTPUT for list_db_profiles]:\n` + (data.profiles.length ? data.profiles.map(p => `- ID: ${p.id}, Name: ${p.name}, Type: ${p.type}, DB: ${p.database}`).join('\n') : '(no profiles found)');
                    } else if (toolName === 'db_query') {
                        if (data.type === 'select') {
                            let tableHeaders = '';
                            let tableRows = '';
                            if (data.columns.length > 0) {
                                tableHeaders = data.columns.map(c => `<th style="padding: 4px 8px; border-bottom: 2px solid #34495e;">${c}</th>`).join('');
                                tableRows = data.rows.map(r => {
                                    return `<tr>` + data.columns.map(c => `<td style="padding: 4px 8px; border-bottom: 1px solid #2c3e50; white-space: nowrap;">${r[c] !== null ? r[c] : '<i>NULL</i>'}</td>`).join('') + `</tr>`;
                                }).join('');
                            }
                            const tableHtml = `
                                <div style="overflow-x: auto; max-height: 250px; border: 1px solid #2c3e50; border-radius: 4px; margin-top: 8px;">
                                    <table class="table-dark table-striped text-start small" style="width: 100%; font-size: 11px; border-collapse: collapse;">
                                        <thead><tr>${tableHeaders}</tr></thead>
                                        <tbody>${tableRows || '<tr><td colspan="100%" class="text-center p-2 text-muted">No rows returned</td></tr>'}</tbody>
                                    </table>
                                </div>
                            `;
                            appendMessage(`<i class="bi bi-table text-info me-1"></i> Query result (${data.affected} rows returned):<br>${tableHtml}`, 'agent');
                            toolOutputText = `[TOOL OUTPUT for db_query]: SELECT returned ${data.affected} rows.\n` + JSON.stringify(data.rows, null, 2);
                        } else {
                            appendMessage(`<i class="bi bi-check-circle-fill text-success me-1"></i> Query executed successfully. Affected rows: <strong>${data.affected}</strong>`, 'agent');
                            toolOutputText = `[TOOL OUTPUT for db_query]: Mutation executed successfully. Affected rows: ${data.affected}`;
                        }
                    }

                    // Automatically continue autonomous agent loop with output
                    if (onComplete) {
                        onComplete(toolOutputText);
                    } else {
                        triggerAiNextTurn(originalResponseText, toolOutputText);
                    }
                } else {
                    appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> Tool error: ${data.message}`, 'agent');
                    const toolOutputText = `[TOOL ERROR for ${toolName}]: ${data.message}`;
                    if (onComplete) {
                        onComplete(toolOutputText);
                    } else {
                        triggerAiNextTurn(originalResponseText, toolOutputText);
                    }
                }

                if (autoscrollCheckbox && autoscrollCheckbox.checked) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            })
            .catch(err => {
                if (statusBubble && statusBubble.parentNode) {
                    statusBubble.remove();
                }
                appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> Tool execution failed: ${err.message}`, 'agent');
                const toolOutputText = `[TOOL ERROR for ${toolName}]: ${err.message}`;
                if (onComplete) {
                    onComplete(toolOutputText);
                } else {
                    triggerAiNextTurn(originalResponseText, toolOutputText);
                }
            });
    }

    function triggerAiNextTurn(assistantMessage, toolOutput) {
        const messages = [];
        const bubbles = document.querySelectorAll('.ai-message');
        bubbles.forEach(bubble => {
            const isUser = bubble.classList.contains('user');
            const isAgent = bubble.classList.contains('agent');
            if (isUser || isAgent) {
                const temp = document.createElement('div');
                temp.innerHTML = bubble.innerHTML;

                const cardEl = temp.querySelector('.ai-tool-card');
                if (cardEl) cardEl.remove();

                const cleanText = temp.textContent || temp.innerText;
                if (cleanText.trim() && cleanText.trim() !== 'Thinking...') {
                    messages.push({
                        role: isUser ? 'user' : 'assistant',
                        content: cleanText.trim()
                    });
                }
            }
        });

        messages.push({
            role: 'assistant',
            content: assistantMessage
        });
        messages.push({
            role: 'user',
            content: toolOutput
        });

        const slicedMessages = messages.slice(-15);
        const selectedModel = modelSelect ? modelSelect.value : 'auto';

        const loadingBubble = appendMessage('<span class="spinner-border spinner-border-sm me-2 text-info" role="status"></span> Thinking...', 'agent');

        // Toggle thinking UI state
        setAgentThinkingState(true);

        let activeFilePath = '';
        let activeFileContent = '';
        if (typeof TabManager !== 'undefined') {
            activeFilePath = TabManager.activeTabPath || '';
            if (activeFilePath && TabManager.editor) {
                activeFileContent = TabManager.editor.getValue() || '';
            }
        }

        streamAiResponse(slicedMessages, selectedModel, activeFilePath, activeFileContent, loadingBubble, (content, reasoning) => {
            processAiResponse(content, reasoning);
        });
    }

    async function streamAiResponse(slicedMessages, selectedModel, activeFilePath, activeFileContent, loadingBubble, onSuccess) {
        try {
            activeAbortController = new AbortController();
            const signal = activeAbortController.signal;

            const response = await fetch('ai-agent/agent-api.php?action=chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                    messages: slicedMessages,
                    model_id: selectedModel,
                    active_file_path: activeFilePath,
                    active_file_content: activeFileContent
                })
            });

            if (!response.ok) {
                let errMessage = 'API connection failed';
                try {
                    const errData = await response.json();
                    errMessage = errData.message || errMessage;
                } catch (e) { }
                throw new Error(errMessage);
            }

            if (loadingBubble && loadingBubble.parentNode) {
                loadingBubble.remove();
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedContent = '';
            let accumulatedReasoning = '';

            let bubbleEl = null;
            let buffer = '';
            let lastRenderTime = 0;

            const renderThrottle = (force = false) => {
                const now = Date.now();
                if (!force && now - lastRenderTime < 100) return;
                lastRenderTime = now;

                let reasoningText = accumulatedReasoning;
                let contentText = accumulatedContent;

                const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/i;
                const thinkMatch = contentText.match(thinkRegex);
                if (thinkMatch) {
                    reasoningText += (reasoningText ? '\n' : '') + thinkMatch[1].trim();
                    contentText = contentText.replace(thinkMatch[0], '').trim();
                }

                reasoningText = reasoningText.trim();
                contentText = contentText.trim();

                // 1. Render premium thoughts accordion in real-time as a standalone element
                if (reasoningText) {
                    if (!window.activeThoughtEl) {
                        window.activeThoughtEl = document.createElement('div');
                        window.activeThoughtEl.className = 'ai-thought-container';
                        messagesContainer.appendChild(window.activeThoughtEl);
                    }

                    const reasoningLines = reasoningText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const lastLine = reasoningLines.length > 0 ? reasoningLines[reasoningLines.length - 1] : 'Thinking...';

                    window.activeThoughtEl.innerHTML = `
                        <div class="ai-thought-accordion collapsed" style="width: 100%; margin: 0;">
                            <div class="ai-thought-header d-flex justify-content-between align-items-center cursor-pointer" onclick="this.parentNode.classList.toggle('collapsed');">
                                <span class="d-flex align-items-center overflow-hidden" style="min-width: 0; flex: 1; margin-right: 8px;">
                                    <i class="bi bi-cpu thought-icon"></i>
                                    <span>Thought</span>
                                    <span class="ai-thought-preview  ms-1">${lastLine}</span>
                                </span>
                                <i class="bi bi-chevron-down thought-chevron"></i>
                            </div>
                            <div class="ai-thought-content">${reasoningText}</div>
                        </div>
                    `;
                } else {
                    if (window.activeThoughtEl && window.activeThoughtEl.parentNode) {
                        window.activeThoughtEl.remove();
                        window.activeThoughtEl = null;
                    }
                }

                // 2. Render content text in real-time in a standalone clean conversational bubble underneath
                if (contentText) {
                    // Strip command actions from streaming output to keep bubble pristine
                    let cleanText = contentText;
                    cleanText = cleanText.replace(/<run_command>[\s\S]*?<\/run_command>/gi, '');
                    cleanText = cleanText.replace(/<write_file\s+path=["'][^"']+["']>[\s\S]*?<\/write_file>/gi, '');
                    cleanText = cleanText.replace(/<patch_file\s+path=["'][^"']+["']>[\s\S]*?<\/patch_file>/gi, '');
                    cleanText = cleanText.replace(/<list_db_profiles\s*\/?>/gi, '');
                    cleanText = cleanText.replace(/<db_query\s+profile_id=["'][^"']+["']\s+sql=["'][^"']+["']\s*\/?>/gi, '');
                    cleanText = cleanText.replace(/<read_file\s+path=["'][^"']+["']\s*\/?>[\s\S]*?<\/read_file>/gi, '');
                    cleanText = cleanText.replace(/<list_dir\s+path=["'][^"']+["']\s*\/?>[\s\S]*?<\/list_dir>/gi, '');
                    cleanText = cleanText.replace(/<search_files\s+query=["'][^"']+["']\s+path=["'][^"']+["']\s*\/?>[\s\S]*?<\/search_files>/gi, '');
                    cleanText = cleanText.replace(/<git_status\s*\/?>/gi, '');
                    cleanText = cleanText.replace(/<git_diff\s*\/?>/gi, '');
                    cleanText = cleanText.replace(/<grep_search\s+query=["'][^"']+["']\s+path=["'][^"']+["']\s*\/?>/gi, '');
                    cleanText = cleanText.replace(/<get_code_outline\s+path=["'][^"']+["']\s*\/?>/gi, '');
                    cleanText = cleanText.replace(/\/run\s+[^\n]+/gi, '');
                    cleanText = cleanText.replace(/\/write\s+[^\s\n]+[\s\n]*```[a-z]*\n[\s\S]*?\n```/gi, '');
                    cleanText = cleanText.trim();

                    if (cleanText) {
                        if (!bubbleEl) {
                            bubbleEl = document.createElement('div');
                            bubbleEl.className = 'ai-message agent';
                            messagesContainer.appendChild(bubbleEl);
                        }

                        const formattedText = cleanText
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/```([a-z]*)\n([\s\S]*?)\n```/g, '<pre class="bg-dark text-info p-2 rounded small mt-2"><code>$2</code></pre>')
                            .replace(/\n/g, '<br>');
                        bubbleEl.innerHTML = formattedText;
                    }
                }

                if (!reasoningText && !contentText) {
                    if (!bubbleEl) {
                        bubbleEl = document.createElement('div');
                        bubbleEl.className = 'ai-message agent';
                        messagesContainer.appendChild(bubbleEl);
                    }
                    bubbleEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2 text-info" role="status"></span> Thinking...';
                }

                if (autoscrollCheckbox && autoscrollCheckbox.checked) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        accumulatedContent += parsed.content || '';
                        accumulatedReasoning += parsed.reasoning || '';
                    } catch (e) {
                        console.warn('AI streaming: non-JSON line ignored:', trimmed.substring(0, 100));
                    }
                }

                renderThrottle(false);
            }

            // Force final render to ensure all text is flushed
            renderThrottle(true);

            // Once streaming is fully complete, clear active variables and delegate to standard tool executor
            if (window.activeThoughtEl && window.activeThoughtEl.parentNode) {
                window.activeThoughtEl.remove();
            }
            window.activeThoughtEl = null;
            if (bubbleEl && bubbleEl.parentNode) {
                bubbleEl.remove();
            }

            // Clean up contentText from any think tags
            let finalContent = accumulatedContent;
            let finalReasoning = accumulatedReasoning;

            const finalThinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/i;
            const finalThinkMatch = finalContent.match(finalThinkRegex);
            if (finalThinkMatch) {
                finalReasoning += (finalReasoning ? '\n' : '') + finalThinkMatch[1].trim();
                finalContent = finalContent.replace(finalThinkMatch[0], '').trim();
            }

            onSuccess(finalContent.trim(), finalReasoning.trim());

            // Reset thinking UI state on success
            setAgentThinkingState(false);
            activeAbortController = null;

        } catch (err) {
            setAgentThinkingState(false);
            activeAbortController = null;

            if (loadingBubble && loadingBubble.parentNode) {
                loadingBubble.remove();
            }

            if (err.name === 'AbortError') {
                appendMessage('<span class="text-warning"><i class="bi bi-stop-circle-fill"></i> AI Generation stopped by user.</span>', 'agent');
            } else {
                appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> <strong>AI Error:</strong> ${err.message}<br><br>💡 Check your model credentials or try choosing another model in settings.`, 'agent');
            }
        }
    }

    function processAiResponse(aiText, reasoningText = '') {
        const actions = [];
        let match;

        // 1. Parse XML format actions
        const runXmlRegex = /<run_command>([\s\S]*?)<\/run_command>/gi;
        while ((match = runXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'run_command',
                command: match[1].trim(),
                raw: match[0],
                index: match.index
            });
        }

        const writeXmlRegex = /<write_file\s+path=["']([^"']+)["']>([\s\S]*?)<\/write_file>/gi;
        while ((match = writeXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'write_file',
                path: match[1].trim(),
                content: match[2],
                raw: match[0],
                index: match.index
            });
        }

        const patchXmlRegex = /<patch_file\s+path=["']([^"']+)["']>([\s\S]*?)<\/patch_file>/gi;
        while ((match = patchXmlRegex.exec(aiText)) !== null) {
            const path = match[1].trim();
            const body = match[2];
            const searchMatch = /<search>([\s\S]*?)<\/search>/i.exec(body);
            const replaceMatch = /<replace>([\s\S]*?)<\/replace>/i.exec(body);
            if (searchMatch && replaceMatch) {
                actions.push({
                    type: 'patch_file',
                    path: path,
                    search: searchMatch[1],
                    replace: replaceMatch[1],
                    raw: match[0],
                    index: match.index
                });
            }
        }

        const readXmlRegex = /<read_file\s+path=["']([^"']+)["']\s*(?:\/>|>([\s\S]*?)<\/read_file>)/gi;
        while ((match = readXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'read_file',
                path: match[1].trim(),
                raw: match[0],
                index: match.index
            });
        }

        const listXmlRegex = /<list_dir\s+path=["']([^"']+)["']\s*(?:\/>|>([\s\S]*?)<\/list_dir>)/gi;
        while ((match = listXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'list_dir',
                path: match[1].trim(),
                raw: match[0],
                index: match.index
            });
        }

        const searchXmlRegex = /<search_files\s+query=["']([^"']+)["']\s+path=["']([^"']+)["']\s*(?:\/>|>([\s\S]*?)<\/search_files>)/gi;
        while ((match = searchXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'search_files',
                query: match[1].trim(),
                path: match[2].trim(),
                raw: match[0],
                index: match.index
            });
        }

        const gitStatusXmlRegex = /<git_status\s*\/?>/gi;
        while ((match = gitStatusXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'git_status',
                raw: match[0],
                index: match.index
            });
        }

        const gitDiffXmlRegex = /<git_diff\s*\/?>/gi;
        while ((match = gitDiffXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'git_diff',
                raw: match[0],
                index: match.index
            });
        }

        const grepSearchXmlRegex = /<grep_search\s+query=["']([^"']+)["']\s+path=["']([^"']+)["']\s*\/?>/gi;
        while ((match = grepSearchXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'grep_search',
                query: match[1].trim(),
                path: match[2].trim(),
                raw: match[0],
                index: match.index
            });
        }

        const getCodeOutlineXmlRegex = /<get_code_outline\s+path=["']([^"']+)["']\s*\/?>/gi;
        while ((match = getCodeOutlineXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'get_code_outline',
                path: match[1].trim(),
                raw: match[0],
                index: match.index
            });
        }

        const listDbXmlRegex = /<list_db_profiles\s*\/?>/gi;
        while ((match = listDbXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'list_db_profiles',
                raw: match[0],
                index: match.index
            });
        }

        const queryDbXmlRegex = /<db_query\s+profile_id=["']([^"']+)["']\s+sql=["']([^"']+)["']\s*\/?>/gi;
        while ((match = queryDbXmlRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'db_query',
                profile_id: match[1].trim(),
                sql: match[2].trim(),
                raw: match[0],
                index: match.index
            });
        }

        // 2. Parse legacy command formats for backward compatibility
        const runRegex = /\/run\s+([^\n]+)/gi;
        while ((match = runRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'run_command',
                command: match[1].trim(),
                raw: match[0],
                index: match.index
            });
        }

        const writeRegex = /\/write\s+([^\s\n]+)[\s\n]*```[a-z]*\n([\s\S]*?)\n```/gi;
        while ((match = writeRegex.exec(aiText)) !== null) {
            actions.push({
                type: 'write_file',
                path: match[1].trim(),
                content: match[2],
                raw: match[0],
                index: match.index
            });
        }

        // Sort actions based on their appearance index in response text
        actions.sort((a, b) => a.index - b.index);

        // Clean AI text from actions to keep chat bubbles pristine and conversational
        let cleanAiText = aiText;
        for (const action of actions) {
            cleanAiText = cleanAiText.replace(action.raw, '');
        }
        cleanAiText = cleanAiText.trim();

        // 3. Render Collapsible AI Thought accordion if thinking/reasoning text is present
        if (reasoningText && reasoningText.trim()) {
            const reasoningLines = reasoningText.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const lastLine = reasoningLines.length > 0 ? reasoningLines[reasoningLines.length - 1] : 'Thinking...';

            const accordionEl = document.createElement('div');
            accordionEl.className = 'ai-thought-container';
            accordionEl.innerHTML = `
                <div class="ai-thought-accordion collapsed" style="width: 100%; margin: 0;">
                    <div class="ai-thought-header d-flex justify-content-between align-items-center cursor-pointer" onclick="this.parentNode.classList.toggle('collapsed');">
                        <span class="d-flex align-items-center overflow-hidden" style="min-width: 0; flex: 1; margin-right: 8px;">
                            <i class="bi bi-cpu thought-icon"></i>
                            <span>Thought</span>
                            <span class="ai-thought-preview  ms-1">${lastLine}</span>
                        </span>
                        <i class="bi bi-chevron-down thought-chevron"></i>
                    </div>
                    <div class="ai-thought-content">${reasoningText.trim()}</div>
                </div>
            `;

            messagesContainer.appendChild(accordionEl);
        }

        // 4. Render clean conversational bubble
        if (cleanAiText) {
            const formattedText = cleanAiText
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/```([a-z]*)\n([\s\S]*?)\n```/g, '<pre class="bg-dark text-info p-2 rounded small mt-2"><code>$2</code></pre>')
                .replace(/\n/g, '<br>');
            appendMessage(formattedText, 'agent');
        } else if (actions.length > 0) {
            appendMessage('<i class="bi bi-robot text-info me-1"></i> Running requested actions...', 'agent');
        }

        if (actions.length === 0) return;

        // Sequential execution queue for multiple actions
        const actionOutputs = [];

        function executeQueue(index) {
            if (index >= actions.length) {
                // Done with all actions! Send the combined output back to AI
                triggerAiNextTurn(aiText, actionOutputs.join('\n\n'));
                return;
            }

            const action = actions[index];
            const onComplete = (output) => {
                actionOutputs.push(output);
                executeQueue(index + 1);
            };

            if (action.type === 'read_file') {
                handleAiToolExecution('read_file', { path: action.path }, aiText, onComplete);
            }
            else if (action.type === 'list_dir') {
                handleAiToolExecution('list_dir', { path: action.path }, aiText, onComplete);
            }
            else if (action.type === 'search_files') {
                handleAiToolExecution('search_files', { query: action.query, path: action.path }, aiText, onComplete);
            }
            else if (action.type === 'git_status') {
                handleAiToolExecution('git_status', {}, aiText, onComplete);
            }
            else if (action.type === 'git_diff') {
                handleAiToolExecution('git_diff', {}, aiText, onComplete);
            }
            else if (action.type === 'grep_search') {
                handleAiToolExecution('grep_search', { query: action.query, path: action.path }, aiText, onComplete);
            }
            else if (action.type === 'get_code_outline') {
                handleAiToolExecution('get_code_outline', { path: action.path }, aiText, onComplete);
            }
            else if (action.type === 'list_db_profiles') {
                handleAiToolExecution('list_db_profiles', {}, aiText, onComplete);
            }
            else if (action.type === 'db_query') {
                handleAiToolExecution('db_query', { profile_id: action.profile_id, sql: action.sql }, aiText, onComplete);
            }
            else if (action.type === 'run_command') {
                const approvalMode = approvalSelect ? approvalSelect.value : 'ask';

                if (approvalMode === 'reject') {
                    appendMessage('<i class="bi bi-x-circle text-danger me-1"></i> Command execution instantly blocked by AI security policy (Auto Reject).', 'agent');
                    onComplete(`[TOOL ERROR for run_command "${action.command}"]: Blocked by user auto-reject policy.`);
                }
                else if (approvalMode === 'ask') {
                    renderToolApprovalCard('run_command', action.command, () => {
                        executeTerminalCommand(action.command, aiText, onComplete);
                    }, () => {
                        setTimeout(() => {
                            appendMessage('<i class="bi bi-dash-circle text-warning me-1"></i> Command execution was cancelled.', 'agent');
                            onComplete(`[TOOL ERROR for run_command "${action.command}"]: Command execution was cancelled by user.`);
                        }, 300);
                    });
                }
                else {
                    // Auto-Approve card for transparency
                    const commandName = action.command.trim().split(/\s+/)[0];
                    const card = document.createElement('div');
                    card.className = 'ai-tool-card';
                    card.innerHTML = `
                        <div class="ai-tool-header">
                            <i class="bi bi-shield-check text-success"></i>
                            <span>Gogies AI Agent Request</span>
                        </div>
                        <div class="ai-tool-body">
                            <div class="mb-1">> Run Command: <strong class="text-success">${commandName}</strong></div>
                            <pre class="bg-dark text-success p-2 rounded small m-0 mt-2 font-monospace" style="font-size: 10.5px; border: 1px solid rgba(25,135,84,0.15); white-space: pre-wrap; word-break: break-all; max-height: 150px; overflow-y: auto; text-align: left;"><code>${action.command}</code></pre>
                        </div>
                        <div class="px-1 text-success small mt-2"><i class="bi bi-check-circle-fill"></i> Command Auto-Approved by Policy</div>
                    `;
                    messagesContainer.appendChild(card);
                    executeTerminalCommand(action.command, aiText, onComplete);
                }
            }
            else if (action.type === 'write_file') {
                // Fetch original content to compute line differences
                fetch('ai-agent/agent-api.php?action=execute_tool', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tool: 'read_file',
                        arguments: { path: action.path }
                    })
                })
                    .then(res => res.json())
                    .then(originalData => {
                        const originalContent = (originalData.status === 'success') ? originalData.content : '';
                        const approvalMode = approvalSelect ? approvalSelect.value : 'ask';

                        if (approvalMode === 'reject') {
                            appendMessage('<i class="bi bi-x-circle text-danger me-1"></i> File write instantly blocked by AI security policy (Auto Reject).', 'agent');
                            onComplete(`[TOOL ERROR for write_file "${action.path}"]: Blocked by user auto-reject policy.`);
                        }
                        else if (approvalMode === 'ask') {
                            renderFileApprovalCard(action.path, originalContent, action.content, () => {
                                executeWriteFile(action.path, originalContent, action.content, false, aiText, onComplete);
                            }, () => {
                                setTimeout(() => {
                                    appendMessage('<i class="bi bi-dash-circle text-warning me-1"></i> File write was cancelled.', 'agent');
                                    onComplete(`[TOOL ERROR for write_file "${action.path}"]: File write was cancelled by user.`);
                                }, 300);
                            });
                        }
                        else {
                            executeWriteFile(action.path, originalContent, action.content, true, aiText, onComplete);
                        }
                    })
                    .catch(err => {
                        appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> Error reading original content: ${err.message}`, 'agent');
                        onComplete(`[TOOL ERROR for write_file "${action.path}"]: Error reading original content: ${err.message}`);
                    });
            }
            else if (action.type === 'patch_file') {
                // Fetch original content, compute patch locally for confirmation & diff, and run
                fetch('ai-agent/agent-api.php?action=execute_tool', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tool: 'read_file',
                        arguments: { path: action.path }
                    })
                })
                    .then(res => res.json())
                    .then(originalData => {
                        const originalContent = (originalData.status === 'success') ? originalData.content : '';
                        if (originalContent.indexOf(action.search) === -1) {
                            appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> Search block not found in <code>${action.path}</code>. Cannot patch.`, 'agent');
                            onComplete(`[TOOL ERROR for patch_file "${action.path}"]: Search block not found in the file.`);
                            return;
                        }
                        const newContent = originalContent.replace(action.search, action.replace);
                        const approvalMode = approvalSelect ? approvalSelect.value : 'ask';

                        if (approvalMode === 'reject') {
                            appendMessage('<i class="bi bi-x-circle text-danger me-1"></i> File patch instantly blocked by AI security policy (Auto Reject).', 'agent');
                            onComplete(`[TOOL ERROR for patch_file "${action.path}"]: Blocked by user auto-reject policy.`);
                        }
                        else if (approvalMode === 'ask') {
                            renderFileApprovalCard(action.path, originalContent, newContent, () => {
                                executePatchFile(action.path, action.search, action.replace, originalContent, newContent, false, aiText, onComplete);
                            }, () => {
                                setTimeout(() => {
                                    appendMessage('<i class="bi bi-dash-circle text-warning me-1"></i> File patch was cancelled.', 'agent');
                                    onComplete(`[TOOL ERROR for patch_file "${action.path}"]: File patch was cancelled by user.`);
                                }, 300);
                            });
                        }
                        else {
                            executePatchFile(action.path, action.search, action.replace, originalContent, newContent, true, aiText, onComplete);
                        }
                    })
                    .catch(err => {
                        appendMessage(`<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i> Error reading original content for patch: ${err.message}`, 'agent');
                        onComplete(`[TOOL ERROR for patch_file "${action.path}"]: Error reading original content: ${err.message}`);
                    });
            }
        }

        executeQueue(0);
    }

    // --- Message Send Logic & Command Triggering Interceptor ---
    const sendBtn = document.getElementById('ai-send-btn');

    function handleSendMessage() {
        if (!aiInput) return;
        const text = aiInput.value.trim();
        if (!text) return;

        // Clear textarea
        aiInput.value = '';
        aiInput.style.height = 'auto';

        // Toggle thinking UI state
        setAgentThinkingState(true);

        // Render user message bubble
        appendMessage(text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>'), 'user');

        // Add thinking loading bubble
        const loadingBubble = appendMessage('<span class="spinner-border spinner-border-sm me-2 text-info" role="status"></span> Thinking...', 'agent');

        // Gather all visual conversation history from chat panel to build LLM context
        const messages = [];
        const bubbles = document.querySelectorAll('.ai-message');
        bubbles.forEach(bubble => {
            const isUser = bubble.classList.contains('user');
            const isAgent = bubble.classList.contains('agent');
            if (isUser || isAgent) {
                const temp = document.createElement('div');
                temp.innerHTML = bubble.innerHTML;

                // Remove ai-tool-card elements to send clean text history
                const cardEl = temp.querySelector('.ai-tool-card');
                if (cardEl) cardEl.remove();

                const cleanText = temp.textContent || temp.innerText;
                if (cleanText.trim() && cleanText.trim() !== 'Thinking...') {
                    messages.push({
                        role: isUser ? 'user' : 'assistant',
                        content: cleanText.trim()
                    });
                }
            }
        });

        // Limit history to last 15 messages for performance
        const slicedMessages = messages.slice(-15);
        const selectedModel = modelSelect ? modelSelect.value : 'auto';

        // Gather active file session context dynamically to feed AI context
        let activeFilePath = '';
        let activeFileContent = '';
        if (typeof TabManager !== 'undefined') {
            activeFilePath = TabManager.activeTabPath || '';
            if (activeFilePath && TabManager.editor) {
                activeFileContent = TabManager.editor.getValue() || '';
            }
        }

        streamAiResponse(slicedMessages, selectedModel, activeFilePath, activeFileContent, loadingBubble, (content, reasoning) => {
            processAiResponse(content, reasoning);
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSendMessage();
        });
    }

    const stopBtn = document.getElementById('ai-stop-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (activeAbortController) {
                activeAbortController.abort();
                activeAbortController = null;
            }
        });
    }

    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            saveHistoryToServer();
        });
    }

    if (approvalSelect) {
        approvalSelect.addEventListener('change', () => {
            saveHistoryToServer();
        });
    }

    if (aiInput) {
        aiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    // Initial load on boot
    loadSettings().then(() => {
        loadChatHistoryFromServer();
    });
});
