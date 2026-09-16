<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$pdo = getDatabaseConnection();

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM categories ORDER BY code ASC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'POST':
        $input = json_decode(file_get_contents("php://input"), true);
        $code = trim($input['code'] ?? '');
        $name = trim($input['name'] ?? '');
        $oldCode = $input['old_code'] ?? null;

        if (empty($code) || empty($name)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Kode dan Nama wajib diisi']);
            exit;
        }

        try {
            if ($oldCode) {
                // --- UPDATE ---
                $stmt = $pdo->prepare("UPDATE categories SET code = ?, name = ? WHERE code = ?");
                $stmt->execute([$code, $name, $oldCode]);

                echo json_encode(['success' => true, 'message' => 'Kategori berhasil diupdate']);
            } else {
                // --- INSERT ---
                // cek duplikat
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM categories WHERE code = ?");
                $stmt->execute([$code]);
                if ($stmt->fetchColumn() > 0) {
                    echo json_encode(['success' => false, 'message' => 'Kode kategori sudah ada']);
                    exit;
                }

                $stmt = $pdo->prepare("INSERT INTO categories (code, name) VALUES (?, ?)");
                $stmt->execute([$code, $name]);

                echo json_encode(['success' => true, 'message' => 'Kategori berhasil ditambahkan']);
            }
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    case 'DELETE':
        if (empty($_GET['code'])) {
            echo json_encode(['success' => false, 'message' => 'Kode kategori wajib diisi']);
            exit;
        }

        $stmt = $pdo->prepare("DELETE FROM categories WHERE code = ?");
        $stmt->execute([$_GET['code']]);
        echo json_encode(['success' => true, 'message' => 'Kategori berhasil dihapus']);
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}
