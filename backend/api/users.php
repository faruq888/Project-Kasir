<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$pdo = getDatabaseConnection();

// Fungsi untuk hash password (gunakan bcrypt)
function hashPassword($password) {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
}

// Fungsi untuk verify password
function verifyPassword($password, $hash) {
    return password_verify($password, $hash);
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            // Ambil semua users (tanpa password untuk keamanan)
            if (isset($_GET['id'])) {
                $stmt = $pdo->prepare("SELECT id, username, role, created_at FROM users WHERE id = ?");
                $stmt->execute([$_GET['id']]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($user) {
                    echo json_encode($user);
                } else {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'User not found']);
                }
            } else {
                $search = $_GET['search'] ?? '';
                $query = "SELECT id, username, role, created_at FROM users";
                $params = [];

                if ($search !== '') {
                    $query .= " WHERE username LIKE ? OR role LIKE ?";
                    $params = ["%$search%", "%$search%"];
                }

                $query .= " ORDER BY username ASC";
                $stmt = $pdo->prepare($query);
                $stmt->execute($params);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            }
            break;

        case 'POST':
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
            $role = $input['role'] ?? 'operator';

            // Validasi role
            if (!in_array($role, ['admin', 'operator'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Role tidak valid']);
                exit;
            }

            // Cek apakah username sudah ada
            $checkStmt = $pdo->prepare("SELECT username FROM users WHERE username = ?");
            $checkStmt->execute([$username]);

            if ($checkStmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Username sudah digunakan']);
                exit;
            }

            $passwordHash = hashPassword($password);
            $stmt = $pdo->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
            $success = $stmt->execute([$username, $passwordHash, $role]);

            if ($success) {
                $userId = $pdo->lastInsertId();
                echo json_encode([
                    'success' => true,
                    'id' => $userId,
                    'message' => 'User berhasil ditambahkan'
                ]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Gagal menambahkan user']);
            }
            break;

        case 'PUT':
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'User ID diperlukan']);
                exit;
            }

            $input = json_decode(file_get_contents('php://input'), true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
                exit;
            }

            $userId = $_GET['id'];
            $updates = [];
            $params = [];

            if (!empty($input['username'])) {
                // Cek duplikasi username (kecuali untuk user yang sedang diedit)
                $checkStmt = $pdo->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
                $checkStmt->execute([$input['username'], $userId]);

                if ($checkStmt->fetch()) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'message' => 'Username sudah digunakan']);
                    exit;
                }

                $updates[] = 'username = ?';
                $params[] = $input['username'];
            }

            if (!empty($input['password'])) {
                $updates[] = 'password = ?';
                $params[] = hashPassword($input['password']);
            }

            if (!empty($input['role'])) {
                if (!in_array($input['role'], ['admin', 'operator'])) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Role tidak valid']);
                    exit;
                }
                $updates[] = 'role = ?';
                $params[] = $input['role'];
            }

            if (empty($updates)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Tidak ada data yang diperbarui']);
                exit;
            }

            $params[] = $userId;
            $query = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
            $stmt = $pdo->prepare($query);
            $success = $stmt->execute($params);

            if ($success) {
                echo json_encode(['success' => true, 'message' => 'User berhasil diperbarui']);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Gagal memperbarui user']);
            }
            break;

        case 'DELETE':
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'User ID diperlukan']);
                exit;
            }

            $userId = $_GET['id'];

            // Cek apakah user yang akan dihapus ada
            $checkStmt = $pdo->prepare("SELECT username FROM users WHERE id = ?");
            $checkStmt->execute([$userId]);
            $user = $checkStmt->fetch();

            if (!$user) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'User tidak ditemukan']);
                exit;
            }

            // Cek apakah masih ada admin lain (jangan sampai semua admin terhapus)
            if ($user['role'] === 'admin') {
                $adminCountStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != ?");
                $adminCountStmt->execute([$userId]);
                $adminCount = $adminCountStmt->fetchColumn();

                if ($adminCount == 0) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Tidak bisa menghapus admin terakhir'
                    ]);
                    exit;
                }
            }

            $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
            $success = $stmt->execute([$userId]);

            if ($success && $stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'User berhasil dihapus']);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'User tidak ditemukan']);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method tidak diizinkan']);
    }

} catch (Exception $e) {
    error_log("Users API error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Terjadi kesalahan server',
        'error' => $e->getMessage()
    ]);
}