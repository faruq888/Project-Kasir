<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/neraca_helper.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

/**
 * Record hutang mutation for tempo purchases
 */
function recordHutangMutation($pdo, $supplierId, $type, $amount, $purchaseId, $dueDate = null, $description = '') {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO hutang_mutations (supplier_id, type, amount, description, purchase_id, due_date)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$supplierId, $type, $amount, $description, $purchaseId, $dueDate]);

        error_log("Recorded hutang mutation: supplier={$supplierId}, type={$type}, amount={$amount}, purchase={$purchaseId}");
        return true;
    } catch (Exception $e) {
        error_log("Error recording hutang mutation: " . $e->getMessage());
        return false;
    }
}

/**
 * Update supplier total hutang
 */
function getSupplierHutang($pdo, $supplierId) {
    try {
        // Calculate total hutang from purchases remaining_amount
        $stmt = $pdo->prepare("
            SELECT COALESCE(SUM(remaining_amount), 0) as total_hutang
            FROM purchases
            WHERE supplier_id = ? AND payment_status != 'Lunas'
        ");
        $stmt->execute([$supplierId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return max(0, $result['total_hutang'] ?? 0);
    } catch (Exception $e) {
        error_log("Error calculating supplier hutang: " . $e->getMessage());
        return 0;
    }
}

/**
 * Record stock movement for purchases
 */
function recordPurchaseStockMovement($pdo, $productId, $movementType, $quantity, $purchaseId, $supplierName = '', $createdBy = null) {
    try {
        $stmt = $pdo->prepare("SELECT stock, name FROM products WHERE id = ?");
        $stmt->execute([$productId]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$product) return false;

        $stockBefore = (int)$product['stock'];
        $stockAfter = $stockBefore;

        if ($movementType === 'in') {
            $stockAfter = $stockBefore + abs($quantity);
        } elseif ($movementType === 'out') {
            $stockAfter = max(0, $stockBefore - abs($quantity));
        }

        $stmtUpdate = $pdo->prepare("UPDATE products SET stock = ? WHERE id = ?");
        $stmtUpdate->execute([$stockAfter, $productId]);

        $stmt = $pdo->prepare("
            INSERT INTO stock_movements
            (product_id, movement_type, quantity, reference_type, reference_id, notes, stock_before, stock_after, created_by)
            VALUES (?, ?, ?, 'purchase', ?, ?, ?, ?, ?)
        ");
        $notes = "Pembelian dari supplier: " . ($supplierName ?: 'Unknown');

        $stmt->execute([
            $productId,
            $movementType,
            abs($quantity),
            $purchaseId,
            $notes,
            $stockBefore,
            $stockAfter,
            $createdBy ?: 'System'
        ]);

        return true;
    } catch (Exception $e) {
        error_log("Error recording purchase stock movement: " . $e->getMessage());
        return false;
    }
}

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        if (isset($_GET['id'])) {
            // Get specific purchase with payment history
            $stmt = $pdo->prepare("
                SELECT p.*, s.name AS supplier_name
                FROM purchases p
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                WHERE p.id = ?
            ");
            $stmt->execute([$_GET['id']]);
            $purchase = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($purchase) {
                // Get items
                $stmt2 = $pdo->prepare("
                    SELECT pi.*, pr.name AS product_name
                    FROM purchase_items pi
                    LEFT JOIN products pr ON pi.product_id = pr.id
                    WHERE pi.purchase_id = ?
                ");
                $stmt2->execute([$_GET['id']]);
                $purchase['items'] = $stmt2->fetchAll(PDO::FETCH_ASSOC);

                // Get payment history
                $stmt3 = $pdo->prepare("
                    SELECT * FROM purchase_payments
                    WHERE purchase_id = ?
                    ORDER BY payment_date DESC
                ");
                $stmt3->execute([$_GET['id']]);
                $purchase['payments'] = $stmt3->fetchAll(PDO::FETCH_ASSOC);

                echo json_encode($purchase);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Pembelian tidak ditemukan']);
            }
        } else {
            // Get all purchases
            $stmt = $pdo->query("
                SELECT p.id, p.purchase_date, p.total_price, p.status, p.payment_method,
                       p.due_date, p.paid_amount, p.remaining_amount, p.payment_status,
                       s.name AS supplier_name,
                       pr.name AS product_name,
                       pi.quantity, pi.buy_price
                FROM purchases p
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
                LEFT JOIN products pr ON pi.product_id = pr.id
                ORDER BY p.purchase_date DESC
            ");
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
        break;

    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);

        if (
            empty($input['purchase_date']) ||
            empty($input['supplier_id']) ||
            empty($input['qty']) ||
            empty($input['buy_price'])
        ) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Data pembelian tidak lengkap']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            $purchaseDate = date('Y-m-d H:i:s');
            $randomPart = str_pad(mt_rand(1, 99999), 5, '0', STR_PAD_LEFT);
            $purchaseId = "PUR-{$randomPart}";

            $total = $input['qty'] * $input['buy_price'];
            $status = $input['status'] ?? 'Pending';
            $paymentMethod = $input['payment_method'] ?? 'cash';
            $dueDate = $input['due_date'] ?? null;

            // Validasi: jika tempo, due_date wajib
            if ($paymentMethod === 'tempo' && empty($dueDate)) {
                throw new Exception("Tanggal jatuh tempo wajib diisi untuk pembelian tempo");
            }

            // Set payment status
            $paidAmount = 0;
            $remainingAmount = $total;
            $paymentStatus = 'Belum Lunas';

            if ($paymentMethod === 'cash') {
                $paidAmount = $total;
                $remainingAmount = 0;
                $paymentStatus = 'Lunas';
            }

            // Insert purchase
            $stmt = $pdo->prepare("
                INSERT INTO purchases
                (id, purchase_date, supplier_id, total_price, status, payment_method, due_date, paid_amount, remaining_amount, payment_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $purchaseId,
                $purchaseDate,
                $input['supplier_id'],
                $total,
                $status,
                $paymentMethod,
                $dueDate,
                $paidAmount,
                $remainingAmount,
                $paymentStatus
            ]);

            // Handle new product
            if ($input['product_id'] === 'new') {
                $newProductId = 'PROD-' . str_pad(mt_rand(1, 99999), 5, '0', STR_PAD_LEFT);
                $initialStock = 0;

                // Check if barcode already exists (if provided)
                $barcode = $input['barcode'] ?? null;
                if (!empty($barcode)) {
                    $checkStmt = $pdo->prepare("SELECT id FROM products WHERE barcode = ?");
                    $checkStmt->execute([$barcode]);
                    if ($checkStmt->fetch()) {
                        throw new Exception('Barcode sudah digunakan produk lain');
                    }
                }

                $stmt = $pdo->prepare("
                    INSERT INTO products (id, name, price, stock, category_code, supplier_id, barcode)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $newProductId,
                    $input['product_name'] ?? 'Produk Baru',
                    $input['sell_price'] ?? 0,
                    $initialStock,
                    $input['category_code'] ?? null,
                    $input['supplier_id'],
                    $barcode
                ]);

                $productId = $newProductId;
            } else {
                $productId = $input['product_id'];
            }

            // Insert purchase items
            $stmt = $pdo->prepare("
                INSERT INTO purchase_items (purchase_id, product_id, quantity, buy_price, subtotal)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $purchaseId,
                $productId,
                $input['qty'],
                $input['buy_price'],
                $total
            ]);

            // Get supplier name
            $supplierStmt = $pdo->prepare("SELECT name FROM suppliers WHERE id = ?");
            $supplierStmt->execute([$input['supplier_id']]);
            $supplierData = $supplierStmt->fetch(PDO::FETCH_ASSOC);
            $supplierName = $supplierData['name'] ?? 'Unknown';

            // Record stock movement jika status Selesai
            if ($status === 'Selesai') {
                recordPurchaseStockMovement(
                    $pdo,
                    $productId,
                    'in',
                    $input['qty'],
                    $purchaseId,
                    $supplierName,
                    'System'
                );
            }

            // Record hutang jika payment method tempo
            if ($paymentMethod === 'tempo' && $status === 'Selesai') {
                $description = "Pembelian tempo - {$supplierName} (Jatuh tempo: " . date('d/m/Y', strtotime($dueDate)) . ")";
                recordHutangMutation(
                    $pdo,
                    $input['supplier_id'],
                    'hutang',
                    $total,
                    $purchaseId,
                    $dueDate,
                    $description
                );

                // Supplier hutang is now calculated dynamically from purchases
            }

            // Record neraca entry for purchases (only if completed)
            if ($status === 'Selesai') {
                try {
                    if ($paymentMethod === 'cash') {
                        recordNeracaPurchaseCash(
                            $pdo,
                            $purchaseId,
                            $purchaseDate,
                            $total,
                            $supplierName,
                            'System'
                        );
                    } else if ($paymentMethod === 'tempo') {
                        recordNeracaPurchaseTempo(
                            $pdo,
                            $purchaseId,
                            $purchaseDate,
                            $total,
                            $supplierName,
                            'System'
                        );
                    }
                } catch (Exception $e) {
                    error_log("Warning: Failed to record neraca for purchase $purchaseId: " . $e->getMessage());
                }
            }

            $pdo->commit();
            echo json_encode([
                'success' => true,
                'id' => $purchaseId,
                'message' => $paymentMethod === 'tempo'
                    ? 'Pembelian tempo berhasil ditambahkan, tercatat sebagai hutang'
                    : 'Pembelian berhasil ditambahkan'
            ]);

        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Gagal menambahkan pembelian',
                'error'   => $e->getMessage()
            ]);
        }
        break;

    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        $purchaseId = $_GET['id'] ?? null;

        if (!$purchaseId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'ID pembelian diperlukan']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            // Get current purchase data
            $stmt = $pdo->prepare("
                SELECT p.*, s.name AS supplier_name
                FROM purchases p
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                WHERE p.id = ?
            ");
            $stmt->execute([$purchaseId]);
            $currentPurchase = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$currentPurchase) throw new Exception('Pembelian tidak ditemukan');

            $oldStatus = $currentPurchase['status'];
            $newStatus = $input['status'] ?? $oldStatus;
            $supplierName = $currentPurchase['supplier_name'] ?? 'Unknown';
            $supplierId = $currentPurchase['supplier_id'];
            $paymentMethod = $currentPurchase['payment_method'];
            $total = $currentPurchase['total_price'];
            $dueDate = $currentPurchase['due_date'];

            // Update status if provided
            if (isset($input['status'])) {
                $stmt = $pdo->prepare("UPDATE purchases SET status = ? WHERE id = ?");
                $stmt->execute([$newStatus, $purchaseId]);
            }

            // Get items for stock updates
            $stmt = $pdo->prepare("SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ?");
            $stmt->execute([$purchaseId]);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Handle stock changes based on status change
            if ($oldStatus !== $newStatus && !empty($items)) {
                foreach ($items as $item) {
                    if ($oldStatus === 'Pending' && $newStatus === 'Selesai') {
                        // Add stock
                        recordPurchaseStockMovement(
                            $pdo,
                            $item['product_id'],
                            'in',
                            $item['quantity'],
                            $purchaseId,
                            $supplierName,
                            'System'
                        );

                        // Record hutang if tempo
                        if ($paymentMethod === 'tempo') {
                            $description = "Pembelian tempo - {$supplierName} (Jatuh tempo: " . date('d/m/Y', strtotime($dueDate)) . ")";
                            recordHutangMutation(
                                $pdo,
                                $supplierId,
                                'hutang',
                                $total,
                                $purchaseId,
                                $dueDate,
                                $description
                            );
                        }

                    } elseif ($oldStatus === 'Selesai' && in_array($newStatus, ['Pending', 'Dibatalkan'])) {
                        // Remove stock
                        recordPurchaseStockMovement(
                            $pdo,
                            $item['product_id'],
                            'out',
                            $item['quantity'],
                            $purchaseId,
                            ($newStatus === 'Dibatalkan'
                                ? "Pembatalan pembelian dari {$supplierName}"
                                : "Pengembalian ke status Pending - {$supplierName}"),
                            'System'
                        );

                        // Reverse hutang if tempo
                        if ($paymentMethod === 'tempo') {
                            $description = "Pembatalan/Pengembalian pembelian tempo - {$supplierName}";
                            recordHutangMutation(
                                $pdo,
                                $supplierId,
                                'bayar',
                                $total,
                                $purchaseId,
                                null,
                                $description
                            );
                        }
                    }
                }

                // Supplier hutang is now calculated dynamically from purchases
                // No need to update supplier table
            }

            // Sync neraca when status changes
            if ($oldStatus !== $newStatus) {
                // Hapus pencatatan neraca jika keluar dari status selesai
                if ($oldStatus === 'Selesai' && $newStatus !== 'Selesai') {
                    try {
                        deleteNeracaByReference($pdo, 'purchase', $purchaseId);
                    } catch (Exception $e) {
                        error_log("Warning: Failed to delete neraca for purchase rollback {$purchaseId}: " . $e->getMessage());
                    }
                }

                // Catat neraca saat pembelian diselesaikan dari status lain
                if ($oldStatus !== 'Selesai' && $newStatus === 'Selesai') {
                    try {
                        // Pastikan tidak ada duplikasi jika sebelumnya sempat tercatat
                        deleteNeracaByReference($pdo, 'purchase', $purchaseId);

                        if ($paymentMethod === 'cash') {
                            recordNeracaPurchaseCash(
                                $pdo,
                                $purchaseId,
                                $currentPurchase['purchase_date'],
                                $total,
                                $supplierName,
                                'System'
                            );
                        } else if ($paymentMethod === 'tempo') {
                            recordNeracaPurchaseTempo(
                                $pdo,
                                $purchaseId,
                                $currentPurchase['purchase_date'],
                                $total,
                                $supplierName,
                                'System'
                            );
                        }
                    } catch (Exception $e) {
                        error_log("Warning: Failed to record neraca for purchase {$purchaseId} on status change: " . $e->getMessage());
                    }
                }
            }

            $pdo->commit();
            echo json_encode(['success' => true, 'message' => 'Status pembelian berhasil diperbarui']);

        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    case 'DELETE':
        $purchaseId = $_GET['id'] ?? null;
        if (!$purchaseId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'ID pembelian diperlukan']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("
                SELECT p.status, p.payment_method, p.supplier_id, p.total_price, s.name AS supplier_name
                FROM purchases p
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                WHERE p.id = ?
            ");
            $stmt->execute([$purchaseId]);
            $purchase = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$purchase) throw new Exception('Pembelian tidak ditemukan');

            $supplierName = $purchase['supplier_name'] ?? 'Unknown';
            $paymentMethod = $purchase['payment_method'];
            $supplierId = $purchase['supplier_id'];
            $total = $purchase['total_price'];

            if ($purchase['status'] === 'Selesai') {
                // Reverse stock
                $stmt = $pdo->prepare("SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ?");
                $stmt->execute([$purchaseId]);
                $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($items as $item) {
                    recordPurchaseStockMovement(
                        $pdo,
                        $item['product_id'],
                        'out',
                        $item['quantity'],
                        $purchaseId,
                        "Penghapusan pembelian dari {$supplierName}",
                        'System'
                    );
                }

                // Reverse hutang if tempo
                if ($paymentMethod === 'tempo') {
                    $description = "Penghapusan pembelian tempo - {$supplierName}";
                    recordHutangMutation(
                        $pdo,
                        $supplierId,
                        'bayar',
                        $total,
                        $purchaseId,
                        null,
                        $description
                    );
                }
            }

            // Hapus pencatatan neraca untuk pembelian ini
            try {
                deleteNeracaByReference($pdo, 'purchase', $purchaseId);
            } catch (Exception $e) {
                error_log("Warning: Failed to delete neraca entries for purchase delete {$purchaseId}: " . $e->getMessage());
            }

            // Delete related records
            $pdo->prepare("DELETE FROM stock_movements WHERE reference_type = 'purchase' AND reference_id = ?")->execute([$purchaseId]);

            // Delete neraca entries for any associated payments
            $paymentIdsStmt = $pdo->prepare("SELECT id FROM purchase_payments WHERE purchase_id = ?");
            $paymentIdsStmt->execute([$purchaseId]);
            $paymentIds = $paymentIdsStmt->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($paymentIds)) {
                foreach ($paymentIds as $pid) {
                    try {
                        deleteNeracaByReference($pdo, 'payment', $pid);
                    } catch (Exception $e) {
                        error_log("Warning: Failed to delete neraca for payment {$pid} during purchase delete {$purchaseId}: " . $e->getMessage());
                    }
                }
            }

            $pdo->prepare("DELETE FROM purchase_payments WHERE purchase_id = ?")->execute([$purchaseId]);
            $pdo->prepare("DELETE FROM purchase_items WHERE purchase_id = ?")->execute([$purchaseId]);
            $pdo->prepare("DELETE FROM hutang_mutations WHERE purchase_id = ?")->execute([$purchaseId]);
            $pdo->prepare("DELETE FROM purchases WHERE id = ?")->execute([$purchaseId]);

            // Supplier hutang is now calculated dynamically from purchases
            // No need to update supplier table

            $pdo->commit();
            echo json_encode(['success' => true, 'message' => 'Pembelian berhasil dihapus']);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Gagal menghapus pembelian', 'error' => $e->getMessage()]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Metode tidak diizinkan']);
}
?>
