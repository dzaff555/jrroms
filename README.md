# Daily Attendance

## Production deployment: Railway

- **Railway** runs the Next.js app; the MySQL database can be hosted by a separate provider.
- The browser calls same-origin `/api/*` endpoints, so no separate API URL or CORS setup is needed.

### Railway setup

Configure the following variables in the Railway app service:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | MySQL connection URL, including host, port, username, password, and database name |
| `JWT_SECRET` | A long, random secret unique to this deployment |
| `JWT_EXPIRES_IN` | `7d` |
| `NEXT_PUBLIC_APP_NAME` | `Daily Attendance` |
| `ADMIN_USERNAME` | Initial admin username |
| `ADMIN_EMAIL` | Initial admin email |
| `ADMIN_PASSWORD` | A strong initial admin password |
| `UPLOAD_DIR` | `/app/uploads`, matching the Railway persistent Volume mount path |

Attach a Railway Volume to the **app service**, mounted at `/app/uploads`, and set
`UPLOAD_DIR=/app/uploads`. The volume preserves task files across deploys and restarts.
Without it, uploaded files on the container filesystem may be lost. Keep
`DATABASE_URL`, `JWT_SECRET`, and passwords server-side; never prefix them with
`NEXT_PUBLIC_`.

Set `DATABASE_URL` to the database provider's connection URL and URL-encode any
reserved characters in the username or password. For providers that require SSL,
add `?ssl-mode=REQUIRED` to `DATABASE_URL`. The trusted provider CA certificate
is bundled with the server-side app, so it does not need a separate environment
variable. The app verifies the database certificate and uses the database name
in the URL.
On first initialization, it creates the tables if needed; it only attempts to create
the database when the URL does not already select one.

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

Developer task files upload directly to the Railway app and stream onto its
persistent Volume; the app does not buffer whole files in memory. Files may use any
format, up to 1 GB each, and are only downloadable by Admins through the authenticated
app.
Chat photos (up to 5 MB) are stored in MySQL so they are available across app
instances and user devices; older photos stored only on a local app filesystem still
require that original upload storage to remain available.

Admins can create User or Developer accounts, or change an existing account's
system role. Developer accounts do not have daily attendance and are not counted
in attendance statistics or absence reports. They can see tasks published from
**Tugas Developer** in the sidebar.

## Local development

Make a local `.env` file with MySQL connection settings in `DATABASE_URL`, plus
the JWT and admin settings above. For local Developer task uploads, set
`UPLOAD_DIR` to a local directory.
Do not commit `.env` or share its secrets. `npm run db:setup` imports the bundled
SQL dump by dropping existing tables, so set `DB_ALLOW_RESET=true` only when you
intentionally want to replace the selected database contents.

Make sure MySQL is reachable, then run:

```bash
npm install
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).
