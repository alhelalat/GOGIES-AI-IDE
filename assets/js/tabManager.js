import { fetchContentForPath } from './api.js';
import { getIconForFile } from './utils.js';
import { ModalManager } from './modals.js';
import { LoadingIndicator } from './loadingIndicator.js';
import { ToastManager } from './toastManager.js';

/**
 * Manages all logic related to editor tabs, including opening, closing,
 * activating, persisting state, and drag-and-drop reordering.
 */
export const TabManager = {
    openTabs: new Map(),
    activeTabPath: null,
    draggedTab: null,
    editor: null,
    welcomeSession: null,

    _getWorkspaceKey: function (baseKey) {
        const workspaceName = localStorage.getItem('current_workspace_name') || 'default';
        const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `${baseKey}-${sanitizedName}`;
    },

    tabsKey: 'ide-open-tabs',
    activeTabKey: 'ide-active-tab',

    init: async function (editor, welcomeSession) {
        this.editor = editor;
        this.welcomeSession = welcomeSession;

        this.tabBarEl = document.getElementById('tab-bar');
        this.tabScrollLeftBtn = document.getElementById('tab-scroll-left');
        this.tabScrollRightBtn = document.getElementById('tab-scroll-right');
        this.saveFileBtn = document.getElementById('save-file-btn');
        this.reloadFileBtn = document.getElementById('reload-file-btn');

        this.setupEventListeners();

        const savedTabs = this.getOpenTabsFromStorage();
        const savedActiveTab = this.getActiveTabFromStorage();

        if (savedTabs.length === 0) {
            this.showWelcomeScreen();
            return;
        }

        for (const path of savedTabs) {
            await this.openFile(path, false);
        }

        if (savedActiveTab && this.openTabs.has(savedActiveTab)) {
            this.setActiveTab(savedActiveTab);
        } else if (this.openTabs.size > 0) {
            this.setActiveTab(this.openTabs.keys().next().value);
        } else {
            this.showWelcomeScreen();
        }
    },

    setupEventListeners: function () {
        this.tabScrollLeftBtn.addEventListener('click', () => this.tabBarEl.scrollBy({ left: -200, behavior: 'smooth' }));
        this.tabScrollRightBtn.addEventListener('click', () => this.tabBarEl.scrollBy({ left: 200, behavior: 'smooth' }));
        this.tabBarEl.addEventListener('scroll', () => this.updateTabScrollers(), { passive: true });
        new ResizeObserver(() => this.updateTabScrollers()).observe(this.tabBarEl.parentElement);
        new MutationObserver(() => this.updateTabScrollers()).observe(this.tabBarEl, { childList: true });

        this.tabBarEl.addEventListener('dragstart', this.handleDragStart.bind(this));
        this.tabBarEl.addEventListener('dragover', this.handleDragOver.bind(this));
        this.tabBarEl.addEventListener('drop', this.handleDrop.bind(this));
        this.tabBarEl.addEventListener('dragend', this.handleDragEnd.bind(this));
    },

    getOpenTabsFromStorage: function () {
        try {
            const key = this._getWorkspaceKey(this.tabsKey);
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error("Could not read tabs from localStorage", e);
            return [];
        }
    },
    saveOpenTabsToStorage: function () {
        try {
            const key = this._getWorkspaceKey(this.tabsKey);
            const paths = Array.from(this.openTabs.keys());
            localStorage.setItem(key, JSON.stringify(paths));
        } catch (e) {
            console.error("Could not save tabs to localStorage", e);
        }
    },
    getActiveTabFromStorage: function () {
        try {
            const key = this._getWorkspaceKey(this.activeTabKey);
            return localStorage.getItem(key);
        } catch (e) {
            console.error("Could not read active tab from localStorage", e);
            return null;
        }
    },
    saveActiveTabToStorage: function (path) {
        try {
            const key = this._getWorkspaceKey(this.activeTabKey);
            path ? localStorage.setItem(key, path) : localStorage.removeItem(key);
        } catch (e) {
            console.error("Could not save active tab to localStorage", e);
        }
    },

    handleDragStart: function (e) {
        if (e.target.classList.contains('ace_tab')) {
            this.draggedTab = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        }
    },
    handleDragOver: function (e) {
        e.preventDefault();
        const afterElement = this.getDragAfterElement(e.clientX);
        if (afterElement == null) {
            this.tabBarEl.appendChild(this.draggedTab);
        } else {
            this.tabBarEl.insertBefore(this.draggedTab, afterElement);
        }
    },
    handleDrop: function (e) {
        e.preventDefault();
        if (this.draggedTab) {
            const newOrder = Array.from(this.tabBarEl.querySelectorAll('.ace_tab')).map(tab => tab.dataset.path);
            const newOpenTabs = new Map();
            newOrder.forEach(path => {
                newOpenTabs.set(path, this.openTabs.get(path));
            });
            this.openTabs = newOpenTabs;
            this.saveOpenTabsToStorage();
        }
    },
    handleDragEnd: function (e) {
        if (this.draggedTab) {
            this.draggedTab.classList.remove('dragging');
            this.draggedTab = null;
        }
    },
    getDragAfterElement: function (x) {
        const draggableElements = [...this.tabBarEl.querySelectorAll('.ace_tab:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    },

    reloadFile: async function (path) {
        if (!this.openTabs.has(path)) {
            // Fallback to openFile if it's not already open for some reason.
            await this.openFile(path, true);
            return;
        }

        const tabData = this.openTabs.get(path);

        try {
            LoadingIndicator.show();
            const { content, mode, isReadOnly } = await fetchContentForPath(path);
            const session = new ace.EditSession(content);
            session.setMode(mode);
            session.setUseWrapMode(true);

            tabData.session = session;
            tabData.isReadOnly = isReadOnly;
            tabData.isDirty = false; // Freshly reloaded, so not dirty.

            session.on('change', () => {
                if (!tabData.isDirty) {
                    tabData.isDirty = true;
                    this.updateFileStatus();
                }
            });

            if (this.activeTabPath === path) {
                this.editor.setSession(session);
                this.editor.setReadOnly(isReadOnly);
            }

            ToastManager.show(`<strong>${path.split('/').pop()}</strong> reloaded.`, 'success');
            this.updateFileStatus(); // To remove the dirty indicator '*'
        } catch (error) {
            console.error(`Failed to reload content for ${path}:`, error);
            ToastManager.show(`Could not reload file: ${error.message}`, 'error');
            this.removeTab(path);
        } finally {
            LoadingIndicator.hide();
        }
    },

    updateTabScrollers: function () {
        requestAnimationFrame(() => {
            const container = this.tabBarEl.parentElement;
            const { scrollWidth, clientWidth, scrollLeft } = this.tabBarEl;
            const needsScrollers = scrollWidth > clientWidth;
            container.classList.toggle('scrolling-active', needsScrollers);

            if (needsScrollers) {
                this.tabScrollLeftBtn.disabled = scrollLeft < 1;
                this.tabScrollRightBtn.disabled = (scrollLeft + clientWidth) >= (scrollWidth - 1);
            }
        });
    },

    openFile: async function (path, activate = true) {
        const extension = path.split('.').pop().toLowerCase();
        const viewableExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

        if (viewableExtensions.includes(extension)) {
            window.open(`${App.workspaceUrl}/${path}`, '_blank');
            return;
        }

        if (this.openTabs.has(path)) {
            if (activate) this.setActiveTab(path);
            return;
        }

        const tabEl = this.createTabElement(path);
        const tabData = { tabElement: tabEl, isDirty: false, session: null, isReadOnly: true };
        this.openTabs.set(path, tabData);
        this.saveOpenTabsToStorage();

        if (activate) this.setActiveTab(path);

        try {
            LoadingIndicator.show();
            const { content, mode, isReadOnly } = await fetchContentForPath(path);
            const session = new ace.EditSession(content);
            session.setMode(mode);
            session.setUseWrapMode(true);

            tabData.session = session;
            tabData.isReadOnly = isReadOnly;

            session.on('change', () => {
                if (!tabData.isDirty) {
                    tabData.isDirty = true;
                    this.updateFileStatus();
                }
            });

            if (this.activeTabPath === path) {
                this.editor.setSession(session);
                this.editor.setReadOnly(isReadOnly);
                this.saveFileBtn.style.display = isReadOnly ? 'none' : 'block';
            }
        } catch (error) {
            console.error(`Failed to load content for ${path}:`, error);
            ToastManager.show(`Could not load file: ${error.message}`, 'error');
            this.removeTab(path);
        } finally {
            LoadingIndicator.hide();
        }
    },

    createTabElement: function (path) {
        const tabEl = document.createElement('li');
        tabEl.className = 'nav-item ace_tab';
        tabEl.dataset.path = path;
        tabEl.draggable = true;
        tabEl.title = path;

        const fileName = path.split('/').pop();
        const extension = fileName.split('.').pop().toLowerCase();
        const isErrorLog = path === '[Error Log]';
        const iconClass = getIconForFile(extension);

        const iconEl = document.createElement('i');
        iconEl.className = `ic ${iconClass} `;

        const nameEl = document.createElement('span');
        nameEl.className = 'tab-name';
        nameEl.textContent = fileName;

        const closeEl = document.createElement('span');
        closeEl.className = 'tab-close';
        closeEl.innerHTML = '&times;';
        closeEl.title = 'Close';
        closeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeTab(path);
        });

        //tabEl.appendChild(iconEl);
        tabEl.appendChild(nameEl);
        tabEl.appendChild(closeEl);

        tabEl.addEventListener('click', () => this.setActiveTab(path));
        this.tabBarEl.appendChild(tabEl);
        return tabEl;
    },

    setActiveTab: function (path) {
        if (this.activeTabPath === path) return;

        if (this.activeTabPath && this.openTabs.has(this.activeTabPath)) {
            this.openTabs.get(this.activeTabPath).tabElement.classList.remove('active');
        }

        this.activeTabPath = path;
        this.saveActiveTabToStorage(path);

        if (path === null) {
            this.showWelcomeScreen();
            return;
        }

        const tabData = this.openTabs.get(path);
        if (tabData) {
            tabData.tabElement.classList.add('active');
            tabData.tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            if (tabData.session) {
                this.editor.setSession(tabData.session);
                this.editor.setReadOnly(tabData.isReadOnly);
                this.saveFileBtn.style.display = tabData.isReadOnly ? 'none' : 'block';
                this.reloadFileBtn.style.display = tabData.isReadOnly ? 'none' : 'block';
            } else {
                const loadingSession = new ace.EditSession("Loading...");
                this.editor.setSession(loadingSession);
                this.editor.setReadOnly(true);
                this.saveFileBtn.style.display = 'none';
                this.reloadFileBtn.style.display = 'none';
            }
            this.updateFileStatus();
            this.editor.focus();
        } else {
            this.showWelcomeScreen();
        }

        this.updateTabScrollers();
    },

    removeTab: function (path) {
        const tabData = this.openTabs.get(path);
        if (!tabData) return;

        if (tabData.isDirty) {
            ModalManager.showConfirm('Unsaved Changes', `<strong>${path.split('/').pop()}</strong> has unsaved changes. Close without saving?`, () => {
                this._performRemoveTab(path);
            });
        } else {
            this._performRemoveTab(path);
        }
    },

    _performRemoveTab: function (path) {
        const tabData = this.openTabs.get(path);
        if (!tabData) return;

        const tabEl = tabData.tabElement;
        const nextActiveEl = tabEl.nextElementSibling || tabEl.previousElementSibling;

        tabEl.remove();
        this.openTabs.delete(path);
        this.saveOpenTabsToStorage();

        if (this.activeTabPath === path) {
            if (nextActiveEl) {
                this.setActiveTab(nextActiveEl.dataset.path);
            } else {
                this.showWelcomeScreen();
            }
        }
    },

    showWelcomeScreen: function () {
        this.editor.setSession(this.welcomeSession);
        this.editor.setReadOnly(true);
        this.activeTabPath = null;
        this.saveFileBtn.style.display = 'none';
        this.reloadFileBtn.style.display = 'none';
        this.saveActiveTabToStorage(null);
        document.querySelectorAll('.ace_tab.active').forEach(el => el.classList.remove('active'));
        this.updateTabScrollers();
    },

    updateFileStatus: function () {
        if (!this.activeTabPath || !this.openTabs.has(this.activeTabPath)) return;

        const tabData = this.openTabs.get(this.activeTabPath);
        const nameEl = tabData.tabElement.querySelector('.tab-name');
        if (!nameEl) return;

        let statusText = this.activeTabPath.split('/').pop();
        if (tabData.isDirty) {
            statusText += ' *';
        }
        nameEl.textContent = statusText;
    }
};