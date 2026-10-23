import { loadEnvConfig } from '@next/env';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { Pool } from 'pg';

loadEnvConfig(process.cwd());

const sourceUrl = process.env.MYSQL_URL?.trim();
const targetUrl = process.env.DATABASE_URL?.trim();
if (!targetUrl) {
  throw new Error('Set DATABASE_URL to the Neon PostgreSQL connection URL before migrating.');
}
if (!targetUrl.startsWith('postgres://') && !targetUrl.startsWith('postgresql://')) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
}
if (sourceUrl && !sourceUrl.startsWith('mysql://')) {
  throw new Error('MYSQL_URL must use the mysql:// protocol.');
}

const parsedSourceUrl = sourceUrl ? new URL(sourceUrl) : null;
const targetConnectionUrl = new URL(targetUrl);
targetConnectionUrl.searchParams.delete('sslmode');
targetConnectionUrl.searchParams.delete('channel_binding');
const target = new Pool({
  connectionString: targetConnectionUrl.toString(),
  ssl: { rejectUnauthorized: true },
  max: 1,
});

const source = parsedSourceUrl
  ? await mysql.createConnection({
      host: parsedSourceUrl.hostname,
      port: Number(parsedSourceUrl.port || 3306),
      user: decodeURIComponent(parsedSourceUrl.username),
      password: decodeURIComponent(parsedSourceUrl.password),
      database: decodeURIComponent(parsedSourceUrl.pathname.slice(1)),
      dateStrings: true,
    })
  : await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number.parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'defaultdb',
      dateStrings: true,
    });

const tableOrder = [
  'users',
  'password_reset_tokens',
  'chat_groups',
  'attendance',
  'attendance_settings',
  'staff_warnings',
  'admin_attendance_inbox',
  'admin_inbox_notifications',
  'staff_admin_chat_messages',
  'chat_favorite_stickers',
  'chat_user_wallpapers',
  'chat_user_chat_reads',
  'chat_call_sessions',
  'chat_call_settings',
  'chat_call_participants',
  'chat_call_signals',
  'user_presence',
  'developer_tasks',
  'developer_task_files',
  'developer_task_completions',
  'chat_group_members',
  'chat_messages',
] as const;

const seededTables = new Set([
  'attendance_settings',
  'chat_call_settings',
  'chat_user_chat_reads',
  'admin_attendance_inbox',
]);
const booleanColumns = new Set([
  'profile_completed',
  'used',
  'file_required',
  'is_sticker',
  'is_voice_note',
  'is_muted',
]);
const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

interface MigrationRow extends RowDataPacket {
  [column: string]: unknown;
}

async function migrate() {
  await source.query("SET time_zone = '+00:00'");
  const [sourceTables] = await source.query<(MigrationRow & { TABLE_NAME: string })[]>(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  );
  const sourceTableNames = new Set(sourceTables.map(({ TABLE_NAME }) => TABLE_NAME));
  if (!sourceTableNames.has('users')) {
    throw new Error('The selected MySQL database does not contain the required "users" table.');
  }
  const client = await target.connect();

  try {
    await client.query('BEGIN');

    for (const table of tableOrder) {
      const exists = await client.query(
        'SELECT to_regclass($1) AS table_name',
        [`public.${table}`]
      );
      if (!exists.rows[0]?.table_name) continue;
      const count = await client.query(`SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(table)}`);
      if (Number(count.rows[0].count) > 0 && !seededTables.has(table)) {
        throw new Error(
          `Target table "${table}" already contains data. Use an empty Neon database so existing rows are not overwritten.`
        );
      }
    }

    for (const table of seededTables) {
      const exists = await client.query('SELECT to_regclass($1) AS table_name', [`public.${table}`]);
      if (exists.rows[0]?.table_name) {
        await client.query(`DELETE FROM ${quoteIdentifier(table)}`);
      }
    }

    for (const table of tableOrder) {
      if (!sourceTableNames.has(table)) continue;
      const targetColumnsResult = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      const targetColumns = new Set(targetColumnsResult.rows.map(({ column_name }) => column_name));
      if (targetColumns.size === 0) {
        throw new Error(`Target table "${table}" is missing. Run npm run db:setup before migrating.`);
      }

      const batchSize = 100;
      let offset = 0;
      let migratedRows = 0;
      let columns: string[] | null = null;

      while (true) {
        const [rows] = await source.query<MigrationRow[]>(
          `SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`,
          [batchSize, offset]
        );
        if (rows.length === 0) break;
        if (columns === null) {
          columns = Object.keys(rows[0]).filter((column) => targetColumns.has(column));
          if (columns.length === 0) {
            throw new Error(`No matching columns were found for source table "${table}".`);
          }
        }
        if (columns === null) {
          throw new Error(`Could not determine the source columns for table "${table}".`);
        }

        const currentColumns = columns;
        const quotedColumns = currentColumns.map(quoteIdentifier).join(', ');
        const values: unknown[] = [];
        const valueGroups = rows.map((row) => {
          const placeholders = currentColumns.map((column) => {
            const value = row[column];
            values.push(
              booleanColumns.has(column) && value !== null && value !== undefined
                ? Boolean(value)
                : value
            );
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        await client.query(
          `INSERT INTO ${quoteIdentifier(table)} (${quotedColumns})
           VALUES ${valueGroups.join(', ')}`,
          values
        );
        migratedRows += rows.length;
        offset += rows.length;
        if (rows.length < batchSize) break;
      }

      if (columns?.includes('id') && migratedRows > 0) {
        const sequence = await client.query<{ sequence: string | null }>(
          "SELECT pg_get_serial_sequence($1, 'id') AS sequence",
          [`public.${table}`]
        );
        if (sequence.rows[0]?.sequence) {
          await client.query(
            `SELECT setval($1::regclass, (SELECT MAX(id) FROM ${quoteIdentifier(table)}), TRUE)`,
            [sequence.rows[0].sequence]
          );
        }
      }
      console.log(`${table}: ${migratedRows} rows`);
    }

    await client.query(
      "INSERT INTO attendance_settings (id, mode) VALUES (1, 'AUTO') ON CONFLICT (id) DO NOTHING"
    );
    await client.query(
      `INSERT INTO chat_call_settings (setting_key, setting_value)
       VALUES ('feature_enabled', 'true') ON CONFLICT (setting_key) DO NOTHING`
    );
    await client.query(`
      INSERT INTO chat_user_chat_reads (user_id, last_read_message_id)
      SELECT id, COALESCE((SELECT MAX(id) FROM staff_admin_chat_messages), 0)
      FROM users WHERE TRUE ON CONFLICT (user_id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO admin_attendance_inbox (admin_id, read_through_id)
      SELECT id, COALESCE((SELECT MAX(id) FROM attendance), 0)
      FROM users WHERE role = 'ADMIN' ON CONFLICT (admin_id) DO NOTHING
    `);
    await client.query('COMMIT');
    console.log('MySQL data migration completed. Source database was not modified.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await migrate();
} finally {
  await source.end();
  await target.end();
}
