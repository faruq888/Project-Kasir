<?php
require_once __DIR__.'/../config/database.php';

function generateJWT($user) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'user_id' => $user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'iat' => time(),
        'exp' => time() + (60 * 60 * 24) // 24 hours
    ]);
    
    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
    
    // Get JWT secret with fallback
    $jwtSecret = getenv('JWT_SECRET');
    if (!$jwtSecret) {
        $jwtSecret = 'your-secret-key-change-this-in-production';
    }
    
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $jwtSecret, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
    
    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

function verifyToken() {
    $headers = getallheaders();
    if (!$headers) {
        error_log("getallheaders() failed - using fallback");
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (substr($key, 0, 5) == 'HTTP_') {
                $header = str_replace(' ', '-', ucwords(str_replace('_', ' ', strtolower(substr($key, 5)))));
                $headers[$header] = $value;
            }
        }
    }
    
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    
    error_log("Auth header received: " . substr($authHeader, 0, 50) . "...");
    
    if (preg_match('/Bearer\s+(\S+)/', $authHeader, $matches)) {
        $token = $matches[1];
        $tokenParts = explode('.', $token);
        
        if (count($tokenParts) !== 3) {
            error_log("Invalid token format - parts count: " . count($tokenParts));
            return ['success' => false, 'message' => 'Invalid token format'];
        }
        
        $header = base64_decode(str_replace(['-', '_'], ['+', '/'], $tokenParts[0]));
        $payload = base64_decode(str_replace(['-', '_'], ['+', '/'], $tokenParts[1]));
        $signatureProvided = $tokenParts[2];
        
        // Get JWT secret with fallback
        $jwtSecret = getenv('JWT_SECRET');
        if (!$jwtSecret) {
            $jwtSecret = 'your-secret-key-change-this-in-production';
        }
        
        $signature = hash_hmac('sha256', $tokenParts[0] . "." . $tokenParts[1], $jwtSecret, true);
        $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
        
        if ($base64UrlSignature !== $signatureProvided) {
            error_log("Invalid token signature");
            return ['success' => false, 'message' => 'Invalid token signature'];
        }
        
        $payloadData = json_decode($payload, true);
        
        // Check token expiration
        if (isset($payloadData['exp']) && $payloadData['exp'] < time()) {
            error_log("Token expired. Exp: " . $payloadData['exp'] . ", Now: " . time());
            return ['success' => false, 'message' => 'Token expired. Please login again.'];
        }
        
        error_log("Token valid for user: " . ($payloadData['username'] ?? 'unknown'));
        return ['success' => true, 'user' => $payloadData];
    }
    
    error_log("Authorization header missing or invalid format. Header: " . var_export($authHeader, true));
    return ['success' => false, 'message' => 'Authorization token missing. Please login again.'];
}

function checkAuth() {
    $result = verifyToken();
    if (!$result['success']) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => $result['message']]);
        exit;
    }
    
    // Start session if not started
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    // Store user info in session
    $_SESSION['user_id'] = $result['user']['user_id'] ?? null;
    $_SESSION['username'] = $result['user']['username'] ?? 'system';
    $_SESSION['role'] = $result['user']['role'] ?? 'operator';
    
    return $result['user'];
}
?>