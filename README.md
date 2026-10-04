# Daily Attendance

## Production deployment: Vercel + Railway MySQL

- **Vercel** runs the complete Next.js app: the website and its `/api/*` route handlers.
- **Railway** runs the MySQL database only.
- The browser calls same-origin `/api/*` endpoints, so no separate API URL or CORS setup is needed.

### Vercel setup

Import this repository into Vercel as a Next.js project and deploy the `main` branch.
Vercel uses `npm run build` by default. In the Vercel project, open
**Settings → Environment Variables** and add:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Railway MySQL public connection URL, using the public host/port and ending in `/daily_attendance` |
| `JWT_SECRET` | A long, random secret unique to this deployment |
| `JWT_EXPIRES_IN` | `7d` |
| `NEXT_PUBLIC_APP_NAME` | `Daily Attendance` |
| `ADMIN_USERNAME` | Initial admin username |
| `ADMIN_EMAIL` | Initial admin email |
| `ADMIN_PASSWORD` | A strong initial admin password |
| `AZURE_STORAGE_ACCOUNT_NAME` | Azure Storage account name for Developer task uploads |
| `AZURE_STORAGE_ACCOUNT_KEY` | Server-only key for that account; never expose it to browser code |
| `AZURE_STORAGE_CONTAINER_NAME` | Optional private container name (defaults to `developer-task-submissions`) |

Add variables to the **Production** environment (and Preview/Development as needed),
then redeploy. Keep `DATABASE_URL`, `JWT_SECRET`, and passwords server-side; never
prefix them with `NEXT_PUBLIC_`. `NEXT_PUBLIC_APP_URL` is the website URL, not the
MySQL URL.

Set `DATABASE_URL` to the Railway MySQL **public TCP proxy** endpoint, with the
database name `daily_attendance` as the final URL path. Use the public proxy host
and port shown in Railway's MySQL service under **Settings → Networking → Public
Networking**. Do not use a Railway private hostname when connecting from Vercel.
Use a newly rotated password; never commit the URL to Git. The app uses the database
name in the URL. On first initialization, it creates the database and tables if
needed, so the MySQL account must have permission to create databases.

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

Developer task files are uploaded directly from the browser to a private Azure Blob
Storage container, avoiding Vercel's request-body limits. Configure the three
`AZURE_STORAGE_*` variables in Vercel Production (and Preview if needed); keep the
account key server-side. The app creates the configured container with public access
disabled. In the Storage account's Blob service CORS settings, allow the deployed
app's exact origin, the `PUT`, `GET`, `HEAD`, and `OPTIONS` methods, request headers
`*`, and expose `ETag`, `Content-Length`, and the `x-ms-*` response headers used by
the Azure client. Do not enable anonymous/public blob access. Each generated upload
SAS is scoped to one random blob and expires after four hours; download SAS URLs
expire after five minutes.

Admins can create User or Developer accounts, or change an existing account's
system role. Developer accounts use the same Friday–Sunday attendance rules and
attendance reports as User accounts, and can see tasks published from **Tugas
Developer** in the sidebar.

The Railway `absentes` app service is not needed when Vercel runs the full Next.js
application. Keep the Railway MySQL service running. Do not remove the app service
until the Vercel deployment has been verified.

## Local development

Make a local `.env` file with MySQL connection settings (`DATABASE_URL`, or
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`), plus the JWT and
admin settings above. Do not commit `.env` or share its secrets.

Make sure MySQL is reachable, then run:

```bash
npm install
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).
