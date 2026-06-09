import { ToastManager } from './toastManager.js';
import { ModalManager } from './modals.js';

let mainModal = null;
let userModal = null;
let workspaceModal = null;

const modalHtml = `
<!-- Main Modal -->
<div class="modal fade" id="adminMainModal" tabindex="-1" aria-hidden="true" style="backdrop-filter: blur(5px);">
    <div class="modal-dialog modal-lg modal-dialog-centered text-light">
        <div class="modal-content border border-secondary shadow-lg" style="background-color: #071322 !important; box-shadow: 0 15px 50px rgba(0,0,0,0.8); border-radius: 12px; overflow: hidden;">
            <div class="modal-header border-bottom border-secondary py-3 d-flex align-items-center justify-content-between" style="background: linear-gradient(135deg, #0b1a2e 0%, #06111f 100%);">
                <h5 class="modal-title d-flex align-items-center text-white" style="font-size: 18px; font-weight: 600;">
                    <i class="bi bi-shield-lock text-primary me-2" style="font-size: 20px;"></i> Gogies IDE Admin Panel
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-0">
                <!-- Nav Tabs -->
                <ul class="nav nav-tabs border-bottom border-secondary" id="adminTabs" role="tablist" style="background-color: #0b1929; border: none;">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active border-0 text-light py-3 px-4 position-relative" id="users-tab" data-bs-toggle="tab" data-bs-target="#users-panel" type="button" role="tab" style="font-weight: 500; font-size: 14px; background: transparent; transition: all 0.2s;">
                            <i class="bi bi-people-fill text-info me-2"></i> Users Management
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link border-0 text-light py-3 px-4 position-relative" id="workspaces-tab" data-bs-toggle="tab" data-bs-target="#workspaces-panel" type="button" role="tab" style="font-weight: 500; font-size: 14px; background: transparent; transition: all 0.2s;">
                            <i class="bi bi-folder-symlink-fill text-warning me-2"></i> Workspace Management
                        </button>
                    </li>
                </ul>
                
                <!-- Tab Panes -->
                <div class="tab-content p-4" id="adminTabsContent" style="max-height: 500px; overflow-y: auto; background-color: #040c16;">
                    
                    <!-- Users Pane -->
                    <div class="tab-pane fade show active" id="users-panel" role="tabpanel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="text-white mb-0" style="font-size: 15px; font-weight: 500;"><i class="bi bi-person-badge text-info me-1"></i> System Users</h6>
                            <button id="adminAddUserBtn" class="btn btn-sm btn-primary px-3 py-1.5 d-flex align-items-center" style="font-size: 12px; font-weight: 500; border-radius: 6px;">
                                <i class="bi bi-person-plus-fill me-1.5"></i> Add New User
                            </button>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-dark table-hover align-middle border border-secondary" style="border-radius: 8px; overflow: hidden; --bs-table-bg: #071424; --bs-table-hover-bg: #0c2036;">
                                <thead class="table-dark border-bottom border-secondary " style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                    <tr>
                                        <th class="ps-3 py-3" style="width: 35%;">Username</th>
                                        <th class="py-3" style="width: 45%;">Permissions / Workspaces</th>
                                        <th class="pe-3 py-3 text-end" style="width: 20%;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="adminUsersTableBody" style="font-size: 13px;">
                                    <!-- Dynamic rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- Workspaces Pane -->
                    <div class="tab-pane fade" id="workspaces-panel" role="tabpanel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="text-white mb-0" style="font-size: 15px; font-weight: 500;"><i class="bi bi-folder2-open text-warning me-1"></i> Configured Workspaces</h6>
                            <button id="adminAddWorkspaceBtn" class="btn btn-sm btn-primary px-3 py-1.5 d-flex align-items-center" style="font-size: 12px; font-weight: 500; border-radius: 6px;">
                                <i class="bi bi-folder-plus me-1.5"></i> Add Workspace
                            </button>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-dark table-hover align-middle border border-secondary" style="border-radius: 8px; overflow: hidden; --bs-table-bg: #071424; --bs-table-hover-bg: #0c2036;">
                                <thead class="table-dark border-bottom border-secondary " style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                    <tr>
                                        <th class="ps-3 py-3" style="width: 35%;">Workspace Name</th>
                                        <th class="py-3" style="width: 45%;">Absolute Server Path</th>
                                        <th class="pe-3 py-3 text-end" style="width: 20%;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="adminWorkspacesTableBody" style="font-size: 13px;">
                                    <!-- Dynamic rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    </div>
</div>

<!-- User Add/Edit Modal -->
<div class="modal fade" id="adminUserModal" tabindex="-1" aria-hidden="true" style="z-index: 1070; backdrop-filter: blur(3px);">
    <div class="modal-dialog modal-dialog-centered text-light" style="max-width: 420px;">
        <div class="modal-content border border-secondary shadow-lg" style="background-color: #091727 !important; border-radius: 10px;">
            <div class="modal-header border-bottom border-secondary py-3">
                <h5 class="modal-title d-flex align-items-center text-white" id="adminUserModalLabel" style="font-size: 15px; font-weight: 600;">
                    Add User
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body py-3">
                <form id="adminUserForm">
                    <input type="hidden" id="adminOriginalUsername" name="original_username">
                    <div class="mb-3">
                        <label for="adminUsername" class="form-label  small mb-1" style="font-weight: 500;">Username</label>
                        <input type="text" class="form-control text-light border-secondary bg-dark" id="adminUsername" name="username" required style="border-radius: 6px; font-size: 13px;">
                    </div>
                    <div class="mb-3">
                        <label for="adminPassword" class="form-label  small mb-1" style="font-weight: 500;">Password</label>
                        <input type="password" class="form-control text-light border-secondary bg-dark" id="adminPassword" name="password" style="border-radius: 6px; font-size: 13px;">
                        <div class=" " id="adminPasswordHelp" style="font-size: 11px;">Password is required for new users.</div>
                    </div>
                    <div class="mb-3">
                        <label for="adminPermissions" class="form-label  small mb-1" style="font-weight: 500;">Permissions</label>
                        <input type="text" class="form-control text-light border-secondary bg-dark" id="adminPermissions" name="permissions" required style="border-radius: 6px; font-size: 13px;">
                        <div class=" " style="font-size: 11px;">Comma-separated list of workspace names, or * for all access.</div>
                    </div>
                </form>
            </div>
            <div class="modal-footer border-top border-secondary py-2">
                <button type="button" class="btn btn-sm btn-secondary px-3" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-sm btn-primary px-3" id="adminSaveUserBtn">Save User</button>
            </div>
        </div>
    </div>
</div>

<!-- Workspace Add/Edit Modal -->
<div class="modal fade" id="adminWorkspaceModal" tabindex="-1" aria-hidden="true" style="z-index: 1070; backdrop-filter: blur(3px);">
    <div class="modal-dialog modal-dialog-centered text-light" style="max-width: 420px;">
        <div class="modal-content border border-secondary shadow-lg" style="background-color: #091727 !important; border-radius: 10px;">
            <div class="modal-header border-bottom border-secondary py-3">
                <h5 class="modal-title d-flex align-items-center text-white" id="adminWorkspaceModalLabel" style="font-size: 15px; font-weight: 600;">
                    Add Workspace
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body py-3">
                <form id="adminWorkspaceForm">
                    <input type="hidden" id="adminOriginalWorkspaceName" name="original_name">
                    <div class="mb-3">
                        <label for="adminWorkspaceName" class="form-label  small mb-1" style="font-weight: 500;">Workspace Name</label>
                        <input type="text" class="form-control text-light border-secondary bg-dark" id="adminWorkspaceName" name="name" required style="border-radius: 6px; font-size: 13px;">
                    </div>
                    <div class="mb-3">
                        <label for="adminWorkspacePath" class="form-label  small mb-1" style="font-weight: 500;">Path</label>
                        <input type="text" class="form-control text-light border-secondary bg-dark" id="adminWorkspacePath" name="path" required style="border-radius: 6px; font-size: 13px;">
                        <div class=" " style="font-size: 11px;">Absolute path on the server (e.g. /media/asus/apps/dev/ide/data)</div>
                    </div>
                </form>
            </div>
            <div class="modal-footer border-top border-secondary py-2">
                <button type="button" class="btn btn-sm btn-secondary px-3" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-sm btn-primary px-3" id="adminSaveWorkspaceBtn">Save Workspace</button>
            </div>
        </div>
    </div>
</div>
`;

