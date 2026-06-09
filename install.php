<?php
// Simple Installer for the IDE
if (file_exists('config.php')) {
    header('Location: index.php');
    exit;
}
// --- Installation Process ---

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // --- 1. Get data from form ---
    $root_path = $_POST['root_path'];
    $data_path = $_POST['data_path'];
    $app_url = $_POST['app_url'];
    $username = $_POST['username'];
    $password = $_POST['password'];
    $workspace_name = $_POST['workspace_name'];
    $workspace_path = $_POST['workspace_path'];

    // --- 2. Create config.php ---
    $config_content = "<?php\n";
    $config_content .= "define('ROOT_PATH', '$root_path');\n";
    $config_content .= "define('DATA_PATH', '$data_path');\n";
    $config_content .= "define('APP_URL', '$app_url');\n";
    $config_content .= "define('DEBUG', true);\n";

    if (file_put_contents('config.php', $config_content) === false) {
        die("Failed to write to file: config.php");
    }

    // --- 3. Create data directories ---
    if (!is_dir($data_path)) {
        mkdir($data_path, 0755, true);
    }
    file_put_contents($data_path . '/.htaccess', "Deny from all");

    if (!is_dir($data_path . '/users')) {
        mkdir($data_path . '/users', 0755, true);
    }
    file_put_contents($data_path . '/users/.htaccess', "Deny from all");

    if (!is_dir($workspace_path)) {
        mkdir($workspace_path, 0755, true);
    }


    // --- 4. Create the first user ---
    $users_content = "<?php\n";
    $users_content .= "return [
";
    $users_content .= "    '$username' => [
";
    $users_content .= "        'password' => '" . password_hash($password, PASSWORD_DEFAULT) . "',\n";
    $users_content .= "        'permissions' => [
";
    $users_content .= "            '*'\n";
    $users_content .= "        ]
";
    $users_content .= "    ]
";
    $users_content .= "];\n";

    if (file_put_contents($data_path . '/users/users.php', $users_content) === false) {
        die("Failed to write to file: " . $data_path . "/users/users.php");
    }

    // --- 5. Create the first workspace ---
    $workspaces_data = [
        $workspace_name => $workspace_path
    ];
    $workspace_content = "<?php http_response_code(403); exit; ?>\n" . json_encode($workspaces_data, JSON_PRETTY_PRINT);

    if (file_put_contents($data_path . '/workspaces.php', $workspace_content) === false) {
        die("Failed to write to file: " . $data_path . "/workspaces.php");
    }


    // --- 6. Redirect to the IDE ---
    header('Location: index.php');
    exit;
}

?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GOGIES{IDE} - Installer</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-grad: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            --bg-grad: radial-gradient(circle at top, #1e1b4b 0%, #0f172a 100%);
            --card-bg: rgba(15, 23, 42, 0.45);
            --card-border: rgba(255, 255, 255, 0.08);
            --input-bg: rgba(15, 23, 42, 0.6);
            --input-border: rgba(255, 255, 255, 0.12);
            --text-muted: #94a3b8;
            --accent-glow: rgba(99, 102, 241, 0.25);
        }

        body, html {
            min-height: 100vh;
            margin: 0;
            font-family: 'Outfit', sans-serif;
            background: var(--bg-grad);
            color: #f1f5f9;
            overflow-x: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem 0;
            position: relative;
        }

        /* Ambient background glow effects */
        body::before {
            content: '';
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
            top: 5%;
            left: 10%;
            z-index: 0;
            pointer-events: none;
        }

        body::after {
            content: '';
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%);
            bottom: 5%;
            right: 10%;
            z-index: 0;
            pointer-events: none;
        }

        .install-container {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 650px;
            padding: 3rem;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: 20px;
            border: 1px solid var(--card-border);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
        }

        .install-container:hover {
            border-color: rgba(255, 255, 255, 0.15);
            box-shadow: 0 30px 60px -10px rgba(0, 0, 0, 0.6);
        }

        .brand-header {
            text-align: center;
            margin-bottom: 2.5rem;
        }

        .brand-header h1 {
            font-weight: 700;
            font-size: 2.25rem;
            letter-spacing: -0.5px;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #ffffff 40%, #c7d2fe 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .brand-header h1 span {
            color: #818cf8;
            -webkit-text-fill-color: initial;
        }

        .brand-header p {
            color: var(--text-muted);
            font-size: 0.95rem;
        }

        .section-header {
            font-size: 1.05rem;
            font-weight: 600;
            color: #c7d2fe;
            margin-bottom: 1.25rem;
            display: flex;
            align-items: center;
            gap: 0.6rem;
            letter-spacing: 0.2px;
        }

        .section-header i {
            color: #818cf8;
            font-size: 1.2rem;
        }

        .form-label {
            font-weight: 500;
            font-size: 0.88rem;
            color: #e2e8f0;
            margin-bottom: 0.5rem;
        }

        .form-control {
            background-color: var(--input-bg);
            border: 1px solid var(--input-border);
            color: #f8fafc;
            border-radius: 10px;
            padding: 0.7rem 1rem;
            font-size: 0.92rem;
            transition: all 0.2s ease-in-out;
        }

        .form-control:focus {
            background-color: rgba(15, 23, 42, 0.8);
            border-color: #818cf8;
            box-shadow: 0 0 0 3px var(--accent-glow);
            color: #fff;
        }

        .form-control::placeholder {
            color: #475569;
        }

        .section-divider {
            border: 0;
            height: 1px;
            background: linear-gradient(to right, rgba(99, 102, 241, 0), rgba(99, 102, 241, 0.35), rgba(99, 102, 241, 0));
            margin: 2rem 0;
        }

        .btn-install {
            background: var(--primary-grad);
            border: none;
            border-radius: 10px;
            padding: 0.85rem;
            font-weight: 600;
            font-size: 1rem;
            color: #fff;
            width: 100%;
            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3);
            transition: all 0.25s ease;
            margin-top: 1rem;
        }

        .btn-install:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 25px rgba(79, 70, 229, 0.45);
        }

        .btn-install:active {
            transform: translateY(1px);
        }
    </style>
