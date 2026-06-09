<?php
/**
 * Backend API for File Operations
 *
 * This script handles all AJAX requests from the frontend for file system interactions.
 */

require_once __DIR__ . '/bootstrap.php';

// --- Authentication Helper ---
function isAuthenticated() {
    return isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;
}

function requireAuth() {
    if (!isAuthenticated()) {
        // For API requests, send a 401 Unauthorized error instead of redirecting
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
        exit;
    }
}

function requireAdmin() {
    requireAuth();
    if (!in_array('*', $_SESSION['permissions'] ?? [])) {
        http_response_code(403); // Forbidden
        echo json_encode(['status' => 'error', 'message' => 'Administrator privileges required.']);
        exit;
    }
}

$action = $_REQUEST['action'] ?? null;

// --- Actions that redirect ---
if ($action === 'login') {
    try {
        $username = $_POST['username'] ?? '';
        $password = $_POST['password'] ?? '';
        $users = getUsers();

        if (isset($users[$username]) && password_verify($password, $users[$username]['password'])) {
            $_SESSION['logged_in'] = true;
            $_SESSION['user'] = $username;
            $userPermissions = $users[$username]['permissions'];
            $_SESSION['permissions'] = $userPermissions;
            $allWorkspaces = getWorkspaces();
            $accessibleWorkspaces = in_array('*', $userPermissions) ? $allWorkspaces : array_intersect_key($allWorkspaces, array_flip($userPermissions));

            if (empty($accessibleWorkspaces)) {
                throw new Exception('You do not have access to any workspaces.');
            }

            $_SESSION['workspace_path'] = reset($accessibleWorkspaces);
            $_SESSION['workspace_name'] = key($accessibleWorkspaces);
            $_SESSION['accessible_workspaces'] = $accessibleWorkspaces;
            header('Location: ' . APP_URL . '/index.php');
        } else {
            throw new Exception('Invalid username or password.');
            session_destroy();
        }
    } catch (Exception $e) {
        $_SESSION['login_error'] = $e->getMessage();
        header('Location: ' . APP_URL . '/login.php');
    }
    exit;
}

if ($action === 'logout') {
    session_unset();
    session_destroy();
    header('Location: ' . APP_URL . '/login.php');
    exit;
}

// --- All actions below this require authentication and return JSON or a file ---
requireAuth();

// Release session lock early for actions that do not write to session to allow concurrent HTTP requests
if ($action !== 'switch_workspace' && $action !== 'login' && $action !== 'logout') {
    session_write_close();
}

// Set JSON header for API actions, but not for file downloads
if ($action !== 'download' && $action !== 'download_zip') {
    header('Content-Type: application/json');
}