export const AdminManager = {
    init() {
        if (document.getElementById('adminMainModal')) return;

        // Append HTML structure
        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        document.body.appendChild(div);

        // Initialize Bootstrap Modal instances
        mainModal = new bootstrap.Modal(document.getElementById('adminMainModal'));
        userModal = new bootstrap.Modal(document.getElementById('adminUserModal'));
        workspaceModal = new bootstrap.Modal(document.getElementById('adminWorkspaceModal'));

        // Register static event listeners
        document.getElementById('adminAddUserBtn').addEventListener('click', () => {
            document.getElementById('adminUserForm').reset();
            document.getElementById('adminUserModalLabel').textContent = 'Add User';
            document.getElementById('adminUsername').readOnly = false;
            document.getElementById('adminOriginalUsername').value = '';
            document.getElementById('adminPasswordHelp').textContent = 'Password is required for new users.';
            userModal.show();
        });

        document.getElementById('adminAddWorkspaceBtn').addEventListener('click', () => {
            document.getElementById('adminWorkspaceForm').reset();
            document.getElementById('adminWorkspaceModalLabel').textContent = 'Add Workspace';
            document.getElementById('adminWorkspaceName').readOnly = false;
            document.getElementById('adminOriginalWorkspaceName').value = '';
            workspaceModal.show();
        });

        document.getElementById('adminSaveUserBtn').addEventListener('click', async () => {
            const form = document.getElementById('adminUserForm');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            const formData = new FormData(form);
            formData.append('action', 'save_user');

            try {
                const response = await fetch(`${App.url}/api.php`, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.status === 'success') {
                    ToastManager.show(result.message, 'success');
                    userModal.hide();
                    AdminManager.loadData();
                } else {
                    ToastManager.show(result.message, 'error');
                }
            } catch (err) {
                ToastManager.show('Failed to save user: ' + err.message, 'error');
            }
        });

        document.getElementById('adminSaveWorkspaceBtn').addEventListener('click', async () => {
            const form = document.getElementById('adminWorkspaceForm');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            const formData = new FormData(form);
            formData.append('action', 'save_workspace');

            try {
                const response = await fetch(`${App.url}/api.php`, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.status === 'success') {
                    ToastManager.show(result.message, 'success');
                    workspaceModal.hide();
                    AdminManager.loadData();
                    // Reload workspace dropdown switcher if loaded
                    if (window.workspaceSwitcher && typeof window.workspaceSwitcher.loadWorkspaces === 'function') {
                        window.workspaceSwitcher.loadWorkspaces();
                    }
                } else {
                    ToastManager.show(result.message, 'error');
                }
            } catch (err) {
                ToastManager.show('Failed to save workspace: ' + err.message, 'error');
            }
        });

        // Delegate Action Buttons (Edit/Delete) on dynamic tables
        document.getElementById('adminUsersTableBody').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-user-btn');
            const deleteBtn = e.target.closest('.delete-user-btn');

            if (editBtn) {
                const username = editBtn.dataset.username;
                const permissions = editBtn.dataset.permissions;

                document.getElementById('adminUserForm').reset();
                document.getElementById('adminUserModalLabel').textContent = 'Edit User';
                document.getElementById('adminOriginalUsername').value = username;
                document.getElementById('adminUsername').value = username;
                document.getElementById('adminUsername').readOnly = true;
                document.getElementById('adminPermissions').value = permissions;
                document.getElementById('adminPasswordHelp').textContent = 'Leave blank to keep the current password.';
                userModal.show();
            }

            if (deleteBtn) {
                const username = deleteBtn.dataset.username;
                ModalManager.showConfirm(
                    'Delete User',
                    `Are you sure you want to delete user '<strong>${username}</strong>'? This action cannot be undone.`,
                    async () => {
                        const formData = new FormData();
                        formData.append('action', 'delete_user');
                        formData.append('username', username);
                        try {
                            const response = await fetch(`${App.url}/api.php`, {
                                method: 'POST',
                                body: formData
                            });
                            const result = await response.json();
                            if (result.status === 'success') {
                                ToastManager.show(result.message, 'success');
                                AdminManager.loadData();
                            } else {
                                ToastManager.show(result.message, 'error');
                            }
                        } catch (err) {
                            ToastManager.show('Failed to delete user: ' + err.message, 'error');
                        }
                    }
                );
            }
        });

        document.getElementById('adminWorkspacesTableBody').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-workspace-btn');
            const deleteBtn = e.target.closest('.delete-workspace-btn');

            if (editBtn) {
                const name = editBtn.dataset.name;
                const path = editBtn.dataset.path;

                document.getElementById('adminWorkspaceForm').reset();
                document.getElementById('adminWorkspaceModalLabel').textContent = 'Edit Workspace';
                document.getElementById('adminOriginalWorkspaceName').value = name;
                document.getElementById('adminWorkspaceName').value = name;
                document.getElementById('adminWorkspaceName').readOnly = true;
                document.getElementById('adminWorkspacePath').value = path;
                workspaceModal.show();
            }

            if (deleteBtn) {
                const name = deleteBtn.dataset.name;
                ModalManager.showConfirm(
                    'Delete Workspace',
                    `Are you sure you want to delete workspace '<strong>${name}</strong>'? This does not delete the files on disk.`,
                    async () => {
                        const formData = new FormData();
                        formData.append('action', 'delete_workspace');
                        formData.append('name', name);
                        try {
                            const response = await fetch(`${App.url}/api.php`, {
                                method: 'POST',
                                body: formData
                            });
                            const result = await response.json();
                            if (result.status === 'success') {
                                ToastManager.show(result.message, 'success');
                                AdminManager.loadData();
                                if (window.workspaceSwitcher && typeof window.workspaceSwitcher.loadWorkspaces === 'function') {
                                    window.workspaceSwitcher.loadWorkspaces();
                                }
                            } else {
                                ToastManager.show(result.message, 'error');
                            }
                        } catch (err) {
                            ToastManager.show('Failed to delete workspace: ' + err.message, 'error');
                        }
                    }
                );
            }
        });
    },

    async loadData() {
        try {
            const response = await fetch(`${App.url}/api.php?action=get_users_and_workspaces`);
            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.message);
            }

            AdminManager.renderUsers(data.data.users);
            AdminManager.renderWorkspaces(data.data.workspaces);
        } catch (error) {
            ToastManager.show('Failed to load admin data: ' + error.message, 'error');
        }
    },

    renderUsers(users) {
        const tbody = document.getElementById('adminUsersTableBody');
        tbody.innerHTML = '';

        for (const username in users) {
            const user = users[username];
            const tr = document.createElement('tr');
            tr.className = 'border-bottom border-secondary border-opacity-50';
            tr.innerHTML = `
                <td class="ps-3 py-3 text-white font-monospace" style="font-weight: 500;">${username}</td>
                <td class="py-3 ">
                    ${user.permissions.map(p => `<span class="badge bg-secondary bg-opacity-25 text-info border border-info border-opacity-25 me-1" style="font-size: 10px; font-weight: 500;">${p}</span>`).join('')}
                </td>
                <td class="pe-3 py-3 text-end">
                    <button class="btn btn-sm btn-link text-warning p-1 me-2 edit-user-btn" data-username="${username}" data-permissions="${user.permissions.join(', ')}" title="Edit User">
                        <i class="bi bi-pencil-square" style="font-size: 15px;"></i>
                    </button>
                    <button class="btn btn-sm btn-link text-danger p-1 delete-user-btn" data-username="${username}" title="Delete User">
                        <i class="bi bi-trash3-fill" style="font-size: 15px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        }
    },

    renderWorkspaces(workspaces) {
        const tbody = document.getElementById('adminWorkspacesTableBody');
        tbody.innerHTML = '';

        for (const name in workspaces) {
            const path = workspaces[name];
            const tr = document.createElement('tr');
            tr.className = 'border-bottom border-secondary border-opacity-50';
            tr.innerHTML = `
                <td class="ps-3 py-3 text-white" style="font-weight: 500;">
                    <i class="bi bi-folder-fill text-warning me-1.5"></i> ${name}
                </td>
                <td class="py-3  font-monospace" style="font-size: 12px;">${path}</td>
                <td class="pe-3 py-3 text-end">
                    <button class="btn btn-sm btn-link text-warning p-1 me-2 edit-workspace-btn" data-name="${name}" data-path="${path}" title="Edit Workspace">
                        <i class="bi bi-pencil-square" style="font-size: 15px;"></i>
                    </button>
                    <button class="btn btn-sm btn-link text-danger p-1 delete-workspace-btn" data-name="${name}" title="Delete Workspace">
                        <i class="bi bi-trash3-fill" style="font-size: 15px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        }
    },

    show() {
        AdminManager.init();
        AdminManager.loadData();
        mainModal.show();
    }
};
