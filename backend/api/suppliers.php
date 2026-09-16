<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$pdo = getDatabaseConnection();

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            if (!empty($_GET['id'])) {
                // Get single supplier with total hutang
                $stmt = $pdo->prepare("
                    SELECT s.*, 
                           COALESCE(SUM(CASE WHEN p.payment_status != 'Lunas' THEN p.remaining_amount ELSE 0 END), 0) as total_hutang
                    FROM suppliers s
                    LEFT JOIN purchases p ON s.id = p.supplier_id
                    WHERE s.id = ?
                    GROUP BY s.id
                ");
                $stmt->execute([$_GET['id']]);
                $supplier = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($supplier) {
                    echo json_encode($supplier);
                } else {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Supplier not found']);
                }
            } else {
                // Get all suppliers with total hutang
                $search = $_GET['search'] ?? '';
                $params = [];
                $query = "
                    SELECT s.*, 
                           COALESCE(SUM(CASE WHEN p.payment_status != 'Lunas' THEN p.remaining_amount ELSE 0 END), 0) as total_hutang
                    FROM suppliers s
                    LEFT JOIN purchases p ON s.id = p.supplier_id
                ";

                if ($search !== '') {
                    $query .= " WHERE s.name LIKE ? OR s.contact LIKE ? OR s.id LIKE ?";
                    $params = ["%$search%", "%$search%", "%$search%"];
                }

                $query .= " GROUP BY s.id ORDER BY s.name ASC";
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

            if (empty($input['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Supplier ID is required']);
                exit;
            }

            if (empty($input['name'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Name is required']);
                exit;
            }

            // Check if ID already exists
            $checkStmt = $pdo->prepare("SELECT id FROM suppliers WHERE id = ?");
            $checkStmt->execute([$input['id']]);

            if ($checkStmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Supplier ID already exists']);
                exit;
            }

            $stmt = $pdo->prepare("
                INSERT INTO suppliers (id, name, contact, address)
                VALUES (?, ?, ?, ?)
            ");
            $success = $stmt->execute([
                $input['id'],
                $input['name'],
                $input['contact'] ?? null,
                $input['address'] ?? null
            ]);

            if ($success) {
                echo json_encode(['success' => true, 'id' => $input['id']]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Failed to insert supplier']);
            }
            break;

        case 'PUT':
            // Get ID from query parameter
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Supplier ID required for update']);
                exit;
            }

            $input = json_decode(file_get_contents('php://input'), true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
                exit;
            }

            $updates = [];
            $params = [];

            if (!empty($input['name'])) {
                $updates[] = 'name = ?';
                $params[] = $input['name'];
            }
            if (isset($input['contact'])) {
                $updates[] = 'contact = ?';
                $params[] = $input['contact'];
            }
            if (isset($input['address'])) {
                $updates[] = 'address = ?';
                $params[] = $input['address'];
            }

            if (!$updates) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'No fields to update']);
                exit;
            }

            $params[] = $_GET['id'];
            $stmt = $pdo->prepare("UPDATE suppliers SET " . implode(', ', $updates) . " WHERE id = ?");
            $success = $stmt->execute($params);

            if ($success) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Failed to update supplier']);
            }
            break;

        case 'DELETE':
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Supplier ID is required']);
                exit;
            }

            // Check if supplier has related purchases
            $checkStmt = $pdo->prepare("SELECT COUNT(*) as count FROM purchases WHERE supplier_id = ?");
            $checkStmt->execute([$_GET['id']]);
            $result = $checkStmt->fetch(PDO::FETCH_ASSOC);

            if ($result['count'] > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Cannot delete supplier with existing purchases']);
                exit;
            }

            $stmt = $pdo->prepare("DELETE FROM suppliers WHERE id = ?");
            $stmt->execute([$_GET['id']]);

            if ($stmt->rowCount()) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Supplier not found']);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
