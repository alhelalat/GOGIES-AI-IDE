<?php
/**
 * Gogies Database Explorer API Backend
 */

require_once dirname(__DIR__) . '/bootstrap.php';

// Secure Session Authentication
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
    exit;
}
header('Content-Type: application/json');

$action = $_REQUEST['action'] ?? null;
$connectionsFile = DATA_PATH . '/db_connections.php';
$reqWorkspace = $_REQUEST['workspace_name'] ?? '';
$workspaces = $_SESSION['accessible_workspaces'] ?? [];

if (!empty($reqWorkspace) && isset($workspaces[$reqWorkspace])) {
    $workspaceHash = md5($workspaces[$reqWorkspace]);
    $connectionsFile = DATA_PATH . "/db_connections_{$workspaceHash}.php";
} else if (isset($_SESSION['workspace_path'])) {
    $workspaceHash = md5($_SESSION['workspace_path']);
    $connectionsFile = DATA_PATH . "/db_connections_{$workspaceHash}.php";
}

// Helper to load profiles
function getConnectionsList($file) {
    if (!file_exists($file)) {
        // Fallback check for old .json file
        $oldFile = str_replace('.php', '.json', $file);
        if (file_exists($oldFile)) {
            $data = json_decode(file_get_contents($oldFile), true) ?? [];
            saveConnectionsList($file, $data);
            @unlink($oldFile);
            return $data;
        }
        return [];
    }
    return readSecurePhpJson($file) ?? [];
}

// Helper to save profiles
function saveConnectionsList($file, $list) {
    writeSecurePhpJson($file, $list);
}

// Helper to initialize PDO connection
function getDbConnection($config) {
    $type = $config['type'] ?? 'sqlite';
    if ($type === 'sqlite') {
        $path = $config['path'] ?? '';
        // Security check: Ensure SQLite file is strictly inside active workspace
        if (isset($_SESSION['workspace_path'])) {
            $basePath = realpath($_SESSION['workspace_path']);
            $realPath = realpath($path);
            if ($realPath === false) {
                // If it doesn't exist yet, check directory permissions
                $realParent = realpath(dirname($path));
                if ($realParent === false || strpos($realParent, $basePath) !== 0) {
                    throw new Exception('Security Access Denied: Path outside workspace.');
                }
            } else if (strpos($realPath, $basePath) !== 0) {
                throw new Exception('Security Access Denied: Path outside workspace.');
            }
        }
        return new PDO("sqlite:" . $path);
    } else if ($type === 'mysql') {
        $host = $config['host'] ?? '127.0.0.1';
        $port = $config['port'] ?? '3306';
        $dbName = $config['database'] ?? '';
        $user = $config['username'] ?? '';
        $pass = $config['password'] ?? '';
        
        $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ];
        return new PDO($dsn, $user, $pass, $options);
    } else if ($type === 'pgsql') {
        $host = $config['host'] ?? '127.0.0.1';
        $port = $config['port'] ?? '5432';
        $dbName = $config['database'] ?? '';
        $user = $config['username'] ?? '';
        $pass = $config['password'] ?? '';
        
        $dsn = "pgsql:host={$host};port={$port};dbname={$dbName}";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ];
        return new PDO($dsn, $user, $pass, $options);
    }
    throw new Exception("Unsupported database type: {$type}");
}

