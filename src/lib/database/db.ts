import { Pool, types, type PoolClient, type QueryResult } from 'pg';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const parsedDatabaseUrl = DATABASE_URL ? new URL(DATABASE_URL) : null;

if (parsedDatabaseUrl && !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
}

const connectionString = parsedDatabaseUrl
  ? (() => {
      const url = new URL(parsedDatabaseUrl);
      url.searchParams.delete('sslmode');
      url.searchParams.delete('channel_binding');
      return url.toString();
    })()
  : undefined;

const DATABASE_SCHEMA_VERSION = 7;
let pool: Pool | null = null;
let isInitialized = false;
let initializationPromise: Promise<{ success: boolean; message: string }> | null = null;

types.setTypeParser(20, (value) => Number(value));

type CompatibleQueryResult = QueryResult & { affectedRows: number };
type CompatibleConnection = {
  beginTransaction: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  query: (sql: string, params?: unknown[]) => Promise<[CompatibleQueryResult]>;
  release: () => void;
};
type CompatiblePool = {
  query: (sql: string, params?: unknown[]) => Promise<[CompatibleQueryResult]>;
  getConnection: () => Promise<CompatibleConnection>;
  end: () => Promise<void>;
};

function getDatabaseConfigurationError(): string | null {
  if (!DATABASE_URL && process.env.NODE_ENV === 'production') {
    return 'Production requires DATABASE_URL. Set your Neon PostgreSQL connection URL in the hosting provider environment settings, then redeploy.';
  }
  if (
    process.env.NODE_ENV === 'production' &&
    parsedDatabaseUrl &&
    ['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname.toLowerCase())
  ) {
    return 'Production PostgreSQL is configured to use localhost. Set DATABASE_URL to your Neon connection URL, then redeploy.';
  }
  return null;
}

function getRawPool(): Pool {
  if (!pool) {
    pool = new Pool({
      ...(connectionString ? { connectionString, ssl: { rejectUnauthorized: true } } : {}),
      host: process.env.DB_HOST || 'localhost',
      port: Number.parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || process.env.USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'defaultdb',
      max: process.env.VERCEL ? 1 : 5,
      idleTimeoutMillis: process.env.VERCEL ? 1_000 : 60_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

function compatibleResult(result: QueryResult): CompatibleQueryResult {
  return Object.assign(result, { affectedRows: result.rowCount ?? 0 });
}

export function getDbPool(): CompatiblePool {
  const rawPool = getRawPool();
  return {
    query: async (sql, params = []) => {
      const [statement, values] = toPostgresStatement(sql, params);
      return [compatibleResult(await rawPool.query(statement, values))];
    },
    getConnection: async () => {
      const client = await rawPool.connect();
      return {
        beginTransaction: async () => { await client.query('BEGIN'); },
        commit: async () => { await client.query('COMMIT'); },
        rollback: async () => { await client.query('ROLLBACK'); },
        query: async (sql, params = []) => {
          const [statement, values] = toPostgresStatement(sql, params);
          return [compatibleResult(await client.query(statement, values))];
        },
        release: () => client.release(),
      };
    },
    end: () => rawPool.end(),
  };
}

function toPostgresStatement(sql: string, params: unknown[]): [string, unknown[]] {
  const ignoreConflicts = /^\s*INSERT\s+IGNORE\s+INTO/i.test(sql);
  let statement = toPostgresSql(sql).trim().replace(/;$/, '');
  if (ignoreConflicts && !/\bON\s+CONFLICT\b/i.test(statement)) {
    const returningIndex = statement.search(/\s+RETURNING\b/i);
    if (returningIndex === -1) {
      statement += ' ON CONFLICT DO NOTHING';
    } else {
      statement = `${statement.slice(0, returningIndex)} ON CONFLICT DO NOTHING${statement.slice(returningIndex)}`;
    }
  }
  return [statement, params];
}

function toPostgresSql(sql: string): string {
  let parameterIndex = 0;
  let result = '';
  let quote: "'" | '"' | '`' | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      result += character;
      if (character === quote) {
        if (sql[index + 1] === quote) {
          result += sql[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character === '`' ? '"' : character;
      result += quote;
      continue;
    }
    if (character === '?') {
      parameterIndex += 1;
      result += `$${parameterIndex}`;
    } else {
      result += character;
    }
  }
  return result
    .replace(/DATE_FORMAT\(/gi, 'TO_CHAR(')
    .replace(/TIME_FORMAT\(/gi, 'TO_CHAR(')
    .replace(/'%Y/g, "'YYYY")
    .replace(/%Y/g, 'YYYY')
    .replace(/%m/g, 'MM')
    .replace(/%d/g, 'DD')
    .replace(/%H/g, 'HH24')
    .replace(/%i/g, 'MI')
    .replace(/%s/g, 'SS')
    .replace(/%f/g, 'US')
    .replace(/INSERT\s+IGNORE\s+INTO/gi, 'INSERT INTO')
    .replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/CONVERT_TZ\(([^,()]+),\s*(?:@@session\.time_zone|'UTC'),\s*'\+07:00'\)/gi, "($1 AT TIME ZONE 'Asia/Jakarta')")
    .replace(/@@session\.time_zone/gi, "'UTC'")
    .replace(/DAYOFWEEK\(([^()]*)\)/gi, '(EXTRACT(DOW FROM $1)::INTEGER + 1)')
    .replace(/INTERVAL\s+(\d+)\s+(SECOND|MINUTE|HOUR|DAY)\b/gi, "INTERVAL '$1 $2'")
    .replace(/DATE_SUB\((CURRENT_TIMESTAMP|[\w.]+),\s*(INTERVAL\s+'[^']+')\)/gi, '$1 - $2')
    .replace(/LOCATE\((LOWER\(\$[0-9]+\)),\s*(LOWER\([^)]*\))\)\s*>\s*0/gi, 'POSITION($1 IN $2) > 0');
}

async function ensureSchema(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_schema_meta (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      schema_version SMALLINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_change_versions (
      category VARCHAR(32) PRIMARY KEY,
      version BIGINT NOT NULL DEFAULT 0
    );
    INSERT INTO app_change_versions (category) VALUES
      ('users'), ('attendance'), ('warnings'), ('adminInbox'), ('taskData'), ('appData')
    ON CONFLICT (category) DO NOTHING;
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      real_name VARCHAR(100),
      nip VARCHAR(50),
      email VARCHAR(100) UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'DEVELOPER')),
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
      disabled_at TIMESTAMPTZ,
      attendance_role VARCHAR(40) NOT NULL DEFAULT 'CSOT',
      absence_reset_date DATE,
      profile_photo TEXT,
      roblox_username VARCHAR(100),
      discord_username VARCHAR(100),
      profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      attendance_role VARCHAR(40) NOT NULL DEFAULT 'CSOT',
      discord_username VARCHAR(100) NOT NULL,
      roblox_username VARCHAR(100) NOT NULL,
      attendance_date DATE NOT NULL,
      attendance_time TIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Hadir',
      attendance_reason VARCHAR(1000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_user_daily_attendance UNIQUE (user_id, attendance_date)
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, attendance_date);
    CREATE TABLE IF NOT EXISTS attendance_settings (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      mode VARCHAR(8) NOT NULL DEFAULT 'AUTO' CHECK (mode IN ('AUTO', 'MANUAL')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS staff_warnings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason VARCHAR(1000) NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_staff_warnings_user_created ON staff_warnings(user_id, created_at);
    CREATE TABLE IF NOT EXISTS admin_attendance_inbox (
      admin_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      read_through_id INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS admin_inbox_notifications (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_key VARCHAR(100) NOT NULL,
      title VARCHAR(180) NOT NULL,
      message VARCHAR(1000) NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_admin_inbox_event UNIQUE (admin_id, event_key)
    );
    CREATE INDEX IF NOT EXISTS idx_admin_inbox_notifications_created ON admin_inbox_notifications(admin_id, created_at);
    CREATE TABLE IF NOT EXISTS staff_admin_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reply_to_id BIGINT REFERENCES staff_admin_chat_messages(id) ON DELETE SET NULL,
      message VARCHAR(2000) NOT NULL,
      image_path VARCHAR(255),
      image_type VARCHAR(50),
      image_data BYTEA,
      drawing_data TEXT,
      is_sticker BOOLEAN NOT NULL DEFAULT FALSE,
      is_voice_note BOOLEAN NOT NULL DEFAULT FALSE,
      audio_duration_seconds INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMPTZ,
      deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_staff_admin_chat_sender ON staff_admin_chat_messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_staff_admin_chat_deleted_at ON staff_admin_chat_messages(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_staff_admin_chat_reply_to ON staff_admin_chat_messages(reply_to_id);
    CREATE TABLE IF NOT EXISTS chat_favorite_stickers (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_message_id BIGINT REFERENCES staff_admin_chat_messages(id) ON DELETE SET NULL,
      image_type VARCHAR(50) NOT NULL,
      image_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_chat_favorite_sticker_source UNIQUE (user_id, source_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_favorite_stickers_user ON chat_favorite_stickers(user_id, created_at);
    CREATE TABLE IF NOT EXISTS chat_user_wallpapers (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      image_type VARCHAR(50) NOT NULL,
      image_data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_user_chat_reads (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_call_sessions (
      id CHAR(36) PRIMARY KEY,
      started_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_active ON chat_call_sessions(ended_at, started_at);
    CREATE TABLE IF NOT EXISTS chat_call_settings (
      setting_key VARCHAR(64) PRIMARY KEY,
      setting_value VARCHAR(16) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_call_participants (
      session_id CHAR(36) NOT NULL REFERENCES chat_call_sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_version BIGINT NOT NULL DEFAULT 0,
      is_muted BOOLEAN NOT NULL DEFAULT TRUE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      left_at TIMESTAMPTZ,
      kicked_at TIMESTAMPTZ,
      PRIMARY KEY (session_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_call_participant_presence ON chat_call_participants(session_id, left_at, last_seen_at);
    CREATE TABLE IF NOT EXISTS chat_call_signals (
      id BIGSERIAL PRIMARY KEY,
      session_id CHAR(36) NOT NULL REFERENCES chat_call_sessions(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      signal_type VARCHAR(16) NOT NULL CHECK (signal_type IN ('offer', 'answer', 'candidate')),
      payload TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_call_signals_target ON chat_call_signals(session_id, target_id, id);
    CREATE TABLE IF NOT EXISTS user_presence (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen_at);
    CREATE TABLE IF NOT EXISTS developer_tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(16) NOT NULL CHECK (category IN ('MODELLING', 'SCRIPTING')),
      file_required BOOLEAN NOT NULL DEFAULT FALSE,
      starts_on DATE NOT NULL,
      ends_on DATE NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_developer_tasks_dates ON developer_tasks(starts_on, ends_on);
    CREATE INDEX IF NOT EXISTS idx_developer_tasks_category ON developer_tasks(category);
    CREATE TABLE IF NOT EXISTS developer_task_files (
      id BIGSERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES developer_tasks(id) ON DELETE CASCADE,
      developer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blob_name VARCHAR(500) NOT NULL UNIQUE,
      original_name VARCHAR(255) NOT NULL,
      content_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
      byte_size BIGINT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UPLOADING', 'COMPLETE')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      uploaded_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_developer_task_files_owner ON developer_task_files(developer_id, task_id, status);
    CREATE TABLE IF NOT EXISTS developer_task_completions (
      task_id INTEGER NOT NULL REFERENCES developer_tasks(id) ON DELETE CASCADE,
      developer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, developer_id)
    );
    CREATE TABLE IF NOT EXISTS chat_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(255),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_chat_group_member UNIQUE (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE OR REPLACE FUNCTION record_app_change() RETURNS TRIGGER AS $$
    BEGIN
      UPDATE app_change_versions
      SET version = version + 1
      WHERE category = TG_ARGV[0];
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS users_record_app_change ON users;
    CREATE TRIGGER users_record_app_change AFTER INSERT OR UPDATE OR DELETE ON users
      FOR EACH ROW EXECUTE FUNCTION record_app_change('users');
    DROP TRIGGER IF EXISTS attendance_record_app_change ON attendance;
    CREATE TRIGGER attendance_record_app_change AFTER INSERT OR UPDATE OR DELETE ON attendance
      FOR EACH ROW EXECUTE FUNCTION record_app_change('attendance');
    DROP TRIGGER IF EXISTS warnings_record_app_change ON staff_warnings;
    CREATE TRIGGER warnings_record_app_change AFTER INSERT OR UPDATE OR DELETE ON staff_warnings
      FOR EACH ROW EXECUTE FUNCTION record_app_change('warnings');
    DROP TRIGGER IF EXISTS admin_attendance_inbox_record_app_change ON admin_attendance_inbox;
    CREATE TRIGGER admin_attendance_inbox_record_app_change AFTER INSERT OR UPDATE OR DELETE ON admin_attendance_inbox
      FOR EACH ROW EXECUTE FUNCTION record_app_change('adminInbox');
    DROP TRIGGER IF EXISTS admin_inbox_notifications_record_app_change ON admin_inbox_notifications;
    CREATE TRIGGER admin_inbox_notifications_record_app_change AFTER INSERT OR UPDATE OR DELETE ON admin_inbox_notifications
      FOR EACH ROW EXECUTE FUNCTION record_app_change('adminInbox');
    DROP TRIGGER IF EXISTS developer_tasks_record_app_change ON developer_tasks;
    CREATE TRIGGER developer_tasks_record_app_change AFTER INSERT OR UPDATE OR DELETE ON developer_tasks
      FOR EACH ROW EXECUTE FUNCTION record_app_change('taskData');
    DROP TRIGGER IF EXISTS developer_task_files_record_app_change ON developer_task_files;
    CREATE TRIGGER developer_task_files_record_app_change AFTER INSERT OR UPDATE OR DELETE ON developer_task_files
      FOR EACH ROW EXECUTE FUNCTION record_app_change('taskData');
    DROP TRIGGER IF EXISTS developer_task_completions_record_app_change ON developer_task_completions;
    CREATE TRIGGER developer_task_completions_record_app_change AFTER INSERT OR UPDATE OR DELETE ON developer_task_completions
      FOR EACH ROW EXECUTE FUNCTION record_app_change('taskData');
    DROP TRIGGER IF EXISTS attendance_settings_record_app_change ON attendance_settings;
    CREATE TRIGGER attendance_settings_record_app_change AFTER INSERT OR UPDATE OR DELETE ON attendance_settings
      FOR EACH ROW EXECUTE FUNCTION record_app_change('appData');
    DROP TRIGGER IF EXISTS users_set_updated_at ON users;
    CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS attendance_settings_set_updated_at ON attendance_settings;
    CREATE TRIGGER attendance_settings_set_updated_at BEFORE UPDATE ON attendance_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS chat_user_wallpapers_set_updated_at ON chat_user_wallpapers;
    CREATE TRIGGER chat_user_wallpapers_set_updated_at BEFORE UPDATE ON chat_user_wallpapers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS chat_user_chat_reads_set_updated_at ON chat_user_chat_reads;
    CREATE TRIGGER chat_user_chat_reads_set_updated_at BEFORE UPDATE ON chat_user_chat_reads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS developer_tasks_set_updated_at ON developer_tasks;
    CREATE TRIGGER developer_tasks_set_updated_at BEFORE UPDATE ON developer_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS real_name VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS nip VARCHAR(50);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS absence_reset_date DATE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS roblox_username VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_role VARCHAR(40) NOT NULL DEFAULT 'CSOT';
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_reason VARCHAR(1000);
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES staff_admin_chat_messages(id) ON DELETE SET NULL;
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS image_data BYTEA;
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS drawing_data TEXT;
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS is_sticker BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS is_voice_note BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS audio_duration_seconds INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE staff_admin_chat_messages ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE staff_warnings ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
    ALTER TABLE chat_call_participants ADD COLUMN IF NOT EXISTS connection_version BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE chat_call_participants ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE chat_call_participants ADD COLUMN IF NOT EXISTS kicked_at TIMESTAMPTZ;
  `);

  await client.query(
    `UPDATE users
     SET disabled_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
     WHERE status = 'DISABLED' AND disabled_at IS NULL`
  );

  const chatBooleanColumns = await client.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'staff_admin_chat_messages'
       AND column_name IN ('is_sticker', 'is_voice_note')`
  );
  for (const { column_name, data_type } of chatBooleanColumns.rows) {
    if (data_type === 'boolean') continue;

    const invalidValues = await client.query(
      `SELECT 1 FROM staff_admin_chat_messages
       WHERE ${column_name} IS NOT NULL
         AND LOWER(${column_name}::text) NOT IN ('1', 'true', 't', 'yes', 'on', '0', 'false', 'f', 'no', 'off')
       LIMIT 1`
    );
    if (invalidValues.rowCount) {
      throw new Error(`Cannot migrate staff_admin_chat_messages.${column_name}: unexpected boolean value.`);
    }

    await client.query(
      `ALTER TABLE staff_admin_chat_messages
       ALTER COLUMN ${column_name} DROP DEFAULT`
    );
    await client.query(
      `ALTER TABLE staff_admin_chat_messages
       ALTER COLUMN ${column_name} TYPE BOOLEAN
       USING CASE
         WHEN ${column_name} IS NULL THEN NULL
         WHEN LOWER(${column_name}::text) IN ('1', 'true', 't', 'yes', 'on') THEN TRUE
         ELSE FALSE
       END`
    );
    await client.query(
      `ALTER TABLE staff_admin_chat_messages
       ALTER COLUMN ${column_name} SET DEFAULT FALSE`
    );
  }

  const profileCompletedColumn = await client.query<{ data_type: string }>(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'users'
       AND column_name = 'profile_completed'`
  );
  if (profileCompletedColumn.rows[0]?.data_type !== 'boolean') {
    const invalidValues = await client.query(
      `SELECT 1 FROM users
       WHERE profile_completed IS NOT NULL
         AND LOWER(profile_completed::text) NOT IN ('1', 'true', 't', 'yes', 'on', '0', 'false', 'f', 'no', 'off')
       LIMIT 1`
    );
    if (invalidValues.rowCount) {
      throw new Error('Cannot migrate users.profile_completed: unexpected boolean value.');
    }

    await client.query('ALTER TABLE users ALTER COLUMN profile_completed DROP DEFAULT');
    await client.query(`
      ALTER TABLE users
      ALTER COLUMN profile_completed TYPE BOOLEAN
      USING CASE
        WHEN profile_completed IS NULL THEN FALSE
        WHEN LOWER(profile_completed::text) IN ('1', 'true', 't', 'yes', 'on') THEN TRUE
        ELSE FALSE
      END
    `);
    await client.query(`
      ALTER TABLE users
      ALTER COLUMN profile_completed SET DEFAULT FALSE,
      ALTER COLUMN profile_completed SET NOT NULL
    `);
  }

  await client.query("INSERT INTO attendance_settings (id, mode) VALUES (1, 'AUTO') ON CONFLICT (id) DO NOTHING");
  await client.query(`
    INSERT INTO chat_call_settings (setting_key, setting_value)
    VALUES ('feature_enabled', 'true')
    ON CONFLICT (setting_key) DO NOTHING
  `);
  await client.query(`
    INSERT INTO chat_user_chat_reads (user_id, last_read_message_id)
    SELECT id, COALESCE((SELECT MAX(id) FROM staff_admin_chat_messages), 0)
    FROM users WHERE TRUE
    ON CONFLICT (user_id) DO NOTHING
  `);
  await client.query(`
    INSERT INTO admin_attendance_inbox (admin_id, read_through_id)
    SELECT u.id, COALESCE((SELECT MAX(a.id) FROM attendance a), 0)
    FROM users u WHERE u.role = 'ADMIN'
    ON CONFLICT (admin_id) DO NOTHING
  `);
  await client.query(
    `INSERT INTO app_schema_meta (id, schema_version)
     VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET schema_version = EXCLUDED.schema_version, updated_at = CURRENT_TIMESTAMP`,
    [DATABASE_SCHEMA_VERSION]
  );
}

async function initializeDatabase(): Promise<{ success: boolean; message: string }> {
  const configurationError = getDatabaseConfigurationError();
  if (configurationError) {
    console.error(`[PostgreSQL Configuration Error] ${configurationError}`);
    return { success: false, message: configurationError };
  }

  const client = await getRawPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('jrroms'), hashtext('schema-init'))");
    await ensureSchema(client);

    if (process.env.SKIP_DATABASE_SEED !== 'true') {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@dailyattendance.local';
      const existingAdmins = await client.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1',
        [adminUsername, adminEmail]
      );
      if (existingAdmins.rowCount === 0) {
        const hashedAdminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
        await client.query(
          `INSERT INTO users (username, email, password, role, status, attendance_role, profile_completed)
           VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE', 'CSOT', TRUE)`,
          [adminUsername, adminEmail, hashedAdminPassword]
        );
      }

      const existingUsers = await client.query('SELECT id FROM users WHERE username = $1 LIMIT 1', ['user']);
      if (existingUsers.rowCount === 0) {
        const hashedUserPassword = await bcrypt.hash('user123', 10);
        await client.query(
          `INSERT INTO users (username, email, password, role, status, attendance_role, profile_completed, roblox_username, discord_username)
           VALUES ('user', 'user@dailyattendance.local', $1, 'USER', 'ACTIVE', 'CSOT', TRUE, 'demo-roblox', 'demo-discord')`,
          [hashedUserPassword]
        );
      }
    }
    await client.query('COMMIT');
    isInitialized = true;
    return { success: true, message: 'PostgreSQL schema is up to date' };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'PostgreSQL schema initialization failed.';
    console.error('[PostgreSQL Initialization Error]:', error);
    return { success: false, message };
  } finally {
    client.release();
  }
}

export function initDatabase(): Promise<{ success: boolean; message: string }> {
  if (isInitialized) return Promise.resolve({ success: true, message: 'Database already initialized' });
  if (!initializationPromise) {
    initializationPromise = initializeDatabase().finally(() => {
      initializationPromise = null;
    });
  }
  return initializationPromise;
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  if (!isInitialized) {
    const initialization = await initDatabase();
    if (!initialization.success) throw new Error(initialization.message);
  }

  const [statement] = toPostgresStatement(sql, params);
  const [result] = await getDbPool().query(statement, params);
  if (/^\s*(SELECT|WITH)\b/i.test(statement)) return result.rows as T;
  if (result.rows.length > 0) {
    return {
      insertId: result.rows[0].id,
      affectedRows: result.rowCount ?? result.rows.length,
      ...result.rows[0],
    } as T;
  }
  return { affectedRows: result.rowCount ?? 0 } as T;
}

export async function testConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const configurationError = getDatabaseConfigurationError();
    if (configurationError) {
      console.error(`[PostgreSQL Configuration Error] ${configurationError}`);
      return { connected: false, error: configurationError };
    }
    await getRawPool().query('SELECT 1');
    return { connected: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PostgreSQL connection failed.';
    const code =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'UNKNOWN';
    console.error(`[PostgreSQL Connection Error] ${code}: ${message}`);
    return { connected: false, error: message };
  }
}