</head>
<body>
    <div class="install-container">
        <div class="brand-header">
            <h1>GOGIES<span>{IDE}</span></h1>
            <p>Complete the parameters below to set up your premium workspace</p>
        </div>

        <form action="install.php" method="post">
            <!-- Section 1: Environment -->
            <div class="section-header">
                <i class="bi bi-sliders"></i> Environment Configurations
            </div>
            <div class="mb-3">
                <label for="root_path" class="form-label">Root Path</label>
                <input type="text" name="root_path" id="root_path" class="form-control" value="<?php echo __DIR__; ?>" required>
            </div>
            <div class="row">
                <div class="col-md-6 mb-3">
                    <label for="data_path" class="form-label">Data Path</label>
                    <input type="text" name="data_path" id="data_path" class="form-control" value="<?php echo __DIR__ . '/data'; ?>" required>
                </div>
                <div class="col-md-6 mb-3">
                    <label for="app_url" class="form-label">Application URL</label>
                    <input type="text" name="app_url" id="app_url" class="form-control" placeholder="e.g. http://localhost/ide" required>
                </div>
            </div>

            <div class="section-divider"></div>

            <!-- Section 2: Admin User -->
            <div class="section-header">
                <i class="bi bi-person-badge"></i> Admin User Credentials
            </div>
            <div class="row">
                <div class="col-md-6 mb-3">
                    <label for="username" class="form-label">Admin Username</label>
                    <input type="text" name="username" id="username" class="form-control" placeholder="Username" required>
                </div>
                <div class="col-md-6 mb-3">
                    <label for="password" class="form-label">Admin Password</label>
                    <input type="password" name="password" id="password" class="form-control" placeholder="Password" required>
                </div>
            </div>

            <div class="section-divider"></div>

            <!-- Section 3: First Workspace -->
            <div class="section-header">
                <i class="bi bi-folder2-open"></i> First Workspace Details
            </div>
            <div class="row">
                <div class="col-md-4 mb-3">
                    <label for="workspace_name" class="form-label">Workspace Name</label>
                    <input type="text" name="workspace_name" id="workspace_name" class="form-control" placeholder="e.g. Project" required>
                </div>
                <div class="col-md-8 mb-3">
                    <label for="workspace_path" class="form-label">Workspace Path</label>
                    <input type="text" name="workspace_path" id="workspace_path" class="form-control" value="<?php echo __DIR__ . '/data/workspaces/my-workspace'; ?>" required>
                </div>
            </div>

            <button type="submit" class="btn btn-install mt-4">Initialize Setup & Install</button>
        </form>
    </div>
</body>
</html>