try {
    switch ($action) {
        case 'get_workspaces':
            $workspaces = $_SESSION['accessible_workspaces'] ?? [];
            echo json_encode(['status' => 'success', 'data' => array_keys($workspaces)]);
            break;

        case 'list_profiles':
            $profiles = getConnectionsList($connectionsFile);
            // Hide passwords before sending to client
            foreach ($profiles as &$p) {
                if (isset($p['password'])) $p['password'] = '******';
            }
            echo json_encode(['status' => 'success', 'data' => $profiles]);
            break;

        case 'save_profile':
            $id = $_POST['id'] ?? '';
            if (empty($id)) {
                $id = uniqid('db_', true);
            }
            $type = $_POST['type'] ?? 'sqlite';
            $name = $_POST['name'] ?? 'New Connection';
            
            $profiles = getConnectionsList($connectionsFile);
            
            $config = [
                'id' => $id,
                'type' => $type,
                'name' => $name,
                'path' => $_POST['path'] ?? '',
                'host' => $_POST['host'] ?? '127.0.0.1',
                'port' => $_POST['port'] ?? '3306',
                'database' => $_POST['database'] ?? '',
                'username' => $_POST['username'] ?? '',
            ];

            $workspaceName = $_POST['workspace_name'] ?? '';
            $workspaces = $_SESSION['accessible_workspaces'] ?? [];
            if (!empty($workspaceName) && isset($workspaces[$workspaceName])) {
                $config['workspace_name'] = $workspaceName;
            }

            if ($type === 'sqlite') {
                $filename = $_POST['filename'] ?? 'db.sqlite';
                if (!empty($workspaceName) && isset($workspaces[$workspaceName])) {
                    $config['filename'] = $filename;
                    $config['path'] = $workspaces[$workspaceName] . '/' . $filename;
                }
            }
            
            // Password protection
            $password = $_POST['password'] ?? '';
            if ($password === '******' && isset($profiles[$id])) {
                $config['password'] = $profiles[$id]['password'];
            } else {
                $config['password'] = $password;
            }
            
            $profiles[$id] = $config;
            saveConnectionsList($connectionsFile, $profiles);
            echo json_encode(['status' => 'success', 'message' => 'Connection profile saved successfully.']);
            break;

        case 'delete_profile':
            $id = $_POST['id'] ?? '';
            $profiles = getConnectionsList($connectionsFile);
            if (isset($profiles[$id])) {
                unset($profiles[$id]);
                saveConnectionsList($connectionsFile, $profiles);
            }
            echo json_encode(['status' => 'success', 'message' => 'Profile deleted.']);
            break;

        case 'get_schema':
            $id = $_GET['id'] ?? '';
            $profiles = getConnectionsList($connectionsFile);
            if (!isset($profiles[$id])) throw new Exception('Profile not found.');
            
            $pdo = getDbConnection($profiles[$id]);
            $type = $profiles[$id]['type'] ?? 'sqlite';
            $schema = [];
            
            if ($type === 'sqlite') {
                $tablesQuery = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
                $tables = $tablesQuery->fetchAll(PDO::FETCH_COLUMN);
                foreach ($tables as $table) {
                    $colsQuery = $pdo->query("PRAGMA table_info(`{$table}`)");
                    $cols = $colsQuery->fetchAll(PDO::FETCH_ASSOC);
                    $schema[$table] = array_map(function($c) {
                        return [
                            'name' => $c['name'],
                            'type' => $c['type'],
                            'pk' => (bool)$c['pk']
                        ];
                    }, $cols);
                }
            } else if ($type === 'mysql') {
                $dbName = $profiles[$id]['database'];
                $tablesQuery = $pdo->query("SHOW TABLES");
                $tables = $tablesQuery->fetchAll(PDO::FETCH_COLUMN);
                foreach ($tables as $table) {
                    $colsQuery = $pdo->query("DESCRIBE `{$table}`");
                    $cols = $colsQuery->fetchAll(PDO::FETCH_ASSOC);
                    $schema[$table] = array_map(function($c) {
                        return [
                            'name' => $c['Field'],
                            'type' => $c['Type'],
                            'pk' => $c['Key'] === 'PRI'
                        ];
                    }, $cols);
                }
            } else if ($type === 'pgsql') {
                $tablesQuery = $pdo->query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
                $tables = $tablesQuery->fetchAll(PDO::FETCH_COLUMN);
                foreach ($tables as $table) {
                    $colsQuery = $pdo->prepare("
                        SELECT 
                            c.column_name as name, 
                            c.data_type as type,
                            CASE WHEN c.column_name IN (
                                SELECT kcu.column_name
                                FROM information_schema.table_constraints tc
                                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                                WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = :table AND tc.table_schema = 'public'
                            ) THEN 1 ELSE 0 END as pk
                        FROM information_schema.columns c
                        WHERE c.table_name = :table AND c.table_schema = 'public'
                        ORDER BY c.ordinal_position
                    ");
                    $colsQuery->execute(['table' => $table]);
                    $cols = $colsQuery->fetchAll(PDO::FETCH_ASSOC);
                    $schema[$table] = array_map(function($c) {
                        return [
                            'name' => $c['name'],
                            'type' => $c['type'],
                            'pk' => (bool)$c['pk']
                        ];
                    }, $cols);
                }
            }
            echo json_encode(['status' => 'success', 'data' => $schema, 'meta' => ['type' => $type]]);
            break;

        case 'get_indexes':
            $id = $_GET['id'] ?? '';
            $table = $_GET['table'] ?? '';
            if (empty($table)) throw new Exception('Table name is required.');
            
            $profiles = getConnectionsList($connectionsFile);
            if (!isset($profiles[$id])) throw new Exception('Profile not found.');
            
            $pdo = getDbConnection($profiles[$id]);
            $type = $profiles[$id]['type'] ?? 'sqlite';
            $result = [];
            
            if ($type === 'sqlite') {
                $indexesQuery = $pdo->query("PRAGMA index_list(`{$table}`)");
                $indexes = $indexesQuery->fetchAll(PDO::FETCH_ASSOC);
                foreach ($indexes as $idx) {
                    $infoQuery = $pdo->query("PRAGMA index_info(`{$idx['name']}`)");
                    $info = $infoQuery->fetchAll(PDO::FETCH_ASSOC);
                    $cols = array_map(function($col) { return $col['name']; }, $info);
                    
                    $idxType = 'INDEX';
                    if ($idx['unique']) {
                        $idxType = 'UNIQUE';
                    }
                    if ($idx['origin'] === 'pk') {
                        $idxType = 'PRIMARY';
                    }
                    
                    $result[] = [
                        'name' => $idx['name'],
                        'type' => $idxType,
                        'columns' => implode(', ', $cols)
                    ];
                }
            } else if ($type === 'mysql') {
                $indexesQuery = $pdo->query("SHOW INDEX FROM `{$table}`");
                $indexes = $indexesQuery->fetchAll(PDO::FETCH_ASSOC);
                $temp = [];
                foreach ($indexes as $idx) {
                    $name = $idx['Key_name'];
                    if (!isset($temp[$name])) {
                        $idxType = 'INDEX';
                        if ($name === 'PRIMARY') {
                            $idxType = 'PRIMARY';
                        } else if ($idx['Non_unique'] == 0) {
                            $idxType = 'UNIQUE';
                        }
                        $temp[$name] = [
                            'name' => $name,
                            'type' => $idxType,
                            'columns' => []
                        ];
                    }
                    $temp[$name]['columns'][] = $idx['Column_name'];
                }
                foreach ($temp as $idx) {
                    $idx['columns'] = implode(', ', $idx['columns']);
                    $result[] = $idx;
                }
            } else if ($type === 'pgsql') {
                $indexesQuery = $pdo->prepare("
                    SELECT
                        i.relname AS index_name,
                        ix.indisunique AS is_unique,
                        ix.indisprimary AS is_primary,
                        pg_get_indexdef(ix.indexrelid) AS index_def
                    FROM
                        pg_index ix
                    JOIN
                        pg_class t ON t.oid = ix.indrelid
                    JOIN
                        pg_class i ON i.oid = ix.indexrelid
                    WHERE
                        t.relname = :table
                ");
                $indexesQuery->execute(['table' => $table]);
                $indexes = $indexesQuery->fetchAll(PDO::FETCH_ASSOC);
                foreach ($indexes as $idx) {
                    $def = $idx['index_def'];
                    $cols = '';
                    if (preg_match('/\((.+)\)$/', $def, $matches)) {
                        $cols = $matches[1];
                    }
                    
                    $idxType = 'INDEX';
                    if ($idx['is_primary']) {
                        $idxType = 'PRIMARY';
                    } else if ($idx['is_unique']) {
                        $idxType = 'UNIQUE';
                    }
                    
                    $result[] = [
                        'name' => $idx['index_name'],
                        'type' => $idxType,
                        'columns' => $cols
                    ];
                }
            }
            echo json_encode(['status' => 'success', 'data' => $result]);
            break;

        case 'execute':
            $id = $_POST['id'] ?? '';
            $query = $_POST['query'] ?? '';
            if (empty($query)) throw new Exception('Query cannot be empty.');
            
            $profiles = getConnectionsList($connectionsFile);
            if (!isset($profiles[$id])) throw new Exception('Profile not found.');
            
            $pdo = getDbConnection($profiles[$id]);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            $startTime = microtime(true);
            
            // Basic sanitization/check for select vs non-select
            $isSelect = preg_match('/^\s*(select|show|describe|explain|pragma)\b/i', $query);
            
            $stmt = $pdo->prepare($query);
            $stmt->execute();
            
            $duration = round((microtime(true) - $startTime) * 1000, 2); // In ms
            
            if ($isSelect) {
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $columns = [];
                if (count($rows) > 0) {
                    $columns = array_keys($rows[0]);
                }
                echo json_encode([
                    'status' => 'success',
                    'data' => [
                        'type' => 'select',
                        'columns' => $columns,
                        'rows' => $rows,
                        'affected' => count($rows),
                        'duration' => $duration
                    ]
                ]);
            } else {
                $affected = $stmt->rowCount();
                echo json_encode([
                    'status' => 'success',
                    'data' => [
                        'type' => 'mutation',
                        'affected' => $affected,
                        'duration' => $duration
                    ]
                ]);
            }
            break;
            
        default:
            throw new Exception('Unknown DB Explorer action.');
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
