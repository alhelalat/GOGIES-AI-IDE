// --- Simple Toast Manager ---
const ToastManager = {
    container: null,
    init() {
        this.container = document.getElementById('toast-container');
    },
    show(message, type = 'info', duration = 5000) {
        if (!this.container) this.init();
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');

        toastEl.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
        
        this.container.appendChild(toastEl);
        const toast = new bootstrap.Toast(toastEl, { delay: duration });
        toast.show();
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    }
};

// --- API Helper ---
async function postRequest(formData) {
    const response = await fetch(`${App.url}/api.php`, {
        method: 'POST',
        body: formData
    });
    const result = await response.json();
    if (result.status !== 'success') {
        throw new Error(result.message || 'An unknown error occurred.');
    }
    return result;
}

// --- Main Admin Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const userModalEl = document.getElementById('userModal');
    const userModal = new bootstrap.Modal(userModalEl);
    const workspaceModalEl = document.getElementById('workspaceModal');
    const workspaceModal = new bootstrap.Modal(workspaceModalEl);
    const confirmModalEl = document.getElementById('confirmModal');
    const confirmModal = new bootstrap.Modal(confirmModalEl);

    const usersTableBody = document.getElementById('usersTableBody');
    const workspacesTableBody = document.getElementById('workspacesTableBody');

    async function loadData() {
        try {
            const response = await fetch(`${App.url}/api.php?action=get_users_and_workspaces`);
            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.message);
            }
            renderUsers(data.data.users);
            renderWorkspaces(data.data.workspaces);
        } catch (error) {
            ToastManager.show(`Failed to load data: ${error.message}`, 'danger');
        }
    }

    function renderUsers(users) {
        usersTableBody.innerHTML = '';
        for (const username in users) {
            const user = users[username];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${username}</td>
                <td>${user.permissions.join(', ')}</td>
                <td>
                    <button class="btn btn-sm btn-warning edit-user-btn" data-username="${username}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-user-btn" data-username="${username}">Delete</button>
                </td>
            `;
            usersTableBody.appendChild(tr);
        }
    }

    function renderWorkspaces(workspaces) {
        workspacesTableBody.innerHTML = '';
        for (const name in workspaces) {
            const path = workspaces[name];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${name}</td>
                <td>${path}</td>
                <td>
                    <button class="btn btn-sm btn-warning edit-workspace-btn" data-name="${name}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-workspace-btn" data-name="${name}">Delete</button>
                </td>
            `;
            workspacesTableBody.appendChild(tr);
        }
    }

    // --- Event Listeners ---

    // Add User
    document.getElementById('addUserBtn').addEventListener('click', () => {
        document.getElementById('userForm').reset();
        document.getElementById('userModalLabel').textContent = 'Add User';
        document.getElementById('username').readOnly = false;
        document.getElementById('originalUsername').value = '';
        userModal.show();
    });

    // Add Workspace
    document.getElementById('addWorkspaceBtn').addEventListener('click', () => {
        document.getElementById('workspaceForm').reset();
        document.getElementById('workspaceModalLabel').textContent = 'Add Workspace';
        document.getElementById('workspaceName').readOnly = false;
        document.getElementById('originalWorkspaceName').value = '';
        workspaceModal.show();
    });

    // Save User
    document.getElementById('saveUserBtn').addEventListener('click', async () => {
        const form = document.getElementById('userForm');
        const formData = new FormData(form);
        formData.append('action', 'save_user');
        
        try {
            const result = await postRequest(formData);
            ToastManager.show(result.message, 'success');
            userModal.hide();
            loadData();
        } catch (error) {
            ToastManager.show(error.message, 'danger');
        }
    });

    // Save Workspace
    document.getElementById('saveWorkspaceBtn').addEventListener('click', async () => {
        const form = document.getElementById('workspaceForm');
        const formData = new FormData(form);
        formData.append('action', 'save_workspace');
        
        try {
            const result = await postRequest(formData);
            ToastManager.show(result.message, 'success');
            workspaceModal.hide();
            loadData();
        } catch (error) {
            ToastManager.show(error.message, 'danger');
        }
    });

    // Edit/Delete button delegation
    document.body.addEventListener('click', async (e) => {
        // Edit User
        if (e.target.classList.contains('edit-user-btn')) {
            const username = e.target.dataset.username;
            const response = await fetch(`${App.url}/api.php?action=get_users_and_workspaces`);
            const data = await response.json();
            const user = data.data.users[username];

            document.getElementById('userForm').reset();
            document.getElementById('userModalLabel').textContent = 'Edit User';
            document.getElementById('originalUsername').value = username;
            document.getElementById('username').value = username;
            document.getElementById('username').readOnly = true;
            document.getElementById('permissions').value = user.permissions.join(', ');
            userModal.show();
        }

        // Delete User
        if (e.target.classList.contains('delete-user-btn')) {
            const username = e.target.dataset.username;
            document.getElementById('confirmModalBody').textContent = `Are you sure you want to delete user '${username}'? This cannot be undone.`;
            confirmModal.show();
            document.getElementById('confirmDeleteBtn').onclick = async () => {
                const formData = new FormData();
                formData.append('action', 'delete_user');
                formData.append('username', username);
                try {
                    const result = await postRequest(formData);
                    ToastManager.show(result.message, 'success');
                    confirmModal.hide();
                    loadData();
                } catch (error) {
                    ToastManager.show(error.message, 'danger');
                }
            };
        }

        // Edit Workspace
        if (e.target.classList.contains('edit-workspace-btn')) {
            const name = e.target.dataset.name;
            const response = await fetch(`${App.url}/api.php?action=get_users_and_workspaces`);
            const data = await response.json();
            const path = data.data.workspaces[name];

            document.getElementById('workspaceForm').reset();
            document.getElementById('workspaceModalLabel').textContent = 'Edit Workspace';
            document.getElementById('originalWorkspaceName').value = name;
            document.getElementById('workspaceName').value = name;
            document.getElementById('workspaceName').readOnly = true;
            document.getElementById('workspacePath').value = path;
            workspaceModal.show();
        }

        // Delete Workspace
        if (e.target.classList.contains('delete-workspace-btn')) {
            const name = e.target.dataset.name;
            document.getElementById('confirmModalBody').textContent = `Are you sure you want to delete workspace '${name}'? This does not delete the files on disk.`;
            confirmModal.show();
            document.getElementById('confirmDeleteBtn').onclick = async () => {
                const formData = new FormData();
                formData.append('action', 'delete_workspace');
                formData.append('name', name);
                try {
                    const result = await postRequest(formData);
                    ToastManager.show(result.message, 'success');
                    confirmModal.hide();
                    loadData();
                } catch (error) {
                    ToastManager.show(error.message, 'danger');
                }
            };
        }
    });

    // Initial Load
    loadData();
});