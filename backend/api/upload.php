<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/authMiddleware.php';

// Check authentication
checkAuth();

$pdo = getDatabaseConnection();
$currentUser = $_SESSION['username'] ?? 'system';

// Create upload directories if they don't exist
$uploadBaseDir = __DIR__ . '/../uploads';
$logoDir = $uploadBaseDir . '/logos';

if (!is_dir($uploadBaseDir)) {
    mkdir($uploadBaseDir, 0755, true);
}
if (!is_dir($logoDir)) {
    mkdir($logoDir, 0755, true);
}

switch ($_SERVER['REQUEST_METHOD']) {
    case 'POST':
        try {
            // Get upload type
            $uploadType = $_POST['upload_type'] ?? 'logo';
            
            // Validate upload type
            $allowedTypes = ['logo', 'document'];
            if (!in_array($uploadType, $allowedTypes)) {
                throw new Exception('Invalid upload type');
            }
            
            // Check if file was uploaded
            if (!isset($_FILES['file'])) {
                throw new Exception('No file in request');
            }
            
            if ($_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $errorMessages = [
                    UPLOAD_ERR_INI_SIZE => 'File terlalu besar (melebihi php.ini limit)',
                    UPLOAD_ERR_FORM_SIZE => 'File terlalu besar (melebihi form limit)',
                    UPLOAD_ERR_PARTIAL => 'File hanya terupload sebagian',
                    UPLOAD_ERR_NO_FILE => 'Tidak ada file yang diupload',
                    UPLOAD_ERR_NO_TMP_DIR => 'Folder temporary tidak ada',
                    UPLOAD_ERR_CANT_WRITE => 'Gagal menulis file ke disk',
                    UPLOAD_ERR_EXTENSION => 'Upload dihentikan oleh extension'
                ];
                $errorCode = $_FILES['file']['error'];
                $errorMsg = $errorMessages[$errorCode] ?? 'Upload error: ' . $errorCode;
                throw new Exception($errorMsg);
            }
            
            $file = $_FILES['file'];
            $fileName = $file['name'];
            $fileTmpName = $file['tmp_name'];
            $fileSize = $file['size'];
            $fileError = $file['error'];
            
            // Get file extension
            $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            
            // Allowed extensions based on upload type
            $allowedExts = [];
            if ($uploadType === 'logo') {
                $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'svg'];
                $targetDir = $logoDir;
                $maxSize = 5 * 1024 * 1024; // 5MB
            } else {
                $allowedExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
                $targetDir = $uploadBaseDir . '/documents';
                $maxSize = 10 * 1024 * 1024; // 10MB
                
                if (!is_dir($targetDir)) {
                    mkdir($targetDir, 0755, true);
                }
            }
            
            // Validate file extension
            if (!in_array($fileExt, $allowedExts)) {
                throw new Exception('Invalid file type. Allowed: ' . implode(', ', $allowedExts));
            }
            
            // Validate file size
            if ($fileSize > $maxSize) {
                throw new Exception('File too large. Max size: ' . ($maxSize / 1024 / 1024) . 'MB');
            }
            
            // Generate unique filename
            $newFileName = uniqid('', true) . '_' . time() . '.' . $fileExt;
            $targetPath = $targetDir . '/' . $newFileName;
            $relativePath = 'uploads/' . ($uploadType === 'logo' ? 'logos' : 'documents') . '/' . $newFileName;
            
            // Move uploaded file
            if (!move_uploaded_file($fileTmpName, $targetPath)) {
                throw new Exception('Failed to move uploaded file');
            }
            
            // Save to database
            $stmt = $pdo->prepare("
                INSERT INTO uploads (file_name, original_name, file_path, file_type, file_size, upload_type, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $newFileName,
                $fileName,
                $relativePath,
                $fileExt,
                $fileSize,
                $uploadType,
                $currentUser
            ]);
            
            $uploadId = $pdo->lastInsertId();
            
            // If it's a logo upload, update settings (store only filename, not full path)
            if ($uploadType === 'logo') {
                $stmt = $pdo->prepare("
                    UPDATE settings 
                    SET setting_value = ? 
                    WHERE setting_key = 'store_logo'
                ");
                $stmt->execute([$newFileName]);
            }
            
            echo json_encode([
                'success' => true,
                'message' => 'File uploaded successfully',
                'data' => [
                    'id' => $uploadId,
                    'file_name' => $newFileName,
                    'original_name' => $fileName,
                    'file_path' => $relativePath,
                    'file_url' => '../backend/' . $relativePath,
                    'file_size' => $fileSize,
                    'file_type' => $fileExt
                ]
            ]);
            
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => $e->getMessage()
            ]);
        }
        break;
        
    case 'GET':
        try {
            // Get uploaded files list
            $uploadType = $_GET['type'] ?? null;
            
            $query = "SELECT * FROM uploads";
            if ($uploadType) {
                $query .= " WHERE upload_type = ?";
                $stmt = $pdo->prepare($query . " ORDER BY created_at DESC");
                $stmt->execute([$uploadType]);
            } else {
                $stmt = $pdo->query($query . " ORDER BY created_at DESC");
            }
            
            $uploads = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Add full URL to each file
            foreach ($uploads as &$upload) {
                $upload['file_url'] = '../backend/' . $upload['file_path'];
            }
            
            echo json_encode([
                'success' => true,
                'data' => $uploads
            ]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => $e->getMessage()
            ]);
        }
        break;
        
    case 'DELETE':
        try {
            parse_str(file_get_contents('php://input'), $_DELETE);
            $uploadId = $_DELETE['id'] ?? $_GET['id'] ?? null;
            $fileName = $_DELETE['file_name'] ?? $_GET['file_name'] ?? null;
            
            if (!$uploadId && !$fileName) {
                throw new Exception('Upload ID or file name required');
            }
            
            // Get file info by ID or filename
            if ($uploadId) {
                $stmt = $pdo->prepare("SELECT * FROM uploads WHERE id = ?");
                $stmt->execute([$uploadId]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM uploads WHERE file_name = ?");
                $stmt->execute([$fileName]);
            }
            
            $upload = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$upload) {
                throw new Exception('File not found');
            }
            
            // Delete physical file
            $filePath = __DIR__ . '/../' . $upload['file_path'];
            if (file_exists($filePath)) {
                unlink($filePath);
            }
            
            // Delete from database
            $stmt = $pdo->prepare("DELETE FROM uploads WHERE id = ?");
            $stmt->execute([$upload['id']]);
            
            // If it was a logo, clear settings
            if ($upload['upload_type'] === 'logo') {
                $stmt = $pdo->prepare("
                    UPDATE settings 
                    SET setting_value = '' 
                    WHERE setting_key = 'store_logo' AND setting_value = ?
                ");
                $stmt->execute([$upload['file_name']]);
            }
            
            echo json_encode([
                'success' => true,
                'message' => 'File deleted successfully'
            ]);
            
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => $e->getMessage()
            ]);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        break;
}
?>
