document.addEventListener('DOMContentLoaded', () => {
    const switcherContainer = document.getElementById('workspace-switcher');
    if (!switcherContainer) return;

    const currentWorkspaceNameEl = document.getElementById('current-workspace-name');
    const workspaceListEl = document.getElementById('workspace-list');
    const dropdownToggle = document.getElementById('workspaceDropdown');

    // 1. Get data from localStorage
    const accessibleWorkspaces = JSON.parse(localStorage.getItem('accessible_workspaces') || '{}');
    let currentWorkspaceName = localStorage.getItem('current_workspace_name');

    const workspaceNames = Object.keys(accessibleWorkspaces);

    if (workspaceNames.length === 0) {
        currentWorkspaceNameEl.textContent = 'No Workspaces';
        dropdownToggle.classList.remove('dropdown-toggle');
        dropdownToggle.style.pointerEvents = 'none';
        return;
    }
 
    // 2. Set current workspace name, defaulting to the first one if needed
    if (!currentWorkspaceName || !accessibleWorkspaces[currentWorkspaceName]) {
        currentWorkspaceName = workspaceNames[0];
        localStorage.setItem('current_workspace_name', currentWorkspaceName);
    }
    currentWorkspaceNameEl.textContent = currentWorkspaceName;
    dropdownToggle.setAttribute('title', `Current Workspace: ${currentWorkspaceName}`);

    // 3. If there is more than one workspace, make it a functional dropdown
    if (workspaceNames.length > 1) {
        workspaceListEl.innerHTML = ''; // Clear any placeholders
        workspaceNames.forEach(name => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.classList.add('dropdown-item', 'workspace-item');
            a.href = '#';
            a.dataset.name = name;
            a.textContent = name;
            if (name === currentWorkspaceName) {
                a.classList.add('active');
            }
            li.appendChild(a);
            workspaceListEl.appendChild(li);
        });

        // 4. Add event listener to switch workspaces
        workspaceListEl.addEventListener('click', async (e) => {
            if (e.target.classList.contains('workspace-item')) {
                e.preventDefault();
                const newWorkspaceName = e.target.dataset.name;

                if (newWorkspaceName && newWorkspaceName !== currentWorkspaceName) {
                    localStorage.setItem('current_workspace_name', newWorkspaceName);

                    const formData = new FormData();
                    formData.append('action', 'switch_workspace');
                    formData.append('name', newWorkspaceName);

                    await fetch('api.php', { method: 'POST', body: formData });
                    window.location.reload();
                }
            }
        });
    } else {
        // If only one workspace, disable dropdown functionality
        dropdownToggle.classList.remove('dropdown-toggle');
        dropdownToggle.style.pointerEvents = 'none';
    }
});