<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$pdo = getDatabaseConnection();

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            if (!empty($_GET['id'])) {
                $stmt = $pdo->prepare("SELECT * FROM customers WHERE id = ?");
                $stmt->execute([$_GET['id']]);
                $customer = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($customer) {
                    echo json_encode($customer);
                } else {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Customer not found']);
                }
            } else {
                $search = $_GET['search'] ?? '';
                $params = [];
                $query = "SELECT * FROM customers";

                if ($search !== '') {
                    $query .= " WHERE name LIKE ? OR phone LIKE ? OR id LIKE ?";
                    $params = ["%$search%", "%$search%", "%$search%"];
                }

                $query .= " ORDER BY name ASC";
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
                echo json_encode(['success' => false, 'message' => 'Customer ID is required']);
                exit;
            }

            if (empty($input['name'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Name is required']);
                exit;
            }

            // Cek apakah ID sudah ada
            $checkStmt = $pdo->prepare("SELECT id FROM customers WHERE id = ?");
            $checkStmt->execute([$input['id']]);

            if ($checkStmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Customer ID already exists']);
                exit;
            }

            $stmt = $pdo->prepare("
                INSERT INTO customers (id, name, phone, address)
                VALUES (?, ?, ?, ?)
            ");
            $success = $stmt->execute([
                $input['id'],
                $input['name'],
                $input['phone'] ?? null,
                $input['address'] ?? null
            ]);

            if ($success) {
                echo json_encode(['success' => true, 'id' => $input['id']]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Failed to insert customer']);
            }
            break;

            case 'PUT':
            // Untuk PUT, dapatkan ID dari query parameter
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Customer ID required for update']);
                exit;
            }

            $input = json_decode(file_get_contents('php://input'), true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
                exit;
            }

            error_log('PUT Input: ' . print_r($input, true));
            error_log('PUT ID: ' . $_GET['id']);

            $updates = [];
            $params = [];

            if (!empty($input['name'])) {
                $updates[] = 'name = ?';
                $params[] = $input['name'];
            }
            if (isset($input['phone'])) {
                $updates[] = 'phone = ?';
                $params[] = $input['phone'];
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
            $stmt = $pdo->prepare("UPDATE customers SET " . implode(', ', $updates) . " WHERE id = ?");
            $success = $stmt->execute($params);

            if ($success) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Failed to update customer']);
            }
            break;

        case 'DELETE':
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Customer ID is required']);
                exit;
            }

            $stmt = $pdo->prepare("DELETE FROM customers WHERE id = ?");
            $stmt->execute([$_GET['id']]);

            if ($stmt->rowCount()) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Customer not found']);
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