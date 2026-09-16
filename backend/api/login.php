<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/authMiddleware.php';

$pdo = getDatabaseConnection();

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method tidak diizinkan']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
        exit;
    }

    if (empty($input['username']) || empty($input['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username dan password wajib diisi']);
        exit;
    }

    $username = trim($input['username']);
    $password = trim($input['password']);

    // Cari user berdasarkan username
    $stmt = $pdo->prepare("SELECT id, username, password, role FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Username atau password salah']);
        exit;
    }

    $passwordValid = password_verify($password, $user['password']);
    $legacyPassword = !$passwordValid && hash_equals((string) $user['password'], $password);

    if (!$passwordValid && !$legacyPassword) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Username atau password salah']);
        exit;
    }

    // Upgrade old plaintext records after a successful login.
    if ($legacyPassword) {
        $rehashStmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $rehashStmt->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }


    // Generate JWT token using authMiddleware
    $token = generateJWT($user);

    // Update last login (opsional)
    $pdo->prepare("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        ->execute([$user['id']]);

    // Response sukses
    echo json_encode([
        'success' => true,
        'message' => 'Login berhasil',
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'role' => $user['role']
        ],
        'role' => $user['role'] // untuk backward compatibility
    ]);

} catch (Exception $e) {
    error_log("Login API error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Terjadi kesalahan server',
        'error' => $e->getMessage()
    ]);
}