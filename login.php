<?php
require_once 'bootstrap.php';

// If already logged in, redirect to the IDE
if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
    header('Location: ' . APP_URL . '/index.php');
    exit;
}

$login_error = $_SESSION['login_error'] ?? null;
unset($_SESSION['login_error']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - GOGIES{IDE}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-grad: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            --bg-grad: radial-gradient(circle at top, #1e1b4b 0%, #0f172a 100%);
            --card-bg: rgba(15, 23, 42, 0.45);
            --card-border: rgba(255, 255, 255, 0.08);
            --input-bg: rgba(15, 23, 42, 0.6);
            --input-border: rgba(255, 255, 255, 0.15);
            --text-muted: #94a3b8;
        }

        body, html {
            height: 100%;
            margin: 0;
            font-family: 'Outfit', sans-serif;
            background: var(--bg-grad);
            color: #f1f5f9;
            overflow-x: hidden;
        }

        body {
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        /* Ambient background glow effects */
        body::before {
            content: '';
            position: absolute;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
            top: 10%;
            left: 15%;
            z-index: 0;
            pointer-events: none;
        }

        body::after {
            content: '';
            position: absolute;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%);
            bottom: 10%;
            right: 15%;
            z-index: 0;
            pointer-events: none;
        }

        .login-container {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 420px;
            padding: 2.5rem;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: 16px;
            border: 1px solid var(--card-border);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .login-container:hover {
            transform: translateY(-2px);
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
            border-color: rgba(255, 255, 255, 0.12);
        }

        .brand-header {
            margin-bottom: 2rem;
            text-align: center;
        }

        .brand-header h1 {
            font-weight: 700;
            font-size: 2rem;
            letter-spacing: -0.5px;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #ffffff 40%, #c7d2fe 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .brand-header h1 span {
            color: #818cf8;
            -webkit-text-fill-color: #818cf8;
        }

        .brand-header p {
            color: var(--text-muted);
            font-size: 0.95rem;
            font-weight: 400;
        }

        .form-floating {
            position: relative;
        }

        .form-floating .form-control {
            background-color: var(--input-bg);
            border: 1px solid var(--input-border);
            color: #fff;
            border-radius: 10px;
            padding: 1.1rem 1rem;
            font-weight: 400;
            transition: all 0.2s ease-in-out;
        }

        .form-floating .form-control:focus {
            background-color: rgba(15, 23, 42, 0.8);
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
            color: #fff;
        }

        .form-floating label {
            color: var(--text-muted);
            padding: 1.1rem 1rem;
            transition: all 0.2s ease-in-out;
        }

        .form-floating > .form-control:focus ~ label,
        .form-floating > .form-control:not(:placeholder-shown) ~ label {
            color: #818cf8;
            transform: scale(0.85) translateY(-0.75rem) translateX(0.15rem);
        }

        .btn-submit {
            background: var(--primary-grad);
            border: none;
            color: white;
            padding: 0.8rem;
            font-weight: 600;
            font-size: 1.05rem;
            border-radius: 10px;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .btn-submit:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
            background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
        }

        .btn-submit:active {
            transform: translateY(1px);
        }

        .alert-custom {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
            border-radius: 10px;
            padding: 0.75rem 1rem;
            font-size: 0.9rem;
            margin-bottom: 1.5rem;
        }

        footer {
            margin-top: 2.5rem;
            font-size: 0.85rem;
            color: var(--text-muted);
        }

        footer a {
            color: #818cf8;
            text-decoration: none;
            transition: color 0.2s ease;
        }

        footer a:hover {
            color: #a5b4fc;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="brand-header">
            <h1>GOGIES<span>{IDE}</span></h1>
            <p>Sign in to access your developer environment</p>
        </div>

        <form method="POST" action="<?php echo APP_URL; ?>/api.php">
            <input type="hidden" name="action" value="login">

            <?php if ($login_error): ?>
                <div class="alert alert-custom text-center" role="alert">
                    <?php echo htmlspecialchars($login_error); ?>
                </div>
            <?php endif; ?>

            <div class="form-floating mb-3">
                <input type="text" class="form-control" id="username" name="username" placeholder="Username" required autofocus>
                <label for="username">Username</label>
            </div>
            
            <div class="form-floating mb-4">
                <input type="password" class="form-control" id="password" name="password" placeholder="Password" required>
                <label for="password">Password</label>
            </div>

            <button class="w-100 btn-submit" type="submit">Sign In</button>
        </form>

        <footer class="text-center">
            <p>&copy; GOGIES{IDE} <?php echo date("Y"); ?> &middot; <a href="http://gogies.net" target="_blank">gogies.net</a></p>
        </footer>
    </div>
</body>
</html>