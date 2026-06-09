<?php
/**
 * AI Agent Tools Execution Layer
 */

class AIAgentTools {
    
    public static function executeTool($toolName, $arguments) {
        switch ($toolName) {
            case 'read_file':
                return self::readFile($arguments['path'] ?? '');
                
            case 'write_file':
                return self::writeFile($arguments['path'] ?? '', $arguments['content'] ?? '');
                
            case 'patch_file':
                return self::patchFile($arguments['path'] ?? '', $arguments['search'] ?? '', $arguments['replace'] ?? '');
                
                
            case 'list_dir':
                return self::listDir($arguments['path'] ?? '');
                
            case 'search_files':
                return self::searchFiles($arguments['query'] ?? '', $arguments['path'] ?? '');
                
            case 'run_command':
                return self::runCommand($arguments['command'] ?? '');
                
            case 'git_status':
                return self::gitStatus();
                
            case 'git_diff':
                return self::gitDiff();
                
            case 'grep_search':
                return self::grepSearch($arguments['query'] ?? '', $arguments['path'] ?? '');
                
            case 'get_code_outline':
                return self::getCodeOutline($arguments['path'] ?? '');
                
            case 'list_db_profiles':
                return self::listDbProfiles();
                
            case 'db_query':
                return self::dbQuery($arguments['profile_id'] ?? '', $arguments['sql'] ?? '');
                
            default:
                throw new Exception("Unknown tool: {$toolName}");
        }
    }
    
    private static function resolvePath($path) {
        $workspaceRoot = $_SESSION['workspace_path'] ?? ROOT_PATH;
        $realRoot = realpath($workspaceRoot);
        if (!$realRoot) {
            throw new Exception("Invalid authorized workspace directory configuration.");
        }
        
        if (empty($path)) {
            return $realRoot;
        }
        
        // Enforce absolute path reconstruction strictly inside workspaceRoot
        if (substr($path, 0, strlen($realRoot)) === $realRoot) {
            $fullPath = $path;
        } else {
            // Strip leading slashes to append cleanly
            $cleanPath = ltrim($path, '/');
            $fullPath = $realRoot . '/' . $cleanPath;
        }
        
        $realPath = realpath($fullPath);
        if ($realPath === false) {
            // Path might not exist yet (e.g. for write_file creating new files)
            // Resolve parent directory and ensure it resides within realRoot
            $parentDir = dirname($fullPath);
            $realParent = realpath($parentDir);
            if ($realParent === false || strpos($realParent, $realRoot) !== 0) {
                throw new Exception("Security violation: Authorized workspace traversal detected.");
            }
            // Prevent child name from using relative directory segments (e.g. ..)
            $base = basename($fullPath);
            if ($base === '.' || $base === '..' || strpos($path, '..') !== false) {
                throw new Exception("Security violation: Path contains invalid directory traversal segments.");
            }
            return str_replace('//', '/', $realParent . '/' . $base);
        }
        
        // Security check: ensure path remains within workspaceRoot to prevent directory traversal
        if (strpos($realPath, $realRoot) !== 0) {
            throw new Exception("Security violation: Authorized workspace traversal detected.");
        }
        return $realPath;
    }
    
