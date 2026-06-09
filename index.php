<?php


// Bootstrap the application
require_once 'bootstrap.php';

// --- Authentication Check ---
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ' . APP_URL . '/login.php');
    exit;
}

// --- Real-time Workspace Access Verification ---
// On every page load, verify the user's permissions and current workspace validity.
try {
    $currentUser = $_SESSION['user'];
    $allUsers = getUsers();
    $userPermissions = $allUsers[$currentUser]['permissions'] ?? [];
    $_SESSION['permissions'] = $userPermissions; // Keep session permissions in sync

    $allWorkspaces = getWorkspaces();
    $accessibleWorkspaces = in_array('*', $userPermissions)
        ? $allWorkspaces
        : array_intersect_key($allWorkspaces, array_flip($userPermissions));

    if (empty($accessibleWorkspaces)) {
        // User has no access to any workspace. Clear session variables.
        $_SESSION['workspace_path'] = null;
        $_SESSION['workspace_name'] = null;
    } else {
        // Check if the current session workspace is still valid and accessible
        $currentWorkspaceName = $_SESSION['workspace_name'] ?? null;
        if (!$currentWorkspaceName || !isset($accessibleWorkspaces[$currentWorkspaceName])) {
            // Current workspace is invalid or user lost access, switch to the first available one.
            $_SESSION['workspace_name'] = key($accessibleWorkspaces);
            $_SESSION['workspace_path'] = reset($accessibleWorkspaces);
        }
    }
    // Always update the list of accessible workspaces in the session.
    $_SESSION['accessible_workspaces'] = $accessibleWorkspaces;
} catch (Exception $e) {
    // If something goes wrong (e.g., data files corrupt), show an error and prevent IDE from loading.
    die("Error verifying workspace access: " . htmlspecialchars($e->getMessage()) . " Please contact an administrator.");
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GOGIES{IDE}</title>

    <!-- Bootstrap CSS (Latest) -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">

    <!-- Bootstrap Icons -->

    <!-- Custom Stylesheet -->

    <link rel="stylesheet" href="<?php echo APP_URL; ?>/assets/css/style.css">
    <link rel="stylesheet" href="<?php echo APP_URL; ?>/assets/css/bootstrap-icons.css">
    <link rel="stylesheet" href="<?php echo APP_URL; ?>/ai-agent/ai-agent.css">
    <link rel="stylesheet" href="<?php echo APP_URL; ?>/assets/icons/style.css">
    
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ace-diff/dist/styles.css">

    <script>
        // Pass PHP constants to JavaScript
        const App = {
            url: '<?php echo APP_URL; ?>',
            workspaceUrl: '',
            aceBasePath: '<?php echo APP_URL; ?>/assets/ace/src-min-noconflict'
        };
    </script>
    <script>
        // Always update localStorage with the current session state on page load.
        localStorage.setItem('accessible_workspaces', JSON.stringify(<?php echo json_encode($_SESSION['accessible_workspaces'] ?? []); ?>));
        localStorage.setItem('current_workspace_name', <?php echo json_encode($_SESSION['workspace_name'] ?? null); ?>);
    </script>
</head>
<body>

    <div class="main-container">
        <!-- Left Side: File Tree -->
        <aside id="sidebar">
            <div class="header">
               <h3>GOGIES{IDE}</h3>
                <div>
                        <?php if (in_array('*', $_SESSION['permissions'] ?? [])): ?>
                    <a href="#" id="admin-btn" title="Admin Panel">
                        <i class="ic ic-shield-lock"></i></a>
                    <?php endif; ?>
                    <a href="#" id="ai-toggle-btn" class="" title="Toggle Gogies AI">
                        <i class="bi bi-stars" style="color: #388bfd; font-size: 18px;"></i></a>
                    <a href="#" id="db-btn" title="Database Explorer">
                        <i class="bi bi-database" style="color: #f59e0b; font-size: 18px;"></i></a>
                    <a href="#" id="show-settings-menu" class="" title="Settings">
                        <i class="ic ic-gear-fill"></i></a>
                    <a href="<?php echo APP_URL; ?>/api.php?action=logout" id="logout-btn"  title="Logout <?php echo htmlspecialchars($_SESSION['user']); ?>">
                        <i class="ic ic-box-arrow-right"></i></a>
                
                </div>
            </div>
             <div class="d-flex align-items-center justify-content-between text-bg-secondary w-100 p-1" >
                 <div class="dropdown flex-grow-1" id="workspace-switcher">
                     <a href="#" class="text-light dropdown-toggle text-decoration-none d-flex align-items-center" id="workspaceDropdown" data-bs-toggle="dropdown" aria-expanded="false" style="padding: 4px 8px;">
                         <i class="ic ic-cmd text-success me-1"></i>
                         <strong id="current-workspace-name" class="text-truncate" style="max-width: 140px; font-size: 13px;">Loading...</strong>
                     </a>
                     <ul class="dropdown-menu text-small shadow" aria-labelledby="workspaceDropdown" id="workspace-list" style="min-width: 180px;">
                         <!-- Populated by workspaceSwitcher.js -->
                     </ul>
                 </div>
                 <div class="dropdown" id="workspace-actions-menu">
                     <button class="btn btn-link text-light p-1 border-0 d-flex align-items-center" type="button" id="workspaceActionsDropdown" data-bs-toggle="dropdown" aria-expanded="false" title="Workspace Actions" style="font-size: 16px; text-decoration: none;">
                         <i class="bi bi-three-dots-vertical"></i>
                     </button>
                     <ul class="dropdown-menu dropdown-menu-end text-small shadow text-bg-secondary" aria-labelledby="workspaceActionsDropdown" style="min-width: 160px; font-size:13px ">
                         <li><a class="dropdown-item p-2 text-bg-secondary" href="#" id="ws-new-file"><i class="bi bi-file-earmark-plus text-white "></i> New File</a></li>
                         <li><a class="dropdown-item p-2 text-bg-secondary" href="#" id="ws-new-dir"><i class="bi bi-folder-plus text-white "></i> New Folder</a></li>
                         <li><a class="dropdown-item p-2 text-bg-secondary" href="#" id="ws-refresh"><i class="bi bi-arrow-clockwise text-white "></i> Refresh Tree</a></li>
                         <li><a class="dropdown-item p-2 text-bg-secondary" href="#" id="ws-backup"><i class="bi bi-shield-check text-white "></i> Backup Now</a></li>
                          <li><a class="dropdown-item p-2 text-bg-secondary" href="#" id="ws-restore-mgr"><i class="bi bi-arrow-counterclockwise text-white "></i> Restore Manager</a></li>
                     </ul>
                 </div>
             </div>
            <div class="file-tree-container">
                <div id="file-tree" class="list-group list-group-flush"></div>
            </div>
               <div class="p-1 text-center text-light small">
                &copy; <?php echo date("Y"); ?> <a class="text-light" href="https://gogies.net" target="_blank"><b>Gogies.net</b></a>
            </div>
        </aside>

        <!-- Right Side: Top Bar and Editor -->
        <main id="main-content">
            <div id="top-bar">
                <div class="d-flex align-items-center h-100 w-100 position-relative">
                    <button id="tab-scroll-left" class="tab-scroller" title="Scroll tabs left"><i class="ic ic-chevron-left"></i></button>
                    <ul class="nav nav-tabs ace_tabs" id="tab-bar" role="tablist"></ul>
                    <button id="tab-scroll-right" class="tab-scroller" title="Scroll tabs right"><i class="ic ic-chevron-right"></i></button>
                </div>
            </div>
            <div id="editor-area" class="flex-grow-1 position-relative">
                <div id="editor"></div>
                <div id="editor-actions">
                    <button id="reload-file-btn" class="btn btn-warning btn-sm" style="display: none;" title="Reload file from disk"><i class="ic ic-arrow-clockwise"></i></button>
                    <button id="save-file-btn" class="btn btn-success btn-sm" style="display: none;" title="Save File"><i class="ic ic-floppy"></i></button>
                </div>
            </div>
        </main>
        <?php include 'ai-agent/ai-panel.php'; ?>
    </div>

    <!-- Context Menus (Hidden by default) -->
    <div id="file-context-menu" class="context-menu">
        <ul class="list-group">
            <li class="list-group-item list-group-item-action" data-action="rename"><i class="ic ic-pencil-square"></i> Rename</li>
            <li class="list-group-item list-group-item-action" data-action="copy"><i class="ic ic-copy"></i> Copy</li>
            <li class="list-group-item list-group-item-action" data-action="decompress" style="display: none;"><i class="ic-box-arrow-in-down-right"></i> Decompress</li>
            <li class="list-group-item list-group-item-action" data-action="download"><i class="ic ic-download"></i> Download</li>
            <li class="list-group-item list-group-item-action" data-action="info"><i class="ic ic-info-circle"></i> Info</li>
            <li class="list-group-item list-group-item-action list-group-item-danger " data-action="delete"><i class="ic ic-trash"></i> Delete</li>
        </ul>
    </div>

    <div id="dir-context-menu" class="context-menu">
        <ul class="list-group">
            <li class="list-group-item list-group-item-action" data-action="new-file"><i class="ic ic-file-earmark-plus"></i> New File</li>
            <li class="list-group-item list-group-item-action" data-action="new-dir"><i class="ic ic-plus-circle"></i> New Directory</li>
            <li class="list-group-item list-group-item-action" data-action="upload"><i class="ic ic-upload"></i> Upload</li>
            <li class="list-group-item list-group-item-action" data-action="rename"><i class="ic ic-pencil-square"></i> Rename</li>
            <li class="list-group-item list-group-item-action" data-action="copy"><i class="ic ic-copy"></i> Copy</li>
            <li class="list-group-item list-group-item-action" data-action="download-zip"><i class="ic ic-zip"></i> Download as Zip</li>
            <li class="list-group-item list-group-item-action list-group-item-danger" data-action="delete"><i class="ic ic-trash"></i> Delete</li>
        </ul>
    </div>

    <!-- Upload Modal -->
    <div class="modal fade" id="uploadModal" tabindex="-1" aria-labelledby="uploadModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="uploadModalLabel">Upload Files</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="uploadModalForm">
                        <div class="mb-3">
                            <label for="uploadModalFiles" class="form-label">Select files to upload</label>
                            <input type="file" class="form-control" id="uploadModalFiles" multiple required>
                        </div>
                        <div id="uploadProgress" class="progress" style="display: none;">
                            <div class="progress-bar" role="progressbar" style="width: 0%;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="uploadModalUpload">Upload</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Input Modal for Rename, New File/Dir, Copy -->
    <div class="modal fade" id="inputModal" tabindex="-1" aria-labelledby="inputModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="inputModalLabel">Input Required</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="inputModalForm" novalidate>
                        <div class="mb-3">
                            <label for="inputModalValue" class="form-label">Name</label>
                            <input type="text" class="form-control" id="inputModalValue" required autocomplete="off">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="inputModalSave">Save</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Confirmation Modal for Delete -->
    <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="confirmModalLabel">Confirm Action</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body" id="confirmModalBody"></div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-danger" id="confirmModalConfirm">Confirm</button>
                </div>
            </div>
        </div>
    </div>

    <!-- File Info Modal -->
    <div class="modal fade" id="infoModal" tabindex="-1" aria-labelledby="infoModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="infoModalLabel">File Information</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <table class="table table-borderless mb-0">
                        <tbody>
                            <tr>
                                <th style="width: 35%;">Name</th>
                                <td id="infoModalName" style="word-break: break-all;"></td>
                            </tr>
                            <tr>
                                <th>Path</th>
                                <td id="infoModalPath" style="word-break: break-all;"></td>
                            </tr>
                            <tr>
                                <th>Size</th>
                                <td id="infoModalSize"></td>
                            </tr>
                            <tr>
                                <th>Type</th>
                                <td id="infoModalType"></td>
                            </tr>
                            <tr>
                                <th>Last Modified</th>
                                <td id="infoModalLastModified"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- Workspace Backup & Restore Manager Modal -->
    <div class="modal fade" id="backupModal" tabindex="-1" aria-labelledby="backupModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content" style="background-color: #0b1727; color: #fff; border: 1px solid #1c2e46;">
                <div class="modal-header border-secondary">
                    <h5 class="modal-title" id="backupModalLabel">
                        <i class="bi bi-arrow-counterclockwise text-primary me-2"></i> Workspace Restore Manager
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-3 text-muted small">Select a snapshot archive below to restore your workspace files and associated databases to that state.</p>
                    
                    <div class="table-responsive">
                        <table class="table table-dark table-hover table-bordered border-secondary align-middle mb-0" id="backup-list-table">
                            <thead>
                                <tr>
                                    <th>Backup Filename</th>
                                    <th>Created At</th>
                                    <th>Size</th>
                                    <th class="text-center" style="width: 200px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="backup-list-tbody">
                                <!-- Dynamic entries -->
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer border-secondary">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Bootstrap JS Bundle (Latest) -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>

    <!-- Ace Editor -->
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/ace.js"></script>
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/theme-gogies.js"></script>
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/theme-gogies_dark.js"></script>
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/ext-modelist.js"></script>
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/ext-language_tools.js"></script>
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/ext-searchbox.js"></script>
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/ext-beautify.js"></script>
    <script src="<?php echo APP_URL; ?>/assets/ace/src-min-noconflict/ext-settings_menu.js"></script>

    <script src="<?php echo APP_URL; ?>/assets/js/workspaceSwitcher.js?v=<?php echo time(); ?>"></script>
    <!-- Custom JavaScript Modules -->
    <script type="module" src="<?php echo APP_URL; ?>/assets/js/main.js?v=<?php echo time(); ?>"></script>
    <script type="module" src="<?php echo APP_URL; ?>/ai-agent/ai-agent.js?v=<?php echo time(); ?>"></script>
</body>
</html>