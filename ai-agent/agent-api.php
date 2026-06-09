<?php
/**
 * AI Agent Custom API Endpoint
 */

// Set working directory to project root so bootstrap can load config properly
chdir(dirname(__DIR__));
require_once 'bootstrap.php';
require_once 'ai-agent/agent-tools.php';

// Authentication Helper
function isAuthenticated() {
    return isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;
}

function requireAuth() {
    if (!isAuthenticated()) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
        exit;
    }
}

// Ensure user is authenticated
requireAuth();

// Release session lock early to allow concurrent HTTP requests while AI is processing
session_write_close();

header('Content-Type: application/json');

$action = $_REQUEST['action'] ?? null;

function ensureDataDir() {
    $dataPath = DATA_PATH;
    if (!is_dir($dataPath)) {
        if (!mkdir($dataPath, 0775, true)) {
            throw new Exception("Unable to create data directory.");
        }
    }
    return $dataPath;
}

function getAiSettingsFilePath() {
    return ensureDataDir() . '/ai_settings.php';
}

function getAiHistoryFilePath() {
    $dataPath = ensureDataDir();
    
    // Safely sanitize username and workspace name for filenames
    $username = preg_replace('/[^a-zA-Z0-9_-]/', '', $_SESSION['user'] ?? 'default');
    $workspace = preg_replace('/[^a-zA-Z0-9_-]/', '', $_SESSION['workspace_name'] ?? 'default');
    
    return $dataPath . "/ai_history_{$username}_{$workspace}.php";
}

function getWorkspaceTree($dir, $depth = 0, $maxDepth = 3) {
    if ($depth > $maxDepth) return "";
    $resolved = realpath($dir);
    if (!$resolved || !is_dir($resolved)) return "";
    
    $items = scandir($resolved);
    $tree = "";
    $indent = str_repeat("  ", $depth);
    
    // Sort directories first, then files
    usort($items, function($a, $b) use ($resolved) {
        $aDir = is_dir($resolved . '/' . $a);
        $bDir = is_dir($resolved . '/' . $b);
        if ($aDir && !$bDir) return -1;
        if (!$aDir && $bDir) return 1;
        return strcasecmp($a, $b);
    });
    
    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || $item === '.git' || $item === 'node_modules' || $item === 'vendor' || $item === 'data') {
            continue;
        }
        $fullPath = $resolved . '/' . $item;
        
        if (is_dir($fullPath)) {
            $tree .= $indent . "📁 " . $item . "/\n";
            $tree .= getWorkspaceTree($fullPath, $depth + 1, $maxDepth);
        } else {
            $tree .= $indent . "📄 " . $item . "\n";
        }
    }
    return $tree;
}