try {
    // A helper function to securely resolve a relative path to a full, validated path
    function getValidatedPath($relativePath) {
        if (!isset($_SESSION['workspace_path'])) {
            throw new Exception('No workspace selected.');
        }
        $basePath = $_SESSION['workspace_path'];

        // Normalize the path to prevent directory traversal tricks
        $sanitizedPath = str_replace('..', '', $relativePath);
        $fullPath = $basePath . '/' . trim($sanitizedPath, '/');
        
        // Get the real, absolute path
        $realBasePath = realpath($basePath);
        $realFullPath = realpath($fullPath);

        // For 'create' actions, the path might not exist yet, so we check its parent
        if ($realFullPath === false) {
            $realFullPath = realpath(dirname($fullPath));
        }

        // Security Check: Ensure the final path is within the workspace
        if ($realFullPath === false || strpos($realFullPath, $realBasePath) !== 0) {
            throw new Exception('Access denied: Path is outside the workspace.');
        }
        
        return $fullPath;
    }

    // A helper function to automatically align permissions and owner of created files
    // to match the workspace root's owner and group.
    function fixFilePermissions($path) {
        if (!isset($_SESSION['workspace_path'])) return;
        $workspace = $_SESSION['workspace_path'];
        if (!file_exists($workspace) || !file_exists($path)) return;

        $owner = fileowner($workspace);
        $group = filegroup($workspace);

        $realRoot = realpath($workspace);
        $realPath = realpath($path);

        $allowedRoots = array_filter([$realRoot, realpath(ROOT_PATH), realpath(DATA_PATH)]);
        $allowed = false;
        foreach ($allowedRoots as $allowedRoot) {
            if ($allowedRoot !== false && strpos($realPath, $allowedRoot) === 0) {
                $allowed = true;
                break;
            }
        }

        if ($realPath === false || !$allowed) {
            return;
        }

        // If running as root (e.g. inside a Docker container), use fast native shell tools
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            $escapedPath = escapeshellarg($realPath);
            $escapedOwner = escapeshellarg($owner);
            $escapedGroup = escapeshellarg($group);
            @shell_exec("chown -R {$escapedOwner}:{$escapedGroup} {$escapedPath}");
            @shell_exec("find {$escapedPath} -type d -exec chmod 775 {} +");
            @shell_exec("find {$escapedPath} -type f -exec chmod 664 {} +");
            return;
        }

        // Fallback to PHP implementation
        applyPermissionsRecursive($realPath, $owner, $group);

        // Walk up parent directories up to $workspace and fix permissions of newly created parents
        $parent = dirname($path);
        while (empty($realPath) || ($realPath !== $realRoot)) {
            $realParent = realpath($parent);
            if ($realParent === false || strpos($realParent, $realRoot) !== 0) {
                break;
            }
            if ($owner !== false) {
                @chown($realParent, $owner);
            }
            if ($group !== false) {
                @chgrp($realParent, $group);
            }
            @chmod($realParent, 0775);
            
            if ($realParent === $realRoot) {
                break;
            }
            $parent = dirname($parent);
            $realPath = $realParent;
        }
    }

    function applyPermissionsRecursive($target, $owner, $group) {
        if (!file_exists($target)) return;
        
        if ($owner !== false) {
            @chown($target, $owner);
        }
        if ($group !== false) {
            @chgrp($target, $group);
        }
        
        if (is_dir($target)) {
            @chmod($target, 0775);
            $items = @scandir($target);
            if ($items !== false) {
                foreach ($items as $item) {
                    if ($item === '.' || $item === '..') continue;
                    applyPermissionsRecursive($target . '/' . $item, $owner, $group);
                }
            }
        } else {
            @chmod($target, 0664);
        }
    }

    // A helper function to get the path to the settings file
    function getSettingsFilePath() {
        // NOTE: For better security, this 'data' directory should ideally be outside the web root.
        $dataPath =DATA_PATH;
        if (!is_dir($dataPath)) {
            // Attempt to create it if it doesn't exist
            if (!mkdir($dataPath, 0775, true)) {
                throw new Exception("Unable to create data directory at {$dataPath}. Please check permissions.");
            }
        }
        return $dataPath . '/ide_settings.php';
    }

    switch ($action) {
        case 'switch_workspace':
            $name = $_POST['name'] ?? '';
            if (empty($name)) {
                throw new Exception('Workspace name is required.');
            }

            // Get all workspaces and user's permissions
            $allWorkspaces = getWorkspaces();
            $userPermissions = $_SESSION['permissions'] ?? [];
            $accessibleWorkspaces = in_array('*', $userPermissions)
                ? $allWorkspaces
                : array_intersect_key($allWorkspaces, array_flip($userPermissions));

            // Check if the requested workspace is accessible
            if (!isset($accessibleWorkspaces[$name])) {
                throw new Exception('Access denied to this workspace.');
            }

            $_SESSION['workspace_name'] = $name;
            $_SESSION['workspace_path'] = $accessibleWorkspaces[$name];
            $response = ['status' => 'success', 'message' => 'Workspace switched successfully.'];
            break;

        case 'backup_workspace':
            // Prevent execution timeout and raise memory limit dynamically for large workspaces
            @ini_set('memory_limit', '512M');
            @set_time_limit(300);
             
            $workspacePath = $_SESSION['workspace_path'] ?? '';
            $workspaceName = $_SESSION['workspace_name'] ?? 'default';
            
            if (empty($workspacePath) || !file_exists($workspacePath)) {
                throw new Exception('No active workspace selected or workspace directory does not exist.');
            }
            
            $backupsDir = DATA_PATH . '/workspace_backups';
            if (!is_dir($backupsDir)) {
                mkdir($backupsDir, 0775, true);
                fixFilePermissions($backupsDir);
                @file_put_contents($backupsDir . '/.gitignore', "*.zip\n");
                fixFilePermissions($backupsDir . '/.gitignore');
            }
            
            $sanitizedName = preg_replace('/[^a-zA-Z0-9_-]/', '', $workspaceName);
            $zipFilename = "backup_{$sanitizedName}_" . date('Y-m-d_H-i-s') . ".zip";
            $zipPath = $backupsDir . '/' . $zipFilename;
            
            $zip = new ZipArchive();
            if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new Exception("Cannot create backup ZIP archive on the server.");
            }
            
            // Helper to recursively add files
            if (!function_exists('addDirToZip')) {
                function addDirToZip($dir, $zip, $baseLen) {
                    $handle = opendir($dir);
                    if (!$handle) return;
                    while (false !== ($file = readdir($handle))) {
                        if ($file === '.' || $file === '..') continue;
                        
                        $filePath = $dir . '/' . $file;
                        $relative = substr($filePath, $baseLen);
                        
                        if (is_dir($filePath)) {
                            // Skip huge system and cache directories to optimize speed
                            if ($file === 'node_modules' || $file === '.git' || $file === 'backups' || $file === 'workspace_backups') {
                                continue;
                            }
                            $zip->addEmptyDir($relative);
                            addDirToZip($filePath, $zip, $baseLen);
                        } else {
                            $zip->addFile($filePath, $relative);
                        }
                    }
                    closedir($handle);
                }
            }
            
            // 1. Add workspace code files
            addDirToZip($workspacePath, $zip, strlen($workspacePath) + 1);
            
            // Track temporary files to delete after closing the zip
            $tmpFilesToDelete = [];
            
            $connectionsFile = DATA_PATH . "/db_connections_" . md5($workspacePath) . ".php";
            $oldConnectionsFile = DATA_PATH . "/db_connections_" . md5($workspacePath) . ".json";
            $profiles = [];
            if (file_exists($connectionsFile)) {
                $profiles = readSecurePhpJson($connectionsFile) ?? [];
            } else if (file_exists($oldConnectionsFile)) {
                $profiles = json_decode(file_get_contents($oldConnectionsFile), true) ?? [];
                writeSecurePhpJson($connectionsFile, $profiles);
                @unlink($oldConnectionsFile);
            }
                
                foreach ($profiles as $p) {
                    if ($p['type'] === 'sqlite') {
                        if (!empty($p['path']) && file_exists($p['path'])) {
                            $zip->addFile($p['path'], "__database_backups__/" . basename($p['path']));
                        }
                    } else if ($p['type'] === 'mysql' || $p['type'] === 'pgsql') {
                        try {
                            $dsn = '';
                            $user = $p['username'] ?? '';
                            $pass = $p['password'] ?? '';
                            if ($p['type'] === 'mysql') {
                                $dsn = "mysql:host={$p['host']};port={$p['port']};dbname={$p['database']};charset=utf8mb4";
                            } else if ($p['type'] === 'pgsql') {
                                $dsn = "pgsql:host={$p['host']};port={$p['port']};dbname={$p['database']}";
                            }
                            
                            $pdo = new PDO($dsn, $user, $pass, [
                                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                                PDO::ATTR_TIMEOUT => 5
                            ]);
                            
                            // Create a temporary file to stream SQL dump to disk (uses 0 memory!)
                            $tmpSqlFile = tempnam(sys_get_temp_dir(), 'db_dump_');
                            $fp = fopen($tmpSqlFile, 'w');
                            
                            $sqlHeader = "-- Gogies{DB} Auto-Generated Database Backup\n";
                            $sqlHeader .= "-- Workspace: {$workspaceName}\n";
                            $sqlHeader .= "-- Connection: {$p['name']}\n";
                            $sqlHeader .= "-- Date: " . date('Y-m-d H:i:s') . "\n\n";
                            fwrite($fp, $sqlHeader);
                            
                            $tables = [];
                            if ($p['type'] === 'mysql') {
                                $stmt = $pdo->query("SHOW TABLES");
                                $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
                            } else {
                                $stmt = $pdo->query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
                                $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
                            }
                            
                            foreach ($tables as $table) {
                                $tableHeader = "-- -----------------------------------------------------\n";
                                $tableHeader .= "-- Table structure for `{$table}`\n";
                                $tableHeader .= "-- -----------------------------------------------------\n";
                                fwrite($fp, $tableHeader);
                                
                                if ($p['type'] === 'mysql') {
                                    $createStmt = $pdo->query("SHOW CREATE TABLE `{$table}`");
                                    $row = $createStmt->fetch();
                                    fwrite($fp, "DROP TABLE IF EXISTS `{$table}`;\n");
                                    fwrite($fp, $row['Create Table'] . ";\n\n");
                                } else {
                                    fwrite($fp, "DROP TABLE IF EXISTS \"{$table}\" CASCADE;\n");
                                    $colStmt = $pdo->prepare("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = ?");
                                    $colStmt->execute([$table]);
                                    $cols = $colStmt->fetchAll();
                                    $colDefs = [];
                                    $sequencesToCreate = [];
                                    foreach ($cols as $col) {
                                        $def = '"' . $col['column_name'] . '" ' . $col['data_type'];
                                        if ($col['is_nullable'] === 'NO') $def .= ' NOT NULL';
                                        
                                        $colDefault = $col['column_default'];
                                        if ($colDefault !== null) {
                                            $def .= ' DEFAULT ' . $colDefault;
                                            
                                            // Check if it's a sequence call
                                            if (preg_match('/nextval\(\'([^\']+)\'/i', $colDefault, $matches)) {
                                                $seqName = $matches[1];
                                                $seqName = str_replace('"', '', $seqName);
                                                if (strpos($seqName, '.') !== false) {
                                                    $parts = explode('.', $seqName);
                                                    $seqName = end($parts);
                                                }
                                                $sequencesToCreate[$seqName] = $col['column_name'];
                                            }
                                        }
                                        $colDefs[] = $def;
                                    }
                                    
                                    // Drop and recreate sequences before creating the table
                                    foreach ($sequencesToCreate as $seq => $colName) {
                                        fwrite($fp, "DROP SEQUENCE IF EXISTS \"{$seq}\" CASCADE;\n");
                                        fwrite($fp, "CREATE SEQUENCE \"{$seq}\";\n");
                                    }
                                    
                                    fwrite($fp, "CREATE TABLE \"{$table}\" (\n  " . implode(",\n  ", $colDefs) . "\n);\n\n");
                                }
                                
                                $dataStmt = $pdo->query($p['type'] === 'mysql' ? "SELECT * FROM `{$table}`" : "SELECT * FROM \"{$table}\"");
                                
                                // Stream table rows one by one to use 0 memory!
                                $hasDataHeader = false;
                                while ($r = $dataStmt->fetch(PDO::FETCH_ASSOC)) {
                                    if (!$hasDataHeader) {
                                        fwrite($fp, "-- Dumping data for table `{$table}`\n");
                                        $hasDataHeader = true;
                                    }
                                    $colsList = [];
                                    $valsList = [];
                                    foreach ($r as $key => $val) {
                                        $colsList[] = $p['type'] === 'mysql' ? "`{$key}`" : "\"{$key}\"";
                                        if ($val === null) {
                                            $valsList[] = 'NULL';
                                        } else if ($val === true) {
                                            $valsList[] = 'TRUE';
                                        } else if ($val === false) {
                                            $valsList[] = 'FALSE';
                                        } else {
                                            $valsList[] = $pdo->quote($val);
                                        }
                                    }
                                    fwrite($fp, "INSERT INTO " . ($p['type'] === 'mysql' ? "`{$table}`" : "\"{$table}\"") . " (" . implode(", ", $colsList) . ") VALUES (" . implode(", ", $valsList) . ");\n");
                                }
                                
                                // Reset sequences to match max values to prevent primary key collision errors on new inserts
                                if ($p['type'] === 'pgsql' && !empty($sequencesToCreate)) {
                                    foreach ($sequencesToCreate as $seq => $colName) {
                                        fwrite($fp, "SELECT setval('\"{$seq}\"', COALESCE((SELECT MAX(\"{$colName}\") FROM \"{$table}\"), 1), true);\n");
                                    }
                                }
                                fwrite($fp, "\n");
                            }
                            
                            fclose($fp);
                            $zip->addFile($tmpSqlFile, "__database_backups__/{$p['name']}_backup.sql");
                            $tmpFilesToDelete[] = $tmpSqlFile;
                        } catch (Exception $dbErr) {
                            $zip->addFromString("__database_backups__/{$p['name']}_backup_FAILED.txt", "Failed to dump database: " . $dbErr->getMessage());
                        }
                    }
                }
            
            $zip->close();
            
            // Clean up temporary files
            foreach ($tmpFilesToDelete as $tmpFile) {
                if (file_exists($tmpFile)) {
                    @unlink($tmpFile);
                }
            }
            
            fixFilePermissions($zipPath);
            
            $response = [
                'status' => 'success',
                'message' => 'Workspace & Database backup generated successfully!'
            ];
            break;

        case 'list_backups':
            $workspaceName = $_SESSION['workspace_name'] ?? 'default';
            $backupsDir = DATA_PATH . '/workspace_backups';
            $backups = [];
            
            if (is_dir($backupsDir)) {
                $sanitizedName = preg_replace('/[^a-zA-Z0-9_-]/', '', $workspaceName);
                $prefix = "backup_{$sanitizedName}_";
                
                $files = scandir($backupsDir);
                foreach ($files as $file) {
                    if ($file === '.' || $file === '..') continue;
                    
                    if (strpos($file, $prefix) === 0 && substr($file, -4) === '.zip') {
                        $filePath = $backupsDir . '/' . $file;
                        
                        // Parse timestamp from name backup_workspacename_YYYY-MM-DD_HH-II-SS.zip
                        $createdAt = 'Unknown';
                        $timePart = substr($file, strlen($prefix), 19);
                        if (preg_match('/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/', $timePart)) {
                            $createdAt = str_replace('_', ' ', $timePart);
                            $createdAt = preg_replace('/-(\d{2})-(\d{2})$/', ':$1:$2', $createdAt);
                        } else {
                            $createdAt = date('Y-m-d H:i:s', filemtime($filePath));
                        }
                        
                        $size = filesize($filePath);
                        if ($size >= 1048576) {
                            $formattedSize = round($size / 1048576, 2) . ' MB';
                        } else if ($size >= 1024) {
                            $formattedSize = round($size / 1024, 2) . ' KB';
                        } else {
                            $formattedSize = $size . ' B';
                        }
                        
                        $backups[] = [
                            'filename' => $file,
                            'createdAt' => $createdAt,
                            'size' => $formattedSize
                        ];
                    }
                }
            }
            
            usort($backups, function($a, $b) {
                return strcmp($b['createdAt'], $a['createdAt']);
            });
            
            $response = [
                'status' => 'success',
                'data' => $backups
            ];
            break;

        case 'restore_backup': 
            @ini_set('memory_limit', '1024M');
            @set_time_limit(300);
            $workspacePath = $_SESSION['workspace_path'] ?? '';
            $workspaceName = $_SESSION['workspace_name'] ?? 'default';
            
            if (empty($workspacePath) || !file_exists($workspacePath)) {
                throw new Exception('No active workspace selected.');
            }
            
            $filename = $_POST['filename'] ?? '';
            $filename = basename($filename);
            $backupsDir = DATA_PATH . '/workspace_backups';
            $backupPath = $backupsDir . '/' . $filename;
            
            if (empty($filename) || !file_exists($backupPath)) {
                throw new Exception('Backup file not found.');
            }
            
            $sanitizedName = preg_replace('/[^a-zA-Z0-9_-]/', '', $workspaceName);
            if (strpos($filename, "backup_{$sanitizedName}_") !== 0) {
                throw new Exception('Access denied. You can only restore backups created for the current active workspace.');
            }
            
            $zip = new ZipArchive();
            if ($zip->open($backupPath) !== true) {
                throw new Exception('Cannot open the backup ZIP archive.');
            }
            
            // Step 1: Connect to connections and restore databases first
            $connectionsFile = DATA_PATH . "/db_connections_" . md5($workspacePath) . ".php";
            $oldConnectionsFile = DATA_PATH . "/db_connections_" . md5($workspacePath) . ".json";
            $profiles = [];
            if (file_exists($connectionsFile)) {
                $profiles = readSecurePhpJson($connectionsFile) ?? [];
            } else if (file_exists($oldConnectionsFile)) {
                $profiles = json_decode(file_get_contents($oldConnectionsFile), true) ?? [];
                writeSecurePhpJson($connectionsFile, $profiles);
                @unlink($oldConnectionsFile);
            }
            
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $entryName = $zip->getNameIndex($i);
                
                if (strpos($entryName, '__database_backups__/') === 0) {
                    $baseName = basename($entryName);
                    
                    if (strpos($baseName, '_backup.sql') !== false) {
                        $connectionName = str_replace('_backup.sql', '', $baseName);
                        
                        $profile = null;
                        foreach ($profiles as $p) {
                            if ($p['name'] === $connectionName) {
                                $profile = $p;
                                break;
                            }
                        }
                        
                        if ($profile) {
                            $dsn = '';
                            $user = $profile['username'] ?? '';
                            $pass = $profile['password'] ?? '';
                            if ($profile['type'] === 'mysql') {
                                $dsn = "mysql:host={$profile['host']};port={$profile['port']};dbname={$profile['database']};charset=utf8mb4";
                            } else if ($profile['type'] === 'pgsql') {
                                $dsn = "pgsql:host={$profile['host']};port={$profile['port']};dbname={$profile['database']}";
                            }
                            
                            try {
                                $pdo = new PDO($dsn, $user, $pass, [
                                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                                    PDO::ATTR_TIMEOUT => 5
                                ]);
                                
                                $pdo->beginTransaction();
                                try {
                                    $stream = $zip->getStream($entryName);
                                    if ($stream) {
                                        $queryBuffer = '';
                                        while (!feof($stream)) {
                                            $line = fgets($stream);
                                            if ($line === false) break;
                                            
                                            $trimmed = trim($line);
                                            // Skip comments and empty lines
                                            if ($trimmed === '' || strpos($trimmed, '--') === 0 || strpos($trimmed, '#') === 0) {
                                                continue;
                                            }
                                            
                                            $queryBuffer .= $line;
                                            
                                            // Execute statements as they complete with a semicolon at the end of the line
                                            if (substr($trimmed, -1) === ';') {
                                                $pdo->exec($queryBuffer);
                                                $queryBuffer = '';
                                            }
                                        }
                                        fclose($stream);
                                        if (trim($queryBuffer) !== '') {
                                            $pdo->exec($queryBuffer);
                                        }
                                    }
                                    $pdo->commit();
                                } catch (Exception $txErr) {
                                    if ($pdo->inTransaction()) {
                                        $pdo->rollBack();
                                    }
                                    throw $txErr;
                                }
                            } catch (Exception $dbErr) {
                                throw new Exception("Failed to restore remote database '{$connectionName}': " . $dbErr->getMessage());
                            }
                        }
                    } else {
                        $profile = null;
                        foreach ($profiles as $p) {
                            if ($p['type'] === 'sqlite' && basename($p['path']) === $baseName) {
                                $profile = $p;
                                break;
                            }
                        }
                        
                        if ($profile && !empty($profile['path'])) {
                            $sqliteData = $zip->getFromName($entryName);
                            if ($sqliteData !== false) {
                                file_put_contents($profile['path'], $sqliteData);
                                @chmod($profile['path'], 0664);
                            }
                        }
                    }
                }
            }
            
            // Step 2: Extract code files back into the workspace path
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $entryName = $zip->getNameIndex($i);
                
                if (strpos($entryName, '__database_backups__/') === 0) {
                    continue;
                }
                
                $destPath = $workspacePath . '/' . $entryName;
                
                if (substr($entryName, -1) === '/') {
                    if (!is_dir($destPath)) {
                        mkdir($destPath, 0775, true);
                        @chmod($destPath, 0775);
                    }
                } else {
                    $parentDir = dirname($destPath);
                    if (!is_dir($parentDir)) {
                        mkdir($parentDir, 0775, true);
                        @chmod($parentDir, 0775);
                    }
                    
                    $fileData = $zip->getFromIndex($i);
                    if ($fileData !== false) {
                        file_put_contents($destPath, $fileData);
                        @chmod($destPath, 0664);
                    }
                }
            }
            
            $zip->close();
            
            $response = [
                'status' => 'success',
                'message' => 'Workspace and Database successfully restored to this backup snapshot!'
            ];
            break;

        case 'delete_backup':
            $workspaceName = $_SESSION['workspace_name'] ?? 'default';
            $filename = $_POST['filename'] ?? '';
            $filename = basename($filename);
            $backupsDir = DATA_PATH . '/workspace_backups';
            $backupPath = $backupsDir . '/' . $filename;
            
            if (empty($filename) || !file_exists($backupPath)) {
                throw new Exception('Backup file not found.');
            }
            
            $sanitizedName = preg_replace('/[^a-zA-Z0-9_-]/', '', $workspaceName);
            if (strpos($filename, "backup_{$sanitizedName}_") !== 0) {
                throw new Exception('Access denied to this backup file.');
            }
            
            unlink($backupPath);
            $response = [
                'status' => 'success',
                'message' => 'Backup snapshot deleted successfully.'
            ];
            break;
        // --- Admin Actions ---
        case 'get_users_and_workspaces':
            requireAdmin();
            $users = getUsers();
            // Remove password hashes before sending to client
            foreach ($users as $username => &$user) {
                unset($user['password']);
            }
            $workspaces = getWorkspaces();
            $response = ['status' => 'success', 'data' => ['users' => $users, 'workspaces' => $workspaces]];
            break;

        case 'save_user':
            requireAdmin();
            $username = $_POST['username'] ?? '';
            $original_username = $_POST['original_username'] ?? '';
            $password = $_POST['password'] ?? '';
            $permissions_str = $_POST['permissions'] ?? '';

            if (empty($username)) throw new Exception('Username cannot be empty.');

            $users = getUsers();
            $is_new_user = empty($original_username);

            if ($is_new_user && isset($users[$username])) {
                throw new Exception("User '{$username}' already exists.");
            }
            if (!$is_new_user && $username !== $original_username) {
                throw new Exception("Cannot change username.");
            }
            if ($is_new_user && empty($password)) {
                throw new Exception("Password is required for new users.");
            }

            $permissions = array_map('trim', explode(',', $permissions_str));

            if ($is_new_user) {
                $users[$username] = [
                    'password' => password_hash($password, PASSWORD_DEFAULT),
                    'permissions' => $permissions
                ];
            } else {
                if (!empty($password)) {
                    $users[$username]['password'] = password_hash($password, PASSWORD_DEFAULT);
                }
                $users[$username]['permissions'] = $permissions;
            }

            saveUsers($users);
            $response = ['status' => 'success', 'message' => "User '{$username}' saved successfully."];
            break;

        case 'delete_user':
            requireAdmin();
            $username = $_POST['username'] ?? '';
            if (empty($username)) throw new Exception('Username not provided.');
            if ($username === $_SESSION['user']) throw new Exception('You cannot delete your own account.');

            $users = getUsers();
            if (!isset($users[$username])) throw new Exception("User '{$username}' not found.");

            // Prevent deleting the last admin
            $admin_count = 0;
            foreach ($users as $user) {
                if (in_array('*', $user['permissions'])) {
                    $admin_count++;
                }
            }
            if (in_array('*', $users[$username]['permissions']) && $admin_count <= 1) {
                throw new Exception('Cannot delete the last administrator.');
            }

            unset($users[$username]);
            saveUsers($users);
            $response = ['status' => 'success', 'message' => "User '{$username}' deleted."];
            break;

        case 'save_workspace':
            requireAdmin();
            $name = $_POST['name'] ?? '';
            $path = $_POST['path'] ?? '';
            if (empty($name) || empty($path)) throw new Exception('Workspace name and path are required.');
            $workspaces = getWorkspaces();
            $workspaces[$name] = $path;
            saveWorkspaces($workspaces);
            $response = ['status' => 'success', 'message' => "Workspace '{$name}' saved."];
            break;

        case 'delete_workspace':
            requireAdmin();
            $name = $_POST['name'] ?? '';
            if (empty($name)) throw new Exception('Workspace name is required.');
            $workspaces = getWorkspaces();
            unset($workspaces[$name]);
            saveWorkspaces($workspaces);
            $response = ['status' => 'success', 'message' => "Workspace '{$name}' deleted."];
            break;

        case 'list_files':
            $path = $_GET['path'] ?? '';
            $fullPath = getValidatedPath($path);
            $dirs = [];
            $files = [];
            if (is_dir($fullPath)) {
                foreach (scandir($fullPath) as $item) {
                    if ($item === '.' || $item === '..') continue;
                    $itemPath = $fullPath . '/' . $item;
                    $relativeItemPath = $path ? $path . '/' . $item : $item;
                    if (is_dir($itemPath)) {
                        $dirs[] = ['name' => $item, 'path' => $relativeItemPath];
                    } else {
                        $files[] = [
                            'name' => $item,
                            'path' => $relativeItemPath,
                            'size' => filesize($itemPath),
                            'extension' => strtolower(pathinfo($item, PATHINFO_EXTENSION))
                        ];
                    }
                }
            }
            $response = ['status' => 'success', 'data' => ['dirs' => $dirs, 'files' => $files]];
            break;

        case 'get_file_content':
            $path = $_GET['path'] ?? '';
            $fullPath = getValidatedPath($path);
            if (!is_file($fullPath) || !is_readable($fullPath)) {
                throw new Exception('File not found or is not readable.');
            }
            $content = file_get_contents($fullPath);
            $response = ['status' => 'success', 'data' => ['path' => $path, 'content' => $content]];
            break;

        case 'save_file_content':
            $path = $_POST['path'] ?? '';
            $content = $_POST['content'] ?? '';
            if (empty($path)) throw new Exception('File path is missing.');

            $fullPath = getValidatedPath($path);

            if (file_put_contents($fullPath, $content) !== false) {
                fixFilePermissions($fullPath);
                $response = ['status' => 'success', 'message' => 'File saved successfully.'];
            } else {
                throw new Exception('Failed to save file. Check permissions.');
            }
            break;

        case 'delete':
            $path = $_POST['path'] ?? '';
            $fullPath = getValidatedPath($path);
            if (!file_exists($fullPath)) throw new Exception('Item not found.');

            function deleteDirectory($dir) {
                if (!is_dir($dir)) return unlink($dir);
                $iterator = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST
                );
                foreach ($iterator as $file) {
                    if ($file->isDir()) rmdir($file->getRealPath());
                    else unlink($file->getRealPath());
                }
                return rmdir($dir);
            }

            if (deleteDirectory($fullPath)) {
                $response = ['status' => 'success', 'message' => "Deleted: {$path}"];
            } else {
                throw new Exception("Failed to delete: {$path}");
            }
            break;

        case 'rename':
            $path = $_POST['path'] ?? '';
            $newName = $_POST['new_name'] ?? '';
            if (empty($path) || empty($newName)) throw new Exception('Missing parameters for rename.');
            if (strpos($newName, '/') !== false) throw new Exception('Invalid name. Slashes are not allowed.');

            $oldFullPath = getValidatedPath($path);
            $newFullPath = dirname($oldFullPath) . '/' . $newName;

            if (file_exists($newFullPath)) throw new Exception("A file or folder with the name '{$newName}' already exists.");

            if (rename($oldFullPath, $newFullPath)) {
                $response = ['status' => 'success', 'message' => 'Renamed successfully.'];
            } else {
                throw new Exception('Failed to rename item.');
            }
            break;

        case 'new_file':
            $path = $_POST['path'] ?? '';
            $name = $_POST['name'] ?? '';
            if (!isset($_POST['path']) || empty($name)) throw new Exception('Missing parameters for new file.');
            if (strpos($name, '/') !== false) throw new Exception('Invalid name. Slashes are not allowed.');

            $parentDir = getValidatedPath($path);
            $newFilePath = $parentDir . '/' . $name;

            if (file_exists($newFilePath)) throw new Exception("File '{$name}' already exists in this directory.");

            if (file_put_contents($newFilePath, '') !== false) {
                fixFilePermissions($newFilePath);
                $response = ['status' => 'success', 'message' => "File '{$name}' created."];
            } else {
                throw new Exception('Could not create file.');
            }
            break;

        case 'new_dir':
            $path = $_POST['path'] ?? '';
            $name = $_POST['name'] ?? '';
            if (!isset($_POST['path']) || empty($name)) throw new Exception('Missing parameters for new directory.');
            if (strpos($name, '/') !== false) throw new Exception('Invalid name. Slashes are not allowed.');

            $parentDir = getValidatedPath($path);
            $newDirPath = $parentDir . '/' . $name;

            if (file_exists($newDirPath)) throw new Exception("Directory '{$name}' already exists.");

            if (mkdir($newDirPath, 0775, true)) {
                fixFilePermissions($newDirPath);
                $response = ['status' => 'success', 'message' => "Directory '{$name}' created."];
            } else {
                throw new Exception('Could not create directory.');
            }
            break;

        case 'copy':
            $path = $_POST['path'] ?? '';
            $newName = $_POST['new_name'] ?? '';
            if (empty($path) || empty($newName)) throw new Exception('Missing parameters for copy.');
            if (strpos($newName, '/') !== false) throw new Exception('Invalid name. Slashes are not allowed.');

            $sourceFullPath = getValidatedPath($path);
            $destinationFullPath = dirname($sourceFullPath) . '/' . $newName;

            if (!file_exists($sourceFullPath)) throw new Exception('Source item not found.');
            if (file_exists($destinationFullPath)) throw new Exception("An item named '{$newName}' already exists.");

            function copyRecursive($source, $dest) {
                if (is_dir($source)) {
                    if (!is_dir($dest)) {
                        mkdir($dest, 0775, true);
                        fixFilePermissions($dest);
                    }
                    $iterator = new DirectoryIterator($source);
                    foreach ($iterator as $fileinfo) {
                        if (!$fileinfo->isDot()) {
                            copyRecursive($fileinfo->getPathname(), $dest . '/' . $fileinfo->getFilename());
                        }
                    }
                } else if (is_file($source)) {
                    copy($source, $dest);
                    fixFilePermissions($dest);
                }
            }

            copyRecursive($sourceFullPath, $destinationFullPath);
            $response = ['status' => 'success', 'message' => 'Item copied successfully.'];
            break;

        case 'upload':
            $path = $_POST['path'] ?? '';
            $targetDir = getValidatedPath($path);

            if (!is_dir($targetDir)) {
                throw new Exception("Target directory '{$path}' does not exist.");
            }
            if (!isset($_FILES['files'])) {
                throw new Exception('No files were uploaded.');
            }

            $uploadedFiles = $_FILES['files'];
            $errors = [];

            $numFiles = count($uploadedFiles['name']);
            for ($i = 0; $i < $numFiles; $i++) {
                $originalFileName = basename($uploadedFiles['name'][$i]);
                $fileName = $originalFileName;
                $tmpName = $uploadedFiles['tmp_name'][$i];
                $error = $uploadedFiles['error'][$i];

                if ($error !== UPLOAD_ERR_OK) {
                    $errors[] = "Failed to upload {$originalFileName}. Error code: {$error}.";
                    continue;
                }
                
                // Handle existing files by prefixing with a number
                $targetFile = $targetDir . '/' . $fileName;
                $counter = 1;
                while (file_exists($targetFile)) {
                    $fileName = $counter . '_' . $originalFileName;
                    $targetFile = $targetDir . '/' . $fileName;
                    $counter++;
                }

                if (!move_uploaded_file($tmpName, $targetFile)) {
                    $errors[] = "Failed to move uploaded file '{$originalFileName}'.";
                } else {
                    fixFilePermissions($targetFile);
                }
            }

            if (!empty($errors)) throw new Exception(implode("\n", $errors));
            
            $response = ['status' => 'success', 'message' => 'All files uploaded successfully.'];
            break;

        case 'download':
            $path = $_GET['path'] ?? '';
            $fullPath = getValidatedPath($path);
            if (!is_file($fullPath) || !is_readable($fullPath)) {
                throw new Exception('File not found or is not readable.');
            }
            header('Content-Description: File Transfer');
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . basename($fullPath) . '"');
            header('Expires: 0');
            header('Cache-Control: must-revalidate');
            header('Pragma: public');
            header('Content-Length: ' . filesize($fullPath));
            flush(); // Flush system output buffer
            readfile($fullPath);
            exit; // Terminate script to prevent JSON output

        case 'download_zip':
            $path = $_GET['path'] ?? '';
            $fullPath = getValidatedPath($path);
            if (!is_dir($fullPath)) throw new Exception('Directory not found.');

            $zip = new ZipArchive();
            $zipFileName = basename($fullPath) . '.zip';
            $zipFilePath = sys_get_temp_dir() . '/' . $zipFileName;

            if ($zip->open($zipFilePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
                throw new Exception("Could not open archive for writing.");
            }

            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($fullPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::LEAVES_ONLY
            );

            foreach ($files as $name => $file) {
                if (!$file->isDir()) {
                    $filePath = $file->getRealPath();
                    $relativePath = substr($filePath, strlen($fullPath) + 1);
                    $zip->addFile($filePath, $relativePath);
                }
            }
            $zip->close();
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="' . $zipFileName . '"');
            header('Content-Length: ' . filesize($zipFilePath));
            readfile($zipFilePath);
            unlink($zipFilePath); // Clean up the temp file
            exit;

        case 'get_log_content':
            $logFilePath = ROOT_PATH . '/errors.log';
            if (!is_file($logFilePath) || !is_readable($logFilePath)) {
                $content = "Error log is empty or does not exist.";
            } else {
                $content = file_get_contents($logFilePath);
                if ($content === false) {
                    throw new Exception('Could not read error log file.');
                }
                if (empty(trim($content))) {
                    $content = "Error log is empty.";
                }
            }
            // Return in the same format as get_file_content for consistency
            $response = ['status' => 'success', 'data' => ['path' => 'Error Log', 'content' => $content]];
            break;

        case 'get_file_info':
            $path = $_GET['path'] ?? '';
            $fullPath = getValidatedPath($path);
            if (!is_file($fullPath)) {
                throw new Exception('File not found.');
            }
            $info = [
                'name' => basename($fullPath),
                'path' => $path,
                'size' => filesize($fullPath),
                'last_modified' => filemtime($fullPath),
                'type' => mime_content_type($fullPath) ?: 'application/octet-stream'
            ];
            $response = ['status' => 'success', 'data' => $info];
            break;

        case 'decompress':
            $path = $_POST['path'] ?? '';
            $fullPath = getValidatedPath($path);
            $extension = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));

            if ($extension !== 'zip') {
                throw new Exception('Decompression is currently only supported for .zip files.');
            }

            if (!is_file($fullPath)) {
                throw new Exception('Archive file not found.');
            }

            $zip = new ZipArchive();
            $res = $zip->open($fullPath);

            if ($res === TRUE) {
                $extractPath = dirname($fullPath);
                if ($zip->extractTo($extractPath)) {
                    $zip->close();
                    fixFilePermissions($extractPath);
                    $response = ['status' => 'success', 'message' => 'Archive decompressed successfully.'];
                } else {
                    $zip->close();
                    throw new Exception('Failed to extract archive. Check directory permissions.');
                }
            } else {
                throw new Exception('Failed to open archive. It may be corrupted or in an unsupported format. Error code: ' . $res);
            }
            break;

        case 'get_settings':
            $settingsFile = getSettingsFilePath();
            if (!file_exists($settingsFile)) {
                // Fallback check for old .json settings file
                $oldFile = str_replace('.php', '.json', $settingsFile);
                if (file_exists($oldFile)) {
                    $data = json_decode(file_get_contents($oldFile), true);
                    if (is_array($data) || is_object($data)) {
                        writeSecurePhpJson($settingsFile, $data);
                        @unlink($oldFile);
                        header('Content-Type: application/json');
                        echo json_encode($data);
                        exit;
                    }
                }
            }
            $data = readSecurePhpJson($settingsFile);
            header('Content-Type: application/json');
            echo json_encode($data ? $data : (object)[]);
            exit;

        case 'save_settings':
            $settingsFile = getSettingsFilePath();
            $settingsJson = $_POST['settings'] ?? '{}';
            
            // Basic validation to ensure we're saving a valid JSON object
            $decoded = json_decode($settingsJson, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                throw new Exception('Invalid settings format provided.');
            }

            if (writeSecurePhpJson($settingsFile, $decoded) !== false) {
                $response = ['status' => 'success', 'message' => 'Settings saved successfully.'];
            } else {
                throw new Exception('Failed to save settings. Check file permissions.');
            }
            break;

        default:
            throw new Exception('Unknown or invalid action specified.');
    }
} catch (Throwable $e) {
    $response = ['status' => 'error', 'message' => $e->getMessage()];
    http_response_code(400); // Bad Request
    if (defined('DEBUG') && DEBUG) {
        $response['details'] = "File: {$e->getFile()}, Line: {$e->getLine()}";
    }
}

$json = json_encode($response, JSON_INVALID_UTF8_SUBSTITUTE);
if ($json === false) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to encode response as JSON: ' . json_last_error_msg()]);
} else {
    echo $json;
}