import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const parsedDatabaseUrl = DATABASE_URL ? new URL(DATABASE_URL) : null;

if (parsedDatabaseUrl && parsedDatabaseUrl.protocol !== 'mysql:') {
  throw new Error('DATABASE_URL must use the mysql:// protocol.');
}

const DB_CONFIG: mysql.ConnectionOptions = parsedDatabaseUrl
  ? {
      host: parsedDatabaseUrl.hostname,
      port: Number(parsedDatabaseUrl.port || 3306),
      user: decodeURIComponent(parsedDatabaseUrl.username),
      password: decodeURIComponent(parsedDatabaseUrl.password),
      database: decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+/, '')),
    }
  : {
      host: process.env.DB_HOST || (process.env.NODE_ENV === 'production' ? '' : 'localhost'),
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || (process.env.NODE_ENV === 'production' ? '' : 'root'),
      password: process.env.DB_PASSWORD || '',
    };

const DB_NAME = DB_CONFIG.database || process.env.DB_NAME || 'daily_attendance';

let pool: mysql.Pool | null = null;
let isInitialized = false;

function getDatabaseConfigurationError(): string | null {
  const host = String(DB_CONFIG.host || '').toLowerCase();
  const isLoopbackHost = ['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(host);

  if (process.env.NODE_ENV === 'production' && !parsedDatabaseUrl) {
    return 'Production requires DATABASE_URL. Set the Railway MySQL public URL in Vercel Project Settings → Environment Variables, then redeploy.';
  }

  if (process.env.NODE_ENV === 'production' && isLoopbackHost) {
    return 'Production MySQL is configured to use localhost. Set DATABASE_URL to the Railway public MySQL connection URL in Vercel Project Settings → Environment Variables, then redeploy.';
  }

  return null;
}

async function ensureColumns(
  dbPool: mysql.Pool,
  migrations: { table: 'users' | 'attendance' | 'staff_warnings'; column: string; definition: string }[]
) {
  for (const migration of migrations) {
    const [columns] = await dbPool.query<mysql.RowDataPacket[]>(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [migration.table, migration.column]
    );

    if (columns.length > 0) continue;

    try {
      await dbPool.query(
        `ALTER TABLE \`${migration.table}\` ADD COLUMN \`${migration.column}\` ${migration.definition}`
      );
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

async function ensureProfilePhotoCapacity(dbPool: mysql.Pool) {
  const [columns] = await dbPool.query<mysql.RowDataPacket[]>(
    'SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['users', 'profile_photo']
  );
  const dataType = String(columns[0]?.DATA_TYPE || '').toLowerCase();

  if (dataType && dataType !== 'mediumtext' && dataType !== 'longtext') {
    await dbPool.query('ALTER TABLE users MODIFY COLUMN profile_photo LONGTEXT NULL');
  }
}

async function ensureEmailIsOptional(dbPool: mysql.Pool) {
  const [columns] = await dbPool.query<mysql.RowDataPacket[]>(
    'SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['users', 'email']
  );

  if (columns[0]?.IS_NULLABLE === 'NO') {
    await dbPool.query('ALTER TABLE users MODIFY COLUMN email VARCHAR(100) NULL');
  }
}

async function ensureDeveloperRole(dbPool: mysql.Pool) {
  const [columns] = await dbPool.query<mysql.RowDataPacket[]>(
    'SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['users', 'role']
  );

  if (!String(columns[0]?.COLUMN_TYPE || '').includes("'DEVELOPER'")) {
    await dbPool.query(
      "ALTER TABLE users MODIFY COLUMN role ENUM('USER', 'ADMIN', 'DEVELOPER') NOT NULL DEFAULT 'USER'"
    );
  }
}

export function getDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...DB_CONFIG,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }
  return pool;
}

export async function initDatabase(): Promise<{ success: boolean; message: string }> {
  if (isInitialized) {
    return { success: true, message: 'Database already initialized' };
  }

  try {
    const configurationError = getDatabaseConfigurationError();
    if (configurationError) {
      console.error(`[MySQL Configuration Error] ${configurationError}`);
      return { success: false, message: configurationError };
    }

    const adminConn = await mysql.createConnection({ ...DB_CONFIG, database: undefined });

    await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await adminConn.end();

    const dbPool = getDbPool();

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        real_name VARCHAR(100) NULL,
        email VARCHAR(100) NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('USER', 'ADMIN', 'DEVELOPER') NOT NULL DEFAULT 'USER',
        status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
        attendance_role ENUM('CSOT', 'PPKA', 'MASINIS', 'PKD', 'PJL') NOT NULL DEFAULT 'CSOT',
        profile_photo LONGTEXT NULL,
        roblox_username VARCHAR(100) NULL,
        discord_username VARCHAR(100) NULL,
        profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_username (username),
        INDEX idx_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        attendance_role ENUM('CSOT', 'PPKA', 'MASINIS', 'PKD', 'PJL') NOT NULL DEFAULT 'CSOT',
        discord_username VARCHAR(100) NOT NULL,
        roblox_username VARCHAR(100) NOT NULL,
        attendance_date DATE NOT NULL,
        attendance_time TIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Hadir',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT unique_user_daily_attendance UNIQUE (user_id, attendance_date),
        INDEX idx_attendance_date (attendance_date),
        INDEX idx_attendance_user_date (user_id, attendance_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS staff_warnings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        issued_by INT NULL,
        reason VARCHAR(1000) NOT NULL,
        read_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_staff_warning_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_staff_warning_issuer FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_staff_warnings_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS admin_attendance_inbox (
        admin_id INT PRIMARY KEY,
        read_through_id INT NOT NULL DEFAULT 0,
        CONSTRAINT fk_admin_attendance_inbox_user FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS admin_inbox_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        event_key VARCHAR(100) NOT NULL,
        title VARCHAR(180) NOT NULL,
        message VARCHAR(1000) NOT NULL,
        read_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_admin_inbox_notification_user FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_admin_inbox_event (admin_id, event_key),
        INDEX idx_admin_inbox_notifications_created (admin_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ensureDeveloperRole(dbPool);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS developer_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(180) NOT NULL,
        description TEXT NOT NULL,
        category ENUM('MODELLING', 'SCRIPTING') NOT NULL,
        file_required BOOLEAN NOT NULL DEFAULT FALSE,
        starts_on DATE NOT NULL,
        ends_on DATE NOT NULL,
        created_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_developer_task_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_developer_tasks_dates (starts_on, ends_on),
        INDEX idx_developer_tasks_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS developer_task_files (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        developer_id INT NOT NULL,
        blob_name VARCHAR(500) NOT NULL UNIQUE,
        original_name VARCHAR(255) NOT NULL,
        content_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
        byte_size BIGINT UNSIGNED NOT NULL,
        status ENUM('PENDING', 'UPLOADING', 'COMPLETE') NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        uploaded_at TIMESTAMP NULL DEFAULT NULL,
        CONSTRAINT fk_developer_task_file_task FOREIGN KEY (task_id) REFERENCES developer_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_developer_task_file_user FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_developer_task_files_owner (developer_id, task_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS developer_task_completions (
        task_id INT NOT NULL,
        developer_id INT NOT NULL,
        completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_id, developer_id),
        CONSTRAINT fk_developer_task_completion_task FOREIGN KEY (task_id) REFERENCES developer_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_developer_task_completion_user FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(
      "ALTER TABLE developer_task_files MODIFY COLUMN status ENUM('PENDING', 'UPLOADING', 'COMPLETE') NOT NULL DEFAULT 'PENDING'"
    );
    await dbPool.query(`
      INSERT IGNORE INTO admin_attendance_inbox (admin_id, read_through_id)
      SELECT u.id, COALESCE((SELECT MAX(a.id) FROM attendance a), 0)
      FROM users u
      WHERE u.role = 'ADMIN'
    `);

    await ensureColumns(dbPool, [
      { table: 'users', column: 'attendance_role', definition: "ENUM('CSOT', 'PPKA', 'MASINIS', 'PKD', 'PJL') NOT NULL DEFAULT 'CSOT'" },
      { table: 'users', column: 'real_name', definition: 'VARCHAR(100) NULL AFTER username' },
      { table: 'users', column: 'profile_photo', definition: 'LONGTEXT NULL' },
      { table: 'users', column: 'roblox_username', definition: 'VARCHAR(100) NULL' },
      { table: 'users', column: 'discord_username', definition: 'VARCHAR(100) NULL' },
      { table: 'users', column: 'profile_completed', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { table: 'attendance', column: 'attendance_role', definition: "ENUM('CSOT', 'PPKA', 'MASINIS', 'PKD', 'PJL') NOT NULL DEFAULT 'CSOT'" },
      { table: 'staff_warnings', column: 'read_at', definition: 'TIMESTAMP NULL DEFAULT NULL AFTER reason' },
    ]);
    await ensureProfilePhotoCapacity(dbPool);
    await ensureEmailIsOptional(dbPool);

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@dailyattendance.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const [existingAdmins]: [mysql.RowDataPacket[], unknown] = await dbPool.query(
      'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [adminUsername, adminEmail]
    );

    if (existingAdmins.length === 0) {
      const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
      await dbPool.query(
        'INSERT INTO users (username, email, password, role, status, attendance_role, profile_completed) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [adminUsername, adminEmail, hashedAdminPassword, 'ADMIN', 'ACTIVE', 'CSOT', true]
      );
      console.log(`[DB] Seeded initial admin account: ${adminUsername}`);
    }

    const [existingUsers]: [mysql.RowDataPacket[], unknown] = await dbPool.query(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      ['user']
    );

    if (existingUsers.length === 0) {
      const hashedUserPassword = await bcrypt.hash('user123', 10);
      await dbPool.query(
        'INSERT INTO users (username, email, password, role, status, attendance_role, profile_completed, roblox_username, discord_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['user', 'user@dailyattendance.local', hashedUserPassword, 'USER', 'ACTIVE', 'CSOT', true, 'demo-roblox', 'demo-discord']
      );
    }

    isInitialized = true;
    return { success: true, message: 'Database initialized and seeded successfully' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initialize database. Ensure MySQL is running on port 3306.';
    console.error('[DB Initialization Error]:', error);
    return { success: false, message };
  }
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  if (!isInitialized) {
    const initialization = await initDatabase();
    if (!initialization.success) {
      throw new Error(initialization.message);
    }
  }

  const dbPool = getDbPool();
  const [results] = await dbPool.query(sql, params);
  return results as T;
}

export async function testConnection(): Promise<{ connected: boolean; error?: string }> {
  let connection: mysql.Connection | undefined;

  try {
    const configurationError = getDatabaseConfigurationError();
    if (configurationError) {
      console.error(`[MySQL Configuration Error] ${configurationError}`);
      return { connected: false, error: configurationError };
    }

    connection = await mysql.createConnection({ ...DB_CONFIG, database: undefined });
    await connection.ping();
    return { connected: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'MySQL connection failed. Ensure MySQL service is started (e.g., via Laragon or XAMPP).';
    const code =
      typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
        ? err.code
        : 'UNKNOWN';
    console.error(`[MySQL Connection Error] ${code}: ${message}`);
    return { connected: false, error: message };
  } finally {
    await connection?.end();
  }
}