try {
    switch ($action) {
        case 'get_history':
            $historyFile = getAiHistoryFilePath();
            $oldHistoryFile = str_replace('.php', '.json', $historyFile);
            $historyData = null;
            if (file_exists($historyFile)) {
                $historyData = readSecurePhpJson($historyFile);
            } else if (file_exists($oldHistoryFile)) {
                $historyData = json_decode(file_get_contents($oldHistoryFile), true);
                if (is_array($historyData)) {
                    writeSecurePhpJson($historyFile, $historyData);
                    @unlink($oldHistoryFile);
                }
            }

            if (is_array($historyData)) {
                echo json_encode($historyData);
            } else {
                echo json_encode([
                    'sessions' => [],
                    'selected_model' => 'auto',
                    'selected_approval_mode' => 'ask'
                ]);
            }
            break;

        case 'save_history':
            $historyFile = getAiHistoryFilePath();
            $rawInput = file_get_contents('php://input');
            $decoded = json_decode($rawInput, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                throw new Exception('Invalid history payload provided.');
            }
            
            if (writeSecurePhpJson($historyFile, $decoded) !== false) {
                echo json_encode(['status' => 'success', 'message' => 'AI history saved successfully.']);
            } else {
                throw new Exception('Failed to save AI history. Check file permissions.');
            }
            break;

        case 'get_settings':
            $settingsFile = getAiSettingsFilePath();
            $oldSettingsFile = str_replace('.php', '.json', $settingsFile);
            $settingsData = null;
            if (file_exists($settingsFile)) {
                $settingsData = readSecurePhpJson($settingsFile);
            } else if (file_exists($oldSettingsFile)) {
                $settingsData = json_decode(file_get_contents($oldSettingsFile), true);
                if (is_array($settingsData) || is_object($settingsData)) {
                    writeSecurePhpJson($settingsFile, $settingsData);
                    @unlink($oldSettingsFile);
                }
            }

            if (is_array($settingsData) || is_object($settingsData)) {
                echo json_encode($settingsData);
            } else {
                echo '{}';
            }
            break;

        case 'save_settings':
            $settingsFile = getAiSettingsFilePath();
            // Get raw input stream for JSON POST requests
            $rawInput = file_get_contents('php://input');
            $settingsJson = $rawInput ? $rawInput : ($_POST['settings'] ?? '{}');
            
            $decoded = json_decode($settingsJson, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                throw new Exception('Invalid settings format provided.');
            }

            if (writeSecurePhpJson($settingsFile, $decoded) !== false) {
                echo json_encode(['status' => 'success', 'message' => 'AI settings saved successfully.']);
            } else {
                throw new Exception('Failed to save AI settings. Check file permissions.');
            }
            break;

        case 'execute_tool':
            $rawInput = file_get_contents('php://input');
            $payload = json_decode($rawInput, true);
            
            $tool = $payload['tool'] ?? '';
            $arguments = $payload['arguments'] ?? [];
            
            if (empty($tool)) {
                throw new Exception('Tool name is required.');
            }
            try {
                $result = AIAgentTools::executeTool($tool, $arguments);
                echo json_encode($result);
            } catch (Exception $e) {
                if ($tool === 'read_file' && strpos($e->getMessage(), 'File not found') !== false) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage(), 'content' => '']);
                } else {
                    throw $e;
                }
            }
            break;

        case 'chat':
            $rawInput = file_get_contents('php://input');
            $payload = json_decode($rawInput, true);
            
            $messages = $payload['messages'] ?? [];
            $modelId = $payload['model_id'] ?? 'auto';
            
            // 1. Load settings to find the selected model or default to first configured model
            $settingsFile = getAiSettingsFilePath();
            $oldSettingsFile = str_replace('.php', '.json', $settingsFile);
            $settings = [];
            if (file_exists($settingsFile)) {
                $settings = readSecurePhpJson($settingsFile) ?? [];
            } else if (file_exists($oldSettingsFile)) {
                $settings = json_decode(file_get_contents($oldSettingsFile), true) ?? [];
                writeSecurePhpJson($settingsFile, $settings);
                @unlink($oldSettingsFile);
            }
            
            // If settings is empty or not array, use premium preset templates as default
            if (!is_array($settings) || empty($settings)) {
                $settings = [
                    [ 'id' => 'tpl_local', 'name' => 'Local Ollama', 'provider' => 'local', 'model' => 'qwen2.5-coder:7b', 'url' => 'http://localhost:11434/v1', 'key' => '', 'thinking' => false ],
                    [ 'id' => 'tpl_openai', 'name' => 'OpenAI GPT-4o', 'provider' => 'openai', 'model' => 'gpt-4o', 'url' => 'https://api.openai.com/v1', 'key' => '', 'thinking' => false ]
                ];
            }
            
            // Find model configuration matching $modelId, or fallback to first one
            $selectedModel = null;
            if ($modelId !== 'auto') {
                foreach ($settings as $m) {
                    if (($m['id'] ?? '') === $modelId) {
                        $selectedModel = $m;
                        break;
                    }
                }
            }
            if (!$selectedModel) {
                $selectedModel = $settings[0];
            }
            
            if (!$selectedModel) {
                throw new Exception('No AI models are configured. Please set them up in AI Settings.');
            }
            
            // 2. Prepare payload and call the provider API using standard curl
            $provider = $selectedModel['provider'] ?? 'openai';
            $modelName = $selectedModel['model'] ?? 'gpt-4o';
            $baseUrl = $selectedModel['url'] ?? '';
            $apiKey = $selectedModel['key'] ?? '';
            $thinking = !empty($selectedModel['thinking']);
            // Get user's active loaded workspace path dynamically from session
            $workspacePath = $_SESSION['workspace_path'] ?? ROOT_PATH;
            
            // Build the workspace structure tree with cache to avoid disk performance bottlenecks
            $cacheFile = ensureDataDir() . '/workspace_tree_' . md5($workspacePath) . '.cache';
            if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 15)) {
                $workspaceTree = file_get_contents($cacheFile);
            } else {
                $workspaceTree = getWorkspaceTree($workspacePath);
                @file_put_contents($cacheFile, $workspaceTree);
            }
            
            // Inject agentic system prompt as system message
            $systemPrompt = "You are GOGIES AI Agent, an intelligent coding assistant. Developed By (Ahmad Helalat www.gogies.net). You are running inside the Gogies web-based IDE, a PHP-powered development environment. You should take ownership of complex tasks and decide if a task needs to be done in multiple steps. You should break down tasks into smaller manageable steps and execute them one by one. You must create production-ready, clean, and secure code, not draft code. You can execute shell commands, run PHP scripts, and modify/create files on behalf of the user within this environment.

