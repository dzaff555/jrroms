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
  migrations: {
    table: 'users' | 'attendance' | 'staff_warnings' | 'staff_admin_chat_messages';
    column: string;
    definition: string;
  }[]
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

async function ensureChatDeletedAtIndex(dbPool: mysql.Pool) {
  const [indexes] = await dbPool.query<mysql.RowDataPacket[]>(
    'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    ['staff_admin_chat_messages', 'idx_staff_admin_chat_deleted_at']
  );

  if (indexes.length > 0) return;

  try {
    await dbPool.query(
      'CREATE INDEX idx_staff_admin_chat_deleted_at ON staff_admin_chat_messages (deleted_at)'
    );
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code !== 'ER_DUP_KEYNAME') throw error;
  }
}

async function ensureChatReplySchema(dbPool: mysql.Pool) {
  const [columns] = await dbPool.query<mysql.RowDataPacket[]>(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['staff_admin_chat_messages', 'reply_to_id']
  );
  if (columns.length === 0) {
    await dbPool.query(
      'ALTER TABLE staff_admin_chat_messages ADD COLUMN reply_to_id BIGINT UNSIGNED NULL AFTER sender_id'
    );
  }

  const [indexes] = await dbPool.query<mysql.RowDataPacket[]>(
    'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    ['staff_admin_chat_messages', 'idx_staff_admin_chat_reply_to']
  );
  if (indexes.length === 0) {
    await dbPool.query(
      'CREATE INDEX idx_staff_admin_chat_reply_to ON staff_admin_chat_messages (reply_to_id)'
    );
  }

  const [constraints] = await dbPool.query<mysql.RowDataPacket[]>(
    'SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    ['staff_admin_chat_messages', 'fk_staff_admin_chat_reply_to']
  );
  if (constraints.length === 0) {
    await dbPool.query(`
      ALTER TABLE staff_admin_chat_messages
      ADD CONSTRAINT fk_staff_admin_chat_reply_to
      FOREIGN KEY (reply_to_id) REFERENCES staff_admin_chat_messages(id) ON DELETE SET NULL
    `);
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
        nip VARCHAR(50) NULL,
        email VARCHAR(100) NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('USER', 'ADMIN', 'DEVELOPER') NOT NULL DEFAULT 'USER',
        status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
        attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT',
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
        attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT',
        discord_username VARCHAR(100) NOT NULL,
        roblox_username VARCHAR(100) NOT NULL,
        attendance_date DATE NOT NULL,
        attendance_time TIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Hadir',
        attendance_reason VARCHAR(1000) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT unique_user_daily_attendance UNIQUE (user_id, attendance_date),
        INDEX idx_attendance_date (attendance_date),
        INDEX idx_attendance_user_date (user_id, attendance_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS attendance_settings (
        id TINYINT UNSIGNED PRIMARY KEY,
        mode ENUM('AUTO', 'MANUAL') NOT NULL DEFAULT 'AUTO',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT chk_attendance_settings_singleton CHECK (id = 1)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(
      "INSERT IGNORE INTO attendance_settings (id, mode) VALUES (1, 'AUTO')"
    );

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
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS staff_admin_chat_messages (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        message VARCHAR(2000) NOT NULL,
        image_path VARCHAR(255) NULL,
        image_type VARCHAR(50) NULL,
        drawing_data LONGTEXT NULL,
        is_sticker BOOLEAN NOT NULL DEFAULT FALSE,
        deleted_at TIMESTAMP(6) NULL DEFAULT NULL,
        deleted_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_staff_admin_chat_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_staff_admin_chat_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_staff_admin_chat_sender (sender_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_favorite_stickers (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        source_message_id BIGINT UNSIGNED NULL,
        image_type VARCHAR(50) NOT NULL,
        image_data MEDIUMBLOB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_chat_favorite_sticker_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_chat_favorite_sticker_source FOREIGN KEY (source_message_id) REFERENCES staff_admin_chat_messages(id) ON DELETE SET NULL,
        UNIQUE KEY unique_chat_favorite_sticker_source (user_id, source_message_id),
        INDEX idx_chat_favorite_stickers_user (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_user_wallpapers (
        user_id INT PRIMARY KEY,
        image_type VARCHAR(50) NOT NULL,
        image_data MEDIUMBLOB NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_chat_user_wallpaper_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_user_chat_reads (
        user_id INT PRIMARY KEY,
        last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_chat_user_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_call_sessions (
        id CHAR(36) PRIMARY KEY,
        started_by INT NOT NULL,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL DEFAULT NULL,
        CONSTRAINT fk_chat_call_session_starter FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_chat_call_sessions_active (ended_at, started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_call_participants (
        session_id CHAR(36) NOT NULL,
        user_id INT NOT NULL,
        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (session_id, user_id),
        CONSTRAINT fk_chat_call_participant_session FOREIGN KEY (session_id) REFERENCES chat_call_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_chat_call_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_chat_call_participant_presence (session_id, left_at, last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_call_signals (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        session_id CHAR(36) NOT NULL,
        sender_id INT NOT NULL,
        target_id INT NOT NULL,
        signal_type ENUM('offer', 'answer', 'candidate') NOT NULL,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_chat_call_signal_session FOREIGN KEY (session_id) REFERENCES chat_call_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_chat_call_signal_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_chat_call_signal_target FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_chat_call_signals_target (session_id, target_id, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      INSERT IGNORE INTO chat_user_chat_reads (user_id, last_read_message_id)
      SELECT id, COALESCE((SELECT MAX(id) FROM staff_admin_chat_messages), 0)
      FROM users
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_presence (
        user_id INT PRIMARY KEY,
        last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_presence_last_seen (last_seen_at)
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
      { table: 'users', column: 'attendance_role', definition: "ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT'" },
      { table: 'users', column: 'real_name', definition: 'VARCHAR(100) NULL AFTER username' },
      { table: 'users', column: 'nip', definition: 'VARCHAR(50) NULL AFTER real_name' },
      { table: 'users', column: 'profile_photo', definition: 'LONGTEXT NULL' },
      { table: 'users', column: 'roblox_username', definition: 'VARCHAR(100) NULL' },
      { table: 'users', column: 'discord_username', definition: 'VARCHAR(100) NULL' },
      { table: 'users', column: 'profile_completed', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { table: 'attendance', column: 'attendance_role', definition: "ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT'" },
      { table: 'attendance', column: 'attendance_reason', definition: 'VARCHAR(1000) NULL AFTER status' },
      { table: 'staff_warnings', column: 'read_at', definition: 'TIMESTAMP NULL DEFAULT NULL AFTER reason' },
      { table: 'staff_admin_chat_messages', column: 'deleted_at', definition: 'TIMESTAMP(6) NULL DEFAULT NULL AFTER message' },
      { table: 'staff_admin_chat_messages', column: 'deleted_by', definition: 'INT NULL AFTER deleted_at' },
      { table: 'staff_admin_chat_messages', column: 'image_path', definition: 'VARCHAR(255) NULL AFTER message' },
      { table: 'staff_admin_chat_messages', column: 'image_type', definition: 'VARCHAR(50) NULL AFTER image_path' },
      { table: 'staff_admin_chat_messages', column: 'image_data', definition: 'MEDIUMBLOB NULL AFTER image_type' },
      { table: 'staff_admin_chat_messages', column: 'drawing_data', definition: 'LONGTEXT NULL AFTER image_data' },
      { table: 'staff_admin_chat_messages', column: 'is_sticker', definition: 'BOOLEAN NOT NULL DEFAULT FALSE AFTER image_data' },
      { table: 'staff_admin_chat_messages', column: 'is_voice_note', definition: 'BOOLEAN NOT NULL DEFAULT FALSE AFTER is_sticker' },
      { table: 'staff_admin_chat_messages', column: 'audio_duration_seconds', definition: 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_voice_note' },
    ]);
    await dbPool.query(
      "ALTER TABLE users MODIFY COLUMN attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT'"
    );
    await dbPool.query(
      "ALTER TABLE attendance MODIFY COLUMN attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT'"
    );
    await ensureChatDeletedAtIndex(dbPool);
    await ensureChatReplySchema(dbPool);
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
