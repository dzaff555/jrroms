-- ========================================================
-- Database Schema for Daily Attendance System
-- MySQL 8.0+ / MariaDB
-- ========================================================

CREATE DATABASE IF NOT EXISTS daily_attendance 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE daily_attendance;

-- Table: users
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: attendance
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  mode ENUM('AUTO', 'MANUAL') NOT NULL DEFAULT 'AUTO',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_attendance_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO attendance_settings (id, mode) VALUES (1, 'AUTO');

-- Table: staff warnings
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admin attendance inbox read cursor
CREATE TABLE IF NOT EXISTS admin_attendance_inbox (
  admin_id INT PRIMARY KEY,
  read_through_id INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_admin_attendance_inbox_user FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_admin_chat_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  reply_to_id BIGINT UNSIGNED NULL,
  message VARCHAR(2000) NOT NULL,
  image_path VARCHAR(255) NULL,
  image_type VARCHAR(50) NULL,
  image_data MEDIUMBLOB NULL,
  is_sticker BOOLEAN NOT NULL DEFAULT FALSE,
  is_voice_note BOOLEAN NOT NULL DEFAULT FALSE,
  audio_duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP(6) NULL DEFAULT NULL,
  deleted_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_admin_chat_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_admin_chat_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_staff_admin_chat_reply_to FOREIGN KEY (reply_to_id) REFERENCES staff_admin_chat_messages(id) ON DELETE SET NULL,
  INDEX idx_staff_admin_chat_sender (sender_id),
  INDEX idx_staff_admin_chat_deleted_at (deleted_at),
  INDEX idx_staff_admin_chat_reply_to (reply_to_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_user_wallpapers (
  user_id INT PRIMARY KEY,
  image_type VARCHAR(50) NOT NULL,
  image_data MEDIUMBLOB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_user_wallpaper_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_user_chat_reads (
  user_id INT PRIMARY KEY,
  last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_user_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO chat_user_chat_reads (user_id, last_read_message_id)
SELECT id, COALESCE((SELECT MAX(id) FROM staff_admin_chat_messages), 0)
FROM users;

CREATE TABLE IF NOT EXISTS user_presence (
  user_id INT PRIMARY KEY,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_presence_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS developer_task_completions (
  task_id INT NOT NULL,
  developer_id INT NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, developer_id),
  CONSTRAINT fk_developer_task_completion_task FOREIGN KEY (task_id) REFERENCES developer_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_developer_task_completion_user FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
