<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/authMiddleware.php';

// Check authentication for POST/DELETE operations
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'])) {
    checkAuth();
}

$pdo = getDatabaseConnection();

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            // Get all settings
            if (isset($_GET['key'])) {
                // Get specific setting
                $stmt = $pdo->prepare("SELECT * FROM settings WHERE setting_key = ?");
                $stmt->execute([$_GET['key']]);
                $setting = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($setting) {
                    echo json_encode(['success' => true, 'data' => $setting]);
                } else {
                    echo json_encode(['success' => false, 'message' => 'Setting tidak ditemukan']);
                }
            } else {
                // Get all settings
                $stmt = $pdo->query("SELECT * FROM settings ORDER BY setting_key ASC");
                $settings = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Convert to key-value pairs for easier use
                $settingsData = [];
                foreach ($settings as $setting) {
                    $settingsData[$setting['setting_key']] = $setting['setting_value'];
                }

                echo json_encode(['success' => true, 'data' => $settingsData]);
            }
            break;

        case 'POST':
            // Update or create settings
            $input = json_decode(file_get_contents('php://input'), true);

            if (!$input || !isset($input['settings'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Data settings diperlukan']);
                exit;
            }

            $pdo->beginTransaction();
            try {
                foreach ($input['settings'] as $key => $value) {
                    // Check if setting exists
                    $stmt = $pdo->prepare("SELECT id FROM settings WHERE setting_key = ?");
                    $stmt->execute([$key]);
                    $existing = $stmt->fetch();

                    if ($existing) {
                        // Update existing setting
                        $stmt = $pdo->prepare("UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?");
                        $stmt->execute([$value, $key]);
                    } else {
                        // Create new setting
                        $stmt = $pdo->prepare("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)");
                        $stmt->execute([$key, $value]);
                    }
                }

                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Settings berhasil disimpan']);
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }
            break;

        case 'DELETE':
            if (empty($_GET['key'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Setting key diperlukan']);
                exit;
            }

            $stmt = $pdo->prepare("DELETE FROM settings WHERE setting_key = ?");
            $stmt->execute([$_GET['key']]);

            if ($stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'Setting berhasil dihapus']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Setting tidak ditemukan']);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method tidak diizinkan']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
?>