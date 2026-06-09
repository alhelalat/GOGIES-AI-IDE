<?php
/**
 * Set higher resource limits for the IDE.
 * These values can be adjusted as needed.
 * Note: 'M' stands for Megabytes. '300' is in seconds.
 */
ini_set('memory_limit', '256M');
ini_set('upload_max_filesize', '100M');
ini_set('post_max_size', '128M');
ini_set('max_execution_time', '300'); // 5 minutes


session_start();

/**
 * Application Bootstrap
 *
 * Initializes the environment, error reporting, and configuration.
 */

// Check if config.php exists
if (!file_exists(__DIR__ . '/config.php')) {
    header('Location: install.php');
    exit;
}
// Include the configuration file.
require_once __DIR__ . '/config.php';

// Include users
if (file_exists(DATA_PATH . '/users/users.php')) {
    $users = require_once DATA_PATH . '/users/users.php';
}

// Include shared data helper functions
require_once __DIR__ . '/data.php';

// Error Reporting
if (defined('DEBUG') && DEBUG === true) {
    // Show all errors in development mode.
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    // Hide all errors in production mode.
    error_reporting(0);
    ini_set('display_errors', 0);
}

// Log all errors to a file, regardless of the debug setting.
ini_set('log_errors', 1);
ini_set('error_log', ROOT_PATH . '/errors.log');

// --- Secure JSON-PHP Data Helpers ---
function writeSecurePhpJson($file, $data) {
    $content = "<?php http_response_code(403); exit; ?>\n" . json_encode($data, JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
    $result = file_put_contents($file, $content, LOCK_EX);
    if ($result !== false && function_exists('fixFilePermissions')) {
        fixFilePermissions($file);
    }
    return $result;
}

function readSecurePhpJson($file) {
    if (!file_exists($file)) return null;
    $content = file_get_contents($file);
    $marker = '?>';
    $pos = strpos($content, $marker);
    if ($pos !== false) {
        $content = substr($content, $pos + strlen($marker));
    }
    return json_decode(trim($content), true);
}