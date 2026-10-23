# Daily Attendance

## Production deployment: Neon PostgreSQL

The app uses PostgreSQL. In Vercel or Railway, configure these variables on the
server-side app service:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection URL (`postgresql://...`) |
| `JWT_SECRET` | A long, random secret unique to this deployment |
| `JWT_EXPIRES_IN` | `7d` |
| `NEXT_PUBLIC_APP_NAME` | `Daily Attendance` |
| `ADMIN_USERNAME` | Initial admin username |
| `ADMIN_EMAIL` | Initial admin email |
| `ADMIN_PASSWORD` | A strong initial admin password |

Copy `DATABASE_URL` from Neon’s **Connect** panel. The URL contains the host,
port, database, and credentials, so those do not need separate app settings.
Keep it and other secrets server-side; never prefix them with `NEXT_PUBLIC_`.
The app verifies TLS certificates when connecting with a URL.

To prepare a new Neon database, run `npm run db:setup` with `DATABASE_URL` set.
This creates or updates the schema without dropping tables or seeding demo
accounts. The app initializes its schema on startup as well.

The browser calls same-origin `/api/*` endpoints, so no separate API URL or CORS
setup is needed. If running on Railway, attach a persistent Volume for uploaded
task files and set `UPLOAD_DIR` to its mount path. Vercel’s local filesystem is
ephemeral, so uploads need persistent external storage there.

The **Lupa Password** form does not send email. It verifies the username and current
password, then saves the new password after confirmation. `NEXT_PUBLIC_APP_URL` is
optional and is only used for displaying the application URL in admin settings.
Email is no longer requested or displayed in account forms, profiles, or reports.
Existing email values remain in the database for users who still sign in with email.
When an administrator creates a user account, they can optionally enter the user's
real name. Users can also view and edit their own real name from their profile.
Administrators can see it in administrator user details and profiles, but one user
cannot view another user's real name and it is not included in session responses.
Users who do not yet have a completed profile must enter their real name during
first-login profile completion; they can update it later from their own profile.

Staff profiles count attendance records marked `Hadir`, missed Friday–Sunday
attendance days after each attendance window closes at 18.00 WIB (a same-day
account created at or after closing is not counted for that day), and recorded
admin warnings. Attendance statistics and reports use the same completed
Friday–Sunday attendance-window rule for absence counts. Admins can add a warning with a
required reason from the account profile; warning records are created automatically
when the app initializes the database.
Admins also receive inbox notifications when a user records a new attendance;
notifications are checked every 30 seconds and can be marked read from the bell menu.

Developer task files stream to `UPLOAD_DIR`; the app does not buffer whole files
in memory. Files may use any format, up to 1 GB each, and are only downloadable by
Admins through the authenticated app.
Chat photos (up to 5 MB) are stored in PostgreSQL so they are available across app
instances and user devices; older photos stored only on a local app filesystem still
require that original upload storage to remain available.

Admins can create User or Developer accounts, or change an existing account's
system role. Developer accounts do not have daily attendance and are not counted
in attendance statistics or absence reports. They can see tasks published from
**Tugas Developer** in the sidebar.

## Migrating existing MySQL data to Neon

Run the migration from a machine that can connect to both the existing MySQL
database and the empty Neon database. First prepare Neon with `npm run db:setup`,
then configure the source using either `MYSQL_URL` or `MYSQL_HOST`, `MYSQL_PORT`,
`MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`. Set `DATABASE_URL` to the
Neon URL and run:

```bash
npm run db:migrate:mysql
```

The migration copies supported application tables and IDs, preserves binary
values, and advances PostgreSQL sequences. It does not modify MySQL. The Neon
tables must be empty (apart from setup defaults); the script refuses to migrate
over existing application data, and the copy is transactional. Keep both
connection strings in local environment variables or an untracked `.env` file;
never commit or paste credentials into source control or logs.

## Local development

Set `DATABASE_URL` to a PostgreSQL URL in `.env` (Neon can be used for development),
plus the JWT and admin settings above. For local Developer task uploads, set
`UPLOAD_DIR` to a local directory. Do not commit `.env` or share its secrets.
`npm run db:setup` creates the schema; it does not import a dump or drop tables.

Then run:

```bash
npm install
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).
