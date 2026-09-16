<?php
/**
 * Neraca Helper Functions
 * 
 * Helper functions to record neraca entries from various transactions
 */

/**
 * Record neraca entry
 * 
 * @param PDO $pdo Database connection
 * @param string $transactionDate Transaction date (Y-m-d H:i:s)
 * @param string $category Category (see neraca table enum)
 * @param string $type Type: 'pemasukan' or 'pengeluaran'
 * @param float $amount Amount
 * @param string $description Description
 * @param string $referenceType Reference type (transaction, purchase, payment, kas_mutation, wajib_beli_mutation, manual)
 * @param string|null $referenceId Reference ID
 * @param string|null $createdBy Created by user
 * @return int Last insert ID
 */
function recordNeraca($pdo, $transactionDate, $category, $type, $amount, $description, $referenceType, $referenceId = null, $createdBy = null) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO neraca (transaction_date, category, type, amount, description, reference_type, reference_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $transactionDate,
            $category,
            $type,
            abs($amount), // Ensure positive amount
            $description,
            $referenceType,
            $referenceId,
            $createdBy
        ]);
        $lastId = $pdo->lastInsertId();
        error_log("Recorded neraca: category=$category, type=$type, amount=$amount, ref=$referenceId");
        return $lastId;
    } catch (Exception $e) {
        error_log("Error recording neraca: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Delete neraca entries by reference
 * 
 * @param PDO $pdo Database connection
 * @param string $referenceType Reference type
 * @param string $referenceId Reference ID
 * @return int Number of deleted rows
 */
function deleteNeracaByReference($pdo, $referenceType, $referenceId) {
    try {
        $stmt = $pdo->prepare("DELETE FROM neraca WHERE reference_type = ? AND reference_id = ?");
        $stmt->execute([$referenceType, $referenceId]);
        $deletedCount = $stmt->rowCount();
        error_log("Deleted $deletedCount neraca entries for ref=$referenceId");
        return $deletedCount;
    } catch (Exception $e) {
        error_log("Error deleting neraca by reference: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Record neraca for sales transaction (completed - cash/non-debit)
 * 
 * @param PDO $pdo Database connection
 * @param string $transactionId Transaction ID
 * @param string $transactionDate Transaction date
 * @param float $amount Total amount
 * @param string $customer Customer name
 * @param string|null $createdBy Created by user
 */
function recordNeracaSales($pdo, $transactionId, $transactionDate, $amount, $customer, $createdBy = null) {
    recordNeraca(
        $pdo,
        $transactionDate,
        'penjualan',
        'pemasukan',
        $amount,
        "Penjualan kepada $customer",
        'transaction',
        $transactionId,
        $createdBy
    );
}

/**
 * Record neraca for receivable (piutang) - Pending debit/transfer transaction
 * 
 * @param PDO $pdo Database connection
 * @param string $transactionId Transaction ID
 * @param string $transactionDate Transaction date
 * @param float $amount Total amount
 * @param string $customer Customer name
 * @param string $paymentMethod Payment method (debit or transfer)
 * @param string|null $createdBy Created by user
 */
function recordNeracaReceivable($pdo, $transactionId, $transactionDate, $amount, $customer, $paymentMethod = 'debit', $createdBy = null) {
    $methodName = ($paymentMethod === 'transfer') ? 'transfer' : 'debit';
    recordNeraca(
        $pdo,
        $transactionDate,
        'piutang',
        'pemasukan',
        $amount,
        "Piutang penjualan $methodName kepada $customer (Pending - Perlu Verifikasi)",
        'transaction',
        $transactionId,
        $createdBy
    );
}

/**
 * Record neraca for purchase (cash)
 * 
 * @param PDO $pdo Database connection
 * @param string $purchaseId Purchase ID
 * @param string $purchaseDate Purchase date
 * @param float $amount Total amount
 * @param string $supplierName Supplier name
 * @param string|null $createdBy Created by user
 */
function recordNeracaPurchaseCash($pdo, $purchaseId, $purchaseDate, $amount, $supplierName, $createdBy = null) {
    recordNeraca(
        $pdo,
        $purchaseDate,
        'pembelian_cash',
        'pengeluaran',
        $amount,
        "Pembelian cash dari $supplierName",
        'purchase',
        $purchaseId,
        $createdBy
    );
}

/**
 * Record neraca for purchase (tempo/credit)
 * 
 * @param PDO $pdo Database connection
 * @param string $purchaseId Purchase ID
 * @param string $purchaseDate Purchase date
 * @param float $amount Total amount
 * @param string $supplierName Supplier name
 * @param string|null $createdBy Created by user
 */
function recordNeracaPurchaseTempo($pdo, $purchaseId, $purchaseDate, $amount, $supplierName, $createdBy = null) {
    recordNeraca(
        $pdo,
        $purchaseDate,
        'pembelian_tempo',
        'pengeluaran',
        $amount,
        "Pembelian tempo dari $supplierName",
        'purchase',
        $purchaseId,
        $createdBy
    );
}

/**
 * Record neraca for payment of debt/hutang
 * 
 * @param PDO $pdo Database connection
 * @param string $paymentId Payment ID
 * @param string $paymentDate Payment date
 * @param float $amount Payment amount
 * @param string $supplierName Supplier name
 * @param string|null $createdBy Created by user
 */
function recordNeracaPaymentHutang($pdo, $paymentId, $paymentDate, $amount, $supplierName, $createdBy = null) {
    recordNeraca(
        $pdo,
        $paymentDate,
        'pembayaran_hutang',
        'pengeluaran',
        $amount,
        "Pembayaran hutang ke $supplierName",
        'payment',
        $paymentId,
        $createdBy
    );
}

/**
 * Record neraca for kas deposit (setoran)
 * 
 * @param PDO $pdo Database connection
 * @param int $mutationId Kas mutation ID
 * @param string $mutationDate Mutation date
 * @param float $amount Amount
 * @param string $customerName Customer name
 * @param string|null $createdBy Created by user
 */
function recordNeracaKasDeposit($pdo, $mutationId, $mutationDate, $amount, $customerName, $createdBy = null) {
    recordNeraca(
        $pdo,
        $mutationDate,
        'setoran_kas',
        'pemasukan',
        $amount,
        "Setoran kas dari $customerName",
        'kas_mutation',
        $mutationId,
        $createdBy
    );
}

/**
 * Record neraca for kas withdrawal (penarikan)
 * 
 * @param PDO $pdo Database connection
 * @param int $mutationId Kas mutation ID
 * @param string $mutationDate Mutation date
 * @param float $amount Amount
 * @param string $customerName Customer name
 * @param string|null $createdBy Created by user
 */
function recordNeracaKasWithdrawal($pdo, $mutationId, $mutationDate, $amount, $customerName, $createdBy = null) {
    recordNeraca(
        $pdo,
        $mutationDate,
        'penarikan_kas',
        'pengeluaran',
        $amount,
        "Penarikan kas oleh $customerName",
        'kas_mutation',
        $mutationId,
        $createdBy
    );
}

/**
 * Record neraca for wajib beli deposit (simpanan)
 * 
 * @param PDO $pdo Database connection
 * @param int $mutationId Wajib beli mutation ID
 * @param string $mutationDate Mutation date
 * @param float $amount Amount
 * @param string $customerName Customer name
 * @param string|null $createdBy Created by user
 */
function recordNeracaWajibBeliDeposit($pdo, $mutationId, $mutationDate, $amount, $customerName, $createdBy = null) {
    recordNeraca(
        $pdo,
        $mutationDate,
        'simpanan_wajib_beli',
        'pemasukan',
        $amount,
        "Simpanan wajib beli dari $customerName",
        'wajib_beli_mutation',
        $mutationId,
        $createdBy
    );
}

/**
 * Record neraca for wajib beli withdrawal (pengeluaran)
 * 
 * @param PDO $pdo Database connection
 * @param int $mutationId Wajib beli mutation ID
 * @param string $mutationDate Mutation date
 * @param float $amount Amount
 * @param string $customerName Customer name
 * @param string|null $createdBy Created by user
 */
function recordNeracaWajibBeliWithdrawal($pdo, $mutationId, $mutationDate, $amount, $customerName, $createdBy = null) {
    recordNeraca(
        $pdo,
        $mutationDate,
        'pengeluaran_wajib_beli',
        'pengeluaran',
        $amount,
        "Pengeluaran wajib beli untuk $customerName",
        'wajib_beli_mutation',
        $mutationId,
        $createdBy
    );
}
?>