Your responses are strictly constrained to the user's active workspace directory: " . realpath($workspacePath) . "



Here is the current directory structure of the workspace:
" . $workspaceTree . "

To perform actions, you MUST use standard XML tags for seamless agentic executions:

To create a new file or completely rewrite a file, write:
<write_file path=\"filename\">
exact file contents
</write_file>

To modify specific parts of an existing file (highly preferred over rewriting the entire file), write:
<patch_file path=\"filename\">
<search>
exact lines to replace
</search>
<replace>
new lines to put in place of the search block
</replace>
</patch_file>

To read the complete contents of an existing file, write:
<read_file path=\"relative_file_path\" />

To list all files and subdirectories within a directory, write:
<list_dir path=\"relative_directory_path\" />

To search for a plain text query across files in a directory, write:
<search_files query=\"search_term\" path=\"relative_directory_path\" />

To run a shell command, write:
<run_command>command</run_command>

To view git status (changed, added, untracked files), write:
<git_status />

To view the line differences of modified files via git diff, write:
<git_diff />

To perform a fast, regex-capable search for a text query across files in a directory, write:
<grep_search query=\"search_term\" path=\"relative_directory_path\" />

To read the structural outline (classes, methods, functions, selectors) of a file, write:
<get_code_outline path=\"relative_file_path\" />

To list all configured database connection profiles in the active workspace, write:
<list_db_profiles />

To execute SQL queries (both SELECT statements and database mutations) against a database connection profile, write:
<db_query profile_id=\"profile_id_from_list\" sql=\"sql_query_to_run\" />

