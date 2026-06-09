import { ToastManager } from '../assets/js/toastManager.js';
import { ModalManager } from '../assets/js/modals.js';

let mainModal = null;
let profileModal = null;
let aceEditor = null;
let currentProfileId = null;
let currentDbType = 'sqlite';
let currentActiveTable = null;
let currentSchema = null;
let isConnected = false;

// Browse state variables for pagination and filtering
let browseCurrentPage = 1;
let browsePageSize = 25;
let browseFilter = '';
let browseTotalCount = 0;
let browseSortColumn = '';
let browseSortOrder = ''; // 'ASC', 'DESC', or ''
let editRecordModal = null;
let originalEditRowData = null;
let workspaceList = [];

// SQL utility helpers for dialect-safe value formatting
function formatSqlValue(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    // Standard SQL escape: double single quotes
    return `'${String(val).replace(/'/g, "''")}'`;
}

const modalHtml = `
<!-- Main DB Modal -->
<div class="modal fade" id="dbMainModal" tabindex="-1" aria-hidden="true" style="backdrop-filter: blur(5px);">
    <div class="modal-dialog text-light" style="max-width: 95vw; height: 98vh; margin: 1vh auto;">
        <div class="modal-content border border-secondary shadow-lg d-flex flex-column" style="height: 100%; border-radius: 12px; overflow: hidden;">
            <div class="modal-header border-bottom border-secondary py-2 d-flex align-items-center justify-content-between flex-shrink-0" style="background-color: #08121f;">
                <h5 class="modal-title d-flex align-items-center text-white m-0" style="font-size: 18px; font-weight: 600;">
                    <i class="bi bi-database-fill text-warning me-2" style="font-size: 20px;"></i> Gogies{DB}
                </h5>
                
                <div class="d-flex align-items-center justify-content-center flex-grow-1 mx-4">
                    <label class="small text-white-50 me-3 mb-0" style="font-weight: 500;">Connection Profile:</label>
                    <select class="form-select form-select-sm bg-dark text-light border-secondary shadow-none me-3" id="dbProfileSelector" style="width: 250px; border-radius: 6px; font-size: 13px;">
                        <option value="">-- Select Connection --</option>
                    </select>
                    <div>
                        <button class="btn btn-sm btn-link text-info p-0 me-3" id="dbAddProfileBtn" title="Add Connection Profile">
                            <i class="bi bi-plus-circle-fill" style="font-size: 16px;"></i>
                        </button>
                        <button class="btn btn-sm btn-link text-warning p-0 me-3" id="dbEditProfileBtn" title="Edit Active Connection" disabled>
                            <i class="bi bi-pencil-square" style="font-size: 16px;"></i>
                        </button>
                        <button class="btn btn-sm btn-link text-danger p-0" id="dbDeleteProfileBtn" title="Delete Connection Profile" disabled>
                            <i class="bi bi-trash3-fill" style="font-size: 16px;"></i>
                        </button>
                    </div>
                </div>

                <button type="button" class="btn-close btn-close-white m-0" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-0 d-flex flex-column flex-grow-1" style="min-height: 0;">
                <div class="container-fluid p-0 d-flex flex-column h-100">
                    <div class="row g-0 h-100">
                        <!-- Left Sidebar: Connections & Tables -->
                        <!-- Left Sidebar: Schema -->
                        <div class="col-md-3 db-sidebar d-flex flex-column h-100 border-end border-secondary" style="background-color: #121922;">
                            <!-- Schema tree -->
                            <div class="flex-grow-1 overflow-auto p-2" id="dbSchemaTree">
                                <div class="text-center py-5 small">
                                    <i class="bi bi-hdd-network mb-2 d-block " style="font-size: 24px;"></i>
                                    <span class="">Select a connection to load schema</span>
                                </div>
                            </div>
                        </div>

                        <!-- Right Area: Tabbed Interface -->
                        <div class="col-md-9 db-main-area d-flex flex-column h-100 position-relative">
                            <!-- Top Action Bar -->
                            <div class="db-toolbar d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary d-none" id="dbTopNavBar" style="background-color: #0c1827;">
                                <div class="d-flex align-items-center">
                                    <strong class="text-warning me-4" id="dbActiveTableName"><i class="bi bi-table me-1"></i> No Table</strong>
                                    <ul class="nav nav-pills nav-sm" id="dbActionTabs" role="tablist">
                                        <li class="nav-item" role="presentation">
                                            <button class="nav-link py-1 px-3 text-light border border-secondary me-2 bg-primary" id="tab-browse" data-view="browse"><i class="bi bi-list-ul me-1"></i> Browse</button>
                                        </li>
                                        <li class="nav-item" role="presentation">
                                            <button class="nav-link py-1 px-3 text-light border border-secondary me-2" id="tab-structure" data-view="structure"><i class="bi bi-gear me-1"></i> Structure</button>
                                        </li>
                                        <li class="nav-item" role="presentation">
                                            <button class="nav-link py-1 px-3 text-light border border-secondary me-2" id="tab-sql" data-view="sql"><i class="bi bi-code-square me-1"></i> SQL</button>
                                        </li>
                                        <li class="nav-item" role="presentation">
                                            <button class="nav-link py-1 px-3 text-light border border-secondary" id="tab-insert" data-view="insert"><i class="bi bi-plus-circle me-1"></i> Insert</button>
                                        </li>
                                    </ul>
                                </div>
                                <div class="small text-white-50" id="dbConnectionStatus">
                                    <span class="badge bg-danger">Disconnected</span>
                                </div>
                            </div>

                            <!-- Dynamic Content Area -->
                            <div class="flex-grow-1 position-relative overflow-hidden bg-black" id="dbContentContainer">
                                
                                <!-- Default Empty State -->
                                <div id="view-empty" class="h-100 d-flex align-items-center justify-content-center ">
                                    <div class="text-center">
                                        <i class="bi bi-database" style="font-size: 4rem;"></i>
                                        <h5 class="mt-3 text-light">Gogies{DB} Studio</h5>
                                        <p class="small">Connect to a profile and select a table.</p>
                                    </div>
                                </div>

                                <!-- SQL Editor View -->
                                <div id="view-sql" class="h-100 d-none flex-column">
                                    <div class="db-query-wrapper" style="height: 40%;">
                                        <div id="dbSqlEditor" class="db-ace-editor"></div>
                                    </div>
                                    <div class="db-toolbar border-bottom border-secondary">
                                        <div class="d-flex align-items-center">
                                            <button class="btn btn-sm btn-warning px-3 py-1.5 d-flex align-items-center me-2" id="dbRunQueryBtn" style="font-size: 12px; font-weight: 600; border-radius: 6px;" disabled>
                                                <i class="bi bi-play-fill me-1" style="font-size: 14px;"></i> Run Query
                                            </button>
                                            <button class="btn btn-sm btn-outline-secondary px-3 py-1.5 d-flex align-items-center" id="dbClearQueryBtn" style="font-size: 12px; border-radius: 6px;">
                                                <i class="bi bi-trash me-1"></i> Clear
                                            </button>
                                        </div>
                                    </div>
                                    <div class="db-results-area flex-grow-1 overflow-auto p-3" id="dbResultsArea">
                                        <div class="text-center  py-5 small">
                                            <i class="bi bi-table mb-2 d-block" style="font-size: 30px; color: #1e2d3d;"></i>
                                            Custom SQL results will render here
                                        </div>
                                    </div>
                                    <div class="db-status-bar border-top border-secondary bg-dark px-3 py-1 d-flex justify-content-between align-items-center" style="font-size:11px;">
                                        <span id="dbExecutionStats" class="">Ready.</span>
                                        <span id="dbRowsAffected" class="text-warning">0 rows</span>
                                    </div>
                                </div>

                                <!-- Browse Data View -->
                                <div id="view-browse" class="h-100 d-none overflow-auto p-0">
                                    <div id="dbBrowseResultsArea"></div>
                                </div>

                                <!-- Structure View -->
                                <div id="view-structure" class="h-100 d-none overflow-auto p-4">
                                    <div id="dbStructureArea"></div>
                                </div>

                                <!-- Insert Form View -->
                                <div id="view-insert" class="h-100 d-none overflow-auto p-4">
                                    <div class="card text-bg-dark border-secondary mx-auto" style="max-width: 800px; border-radius: 10px;">
                                        <div class="card-header border-secondary py-3 text-light"><i class="bi bi-plus-circle text-success me-2"></i> <strong>Insert New Row</strong></div>
                                        <div class="card-body" id="dbInsertFormArea">
                                            <div class="text-center  py-5 small">Select a table first</div>
                                        </div>
                                        <div class="card-footer border-secondary text-end py-3">
                                            <button class="btn btn-sm btn-success px-4" id="dbSubmitInsertBtn">Save Record</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Profile Add/Edit Modal -->
<div class="modal fade" id="dbProfileModal" tabindex="-1" aria-hidden="true" style="z-index: 1070; backdrop-filter: blur(3px);">
    <div class="modal-dialog modal-dialog-centered text-light" style="max-width: 440px;">
        <div class="modal-content border border-secondary shadow-lg" style="background-color: #081423 !important; border-radius: 10px;">
            <div class="modal-header border-bottom border-secondary py-3">
                <h5 class="modal-title d-flex align-items-center text-white" id="dbProfileModalLabel" style="font-size: 15px; font-weight: 600;">
                    Add Connection Profile
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body py-3">
                <form id="dbProfileForm">
                    <input type="hidden" id="dbProfileId" name="id">
                    <div class="mb-3">
                        <label class="form-label small mb-1">Profile Name</label>
                        <input type="text" class="form-control form-control-sm text-light border-secondary bg-dark" name="name" required placeholder="My SQLite Db" style="border-radius: 6px; font-size: 13px;">
                    </div>
                    <div class="mb-3">
                        <label class="form-label small mb-1">Database Type</label>
                        <select class="form-select form-select-sm text-light border-secondary bg-dark" name="type" id="dbProfileType" required style="border-radius: 6px; font-size: 13px;">
                            <option value="sqlite">SQLite (File-based)</option>
                            <option value="mysql">MySQL / MariaDB</option>
                            <option value="pgsql">PostgreSQL</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small mb-1">Workspace</label>
                        <select class="form-select form-select-sm text-light border-secondary bg-dark" name="workspace_name" id="dbProfileWorkspaceSelect" required style="border-radius: 6px; font-size: 13px;">
                            <option value="">Loading...</option>
                        </select>
                    </div>

                    <!-- SQLite inputs -->
                    <div id="dbSqliteInputs">
                        <div class="mb-3">
                            <label class="form-label small mb-1">Database Filename</label>
                            <input type="text" class="form-control form-control-sm text-light border-secondary bg-dark" name="filename" placeholder="db.sqlite" style="border-radius: 6px; font-size: 13px;">
                        </div>
                    </div>

                    <!-- MySQL inputs -->
                    <div id="dbMysqlInputs" style="display:none;">
                        <div class="row g-2 mb-3">
                            <div class="col-8">
                                <label class="form-label small mb-1">Hostname</label>
                                <input type="text" class="form-control form-control-sm text-light border-secondary bg-dark" name="host" placeholder="127.0.0.1" style="border-radius: 6px; font-size: 13px;">
                            </div>
                            <div class="col-4">
                                <label class="form-label small mb-1">Port</label>
                                <input type="text" class="form-control form-control-sm text-light border-secondary bg-dark" name="port" placeholder="3306" style="border-radius: 6px; font-size: 13px;">
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label small mb-1">Database Name</label>
                            <input type="text" class="form-control form-control-sm text-light border-secondary bg-dark" name="database" placeholder="my_database" style="border-radius: 6px; font-size: 13px;">
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <label class="form-label small mb-1">Username</label>
                                <input type="text" class="form-control form-control-sm text-light border-secondary bg-dark" name="username" placeholder="root" style="border-radius: 6px; font-size: 13px;">
                            </div>
                            <div class="col-6">
                                <label class="form-label small mb-1">Password</label>
                                <input type="password" class="form-control form-control-sm text-light border-secondary bg-dark" name="password" placeholder="******" style="border-radius: 6px; font-size: 13px;">
                            </div>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer border-top border-secondary py-2">
                <button type="button" class="btn btn-sm btn-secondary px-3" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-sm btn-warning px-3 text-dark" id="dbSaveProfileBtn" style="font-weight: 500;">Save Profile</button>
            </div>
        </div>
    </div>
</div>

<!-- Edit Record Modal -->
<div class="modal fade" id="dbEditRecordModal" tabindex="-1" aria-hidden="true" style="backdrop-filter: blur(5px);">
    <div class="modal-dialog modal-dialog-centered text-light">
        <div class="modal-content border border-secondary shadow-lg" style="background-color: #08121f; border-radius: 12px;">
            <div class="modal-header border-bottom border-secondary py-2.5">
                <h6 class="modal-title d-flex align-items-center text-white" id="dbEditRecordModalLabel">
                    <i class="bi bi-pencil-square text-info me-2"></i> Edit Record
                </h6>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" style="max-height: 70vh; overflow-y: auto; background-color: #050a12;">
                <form id="dbEditRecordForm"></form>
            </div>
            <div class="modal-footer border-top border-secondary py-2" style="background-color: #08121f;">
                <button type="button" class="btn btn-sm btn-secondary px-3" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-sm btn-info px-3 text-dark" id="dbSaveRecordBtn" style="font-weight: 500;">Save Changes</button>
            </div>
        </div>
    </div>
</div>
`;