    private static function readFile($path) {
        $resolved = self::resolvePath($path);
        if (!file_exists($resolved)) {
            throw new Exception("File not found: {$path}");
        }
        if (is_dir($resolved)) {
            throw new Exception("Specified path is a directory, not a file: {$path}");
        }
        
        // Safety limit: reject files larger than 10MB to prevent memory exhaustion
        $maxSize = 10 * 1024 * 1024; // 10 MB
        $fileSize = filesize($resolved);
        if ($fileSize > $maxSize) {
            throw new Exception("File too large for reading (" . round($fileSize / 1024 / 1024, 1) . " MB). File must be under 10 MB.");
        }
        
        $content = file_get_contents($resolved);
        return [
            'status' => 'success',
            'content' => $content
        ];
    }
    private static function fixFilePermissions($path) {
        $workspaceRoot = $_SESSION['workspace_path'] ?? ROOT_PATH;
        if (!file_exists($workspaceRoot) || !file_exists($path)) return;

        $owner = fileowner($workspaceRoot);
        $group = filegroup($workspaceRoot);

        $realRoot = realpath($workspaceRoot);
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
        self::applyPermissionsRecursive($realPath, $owner, $group);

        // Walk up parent directories up to $workspaceRoot and fix permissions of newly created parents
        $parent = dirname($path);
        $maxIterations = 50; // safety limit to prevent infinite loops
        $iterations = 0;
        while (empty($realPath) || ($realPath !== $realRoot)) {
            if ($iterations++ >= $maxIterations) break;
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

    private static function applyPermissionsRecursive($target, $owner, $group) {
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
                    self::applyPermissionsRecursive($target . '/' . $item, $owner, $group);
                }
            }
        } else {
            @chmod($target, 0664);
        }
    }
    
    private static function writeFile($path, $content) {
        $resolved = self::resolvePath($path);
        $exists = file_exists($resolved);
        $dir = dirname($resolved);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
            self::fixFilePermissions($dir);
        }
        if (file_put_contents($resolved, $content) !== false) {
            self::fixFilePermissions($resolved);
            return [
                'status' => 'success',
                'action' => $exists ? 'modified' : 'created',
                'message' => $exists ? "File modified successfully: {$path}" : "File created successfully: {$path}"
            ];
        } else {
            throw new Exception("Failed to write to file: {$path}");
        }
    }
    
    private static function patchFile($path, $search, $replace) {
        $resolved = self::resolvePath($path);
        if (!file_exists($resolved)) {
            throw new Exception("File not found: {$path}");
        }
        if (is_dir($resolved)) {
            throw new Exception("Specified path is a directory, not a file: {$path}");
        }
        
        $content = file_get_contents($resolved);
        if (strpos($content, $search) === false) {
            throw new Exception("Search block not found in file: {$path}");
        }
        
        $count = substr_count($content, $search);
        if ($count > 1) {
            throw new Exception("Search block is not unique inside the file; it matches {$count} times: {$path}");
        }
        
        $newContent = str_replace($search, $replace, $content);
        if (file_put_contents($resolved, $newContent) !== false) {
            self::fixFilePermissions($resolved);
            return [
                'status' => 'success',
                'action' => 'modified',
                'message' => "File patched successfully: {$path}"
            ];
        } else {
            throw new Exception("Failed to patch file: {$path}");
        }
    }
    
    private static function getConnectionsFile() {
        $connectionsFile = DATA_PATH . '/db_connections.php';
        if (isset($_SESSION['workspace_path'])) {
            $workspaceHash = md5($_SESSION['workspace_path']);
            $connectionsFile = DATA_PATH . "/db_connections_{$workspaceHash}.php";
        }
        return $connectionsFile;
    }

    private static function getDbConnection($config) {
        $type = $config['type'] ?? 'sqlite';
        if ($type === 'sqlite') {
            $path = $config['path'] ?? '';
            if (isset($_SESSION['workspace_path'])) {
                $basePath = realpath($_SESSION['workspace_path']);
                $realPath = realpath($path);
                if ($realPath === false) {
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

    private static function listDbProfiles() {
        $file = self::getConnectionsFile();
        if (!file_exists($file)) {
            return [
                'status' => 'success',
                'profiles' => []
            ];
        }
        $profiles = readSecurePhpJson($file) ?? [];
        $sanitized = [];
        foreach ($profiles as $id => $p) {
            $sanitized[] = [
                'id' => $id,
                'name' => $p['name'] ?? 'Unnamed',
                'type' => $p['type'] ?? 'sqlite',
                'database' => $p['database'] ?? ($p['filename'] ?? '')
            ];
        }
        return [
            'status' => 'success',
            'profiles' => $sanitized
        ];
    }

    private static function dbQuery($profileId, $sql) {
        if (empty($profileId)) {
            throw new Exception("Database profile ID is required.");
        }
        if (empty($sql)) {
            throw new Exception("SQL query is required.");
        }
        
        $file = self::getConnectionsFile();
        if (!file_exists($file)) {
            throw new Exception("No database profiles configured in this workspace.");
        }
        $profiles = readSecurePhpJson($file) ?? [];
        if (!isset($profiles[$profileId])) {
            throw new Exception("Database profile '{$profileId}' not found.");
        }
        
        $pdo = self::getDbConnection($profiles[$profileId]);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        $isSelect = preg_match('/^\s*(select|show|describe|explain|pragma)\b/i', $sql);
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        
        if ($isSelect) {
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $columns = [];
            if (count($rows) > 0) {
                $columns = array_keys($rows[0]);
            }
            return [
                'status' => 'success',
                'type' => 'select',
                'columns' => $columns,
                'rows' => $rows,
                'affected' => count($rows)
            ];
        } else {
            $affected = $stmt->rowCount();
            return [
                'status' => 'success',
                'type' => 'mutation',
                'affected' => $affected
            ];
        }
    }
    
    private static function listDir($path) {
        $resolved = self::resolvePath($path);
        if (!is_dir($resolved)) {
            throw new Exception("Directory not found: {$path}");
        }
        $items = scandir($resolved);
        $result = [];
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            $full = $resolved . '/' . $item;
            $result[] = [
                'name' => $item,
                'type' => is_dir($full) ? 'directory' : 'file',
                'size' => is_dir($full) ? 0 : filesize($full)
            ];
        }
        return [
            'status' => 'success',
            'items' => $result
        ];
    }
    
    private static function searchFiles($query, $path) {
        $resolved = self::resolvePath($path);
        $results = [];
        
        // Dynamic search iterator
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($resolved, RecursiveDirectoryIterator::SKIP_DOTS)
        );
        
        foreach ($iterator as $file) {
            if ($file->isDir()) continue;
            $filepath = $file->getPathname();
            
            // Skip git directories and large binary files
            if (strpos($filepath, '/.git/') !== false || strpos($filepath, '/node_modules/') !== false) {
                continue;
            }
            
            $content = @file_get_contents($filepath);
            if ($content !== false && strpos($content, $query) !== false) {
                $lines = explode("\n", $content);
                foreach ($lines as $idx => $line) {
                    if (strpos($line, $query) !== false) {
                        $results[] = [
                            'file' => str_replace(($_SESSION['workspace_path'] ?? ROOT_PATH) . '/', '', $filepath),
                            'line' => $idx + 1,
                            'content' => trim($line)
                        ];
                        if (count($results) >= 50) break 2;
                    }
                }
            }
        }
        return [
            'status' => 'success',
            'matches' => $results
        ];
    }
    
    private static function runCommand($command) {
        // Set higher execution limits
        set_time_limit(60);
        
        $descriptorspec = [
            0 => ["pipe", "r"], // stdin
            1 => ["pipe", "w"], // stdout
            2 => ["pipe", "w"]  // stderr
        ];
        
        // Execute command starting inside the user's active workspace
        $workspaceRoot = $_SESSION['workspace_path'] ?? ROOT_PATH;
        $process = proc_open($command, $descriptorspec, $pipes, $workspaceRoot);
        
        if (is_resource($process)) {
            fclose($pipes[0]); // close stdin
            
            $stdout = stream_get_contents($pipes[1]);
            fclose($pipes[1]);
            
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[2]);
            
            $exitCode = proc_close($process);
            
            // Ensure any files or folders created by the shell command have correct permissions
            self::fixFilePermissions($workspaceRoot);
            
            return [
                'status' => 'success',
                'exit_code' => $exitCode,
                'stdout' => $stdout,
                'stderr' => $stderr
            ];
        } else {
            throw new Exception("Unable to start process for command: {$command}");
        }
    }

    private static function gitStatus() {
        $workspaceRoot = $_SESSION['workspace_path'] ?? ROOT_PATH;
        $output = '';
        $exitCode = -1;
        
        $descriptorspec = [
            1 => ["pipe", "w"],
            2 => ["pipe", "w"]
        ];
        $process = proc_open("git status --porcelain", $descriptorspec, $pipes, $workspaceRoot);
        if (is_resource($process)) {
            $output = stream_get_contents($pipes[1]);
            fclose($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[2]);
            $exitCode = proc_close($process);
            if ($exitCode !== 0) {
                $output = "Git error: " . trim($stderr);
            }
        } else {
            throw new Exception("Unable to run git status");
        }
        
        return [
            'status' => 'success',
            'output' => $output
        ];
    }

    private static function gitDiff() {
        $workspaceRoot = $_SESSION['workspace_path'] ?? ROOT_PATH;
        $output = '';
        $exitCode = -1;
        
        $descriptorspec = [
            1 => ["pipe", "w"],
            2 => ["pipe", "w"]
        ];
        $process = proc_open("git diff", $descriptorspec, $pipes, $workspaceRoot);
        if (is_resource($process)) {
            $output = stream_get_contents($pipes[1]);
            fclose($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[2]);
            $exitCode = proc_close($process);
            if ($exitCode !== 0) {
                $output = "Git error: " . trim($stderr);
            }
        } else {
            throw new Exception("Unable to run git diff");
        }
        
        return [
            'status' => 'success',
            'output' => $output
        ];
    }

    private static function grepSearch($query, $path) {
        $resolved = self::resolvePath($path);
        $results = [];
        
        if (!is_dir($resolved)) {
            throw new Exception("Path is not a directory: {$path}");
        }
        
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($resolved, RecursiveDirectoryIterator::SKIP_DOTS)
        );
        
        $pattern = '/' . preg_quote($query, '/') . '/i';
        
        foreach ($iterator as $file) {
            if ($file->isDir()) continue;
            $filepath = $file->getPathname();
            
            if (strpos($filepath, '/.git/') !== false || strpos($filepath, '/node_modules/') !== false || strpos($filepath, '/vendor/') !== false) {
                continue;
            }
            
            $content = @file_get_contents($filepath);
            if ($content !== false && preg_match($pattern, $content)) {
                $lines = explode("\n", $content);
                foreach ($lines as $idx => $line) {
                    if (preg_match($pattern, $line)) {
                        $results[] = [
                            'file' => str_replace(($_SESSION['workspace_path'] ?? ROOT_PATH) . '/', '', $filepath),
                            'line' => $idx + 1,
                            'content' => trim($line)
                        ];
                        if (count($results) >= 100) break 2;
                    }
                }
            }
        }
        return [
            'status' => 'success',
            'matches' => $results
        ];
    }

    private static function getCodeOutline($path) {
        $resolved = self::resolvePath($path);
        if (!file_exists($resolved)) {
            throw new Exception("File not found: {$path}");
        }
        if (is_dir($resolved)) {
            throw new Exception("Path is a directory, outline requires a file: {$path}");
        }
        
        $content = file_get_contents($resolved);
        $extension = strtolower(pathinfo($resolved, PATHINFO_EXTENSION));
        $outline = [];
        
        if ($extension === 'php') {
            $lines = explode("\n", $content);
            foreach ($lines as $idx => $line) {
                $lineNum = $idx + 1;
                if (preg_match('/^\s*(class|interface|trait)\s+(\w+)/i', $line, $matches)) {
                    $outline[] = [
                        'type' => 'structure',
                        'name' => $matches[1] . ' ' . $matches[2],
                        'line' => $lineNum
                    ];
                }
                elseif (preg_match('/^\s*(public|protected|private)?\s*(static)?\s*function\s+(\w+)\s*\(/i', $line, $matches)) {
                    $visibility = !empty($matches[1]) ? $matches[1] : 'public';
                    $static = !empty($matches[2]) ? ' static' : '';
                    $outline[] = [
                        'type' => 'method',
                        'name' => $visibility . $static . ' function ' . $matches[3] . '()',
                        'line' => $lineNum
                    ];
                }
            }
        } elseif ($extension === 'js') {
            $lines = explode("\n", $content);
            foreach ($lines as $idx => $line) {
                $lineNum = $idx + 1;
                if (preg_match('/^\s*class\s+(\w+)/', $line, $matches)) {
                    $outline[] = [
                        'type' => 'structure',
                        'name' => 'class ' . $matches[1],
                        'line' => $lineNum
                    ];
                }
                elseif (preg_match('/^\s*(async\s+)?function\s+(\w+)\s*\(/', $line, $matches)) {
                    $prefix = !empty($matches[1]) ? 'async ' : '';
                    $outline[] = [
                        'type' => 'method',
                        'name' => $prefix . 'function ' . $matches[2] . '()',
                        'line' => $lineNum
                    ];
                }
                elseif (preg_match('/^\s*(const|let|var)\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*=>/', $line, $matches)) {
                    $outline[] = [
                        'type' => 'method',
                        'name' => 'const ' . $matches[2] . ' = () => {}',
                        'line' => $lineNum
                    ];
                }
                elseif (preg_match('/^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*\{/', $line, $matches)) {
                    $name = $matches[2];
                    if (!in_array($name, ['if', 'for', 'while', 'switch', 'catch'])) {
                        $prefix = !empty($matches[1]) ? 'async ' : '';
                        $outline[] = [
                            'type' => 'method',
                            'name' => $prefix . $name . '()',
                            'line' => $lineNum
                        ];
                    }
                }
            }
        } elseif ($extension === 'css' || $extension === 'scss' || $extension === 'less') {
            $lines = explode("\n", $content);
            foreach ($lines as $idx => $line) {
                $lineNum = $idx + 1;
                if (preg_match('/^([^{]+)\{/', $line, $matches)) {
                    $selector = trim($matches[1]);
                    if (!empty($selector) && strpos($selector, '@') === false) {
                        $outline[] = [
                            'type' => 'css_rule',
                            'name' => $selector,
                            'line' => $lineNum
                        ];
                    }
                }
            }
        } elseif ($extension === 'py') {
            $lines = explode("\n", $content);
            foreach ($lines as $idx => $line) {
                $lineNum = $idx + 1;
                // Class definitions
                if (preg_match('/^\s*class\s+(\w+)\s*(?:\(|:)/', $line, $matches)) {
                    $outline[] = [
                        'type' => 'structure',
                        'name' => 'class ' . $matches[1],
                        'line' => $lineNum
                    ];
                }
                // Function definitions (including async)
                elseif (preg_match('/^\s*(async\s+)?def\s+(\w+)\s*\(/', $line, $matches)) {
                    $prefix = !empty($matches[1]) ? 'async ' : '';
                    $outline[] = [
                        'type' => 'method',
                        'name' => $prefix . 'def ' . $matches[2] . '()',
                        'line' => $lineNum
                    ];
                }
            }
        } elseif ($extension === 'html' || $extension === 'htm') {
            $lines = explode("\n", $content);
            foreach ($lines as $idx => $line) {
                $lineNum = $idx + 1;
                // IDs and Classes used as id="" or class=""
                if (preg_match('/<(\w+)[^>]*id=["\']([^"\']+)["\']/', $line, $matches)) {
                    $outline[] = [
                        'type' => 'html_element',
                        'name' => "#{$matches[2]} ({$matches[1]})",
                        'line' => $lineNum
                    ];
                }
            }
        } elseif ($extension === 'sql') {
            $lines = explode("\n", $content);
            foreach ($lines as $idx => $line) {
                $lineNum = $idx + 1;
                if (preg_match('/^\s*(?:CREATE|ALTER|DROP)\s+(?:TABLE|VIEW|INDEX|PROCEDURE|FUNCTION|TRIGGER)\s+(\w+)/i', $line, $matches)) {
                    $outline[] = [
                        'type' => 'sql_statement',
                        'name' => strtoupper($matches[1]) . ' ' . $matches[2],
                        'line' => $lineNum
                    ];
                }
            }
        } elseif ($extension === 'yaml' || $extension === 'yml') {
            $lines = explode("\n", $content);
            $currentKey = '';
            foreach ($lines as $idx => $line) {
                $lineNum = $idx + 1;
                if (preg_match('/^(\s*)(\w[\w\-]*):/', $line, $matches)) {
                    $indent = strlen($matches[1]);
                    $key = $matches[2];
                    if ($indent === 0) {
                        $currentKey = $key;
                        $outline[] = [
                            'type' => 'yaml_key',
                            'name' => $key,
                            'line' => $lineNum
                        ];
                    }
                }
            }
        }
        
        return [
            'status' => 'success',
            'outline' => $outline
        ];
    }
}