Never output the full modified or created file content inside your conversational response text—only inside the <write_file> or <patch_file> tags.
Do not repeat or explain the XML tags themselves in your response.";

            // Load and append agent_rules.md if it exists in the active workspace root
            $rulesFile = rtrim($workspacePath, '/') . '/agent_rules.md';
            if (file_exists($rulesFile) && is_readable($rulesFile)) {
                $systemPrompt .= "\n\nAdditional Workspace Agent Rules (from agent_rules.md):\n" . file_get_contents($rulesFile) . "\n";
            }

            // Dynamically inject the active file path and content if provided by the frontend
            $activeFilePath = $payload['active_file_path'] ?? '';
            $activeFileContent = $payload['active_file_content'] ?? '';
            
            if (!empty($activeFilePath)) {
                $systemPrompt .= "\n\nThe user currently has `" . $activeFilePath . "` open in the editor.\n";
                $systemPrompt .= "Here is the complete content of the active file `" . $activeFilePath . "` currently displayed on their screen:\n";
                $systemPrompt .= "```\n" . $activeFileContent . "\n```\n";
            }
            
            // Reformat messages for standard LLM APIs
            $apiMessages = [];
            $apiMessages[] = [
                'role' => 'system',
                'content' => $systemPrompt
            ];
            
            $msgCount = count($messages);
            for ($i = 0; $i < $msgCount; $i++) {
                $content = $messages[$i]['content'];
                $apiMessages[] = [
                    'role' => ($messages[$i]['role'] === 'user') ? 'user' : 'assistant',
                    'content' => $content
                ];
            }
            
            // 3. Make HTTP request with SSE streaming enabled
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 90);
            
            // Set streaming headers for PHP client
            header('Content-Type: text/event-stream');
            header('Cache-Control: no-cache');
            header('Connection: keep-alive');
            header('X-Accel-Buffering: no');
            
            while (ob_get_level() > 0) {
                ob_end_flush();
            }
            ob_implicit_flush(true);

            if ($provider === 'openai' || $provider === 'local' || $provider === 'gemini') {
                if ($provider === 'gemini') {
                    $url = $baseUrl ? rtrim($baseUrl, '/') . '/chat/completions' : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
                } else {
                    $url = $baseUrl ? rtrim($baseUrl, '/') . '/chat/completions' : 'https://api.openai.com/v1/chat/completions';
                }
                
                $postData = [
                    'model' => $modelName,
                    'messages' => $apiMessages,
                    'stream' => true
                ];
                
                if ($thinking) {
                    if (strpos($modelName, 'o1') !== false || strpos($modelName, 'o3') !== false) {
                        $postData['reasoning_effort'] = 'medium';
                    }
                }
                
                $headers = [
                    'Content-Type: application/json'
                ];
                if (!empty($apiKey)) {
                    $headers[] = 'Authorization: Bearer ' . $apiKey;
                }
                
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
                curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
                
                $openAiBuffer = '';
                curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $chunk) use (&$openAiBuffer) {
                    $openAiBuffer .= $chunk;
                    $lines = explode("\n", $openAiBuffer);
                    $openAiBuffer = array_pop($lines);
                    
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (empty($line)) continue;
                        if (strpos($line, 'data: ') === 0) {
                            $jsonData = substr($line, 6);
                            if ($jsonData === '[DONE]') continue;
                            $decoded = json_decode($jsonData, true);
                            if ($decoded) {
                                $delta = $decoded['choices'][0]['delta'] ?? null;
                                if ($delta) {
                                    $content = $delta['content'] ?? '';
                                    $reasoning = $delta['reasoning_content'] ?? $delta['reasoning'] ?? $delta['thinking'] ?? '';
                                    echo json_encode([
                                        'content' => $content,
                                        'reasoning' => $reasoning
                                    ]) . "\n";
                                    flush();
                                }
                            }
                        }
                    }
                    return strlen($chunk);
                });
                
                $res = curl_exec($ch);
                if ($res === false) {
                    $err = curl_error($ch);
                    curl_close($ch);
                    throw new Exception('Connection failed: ' . $err);
                }
                curl_close($ch);
                exit;
            } 
            elseif ($provider === 'anthropic') {
                $url = $baseUrl ? rtrim($baseUrl, '/') . '/v1/messages' : 'https://api.anthropic.com/v1/messages';
                
                $anthropicMessages = [];
                $msgCount = count($messages);
                for ($i = 0; $i < $msgCount; $i++) {
                    if ($messages[$i]['role'] === 'system') continue;
                    $content = $messages[$i]['content'];
                    $anthropicMessages[] = [
                        'role' => ($messages[$i]['role'] === 'user') ? 'user' : 'assistant',
                        'content' => $content
                    ];
                }
                
                $postData = [
                    'model' => $modelName,
                    'messages' => $anthropicMessages,
                    'system' => $systemPrompt,
                    'max_tokens' => 4096,
                    'stream' => true
                ];
                
                $headers = [
                    'Content-Type: application/json',
                    'x-api-key: ' . $apiKey,
                    'anthropic-version: 2023-06-01'
                ];
                
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
                curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
                
                curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $chunk) {
                    $lines = explode("\n", $chunk);
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (empty($line)) continue;
                        if (strpos($line, 'data: ') === 0) {
                            $jsonData = substr($line, 6);
                            $decoded = json_decode($jsonData, true);
                            if ($decoded) {
                                $type = $decoded['type'] ?? '';
                                if ($type === 'content_block_delta') {
                                    $delta = $decoded['delta'] ?? null;
                                    if ($delta) {
                                        $content = '';
                                        $reasoning = '';
                                        if (($delta['type'] ?? '') === 'thinking_delta') {
                                            $reasoning = $delta['thinking'] ?? '';
                                        } elseif (($delta['type'] ?? '') === 'text_delta') {
                                            $content = $delta['text'] ?? '';
                                        }
                                        echo json_encode([
                                            'content' => $content,
                                            'reasoning' => $reasoning
                                        ]) . "\n";
                                        flush();
                                    }
                                }
                            }
                        }
                    }
                    return strlen($chunk);
                });
                
                $res = curl_exec($ch);
                if ($res === false) {
                    $err = curl_error($ch);
                    curl_close($ch);
                    throw new Exception('Connection failed: ' . $err);
                }
                curl_close($ch);
                exit;
            }
            break;

        default:
            throw new Exception('Unknown or invalid action specified.');
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
