<?php
require_once 'bootstrap.php';

// --- Authentication & Authorization Check ---
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ' . APP_URL . '/login.php');
    exit;
}
if (!in_array('*', $_SESSION['permissions'] ?? [])) {
    // A simple access denied message for non-admins.
    header('HTTP/1.1 403 Forbidden');
    die('<h1>403 Forbidden</h1><p>You do not have permission to access this page.</p><a href="' . APP_URL . '">Go to IDE</a>');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - GOGIES{IDE}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <style>
        body { background-color: #f8f9fa; }
        .container { max-width: 1200px; }
        .card-header { display: flex; justify-content: space-between; align-items: center; }
    </style>
</head>
<body>
    <nav class="navbar navbar-dark bg-dark mb-4">
        <div class="container-fluid">
            <a class="navbar-brand" href="#">GOGIES{IDE} Admin Panel</a>
            <a href="<?php echo APP_URL; ?>/index.php" class="btn btn-outline-light">Back to IDE</a>
        </div>
    </nav>

    <div class="container">
        <!-- User Management -->
        <div class="card mb-4">
            <div class="card-header">
                <h3><i class="ic ic-people-fill"></i> User Management</h3>
                <button id="addUserBtn" class="btn btn-primary"><i class="ic ic-plus-circle"></i> Add User</button>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Permissions</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <!-- User rows will be inserted here by JavaScript -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Workspace Management -->
        <div class="card">
            <div class="card-header">
                <h3><i class="ic ic-folder-network"></i> Workspace Management</h3>
                <button id="addWorkspaceBtn" class="btn btn-primary"><i class="ic ic-plus-circle"></i> Add Workspace</button>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Workspace Name</th>
                                <th>Path</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="workspacesTableBody">
                            <!-- Workspace rows will be inserted here by JavaScript -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- User Modal -->
    <div class="modal fade" id="userModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="userModalLabel">Add/Edit User</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="userForm">
                        <input type="hidden" id="originalUsername" name="original_username">
                        <div class="mb-3">
                            <label for="username" class="form-label">Username</label>
                            <input type="text" class="form-control" id="username" name="username" required>
                        </div>
                        <div class="mb-3">
                            <label for="password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="password" name="password">
                            <div class="">Leave blank to keep the current password.</div>
                        </div>
                        <div class="mb-3">
                            <label for="permissions" class="form-label">Permissions</label>
                            <input type="text" class="form-control" id="permissions" name="permissions" required>
                            <div class="">Comma-separated list of workspace names, or * for all.</div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary" id="saveUserBtn">Save User</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Workspace Modal -->
    <div class="modal fade" id="workspaceModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="workspaceModalLabel">Add/Edit Workspace</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="workspaceForm">
                        <input type="hidden" id="originalWorkspaceName" name="original_name">
                        <div class="mb-3">
                            <label for="workspaceName" class="form-label">Workspace Name</label>
                            <input type="text" class="form-control" id="workspaceName" name="name" required>
                        </div>
                        <div class="mb-3">
                            <label for="workspacePath" class="form-label">Path</label>
                            <input type="text" class="form-control" id="workspacePath" name="path" required>
                            <div class="">Absolute path on the server (e.g., /home/user/www/project1).</div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary" id="saveWorkspaceBtn">Save Workspace</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Confirmation Modal -->
    <div class="modal fade" id="confirmModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="confirmModalLabel">Confirm Deletion</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body" id="confirmModalBody">
                    Are you sure you want to delete this item? This action cannot be undone.
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
                </div>
            </div>
        </div>
    </div>

    <footer class="container text-center mt-4">
        <p>&copy;  GOGIES{IDE} <?php echo date("Y"); ?> <a href="http://gogies.net" target="_blank">gogies.net</a></p>
    </footer>
    <div id="toast-container" class="toast-container position-fixed bottom-0 end-0 p-3"></div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const App = {
            url: '<?php echo APP_URL; ?>'
        };
    </script>
    <script type="module" src="<?php echo APP_URL; ?>/assets/js/admin.js"></script>
</body>
</html>