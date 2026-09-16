<?php
// Load environment configuration
function loadEnvConfig() {
    $envFile = __DIR__ . '/../start.env';
    $config = [
        'DB_HOST' => 'localhost',
        'DB_NAME' => 'kasir',
        'DB_USER' => 'root',
        'DB_PASS' => '',
        'DB_PORT' => '3306'
    ];
    
    if (file_exists($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            list($key, $value) = explode('=', $line, 2);
            $config[trim($key)] = trim($value);
        }
    }
    
    return applyRuntimeOverrides($config);
}

function applyRuntimeOverrides($config) {
    $map = [
        'DB_HOST' => 'KASIR_DB_HOST',
        'DB_NAME' => 'KASIR_DB_NAME',
        'DB_USER' => 'KASIR_DB_USER',
        'DB_PASS' => 'KASIR_DB_PASS',
        'DB_PORT' => 'KASIR_DB_PORT',
    ];

    foreach ($map as $configKey => $envKey) {
        $value = getenv($envKey);
        if ($value !== false) {
            $config[$configKey] = $value;
        }
    }

    return $config;
}

// Singleton pattern for database connection
class Database {
    private static $instance = null;
    private $pdo;
    
    private function __construct() {
        $config = loadEnvConfig();
        $host = $config['DB_HOST'];
        $db = $config['DB_NAME'];
        $user = $config['DB_USER'];
        $pass = $config['DB_PASS'];
        $port = $config['DB_PORT'] ?? '3306';
        $charset = 'utf8mb4';
        
        $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=$charset";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_PERSISTENT         => false, // Avoid connection issues
        ];
        
        require_once __DIR__ . '/../includes/timezone.php';

        try {
            $this->pdo = new PDO($dsn, $user, $pass, $options);
            kasir_apply_system_timezone($this->pdo);
            $this->pdo->exec("SET NAMES utf8mb4");
        } catch (PDOException $e) {
            error_log('Database connection error: ' . $e->getMessage());
            http_response_code(500);
            die(json_encode([
                'success' => false, 
                'message' => 'Tidak dapat terhubung ke database. Pastikan MySQL berjalan.',
                'error' => $e->getMessage()
            ]));
        }
    }
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function getConnection() {
        return $this->pdo;
    }
}

// Legacy function for backward compatibility
function getDatabaseConnection() {
    return Database::getInstance()->getConnection();
}
