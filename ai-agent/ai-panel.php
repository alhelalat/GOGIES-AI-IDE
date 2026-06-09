<!-- Right Side: Resizable AI Agent Panel -->
<aside id="ai-panel">
    <div id="ai-resize-handle"></div>
    <div class="ai-panel-header">
        <div class="ai-title">
            <i class="bi bi-stars"></i>
            <span>Gogies AI</span>
        </div>
        <div class="ai-header-actions">
            <button id="ai-new-chat-btn" class="ai-action-btn" title="New Chat"><i class="bi bi-plus-circle "></i></button>
            <button id="ai-history-btn" class="ai-action-btn" title="Chat History"><i class="bi bi-clock-history "></i></button>
            <button id="ai-delete-btn" class="ai-action-btn" title="Clear Chat"><i class="bi bi-trash3"></i></button>
            <button id="ai-settings-btn" class="ai-action-btn" title="AI Settings" data-bs-toggle="offcanvas" data-bs-target="#ai-settings-offcanvas"><i class="bi bi-gear"></i></button>
            <button id="ai-hide-btn" class="ai-action-btn" title="Hide Panel"><i class="bi bi-x-lg "></i></button>
        </div>
    </div>
    <div class="ai-panel-body">
        <div class="ai-chat-messages" id="ai-messages">
            <div class="ai-message system">
                Hello! I am your AI Assistant. How can I help you today?
            </div>
        </div>
        <div class="ai-chat-input-container p-1">
            <div class="ai-controls-row p-0">
                <select id="ai-model-select" class="ai-select">
                    <option value="auto">✨ Auto</option>
                </select>
                <select id="ai-approval-select" class="ai-select">
                    <option value="auto">✅ Auto approve</option>
                    <option value="ask" selected>❓ Ask user</option>
                    <option value="reject">❌ Auto reject</option>
                </select>
                <label class="ai-checkbox-label" title="Automatically scroll to latest message">
                    <input type="checkbox" id="ai-autoscroll-checkbox" checked>
                    <span>Autoscroll</span>
                </label>
            </div>
            <div class="ai-input-row">
                <textarea id="ai-input" placeholder="Ask anything..." rows="1"></textarea>
                <button id="ai-send-btn" class="btn btn-primary btn-sm" title="Send message"><i class="ic ic-chevron-right"></i></button>
                <button id="ai-stop-btn" class="btn btn-danger btn-sm d-none" title="Stop generating"><i class="bi bi-stop-fill"></i></button>
            </div>
        </div>
    </div>
</aside>

<!-- Bootstrap Offcanvas Settings Panel -->
<div class="offcanvas offcanvas-end text-bg-dark" tabindex="-1" id="ai-settings-offcanvas" aria-labelledby="ai-settings-label" style="width: 100% !important; max-width:700px!important; background-color: #071322 !important; border-left: 1px solid #1a2f4c; box-shadow: -5px 0 25px rgba(0,0,0,0.5);">
    <div class="offcanvas-header border-bottom border-secondary py-3 d-flex align-items-center justify-content-between">
        <h5 class="offcanvas-title" id="ai-settings-label">🧠 AI Brains</h5>
        <div class="d-flex align-items-center gap-2">
            <button type="button" id="ai-add-model-btn" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i> Model</button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
        </div>
    </div>
    <div class="offcanvas-body">
        
        <form id="ai-settings-form">
            <div id="ai-models-container" class="d-flex flex-column gap-3" style="max-height: 70vh; overflow-y: auto; padding-right: 4px;">
                <!-- Dynamic model cards will be appended here -->
            </div>
            
            <div class="mt-4 border-top border-secondary pt-3 d-flex gap-2">
                <button type="submit" class="btn btn-primary btn-sm flex-grow-1"><i class="bi bi-check-lg"></i> Save Brains</button>
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="offcanvas">Cancel</button>
            </div>
        </form>
    </div>
</div>
