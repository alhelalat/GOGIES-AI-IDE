import { postRequest } from './api.js';
import { formatBytes, getIconForFile } from './utils.js';
import { ModalManager } from './modals.js';
import { TabManager } from './tabManager.js';
import { expandedFolders } from './state.js';
import { LoadingIndicator } from './loadingIndicator.js';
import { ToastManager } from './toastManager.js';

/**
 * Manages the file tree, including rendering, context menus, and actions.
 */

const fileTreeEl = document.getElementById('file-tree');
const fileContextMenu = document.getElementById('file-context-menu');
const dirContextMenu = document.getElementById('dir-context-menu');

async function loadTree(path, element) {
    try {
        const response = await fetch(`${App.url}/api.php?action=list_files&path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error('Network response was not ok.');

        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);

        const { dirs, files } = result.data;

        dirs.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));

        element.innerHTML = '';

        dirs.forEach(dir => {
            const dirEl = document.createElement('div');
            dirEl.className = 'list-group-item';
            dirEl.dataset.path = dir.path;
            dirEl.dataset.type = 'dir';
            dirEl.innerHTML = `<span class="folder-toggle"></span><i class="ic ic-folder  text-warning"></i> ${dir.name}`;

            const subList = document.createElement('div');
            subList.className = 'list-group list-group-flush';
            subList.style.display = 'none';

            const expandFolder = () => {
                subList.style.display = 'block';
                dirEl.querySelector('.folder-toggle').classList.add('open');
                if (subList.innerHTML === '') {
                    subList.innerHTML = '<div class="list-group-item">Loading...</div>';
                    loadTree(dir.path, subList);
                }
            };

            const collapseFolder = () => {
                subList.style.display = 'none';
                dirEl.querySelector('.folder-toggle').classList.remove('open');
            };

            dirEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = subList.style.display === 'block';
                if (isOpen) {
                    collapseFolder();
                    expandedFolders.remove(dir.path);
                } else {
                    expandFolder();
                    expandedFolders.add(dir.path);
                }
            });

            element.appendChild(dirEl);
            element.appendChild(subList);

            if (expandedFolders.has(dir.path)) {
                expandFolder();
            }
        });

        files.forEach(file => {
            const fileEl = document.createElement('a');
            fileEl.href = '#';
            fileEl.className = 'list-group-item list-group-item-action';
            fileEl.dataset.path = file.path;
            fileEl.dataset.type = 'file';
            fileEl.title = `${file.name} (${formatBytes(file.size)})`;

            const iconClass = getIconForFile(file.extension);
            fileEl.innerHTML = `<i class="ic ${iconClass}"></i> ${file.name}`;

            fileEl.addEventListener('click', (e) => {
                e.preventDefault();
                TabManager.openFile(file.path);
            });

            element.appendChild(fileEl);
        });

    } catch (error) {
        console.error('Failed to load file tree:', error);
        element.innerHTML = `<div class="list-group-item text-danger">${error.message}</div>`;
    }
}

function showContextMenu(menu, event) {
    event.preventDefault();
    const targetItem = event.target.closest('.list-group-item');
    if (!targetItem) return;

    const path = targetItem.dataset.path;
    const type = targetItem.dataset.type;

    if (type === 'file') {
        const extension = path.split('.').pop().toLowerCase();
        const archiveExtensions = ['zip'];
        const decompressItem = menu.querySelector('[data-action="decompress"]');
        if (decompressItem) {
            decompressItem.style.display = archiveExtensions.includes(extension) ? 'block' : 'none';
        }
    }

    hideContextMenus();

    // Display the menu to calculate its dimensions before positioning
    menu.style.display = 'block';

    const { innerWidth: windowWidth, innerHeight: windowHeight } = window;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = menu;

    let top = event.pageY;
    // If the menu would go off the bottom of the screen, show it above the cursor
    if (top + menuHeight > windowHeight) {
        top = event.pageY - menuHeight;
    }

    let left = event.pageX;
    // If the menu would go off the right of the screen, show it to the left of the cursor
    if (left + menuWidth > windowWidth) {
        left = event.pageX - menuWidth;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.dataset.path = path;
}

function hideContextMenus() {
    fileContextMenu.style.display = 'none';
    dirContextMenu.style.display = 'none';
}

async function handleContextMenuAction(action, path) {
    const element = document.querySelector(`[data-path="${path}"]`);

    const refreshParentNode = (itemElement) => {
        if (!itemElement) return;
        const parentListContainer = itemElement.parentElement;
        const parentFolderEl = parentListContainer.previousElementSibling;

        if (parentFolderEl && parentFolderEl.dataset.type === 'dir') {
            const parentPath = parentFolderEl.dataset.path;
            parentListContainer.innerHTML = '<div class="list-group-item">Loading...</div>';
            loadTree(parentPath, parentListContainer);
        } else {
            fileTreeEl.innerHTML = '';
            loadTree('', fileTreeEl);
        }
    };

    const refreshDirNode = (dirElement) => {
        if (!dirElement || dirElement.dataset.type !== 'dir') return;
        const subList = dirElement.nextElementSibling;
        if (subList && subList.style.display === 'block') {
            loadTree(dirElement.dataset.path, subList);
        } else if (subList) {
            subList.innerHTML = '';
        }
    };

    const actions = {
        'rename': (path) => {
            const currentName = path.split('/').pop();
            ModalManager.showInput('Rename Item', 'New Name', currentName, async (newName) => {
                if (!newName || newName === currentName) return;
                const formData = new FormData();
                formData.append('action', 'rename');
                formData.append('path', path);
                formData.append('new_name', newName);
                LoadingIndicator.show();
                try {
                    await postRequest(formData);
                    ToastManager.show(`Renamed to <strong>${newName}</strong>`, 'success');
                    refreshParentNode(element);
                } catch (error) {
                    ToastManager.show(`Rename failed: ${error.message}`, 'error');
                } finally {
                    LoadingIndicator.hide();
                }
            });
        },
        'copy': (path) => {
            const currentName = path.split('/').pop();
            ModalManager.showInput('Copy Item', 'Name for Copy', `copy_of_${currentName}`, async (newName) => {
                if (!newName || newName === currentName) return;
                const formData = new FormData();
                formData.append('action', 'copy');
                formData.append('path', path);
                formData.append('new_name', newName);
                LoadingIndicator.show();
                try {
                    await postRequest(formData);
                    ToastManager.show(`Created copy <strong>${newName}</strong>`, 'success');
                    refreshParentNode(element);
                } catch (error) {
                    ToastManager.show(`Copy failed: ${error.message}`, 'error');
                } finally {
                    LoadingIndicator.hide();
                }
            });
        },
        'download': (path) => {
            window.location.href = `${App.url}/api.php?action=download&path=${encodeURIComponent(path)}`;
        },
        'delete': (path) => {
            ModalManager.showConfirm('Confirm Deletion', `Are you sure you want to delete <strong>${path}</strong>? This action cannot be undone.`, async () => {
                const formData = new FormData();
                formData.append('action', 'delete');
                formData.append('path', path);
                LoadingIndicator.show();
                try {
                    await postRequest(formData);
                    ToastManager.show(`Deleted <strong>${path}</strong>`, 'success');
                    refreshParentNode(element);
                } catch (error) {
                    ToastManager.show(`Delete failed: ${error.message}`, 'error');
                } finally {
                    LoadingIndicator.hide();
                }
            });
        },
        'decompress': (path) => {
            ModalManager.showConfirm(
                'Confirm Decompression',
                `Are you sure you want to decompress <strong>${path}</strong> into the current directory? This may overwrite existing files.`,
                async () => {
                    const formData = new FormData();
                    formData.append('action', 'decompress');
                    formData.append('path', path);
                    LoadingIndicator.show();
                    try {
                        await postRequest(formData);
                        ToastManager.show(`Decompressed <strong>${path}</strong>`, 'success');
                        refreshParentNode(element);
                    } catch (error) {
                        ToastManager.show(`Decompression failed: ${error.message}`, 'error');
                    }
                    LoadingIndicator.hide();
                }
            );
        },
        'info': async (path) => {
            try {
                const response = await fetch(`${App.url}/api.php?action=get_file_info&path=${encodeURIComponent(path)}`);
                if (!response.ok) throw new Error('Network response was not ok.');
                const result = await response.json();
                if (result.status !== 'success') throw new Error(result.message);
                ModalManager.showInfo(result.data);
            } catch (error) {
                ToastManager.show(`Could not get file info: ${error.message}`, 'error');
            }
        },
        'new-file': (path) => {
            ModalManager.showInput('Create New File', 'File Name', '', async (fileName) => {
                if (!fileName) return;
                const formData = new FormData();
                formData.append('action', 'new_file');
                formData.append('path', path);
                formData.append('name', fileName);
                LoadingIndicator.show();
                try {
                    await postRequest(formData);
                    ToastManager.show(`File <strong>${fileName}</strong> created.`, 'success');
                    refreshDirNode(element);
                } catch (error) {
                    ToastManager.show(`Failed to create file: ${error.message}`, 'error');
                } finally {
                    LoadingIndicator.hide();
                }
            });
        },
        'new-dir': (path) => {
            ModalManager.showInput('Create New Directory', 'Directory Name', '', async (dirName) => {
                if (!dirName) return;
                const formData = new FormData();
                formData.append('action', 'new_dir');
                formData.append('path', path);
                formData.append('name', dirName);
                LoadingIndicator.show();
                try {
                    await postRequest(formData);
                    ToastManager.show(`Directory <strong>${dirName}</strong> created.`, 'success');
                    refreshDirNode(element);
                } catch (error) {
                    ToastManager.show(`Failed to create directory: ${error.message}`, 'error');
                } finally {
                    LoadingIndicator.hide();
                }
            });
        },
        'download-zip': (path) => {
            window.location.href = `${App.url}/api.php?action=download_zip&path=${encodeURIComponent(path)}`;
        },
        'upload': (path) => {
            ModalManager.showUpload(path, () => {
                refreshDirNode(element);
            });
        }
    };

    try {
        if (actions[action]) {
            await actions[action](path);
        } else {
            ToastManager.show(`Action '${action}' is not yet implemented.`, 'warning');
        }
    } catch (error) {
        ToastManager.show(`Error: ${error.message}`, 'error');
        console.error('Action failed:', error);
    }
}

export const FileTreeManager = {
    init() {
        fileTreeEl.addEventListener('contextmenu', (event) => {
            const target = event.target.closest('.list-group-item');
            if (!target) return;

            if (target.dataset.type === 'file') {
                showContextMenu(fileContextMenu, event);
            } else if (target.dataset.type === 'dir') {
                showContextMenu(dirContextMenu, event);
            }
        });

        [fileContextMenu, dirContextMenu].forEach(menu => {
            menu.addEventListener('click', (e) => {
                const action = e.target.closest('li')?.dataset.action;
                if (action) {
                    handleContextMenuAction(action, menu.dataset.path);
                }
                hideContextMenus();
            });
        });

        window.addEventListener('click', hideContextMenus);

        return loadTree('', fileTreeEl);
    },
    refresh() {
        if (fileTreeEl) {
            fileTreeEl.innerHTML = '';
            return loadTree('', fileTreeEl);
        }
    },
    newFileRoot() {
        ModalManager.showInput('Create New File', 'File Name', '', async (fileName) => {
            if (!fileName) return;
            const formData = new FormData();
            formData.append('action', 'new_file');
            formData.append('path', '');
            formData.append('name', fileName);
            LoadingIndicator.show();
            try {
                await postRequest(formData);
                ToastManager.show(`File <strong>${fileName}</strong> created.`, 'success');
                this.refresh();
            } catch (error) {
                ToastManager.show(`Failed to create file: ${error.message}`, 'error');
            } finally {
                LoadingIndicator.hide();
            }
        });
    },
    newDirRoot() {
        ModalManager.showInput('Create New Directory', 'Directory Name', '', async (dirName) => {
            if (!dirName) return;
            const formData = new FormData();
            formData.append('action', 'new_dir');
            formData.append('path', '');
            formData.append('name', dirName);
            LoadingIndicator.show();
            try {
                await postRequest(formData);
                ToastManager.show(`Directory <strong>${dirName}</strong> created.`, 'success');
                this.refresh();
            } catch (error) {
                ToastManager.show(`Failed to create directory: ${error.message}`, 'error');
            } finally {
                LoadingIndicator.hide();
            }
        });
    }
};

window.FileTreeManager = FileTreeManager;