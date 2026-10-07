const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function setup() {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
  const DB_USER = process.env.DB_USER || 'root';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const DB_NAME = process.env.DB_NAME || 'heidiq';

  console.log('🔄 Connecting to MySQL at', `${DB_HOST}:${DB_PORT}...`);

  try {
    const adminConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    console.log('✅ Connected to MySQL server.');
    console.log(`📦 Creating database ${DB_NAME} if not exists...`);
    await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await adminConn.end();

    const db = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      multipleStatements: true,
    });

    const preferredSqlFiles = ['heidiq.sql', 'daily_attendance.sql'];
    const sqlPath = preferredSqlFiles.map((fileName) => path.join(__dirname, fileName)).find((candidate) => fs.existsSync(candidate)) || path.join(__dirname, 'heidiq.sql');
    if (fs.existsSync(sqlPath)) {
      const sqlDump = fs.readFileSync(sqlPath, 'utf8');
      console.log(`📝 Importing SQL dump from ${path.relative(process.cwd(), sqlPath)}...`);
      const tablesToDrop = ['chat_messages', 'chat_group_members', 'chat_groups', 'staff_warnings', 'attendance', 'password_reset_tokens', 'users'];
      for (const table of tablesToDrop) {
        await db.query(`DROP TABLE IF EXISTS \`${table}\`;`);
      }
      await db.query(sqlDump);
      await ensureStaffWarningsTable(db);
      await ensureAdminAttendanceInboxTable(db);
      await db.end();
      console.log('🎉 SQL dump imported successfully!');
      return;
    }

    console.log('🛠 Creating tables...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        real_name VARCHAR(100) NULL,
        nip VARCHAR(50) NULL,
        email VARCHAR(100) NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
        status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
        attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_username (username),
        INDEX idx_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [realNameColumn] = await db.query("SHOW COLUMNS FROM users LIKE 'real_name'");
    if (realNameColumn.length === 0) {
      await db.query('ALTER TABLE users ADD COLUMN real_name VARCHAR(100) NULL AFTER username');
    }
    const [nipColumn] = await db.query("SHOW COLUMNS FROM users LIKE 'nip'");
    if (nipColumn.length === 0) {
      await db.query('ALTER TABLE users ADD COLUMN nip VARCHAR(50) NULL AFTER real_name');
    }

    const [userAttendanceRoleColumn] = await db.query("SHOW COLUMNS FROM users LIKE 'attendance_role'");
    if (userAttendanceRoleColumn.length === 0) {
      await db.query("ALTER TABLE users ADD COLUMN attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT'");
    }

    const [emailColumn] = await db.query("SHOW COLUMNS FROM users LIKE 'email'");
    if (emailColumn.length > 0 && emailColumn[0].Null === 'NO') {
      await db.query('ALTER TABLE users MODIFY COLUMN email VARCHAR(100) NULL');
    }
    await db.query(
      "ALTER TABLE users MODIFY COLUMN attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT'"
    );

    await db.query(`
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

    const [attendanceRoleColumn] = await db.query("SHOW COLUMNS FROM attendance LIKE 'attendance_role'");
    if (attendanceRoleColumn.length === 0) {
      await db.query("ALTER TABLE attendance ADD COLUMN attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT' AFTER name");
    }
    await db.query(
      "ALTER TABLE attendance MODIFY COLUMN attendance_role ENUM('Pusat Kendali', 'PPKA', 'Masinis Madya', 'Masinis Muda', 'Masinis Pertama', 'CSOT', 'Security', 'Magang', 'PJL', 'Masa Pendidikan', 'MASINIS', 'PKD') NOT NULL DEFAULT 'CSOT'"
    );
    const [attendanceReasonColumn] = await db.query("SHOW COLUMNS FROM attendance LIKE 'attendance_reason'");
    if (attendanceReasonColumn.length === 0) {
      await db.query('ALTER TABLE attendance ADD COLUMN attendance_reason VARCHAR(1000) NULL AFTER status');
    }
    await db.query(`
      CREATE TABLE IF NOT EXISTS attendance_settings (
        id TINYINT UNSIGNED PRIMARY KEY,
        mode ENUM('AUTO', 'MANUAL') NOT NULL DEFAULT 'AUTO',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT chk_attendance_settings_singleton CHECK (id = 1)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query("INSERT IGNORE INTO attendance_settings (id, mode) VALUES (1, 'AUTO')");

    await db.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_reset_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ensureStaffWarningsTable(db);
    await ensureAdminAttendanceInboxTable(db);

    console.log('🌱 Checking seed admin account...');
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@dailyattendance.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const [existing] = await db.query('SELECT id FROM users WHERE username = ? OR email = ?', [adminUsername, adminEmail]);
    if (existing.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await db.query(
        'INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
        [adminUsername, adminEmail, hash, 'ADMIN', 'ACTIVE']
      );
      console.log(`✅ Default admin created: ${adminUsername} / ${adminPassword}`);
    } else {
      console.log('ℹ️ Admin user already exists.');
    }

    const [existingUser] = await db.query('SELECT id FROM users WHERE username = ?', ['user']);
    if (existingUser.length === 0) {
      const userHash = await bcrypt.hash('user123', 10);
      await db.query(
        'INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
        ['user', 'user@dailyattendance.local', userHash, 'USER', 'ACTIVE']
      );
      console.log('✅ Demo user created: user / user123');
    }

    await db.end();
    console.log('🎉 Database setup completed successfully!');
  } catch (err) {
    console.error('❌ Database setup error:', err.message);
    process.exit(1);
  }
}

setup();

async function ensureStaffWarningsTable(db) {
  await db.query(`
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
  const [readAtColumn] = await db.query("SHOW COLUMNS FROM staff_warnings LIKE 'read_at'");
  if (readAtColumn.length === 0) {
    await db.query('ALTER TABLE staff_warnings ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL AFTER reason');
  }

  async function ensureAdminAttendanceInboxTable(db) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_attendance_inbox (
        admin_id INT PRIMARY KEY,
        read_through_id INT NOT NULL DEFAULT 0,
        CONSTRAINT fk_admin_attendance_inbox_user FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      INSERT IGNORE INTO admin_attendance_inbox (admin_id, read_through_id)
      SELECT u.id, COALESCE((SELECT MAX(a.id) FROM attendance a), 0)
      FROM users u
      WHERE u.role = 'ADMIN'
    `);
  }
}