export const DBManager = {
    init() {
        const modalExists = !!document.getElementById('dbMainModal');
        if (!modalExists) {
            // Append HTML structure
            const div = document.createElement('div');
            div.innerHTML = modalHtml;
            document.body.appendChild(div);
        }

        // Initialize Bootstrap Modal instances if they aren't already set
        if (!mainModal) {
            mainModal = new bootstrap.Modal(document.getElementById('dbMainModal'));
        }
        if (!profileModal) {
            profileModal = new bootstrap.Modal(document.getElementById('dbProfileModal'));
        }
        if (!editRecordModal) {
            editRecordModal = new bootstrap.Modal(document.getElementById('dbEditRecordModal'));
        }

        if (modalExists) return;

        // Wire Save Changes button inside edit record modal
        document.getElementById('dbSaveRecordBtn').onclick = async () => {
            const table = currentActiveTable;
            const cols = currentSchema[table];
            const pkCols = cols.filter(c => c.pk).map(c => c.name);
            const quote = currentDbType === 'pgsql' ? '"' : '\`';

            const updates = [];
            cols.forEach(c => {
                const el = document.getElementById(`edit-col-${c.name}`);
                if (el) {
                    const newVal = el.value === '' && !c.pk ? null : el.value;
                    updates.push(`${quote}${c.name}${quote} = ${formatSqlValue(newVal)}`);
                }
            });

            let condition = '';
            if (pkCols.length > 0) {
                condition = pkCols.map(col => `${quote}${col}${quote} = ${formatSqlValue(originalEditRowData[col])}`).join(' AND ');
            } else {
                condition = cols.map(c => `${quote}${c.name}${quote} = ${formatSqlValue(originalEditRowData[c.name])}`).join(' AND ');
            }

            const query = `UPDATE ${quote}${table}${quote} SET ${updates.join(', ')} WHERE ${condition};`;

            const formData = new FormData();
            formData.append('action', 'execute');
            formData.append('id', currentProfileId);
            formData.append('query', query);

            try {
                const response = await fetch(`db-manager/db-api.php`, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.status === 'success') {
                    editRecordModal.hide();
                    ToastManager.show('Record updated successfully!', 'success');
                    await DBManager.fetchAndRenderBrowseData();
                } else {
                    throw new Error(result.message);
                }
            } catch (err) {
                ToastManager.show('Failed to update record: ' + err.message, 'error');
            }
        };

        // Wire Save Record button inside insert tab
        document.getElementById('dbSubmitInsertBtn').onclick = async () => {
            const table = currentActiveTable;
            if (!table) {
                ToastManager.show('Select a table first', 'warning');
                return;
            }
            
            const cols = currentSchema[table];
            if (!cols) return;
            
            const quote = currentDbType === 'pgsql' ? '"' : '\`';
            const columnsToInsert = [];
            const valuesToInsert = [];
            
            cols.forEach(c => {
                const inputEl = document.querySelector(`#dbDynamicInsertForm [name="${c.name}"]`);
                if (inputEl) {
                    const val = inputEl.value;
                    const isAI = c.pk && (c.type.toLowerCase().includes('int') || c.type.toLowerCase().includes('serial'));
                    
                    if (isAI && val.trim() === '') {
                        // Skip empty primary key / auto-increment so database generates it
                        return;
                    }
                    
                    const sqlVal = formatSqlValue(val.trim() === '' ? null : val);
                    columnsToInsert.push(`${quote}${c.name}${quote}`);
                    valuesToInsert.push(sqlVal);
                }
            });
            
            if (columnsToInsert.length === 0) {
                ToastManager.show('No columns to insert!', 'warning');
                return;
            }
            
            const query = `INSERT INTO ${quote}${table}${quote} (${columnsToInsert.join(', ')}) VALUES (${valuesToInsert.join(', ')});`;
            
            const formData = new FormData();
            formData.append('action', 'execute');
            formData.append('id', currentProfileId);
            formData.append('query', query);
            
            try {
                const response = await fetch(`db-manager/db-api.php`, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.status === 'success') {
                    ToastManager.show('Record inserted successfully!', 'success');
                    // Reset the insert form
                    document.getElementById('dbDynamicInsertForm').reset();
                    // Go to browse and load the new data!
                    await DBManager.loadTableData(table);
                } else {
                    throw new Error(result.message);
                }
            } catch (err) {
                ToastManager.show('Failed to insert record: ' + err.message, 'error');
            }
        };

        // Handle nested stacking order dynamically on show/hide
        const confirmEl = document.getElementById('confirmModal');
        if (confirmEl) {
            confirmEl.addEventListener('show.bs.modal', () => {
                if (document.getElementById('dbMainModal').classList.contains('show')) {
                    confirmEl.style.zIndex = '1090';
                }
            });
        }

        // Handle Tab Switching
        document.querySelectorAll('#dbActionTabs .nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const view = e.target.closest('button').dataset.view;
                DBManager.switchView(view);
            });
        });

        // Toggle database inputs dynamically based on selection
        document.getElementById('dbProfileType').addEventListener('change', (e) => {
            if (e.target.value === 'sqlite') {
                document.getElementById('dbSqliteInputs').style.display = 'block';
                document.getElementById('dbMysqlInputs').style.display = 'none';
            } else {
                document.getElementById('dbSqliteInputs').style.display = 'none';
                document.getElementById('dbMysqlInputs').style.display = 'block';

                // Toggle placeholder and default port dynamically
                const portInput = document.querySelector('#dbProfileForm [name="port"]');
                if (e.target.value === 'pgsql') {
                    portInput.placeholder = '5432';
                    if (!portInput.value || portInput.value === '3306') portInput.value = '5432';
                } else {
                    portInput.placeholder = '3306';
                    if (!portInput.value || portInput.value === '5432') portInput.value = '3306';
                }
            }
        });

        // Trigger dynamic profile forms
        document.getElementById('dbAddProfileBtn').addEventListener('click', () => {
            const form = document.getElementById('dbProfileForm');
            form.reset();
            document.getElementById('dbProfileId').value = '';
            
            // Pre-select current active workspace by default
            const currentWorkspace = localStorage.getItem('current_workspace_name');
            if (currentWorkspace) {
                const select = document.getElementById('dbProfileWorkspaceSelect');
                if (select) select.value = currentWorkspace;
            }
            
            document.getElementById('dbProfileModalLabel').textContent = 'Add Connection Profile';
            document.getElementById('dbProfileType').dispatchEvent(new Event('change'));
            profileModal.show();
        });

        document.getElementById('dbEditProfileBtn').addEventListener('click', async () => {
            const selector = document.getElementById('dbProfileSelector');
            const id = selector.value;
            if (!id) return;

            try {
                const response = await fetch(`db-manager/db-api.php?action=list_profiles`);
                const result = await response.json();
                if (result.status === 'success' && result.data[id]) {
                    const data = result.data[id];
                    const form = document.getElementById('dbProfileForm');
                    form.reset();

                    document.getElementById('dbProfileId').value = data.id;
                    form.querySelector('[name="name"]').value = data.name;
                    document.getElementById('dbProfileType').value = data.type;
                    document.getElementById('dbProfileType').dispatchEvent(new Event('change'));

                    // Pre-fill general workspace field
                    form.querySelector('[name="workspace_name"]').value = data.workspace_name || '';

                    if (data.type === 'sqlite') {
                        form.querySelector('[name="filename"]').value = data.filename || (data.path ? data.path.substring(data.path.lastIndexOf('/') + 1) : 'db.sqlite');
                    } else {
                        form.querySelector('[name="host"]').value = data.host;
                        form.querySelector('[name="port"]').value = data.port;
                        form.querySelector('[name="database"]').value = data.database;
                        form.querySelector('[name="username"]').value = data.username;
                        form.querySelector('[name="password"]').value = '******'; // Masked password
                    }

                    document.getElementById('dbProfileModalLabel').textContent = 'Edit Connection Profile';
                    profileModal.show();
                }
            } catch (err) {
                ToastManager.show('Failed to load profile details: ' + err.message, 'error');
            }
        });

        // Save profiles
        document.getElementById('dbSaveProfileBtn').addEventListener('click', async () => {
            const form = document.getElementById('dbProfileForm');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            const formData = new FormData(form);
            formData.append('action', 'save_profile');

            try {
                const response = await fetch(`db-manager/db-api.php`, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.status === 'success') {
                    ToastManager.show(result.message, 'success');
                    profileModal.hide();
                    DBManager.loadProfiles();
                } else {
                    ToastManager.show(result.message, 'error');
                }
            } catch (err) {
                ToastManager.show('Failed to save profile: ' + err.message, 'error');
            }
        });

        // Delete profile
        document.getElementById('dbDeleteProfileBtn').addEventListener('click', () => {
            const selector = document.getElementById('dbProfileSelector');
            const id = selector.value;
            if (!id) return;
            const name = selector.options[selector.selectedIndex].text;

            ModalManager.showConfirm(
                'Delete Connection Profile',
                `Are you sure you want to delete profile '<strong>${name}</strong>'?`,
                async () => {
                    const formData = new FormData();
                    formData.append('action', 'delete_profile');
                    formData.append('id', id);
                    try {
                        const response = await fetch(`db-manager/db-api.php`, {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();
                        if (result.status === 'success') {
                            ToastManager.show(result.message, 'success');
                            DBManager.loadProfiles();
                        } else {
                            ToastManager.show(result.message, 'error');
                        }
                    } catch (err) {
                        ToastManager.show('Failed to delete profile: ' + err.message, 'error');
                    }
                }
            );
        });

        // Handle Active profile switching
        document.getElementById('dbProfileSelector').addEventListener('change', (e) => {
            const id = e.target.value;
            console.log("DB Profile Selected:", id); // DIAGNOSTIC LOG
            if (id) {
                currentProfileId = id;
                document.getElementById('dbEditProfileBtn').disabled = false;
                document.getElementById('dbDeleteProfileBtn').disabled = false;
                DBManager.connect(id);
            } else {
                currentProfileId = null;
                isConnected = false;
                document.getElementById('dbEditProfileBtn').disabled = true;
                document.getElementById('dbDeleteProfileBtn').disabled = true;
                document.getElementById('dbRunQueryBtn').disabled = true;
                document.getElementById('dbConnectionStatus').innerHTML = '<span class="badge bg-danger">Disconnected</span>';
                document.getElementById('dbSchemaTree').innerHTML = `
                    <div class="text-center  py-5 small">
                        <i class="bi bi-hdd-network mb-2 d-block" style="font-size: 24px;"></i>
                        Select a connection to load schema
                    </div>
                `;
            }
        });

        // Clear button
        document.getElementById('dbClearQueryBtn').addEventListener('click', () => {
            if (aceEditor) {
                aceEditor.setValue('');
            }
        });

        // Run query trigger
        document.getElementById('dbRunQueryBtn').addEventListener('click', () => {
            DBManager.runQuery();
        });

        // Initialize SQL Ace Editor lazily
        setTimeout(() => {
            aceEditor = ace.edit("dbSqlEditor");
            aceEditor.setTheme("ace/theme/tomorrow_night_eighties");
            aceEditor.session.setMode("ace/mode/sql");
            aceEditor.setShowPrintMargin(false);
            aceEditor.setValue("SELECT * FROM sqlite_master;");

            // Add custom hotkey Ctrl+Enter inside SQL editor
            aceEditor.commands.addCommand({
                name: "runQuery",
                bindKey: { win: "Ctrl-Enter", mac: "Command-Enter" },
                exec: () => {
                    if (isConnected) {
                        DBManager.runQuery();
                    }
                }
            });
        }, 300);
    },

    async loadWorkspaces() {
        try {
            const response = await fetch('db-manager/db-api.php?action=get_workspaces');
            const result = await response.json();
            if (result.status === 'success') {
                workspaceList = result.data;
                const select = document.getElementById('dbProfileWorkspaceSelect');
                if (select) {
                    select.innerHTML = workspaceList.map(name => `<option value="${name}">${name}</option>`).join('');
                }
            }
        } catch (err) {
            console.error('Failed to load workspaces:', err);
        }
    },

    async loadProfiles() {
        try {
            const response = await fetch(`db-manager/db-api.php?action=list_profiles`);
            const result = await response.json();
            if (result.status === 'success') {
                const selector = document.getElementById('dbProfileSelector');
                const previousVal = selector.value;
                selector.innerHTML = '<option value="">-- Select Connection --</option>';

                for (const id in result.data) {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = result.data[id].name;
                    selector.appendChild(opt);
                }

                const keys = Object.keys(result.data);
                if (previousVal && result.data[previousVal]) {
                    selector.value = previousVal;
                    selector.dispatchEvent(new Event('change'));
                } else if (keys.length > 0 && !isConnected) {
                    const firstId = keys[0];
                    selector.value = firstId;
                    currentProfileId = firstId;
                    document.getElementById('dbEditProfileBtn').disabled = false;
                    document.getElementById('dbDeleteProfileBtn').disabled = false;
                    this.connect(firstId);
                } else {
                    selector.dispatchEvent(new Event('change'));
                }
            }
        } catch (err) {
            ToastManager.show('Failed to fetch connection profiles: ' + err.message, 'error');
        }
    },

    async connect(id) {
        document.getElementById('dbSchemaTree').innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border spinner-border-sm text-warning" role="status"></div>
                <span class="ms-2  small">Connecting...</span>
            </div>
        `;

        try {
            const response = await fetch(`db-manager/db-api.php?action=get_schema&id=${id}`);
            const result = await response.json();
            if (result.status === 'success') {
                isConnected = true;
                currentSchema = result.data;
                currentDbType = result.meta && result.meta.type ? result.meta.type : 'sqlite';
                document.getElementById('dbRunQueryBtn').disabled = false;
                document.getElementById('dbConnectionStatus').innerHTML = '<span class="badge bg-success">Connected</span>';

                DBManager.renderSchemaTree(result.data);
            } else {
                throw new Error(result.message);
            }
        } catch (err) {
            isConnected = false;
            document.getElementById('dbRunQueryBtn').disabled = true;
            document.getElementById('dbConnectionStatus').innerHTML = '<span class="badge bg-danger">Connection Failed</span>';
            document.getElementById('dbSchemaTree').innerHTML = `
                <div class="alert alert-danger mx-2 my-3 p-2 small">
                    <i class="bi bi-exclamation-triangle-fill me-1"></i>
                    ${err.message}
                </div>
            `;
            ToastManager.show('Connection failed: ' + err.message, 'error');
        }
    },

    renderSchemaTree(schema) {
        const container = document.getElementById('dbSchemaTree');
        container.innerHTML = '';

        const tableNames = Object.keys(schema);
        if (tableNames.length === 0) {
            container.innerHTML = `
                <div class="text-center  py-5 small">
                    <i class="bi bi-info-circle mb-2 d-block" style="font-size: 20px;"></i>
                    No tables found in database.
                </div>
            `;
            return;
        }

        // Sort table names alphabetically
        tableNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        for (const table of tableNames) {
            const trId = `tree-${table.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const headerDiv = document.createElement('div');
            headerDiv.className = 'db-tree-item d-flex align-items-center w-100';
            headerDiv.innerHTML = `
                <i class="bi bi-chevron-right me-1  toggle-icon" style="cursor:pointer; padding: 2px 6px 2px 2px;"></i>
                <div class="db-table-title flex-grow-1" style="cursor:pointer">
                    <i class="bi bi-table text-warning me-1.5"></i>
                    <strong>${table}</strong>
                </div>
            `;

            const columnsDiv = document.createElement('div');
            columnsDiv.id = trId;
            columnsDiv.style.display = 'none';

            schema[table].forEach(col => {
                const colItem = document.createElement('div');
                colItem.className = 'db-schema-column';
                const pkIcon = col.pk ? '<i class="bi bi-key-fill text-warning me-1" style="font-size: 11px;" title="Primary Key"></i>' : '<i class="bi bi-dash  me-1"></i>';
                colItem.innerHTML = `${pkIcon} <span>${col.name} <small class="" style="font-size: 10px;">(${col.type})</small></span>`;
                columnsDiv.appendChild(colItem);
            });

            // Accordion expand/collapse on chevron only
            const chevron = headerDiv.querySelector('.toggle-icon');
            chevron.addEventListener('click', (e) => {
                e.stopPropagation();
                if (columnsDiv.style.display === 'none') {
                    columnsDiv.style.display = 'block';
                    chevron.className = 'bi bi-chevron-down me-1  toggle-icon';
                } else {
                    columnsDiv.style.display = 'none';
                    chevron.className = 'bi bi-chevron-right me-1  toggle-icon';
                }
            });

            // Click table name to instantly browse data
            const titleDiv = headerDiv.querySelector('.db-table-title');
            titleDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                DBManager.loadTableData(table);
            });

            container.appendChild(headerDiv);
            container.appendChild(columnsDiv);
        }
    },

    async runQuery() {
        if (!currentProfileId || !isConnected || !aceEditor) return;

        const query = aceEditor.getValue().trim();
        if (!query) {
            ToastManager.show('Please enter a query to run.', 'warning');
            return;
        }

        document.getElementById('dbResultsArea').innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-warning" role="status"></div>
                <div class=" small mt-2">Executing query...</div>
            </div>
        `;

        const formData = new FormData();
        formData.append('action', 'execute');
        formData.append('id', currentProfileId);
        formData.append('query', query);

        try {
            const response = await fetch(`db-manager/db-api.php`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.status === 'success') {
                const meta = result.data;
                document.getElementById('dbExecutionStats').textContent = `Executed in ${meta.duration}ms.`;

                if (meta.type === 'select') {
                    document.getElementById('dbRowsAffected').textContent = `${meta.affected} rows`;
                    DBManager.renderQueryResults(meta.columns, meta.rows);
                } else {
                    document.getElementById('dbRowsAffected').textContent = `${meta.affected} rows affected`;
                    document.getElementById('dbResultsArea').innerHTML = `
                        <div class="alert alert-success m-3 d-flex align-items-center">
                            <i class="bi bi-check-circle-fill me-2" style="font-size: 20px;"></i>
                            <div>
                                <strong>Success!</strong> Mutation executed successfully. Affected rows: <strong>${meta.affected}</strong>
                            </div>
                        </div>
                    `;
                }
            } else {
                throw new Error(result.message);
            }
        } catch (err) {
            document.getElementById('dbExecutionStats').textContent = 'Error.';
            document.getElementById('dbRowsAffected').textContent = '0 rows';
            document.getElementById('dbResultsArea').innerHTML = `
                <div class="alert alert-danger m-3 d-flex align-items-start">
                    <i class="bi bi-exclamation-triangle-fill me-2" style="font-size: 20px;"></i>
                    <div>
                        <strong>SQL Execution Error:</strong><br>
                        <pre class="mt-2 text-wrap bg-dark bg-opacity-25 p-2 rounded text-light" style="font-size: 12px; font-family: monospace;">${err.message}</pre>
                    </div>
                </div>
            `;
            ToastManager.show('Query failed: ' + err.message, 'error');
        }
    },

    renderQueryResults(columns, rows) {
        const area = document.getElementById('dbResultsArea');
        area.innerHTML = '';

        if (rows.length === 0) {
            area.innerHTML = `
                <div class="text-center  py-5 small">
                    <i class="bi bi-info-circle mb-2 d-block" style="font-size: 24px;"></i>
                    Query returned empty result set.
                </div>
            `;
            return;
        }

        const table = document.createElement('table');
        table.className = 'table table-dark table-hover table-striped db-results-table border-0 w-100 mb-0';

        // Header
        const thead = document.createElement('thead');
        const headerTr = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.className = 'ps-3 py-2.5 border-secondary text-truncate';
            th.textContent = col;
            headerTr.appendChild(th);
        });
        thead.appendChild(headerTr);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = 'border-bottom border-secondary border-opacity-25';
            columns.forEach(col => {
                const td = document.createElement('td');
                td.className = 'ps-3 py-2 text-light font-monospace text-truncate';
                td.style.maxWidth = '250px';

                const val = row[col];
                if (val === null) {
                    td.innerHTML = '<span class=" italic">NULL</span>';
                } else {
                    td.textContent = val;
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        area.appendChild(table);
    },

    switchView(viewName) {
        document.querySelectorAll('#dbActionTabs .nav-link').forEach(t => {
            t.classList.remove('active', 'bg-primary');
        });
        const activeTab = document.querySelector(`#tab-${viewName}`);
        if (activeTab) activeTab.classList.add('active', 'bg-primary');

        document.getElementById('view-empty').classList.add('d-none');
        document.getElementById('view-sql').classList.add('d-none');
        document.getElementById('view-browse').classList.add('d-none');
        document.getElementById('view-structure').classList.add('d-none');
        document.getElementById('view-insert').classList.add('d-none');

        document.getElementById(`view-${viewName}`).classList.remove('d-none');
        document.getElementById('view-sql').classList.remove('d-flex');
        if (viewName === 'sql') {
            document.getElementById('view-sql').classList.add('d-flex');
        }
    },

    async loadTableData(table) {
        currentActiveTable = table;
        document.getElementById('dbTopNavBar').classList.remove('d-none');
        document.getElementById('dbActiveTableName').innerHTML = `<i class="bi bi-table me-1"></i> ${table}`;

        // Pre-build the other tabs instantly from memory
        this.generateStructureHTML(table);
        this.generateInsertHTML(table);

        this.switchView('browse');

        // Reset pagination, search filter, and sorting on switching tables
        browseCurrentPage = 1;
        browseFilter = '';
        browseSortColumn = '';
        browseSortOrder = '';

        await this.fetchAndRenderBrowseData();
    },

    async fetchAndRenderBrowseData() {
        const table = currentActiveTable;
        if (!table) return;

        const container = document.getElementById('dbBrowseResultsArea');

        // Render scaffolding toolbar with page sizes, page controls and SQL WHERE filter input
        container.innerHTML = `
            <div class="row g-2 align-items-center mb-3 bg-dark p-2 border border-secondary border-opacity-25 rounded" style="background-color: #0c1827 !important; border-radius: 8px;">
                <div class="col-md-6 col-sm-12">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-black border-secondary " style="font-size: 12px;"><i class="bi bi-filter"></i> SQL WHERE</span>
                        <input type="text" class="form-control bg-black text-light border-secondary shadow-none font-monospace" id="dbBrowseFilterInput" placeholder="e.g. status = 'active' or id > 10" value="${browseFilter}" style="font-size: 12px;">
                        <button class="btn btn-warning text-dark px-3" id="dbBrowseFilterBtn" style="font-weight: 500;">Apply</button>
                        <button class="btn btn-outline-secondary" id="dbBrowseFilterClearBtn" title="Clear Filter"><i class="bi bi-x-lg"></i></button>
                    </div>
                </div>
                <div class="col-md-6 col-sm-12 d-flex align-items-center justify-content-md-end justify-content-between gap-3">
                    <div class="d-flex align-items-center gap-2">
                        <span class="small  text-nowrap" style="font-size: 12px;">Page Size:</span>
                        <select class="form-select form-select-sm bg-black text-light border-secondary shadow-none" id="dbBrowsePageSizeSelect" style="width: auto; font-size: 12px;">
                            <option value="10" ${browsePageSize === 10 ? 'selected' : ''}>10</option>
                            <option value="25" ${browsePageSize === 25 ? 'selected' : ''}>25</option>
                            <option value="50" ${browsePageSize === 50 ? 'selected' : ''}>50</option>
                            <option value="100" ${browsePageSize === 100 ? 'selected' : ''}>100</option>
                            <option value="250" ${browsePageSize === 250 ? 'selected' : ''}>250</option>
                        </select>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-outline-secondary py-0.5 px-2" id="dbBrowsePrevPageBtn" title="Previous Page" ${browseCurrentPage === 1 ? 'disabled' : ''}><i class="bi bi-chevron-left" style="font-size: 11px;"></i></button>
                        <span class="small text-light text-nowrap" id="dbBrowsePageNumDisplay" style="font-size: 12px;">Page ${browseCurrentPage}</span>
                        <button class="btn btn-sm btn-outline-secondary py-0.5 px-2" id="dbBrowseNextPageBtn" title="Next Page"><i class="bi bi-chevron-right" style="font-size: 11px;"></i></button>
                    </div>
                    <span class="badge bg-secondary p-2 text-nowrap" id="dbBrowseTotalBadge" style="font-size: 11px; font-weight: 500;">Total: ...</span>
                </div>
            </div>
            <div id="dbBrowseTableArea" class="position-relative">
                <div class="text-center py-5">
                    <div class="spinner-border text-warning" role="status"></div>
                    <div class="small mt-2 text-white-50">Fetching records...</div>
                </div>
            </div>
        `;

        // Wire toolbar interactive event listeners
        document.getElementById('dbBrowseFilterBtn').onclick = () => {
            browseFilter = document.getElementById('dbBrowseFilterInput').value.trim();
            browseCurrentPage = 1;
            this.fetchAndRenderBrowseData();
        };

        document.getElementById('dbBrowseFilterInput').onkeydown = (e) => {
            if (e.key === 'Enter') {
                browseFilter = e.target.value.trim();
                browseCurrentPage = 1;
                this.fetchAndRenderBrowseData();
            }
        };

        document.getElementById('dbBrowseFilterClearBtn').onclick = () => {
            browseFilter = '';
            document.getElementById('dbBrowseFilterInput').value = '';
            browseCurrentPage = 1;
            this.fetchAndRenderBrowseData();
        };

        document.getElementById('dbBrowsePageSizeSelect').onchange = (e) => {
            browsePageSize = parseInt(e.target.value);
            browseCurrentPage = 1;
            this.fetchAndRenderBrowseData();
        };

        document.getElementById('dbBrowsePrevPageBtn').onclick = () => {
            if (browseCurrentPage > 1) {
                browseCurrentPage--;
                this.fetchAndRenderBrowseData();
            }
        };

        document.getElementById('dbBrowseNextPageBtn').onclick = () => {
            browseCurrentPage++;
            this.fetchAndRenderBrowseData();
        };

        // Quote identifiers safely depending on DB Type (Double quotes for PgSQL, Backticks for MySQL/SQLite)
        const quote = currentDbType === 'pgsql' ? '"' : '\`';
        const whereClause = browseFilter ? ` WHERE ${browseFilter}` : '';
        const orderByClause = browseSortColumn ? ` ORDER BY ${quote}${browseSortColumn}${quote} ${browseSortOrder}` : '';
        const limit = browsePageSize;
        const offset = (browseCurrentPage - 1) * limit;

        const dataQuery = `SELECT * FROM ${quote}${table}${quote}${whereClause}${orderByClause} LIMIT ${limit} OFFSET ${offset};`;
        const countQuery = `SELECT COUNT(*) AS total_records FROM ${quote}${table}${quote}${whereClause};`;

        try {
            // 1. Fetch total count in background
            const countFormData = new FormData();
            countFormData.append('action', 'execute');
            countFormData.append('id', currentProfileId);
            countFormData.append('query', countQuery);

            const countResponse = await fetch(`db-manager/db-api.php`, {
                method: 'POST',
                body: countFormData
            });
            const countResult = await countResponse.json();
            if (countResult.status === 'success' && countResult.data && countResult.data.rows && countResult.data.rows.length > 0) {
                browseTotalCount = parseInt(countResult.data.rows[0].total_records || countResult.data.rows[0].TOTAL_RECORDS || 0);
            } else {
                browseTotalCount = 0;
            }

            // 2. Fetch page rows
            const dataFormData = new FormData();
            dataFormData.append('action', 'execute');
            dataFormData.append('id', currentProfileId);
            dataFormData.append('query', dataQuery);

            const dataResponse = await fetch(`db-manager/db-api.php`, {
                method: 'POST',
                body: dataFormData
            });
            const dataResult = await dataResponse.json();

            if (dataResult.status === 'success') {
                const meta = dataResult.data;
                const totalPages = Math.max(1, Math.ceil(browseTotalCount / browsePageSize));

                // Update stats and bounds elements in toolbar
                document.getElementById('dbBrowseTotalBadge').textContent = `Total: ${browseTotalCount}`;
                document.getElementById('dbBrowsePageNumDisplay').textContent = `Page ${browseCurrentPage} of ${totalPages}`;
                document.getElementById('dbBrowsePrevPageBtn').disabled = browseCurrentPage === 1;
                document.getElementById('dbBrowseNextPageBtn').disabled = browseCurrentPage >= totalPages;

                const tableArea = document.getElementById('dbBrowseTableArea');
                tableArea.innerHTML = '';

                if (meta.rows.length === 0) {
                    tableArea.innerHTML = `
                        <div class="text-center py-5 small border border-secondary border-opacity-25 rounded bg-dark" style="background-color: #0c1827 !important;">
                            <i class="bi bi-info-circle mb-2 d-block text-warning" style="font-size: 24px;"></i>
                            No records found.
                        </div>
                    `;
                    return;
                }

                // Render dynamic records table
                const tableEl = document.createElement('table');
                tableEl.className = 'table table-dark table-hover table-striped db-results-table border-0 w-100 mb-0';
                tableEl.style.fontSize = '13px';

                // Header
                const thead = document.createElement('thead');
                thead.style.backgroundColor = '#050a12';
                thead.style.borderBottom = '2px solid #2d3748';

                const headerTr = document.createElement('tr');

                // Add actions column at start
                const actionTh = document.createElement('th');
                actionTh.className = 'py-2.5 text-center text-white-50 border-secondary';
                actionTh.style.width = '100px';
                actionTh.textContent = 'Actions';
                headerTr.appendChild(actionTh);

                meta.columns.forEach(col => {
                    const th = document.createElement('th');
                    th.className = 'ps-3 py-2.5 border-secondary text-truncate text-white-50 user-select-none';
                    th.style.cursor = 'pointer';

                    let sortIcon = '<i class="bi bi-arrow-down-up ms-1  opacity-50" style="font-size: 10px;"></i>';
                    if (browseSortColumn === col) {
                        sortIcon = browseSortOrder === 'ASC'
                            ? '<i class="bi bi-arrow-up text-warning ms-1" style="font-size: 11px;"></i>'
                            : '<i class="bi bi-arrow-down text-warning ms-1" style="font-size: 11px;"></i>';
                    }

                    th.innerHTML = `${col} ${sortIcon}`;

                    th.onclick = () => {
                        if (browseSortColumn !== col) {
                            browseSortColumn = col;
                            browseSortOrder = 'ASC';
                        } else if (browseSortOrder === 'ASC') {
                            browseSortOrder = 'DESC';
                        } else {
                            browseSortColumn = '';
                            browseSortOrder = '';
                        }
                        this.fetchAndRenderBrowseData();
                    };

                    headerTr.appendChild(th);
                });
                thead.appendChild(headerTr);
                tableEl.appendChild(thead);

                // Body
                const tbody = document.createElement('tbody');
                meta.rows.forEach(row => {
                    const tr = document.createElement('tr');
                    tr.className = 'border-bottom border-secondary border-opacity-25';

                    // Actions cell
                    const actionTd = document.createElement('td');
                    actionTd.className = 'text-center align-middle py-1 border-secondary';
                    actionTd.innerHTML = `
                        <div class="d-flex justify-content-center gap-1">
                            <button class="btn btn-sm btn-outline-info p-1 px-2 browse-edit-btn" title="Edit Record" style="font-size: 11px;"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm btn-outline-danger p-1 px-2 browse-delete-btn" title="Delete Record" style="font-size: 11px;"><i class="bi bi-trash"></i></button>
                        </div>
                    `;

                    actionTd.querySelector('.browse-edit-btn').onclick = () => {
                        this.showEditRecordModal(row);
                    };
                    actionTd.querySelector('.browse-delete-btn').onclick = async () => {
                        if (confirm('Are you sure you want to delete this record?')) {
                            const cols = currentSchema[table];
                            const pkCols = cols.filter(c => c.pk).map(c => c.name);
                            const quote = currentDbType === 'pgsql' ? '"' : '\`';

                            let condition = '';
                            if (pkCols.length > 0) {
                                condition = pkCols.map(col => `${quote}${col}${quote} = ${formatSqlValue(row[col])}`).join(' AND ');
                            } else {
                                condition = cols.map(c => `${quote}${c.name}${quote} = ${formatSqlValue(row[c.name])}`).join(' AND ');
                            }

                            const query = `DELETE FROM ${quote}${table}${quote} WHERE ${condition};`;

                            const formData = new FormData();
                            formData.append('action', 'execute');
                            formData.append('id', currentProfileId);
                            formData.append('query', query);

                            try {
                                const response = await fetch(`db-manager/db-api.php`, {
                                    method: 'POST',
                                    body: formData
                                });
                                const result = await response.json();
                                if (result.status === 'success') {
                                    ToastManager.show('Record deleted successfully!', 'success');
                                    await this.fetchAndRenderBrowseData();
                                } else {
                                    throw new Error(result.message);
                                }
                            } catch (err) {
                                ToastManager.show('Failed to delete record: ' + err.message, 'error');
                            }
                        }
                    };

                    tr.appendChild(actionTd);

                    meta.columns.forEach(col => {
                        const td = document.createElement('td');
                        td.className = 'ps-3 py-2 text-light font-monospace text-truncate align-middle border-secondary';
                        td.style.maxWidth = '250px';

                        const val = row[col];
                        if (val === null) {
                            td.innerHTML = '<span class=" italic" style="font-size: 11px;">NULL</span>';
                        } else {
                            td.textContent = val;
                        }
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                tableEl.appendChild(tbody);

                const tableResp = document.createElement('div');
                tableResp.className = 'table-responsive border border-secondary border-opacity-25 rounded';
                tableResp.style.backgroundColor = '#0c1827';
                tableResp.appendChild(tableEl);

                tableArea.appendChild(tableResp);
            } else {
                throw new Error(dataResult.message);
            }
        } catch (err) {
            console.error(err);
            document.getElementById('dbBrowseTableArea').innerHTML = `
                <div class="alert alert-danger m-3 d-flex align-items-start">
                    <i class="bi bi-exclamation-triangle-fill me-2 text-warning" style="font-size: 20px;"></i>
                    <div>
                        <strong>Error loading records:</strong><br>
                        ${err.message || 'Check your SQL WHERE filter syntax.'}
                    </div>
                </div>
            `;
        }
    },

    showEditRecordModal(row) {
        const table = currentActiveTable;
        const cols = currentSchema[table];
        originalEditRowData = row;

        const form = document.getElementById('dbEditRecordForm');
        form.innerHTML = '';

        cols.forEach(col => {
            const isText = col.type.toLowerCase().includes('text');
            const val = row[col.name] !== null ? row[col.name] : '';

            const formGroup = document.createElement('div');
            formGroup.className = 'mb-3';
            formGroup.innerHTML = `
                <label class="form-label text-light mb-1 d-flex justify-content-between align-items-center" style="font-size: 13px; font-weight: 500;">
                    <span>${col.name} ${col.pk ? '<i class="bi bi-key-fill text-warning ms-1" title="Primary Key"></i>' : ''}</span>
                    <span class="text-info font-monospace" style="font-size: 10px;">${col.type}</span>
                </label>
                ${isText
                    ? `<textarea class="form-control form-control-sm bg-dark text-light border-secondary font-monospace" id="edit-col-${col.name}" rows="3">${val}</textarea>`
                    : `<input type="text" class="form-control form-control-sm bg-dark text-light border-secondary font-monospace" id="edit-col-${col.name}" value="${val}">`
                }
            `;
            form.appendChild(formGroup);
        });

        editRecordModal.show();
    },

    async generateStructureHTML(table) {
        if (!currentSchema || !currentSchema[table]) return;

        // Fetch existing indexes for this table
        let indexes = [];
        try {
            const response = await fetch(`db-manager/db-api.php?action=get_indexes&id=${currentProfileId}&table=${table}`);
            const result = await response.json();
            if (result.status === 'success') {
                indexes = result.data;
            }
        } catch (err) {
            console.error('Failed to load table indexes:', err);
        }

        // Common Data Types for the dropdown
        const dataTypes = [
            'INT', 'VARCHAR', 'TEXT', 'DATE', 'DATETIME', 'BOOLEAN',
            'TINYINT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE',
            'TIME', 'TIMESTAMP', 'BLOB', 'JSON', 'ENUM'
        ];

        // Common Collations
        const collations = [
            'utf8mb4_unicode_ci', 'utf8mb4_general_ci',
            'utf8_general_ci', 'latin1_swedish_ci', 'NOCASE'
        ];

        let html = `
            <div class="d-flex justify-content-between align-items-center mb-3 mt-2">
                <h6 class="text-light m-0"><i class="bi bi-layout-three-columns text-warning me-2"></i>Advanced Structure Definition</h6>
                <div>
                    <button class="btn btn-sm btn-outline-info me-2" id="dbAddColumnBtn"><i class="bi bi-plus"></i> Add Column</button>
                    <button class="btn btn-sm btn-success" id="dbSaveStructureBtn"><i class="bi bi-check2-circle"></i> Save Changes</button>
                </div>
            </div>
            
            <div class="table-responsive border border-secondary rounded shadow-sm" style="background-color: #0c1827;">
                <table class="table table-dark table-hover mb-0" id="dbStructureTable" style="font-size: 13px;">
                    <thead style="background-color: #050a12; border-bottom: 2px solid #2d3748;">
                        <tr>
                            <th class="py-3 ps-3 text-white-50" style="width: 15%;">Name</th>
                            <th class="py-3 text-white-50" style="width: 12%;">Type</th>
                            <th class="py-3 text-white-50" style="width: 10%;">Length</th>
                            <th class="py-3 text-white-50" style="width: 13%;">Collation</th>
                            <th class="py-3 text-white-50" style="width: 15%;">Default</th>
                            <th class="py-3 text-center text-white-50" style="width: 5%;" title="Allow NULL">Null</th>
                            <th class="py-3 text-white-50" style="width: 11%;">Index</th>
                            <th class="py-3 text-center text-white-50" style="width: 5%;" title="Auto Increment">A_I</th>
                            <th class="py-3 text-center text-white-50" style="width: 14%;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        currentSchema[table].forEach(col => {
            let baseType = col.type ? col.type.toUpperCase() : 'VARCHAR';
            let length = '';
            const match = baseType.match(/^([A-Z]+)\(([^)]+)\)/);
            if (match) {
                baseType = match[1];
                length = match[2];
            }

            const isAI = col.pk && (baseType.includes('INT') || baseType.includes('SERIAL'));
            const isNull = !col.pk;

            // Heuristic for collation (only relevant for string types)
            const isString = baseType.includes('CHAR') || baseType.includes('TEXT');
            const defaultCollation = isString ? (currentDbType === 'sqlite' ? 'NOCASE' : 'utf8mb4_unicode_ci') : '';

            html += `
                <tr class="db-col-row border-secondary border-opacity-25" data-original-name="${col.name}">
                    <td class="align-middle ps-3">
                        <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary col-name-input shadow-none" value="${col.name}">
                    </td>
                    <td class="align-middle">
                        <select class="form-select form-select-sm bg-dark text-info border-secondary col-type-select shadow-none">
                            <option value="${baseType}" selected>${baseType}</option>
                            ${dataTypes.filter(t => t !== baseType).map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </td>
                    <td class="align-middle">
                        <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary col-length-input shadow-none" value="${length}" placeholder="255">
                    </td>
                    <td class="align-middle">
                        <select class="form-select form-select-sm bg-dark text-light border-secondary col-collation-select shadow-none" ${!isString ? 'disabled' : ''}>
                            <option value="">---</option>
                            ${collations.map(c => `<option value="${c}" ${c === defaultCollation ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </td>
                    <td class="align-middle d-flex">
                        <select class="form-select form-select-sm bg-dark text-light border-secondary col-default-select shadow-none me-1" style="width: 50%;">
                            <option value="NONE" selected>None</option>
                            <option value="NULL">NULL</option>
                            <option value="CURRENT_TIMESTAMP">CURRENT_TIMESTAMP</option>
                            <option value="CUSTOM">As defined:</option>
                        </select>
                        <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary col-default-input shadow-none d-none" style="width: 50%;" placeholder="value">
                    </td>
                    <td class="text-center align-middle">
                        <input class="form-check-input border-secondary col-null-checkbox shadow-none" type="checkbox" ${isNull ? 'checked' : ''}>
                    </td>
                    <td class="align-middle">
                        <select class="form-select form-select-sm bg-dark text-warning border-secondary col-index-select shadow-none">
                            <option value="">---</option>
                            <option value="PRIMARY" ${col.pk ? 'selected' : ''}>PRIMARY</option>
                            <option value="UNIQUE">UNIQUE</option>
                            <option value="INDEX">INDEX</option>
                        </select>
                    </td>
                    <td class="text-center align-middle">
                        <input class="form-check-input border-secondary col-ai-checkbox shadow-none" type="checkbox" ${isAI ? 'checked' : ''}>
                    </td>
                    <td class="text-center align-middle">
                        <button class="btn btn-sm btn-outline-danger p-1 px-2 delete-col-btn" title="Drop Column" onclick="this.closest('tr').style.opacity = '0.3'; this.closest('tr').classList.add('dropped-column');"><i class="bi bi-trash3"></i></button>
                    </td>
                </tr>
            `;
        });

        // Render Indexes rows dynamically
        let indexesRowsHtml = '';
        if (indexes.length === 0) {
            indexesRowsHtml = `
                <tr class="db-index-row border-secondary border-opacity-25  empty-index-msg">
                    <td colspan="4" class="text-center py-3">No indexes or unique keys defined. Click "Add Index" to create one.</td>
                </tr>
            `;
        } else {
            indexes.forEach(idx => {
                indexesRowsHtml += `
                    <tr class="db-index-row border-secondary border-opacity-25" data-original-name="${idx.name}">
                        <td class="align-middle ps-3">
                            <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary index-name-input shadow-none" value="${idx.name}">
                        </td>
                        <td class="align-middle">
                            <select class="form-select form-select-sm bg-dark text-warning border-secondary index-type-select shadow-none">
                                <option value="PRIMARY" ${idx.type === 'PRIMARY' ? 'selected' : ''}>PRIMARY</option>
                                <option value="UNIQUE" ${idx.type === 'UNIQUE' ? 'selected' : ''}>UNIQUE</option>
                                <option value="INDEX" ${idx.type === 'INDEX' ? 'selected' : ''}>INDEX</option>
                                <option value="FULLTEXT" ${idx.type === 'FULLTEXT' ? 'selected' : ''}>FULLTEXT</option>
                            </select>
                        </td>
                        <td class="align-middle">
                            <input type="text" class="form-control form-control-sm bg-dark text-info border-secondary index-cols-input shadow-none" value="${idx.columns}">
                        </td>
                        <td class="text-center align-middle">
                            <button class="btn btn-sm btn-outline-danger p-1 px-2" title="Drop Index" onclick="this.closest('tr').style.opacity = '0.3'; this.closest('tr').classList.add('dropped-index');"><i class="bi bi-trash3"></i></button>
                        </td>
                    </tr>
                `;
            });
        }

        // Build dialect-specific options
        let optionsHtml = '';
        if (currentDbType === 'mysql') {
            optionsHtml = `
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="card text-bg-dark border-secondary">
                            <div class="card-body py-2">
                                <label class="small  mb-1">Table Engine (MySQL)</label>
                                <select class="form-select form-select-sm bg-black text-light border-secondary shadow-none">
                                    <option value="InnoDB">InnoDB</option>
                                    <option value="MyISAM">MyISAM</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card text-bg-dark border-secondary">
                            <div class="card-body py-2">
                                <label class="small  mb-1">Auto Increment Base</label>
                                <input type="number" class="form-control form-control-sm bg-black text-light border-secondary shadow-none" placeholder="1">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (currentDbType === 'pgsql') {
            optionsHtml = `
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="card text-bg-dark border-secondary">
                            <div class="card-body py-2">
                                <label class="small  mb-1">Tablespace (PostgreSQL)</label>
                                <input type="text" class="form-control form-control-sm bg-black text-light border-secondary shadow-none" placeholder="pg_default" disabled>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card text-bg-dark border-secondary">
                            <div class="card-body py-2">
                                <label class="small  mb-1">WITH OIDS</label>
                                <select class="form-select form-select-sm bg-black text-light border-secondary shadow-none" disabled>
                                    <option value="false">No</option>
                                    <option value="true">Yes</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            optionsHtml = `
                <div class=" small py-2 text-center bg-dark border border-secondary border-opacity-25 rounded">
                    <i class="bi bi-info-circle me-1"></i> No dialect-specific options for SQLite.
                </div>
            `;
        }

        html += `
                    </tbody>
                </table>
            </div>
            
            <div class="mt-4 pt-3 border-top border-secondary border-opacity-25">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="text-light m-0"><i class="bi bi-diagram-3 text-success me-2"></i>Composite Indexes & Relations</h6>
                    <button class="btn btn-sm btn-outline-warning" id="dbAddCompositeIndexBtn"><i class="bi bi-plus"></i> Add Index</button>
                </div>
                
                <div class="table-responsive border border-secondary rounded shadow-sm mb-4" style="background-color: #0c1827;">
                    <table class="table table-dark table-hover mb-0" id="dbCompositeIndexTable" style="font-size: 13px;">
                        <thead style="background-color: #050a12; border-bottom: 2px solid #2d3748;">
                            <tr>
                                <th class="py-2 ps-3 text-white-50" style="width: 25%;">Index Name</th>
                                <th class="py-2 text-white-50" style="width: 20%;">Index Type</th>
                                <th class="py-2 text-white-50" style="width: 40%;">Columns (Comma separated)</th>
                                <th class="py-2 text-center text-white-50" style="width: 15%;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${indexesRowsHtml}
                        </tbody>
                    </table>
                </div>

                <div class="mt-3">
                    <h6 class="text-light mb-3"><i class="bi bi-gear-wide-connected text-info me-2"></i>Table Options & Configuration</h6>
                    ${optionsHtml}
                </div>
            </div>
        `;
        document.getElementById('dbStructureArea').innerHTML = html;

        // Add dynamic Default Value input toggle listener
        document.querySelectorAll('.col-default-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const input = e.target.nextElementSibling;
                if (e.target.value === 'CUSTOM') {
                    input.classList.remove('d-none');
                } else {
                    input.classList.add('d-none');
                }
            });
        });

        // Wire Add Column Button
        document.getElementById('dbAddColumnBtn').onclick = () => {
            const tbody = document.querySelector('#dbStructureTable tbody');
            const tr = document.createElement('tr');
            tr.className = 'db-col-row new-column border-secondary border-opacity-25';
            tr.innerHTML = `
                <td class="align-middle ps-3">
                    <input type="text" class="form-control form-control-sm bg-dark text-light border-success col-name-input shadow-none" placeholder="new_column">
                </td>
                <td class="align-middle">
                    <select class="form-select form-select-sm bg-dark text-info border-secondary col-type-select shadow-none">
                        ${dataTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </td>
                <td class="align-middle">
                    <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary col-length-input shadow-none" placeholder="e.g. 255">
                </td>
                <td class="align-middle">
                    <select class="form-select form-select-sm bg-dark text-light border-secondary col-collation-select shadow-none">
                        <option value="">---</option>
                        ${collations.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </td>
                <td class="align-middle d-flex">
                    <select class="form-select form-select-sm bg-dark text-light border-secondary col-default-select shadow-none me-1" style="width: 50%;">
                        <option value="NONE" selected>None</option>
                        <option value="NULL">NULL</option>
                        <option value="CURRENT_TIMESTAMP">CURRENT_TIMESTAMP</option>
                        <option value="CUSTOM">As defined:</option>
                    </select>
                    <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary col-default-input shadow-none d-none" style="width: 50%;" placeholder="value">
                </td>
                <td class="text-center align-middle">
                    <input class="form-check-input border-secondary col-null-checkbox shadow-none" type="checkbox" checked>
                </td>
                <td class="align-middle">
                    <select class="form-select form-select-sm bg-dark text-warning border-secondary col-index-select shadow-none">
                        <option value="">---</option>
                        <option value="PRIMARY">PRIMARY</option>
                        <option value="UNIQUE">UNIQUE</option>
                        <option value="INDEX">INDEX</option>
                    </select>
                </td>
                <td class="text-center align-middle">
                    <input class="form-check-input border-secondary col-ai-checkbox shadow-none" type="checkbox">
                </td>
                <td class="text-center align-middle">
                    <button class="btn btn-sm btn-outline-danger p-1 px-2 delete-col-btn" onclick="this.closest('tr').remove()"><i class="bi bi-x-circle"></i></button>
                </td>
            `;
            tbody.appendChild(tr);

            // Wire the specific dropdown just added
            const newSelect = tr.querySelector('.col-default-select');
            newSelect.addEventListener('change', (e) => {
                const input = e.target.nextElementSibling;
                if (e.target.value === 'CUSTOM') {
                    input.classList.remove('d-none');
                } else {
                    input.classList.add('d-none');
                }
            });

            // Disable collation if not a string type
            const typeSelect = tr.querySelector('.col-type-select');
            const colSelect = tr.querySelector('.col-collation-select');
            typeSelect.addEventListener('change', (e) => {
                const isStr = e.target.value.includes('CHAR') || e.target.value.includes('TEXT');
                colSelect.disabled = !isStr;
                if (!isStr) colSelect.value = '';
            });
        };

        // Wire Add Composite Index Button
        document.getElementById('dbAddCompositeIndexBtn').onclick = () => {
            const tbody = document.querySelector('#dbCompositeIndexTable tbody');
            const emptyMsg = tbody.querySelector('.empty-index-msg');
            if (emptyMsg) emptyMsg.remove();

            const tr = document.createElement('tr');
            tr.className = 'db-index-row new-index border-secondary border-opacity-25';
            tr.innerHTML = `
                <td class="align-middle ps-3">
                    <input type="text" class="form-control form-control-sm bg-dark text-light border-warning index-name-input shadow-none" placeholder="e.g. idx_user_status">
                </td>
                <td class="align-middle">
                    <select class="form-select form-select-sm bg-dark text-warning border-secondary index-type-select shadow-none">
                        <option value="INDEX">INDEX</option>
                        <option value="UNIQUE">UNIQUE</option>
                        <option value="PRIMARY">PRIMARY</option>
                        <option value="FULLTEXT">FULLTEXT</option>
                    </select>
                </td>
                <td class="align-middle">
                    <input type="text" class="form-control form-control-sm bg-dark text-info border-secondary index-cols-input shadow-none" placeholder="id, username">
                </td>
                <td class="text-center align-middle">
                    <button class="btn btn-sm btn-outline-danger p-1 px-2" onclick="this.closest('tr').remove()"><i class="bi bi-x-circle"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        };
    },

    generateInsertHTML(table) {
        if (!currentSchema || !currentSchema[table]) return;

        let html = '<form id="dbDynamicInsertForm" class="mt-2">';
        currentSchema[table].forEach(col => {
            const isAutoIncrement = col.pk && (col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('serial'));

            if (isAutoIncrement) {
                html += `
                    <div class="mb-4">
                        <label class="form-label small "><i class="bi bi-key-fill text-warning me-1"></i> ${col.name} <span class="badge bg-secondary ms-2">${col.type}</span></label>
                        <input type="text" class="form-control bg-dark border-secondary text-light font-monospace" name="${col.name}" placeholder="[Auto-Increment] Leave blank to auto-generate, or type a custom value">
                    </div>
                `;
            } else {
                // Simple assumption: text areas for TEXT, inputs for everything else
                const isText = col.type.toLowerCase().includes('text');
                html += `
                    <div class="mb-4">
                        <label class="form-label text-light" style="font-weight: 500;">${col.name} <span class="text-info ms-2" style="font-size: 11px;">${col.type}</span></label>
                        ${isText
                        ? `<textarea class="form-control bg-dark border-secondary text-light font-monospace" name="${col.name}" rows="3" placeholder="NULL / Empty"></textarea>`
                        : `<input type="text" class="form-control bg-dark border-secondary text-light font-monospace" name="${col.name}" placeholder="NULL / Empty">`
                    }
                    </div>
                `;
            }
        });
        html += '</form>';
        document.getElementById('dbInsertFormArea').innerHTML = html;
    },

    show() {
        this.init();
        this.loadWorkspaces();
        this.loadProfiles();
        mainModal.show();
    }
};
