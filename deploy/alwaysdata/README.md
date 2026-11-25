# Deploying to alwaysdata (tanvirs.alwaysdata.net)

The site runs as an alwaysdata **User program**: the static Linux binary listens on the `IP` and `PORT` alwaysdata provides, and alwaysdata's proxy serves it over HTTPS with its `*.alwaysdata.net` certificate.

```
~/portfolio/run.sh                 site command: loads .env, then runs the current release
~/portfolio/.env                   server settings incl. database URL and admin password (mode 600)
~/portfolio/releases/portfolio-*   uploaded binaries, last 5 kept
~/portfolio/current                symlink to the live release
```

Run the scripts from **Git Bash** on Windows, or any Linux/macOS shell. They need `curl`, `ssh`/`scp` and Python 3.

## 1. One-time setup

1. **Settings file.** Copy `alwaysdata.env.example` to `alwaysdata.env` in this folder. The copy is gitignored because it will hold your API key and passwords.
2. **API key.** In the alwaysdata panel, open **Profile > Tokens**, create a token, and put it in `ALWAYSDATA_API_KEY`.
3. **SSH.** In **Remote access > SSH**, enable password login for the `tanvirs` user and set a password. Check it works:
   ```sh
   ssh tanvirs@ssh-tanvirs.alwaysdata.net
   ```
   To avoid typing the password on every deploy, add your key: `ssh-copy-id tanvirs@ssh-tanvirs.alwaysdata.net`.
4. **Site.** Point the site at the binary:
   ```sh
   bash deploy/alwaysdata/setup-site.sh
   ```
   This makes the site for `tanvirs.alwaysdata.net` a User program running `/home/tanvirs/portfolio/run.sh`, with **Force HTTPS** on.

   To do it by hand instead: **Web > Sites**, edit the site for `tanvirs.alwaysdata.net` (or add one):
   - Type: **User program**
   - Command: `/home/tanvirs/portfolio/run.sh`
   - Working directory: `portfolio`
   - Environment: leave empty (settings come from `~/portfolio/.env`)
   - **SSL tab:** tick **Force HTTPS**

## 2. Deploy

```sh
bash deploy/alwaysdata/deploy.sh
```

The script:

1. Builds `bin/portfolio-linux-amd64`, which runs every test first.
2. Uploads the binary and `run.sh`, and writes `~/portfolio/.env`.
3. Switches the `current` symlink, so the switch is atomic.
4. Restarts the site through the API.
5. Waits for `/readyz`, then checks the home page and the contact API.

Other commands:

| Command | What it does |
|---|---|
| `SKIP_BUILD=1 bash deploy/alwaysdata/deploy.sh` | Upload the binary you already built |
| `bash deploy/alwaysdata/deploy.sh env` | Push changed settings (for example a new admin password) and restart |
| `bash deploy/alwaysdata/deploy.sh rollback` | Switch back to the previous release and restart |

Without an API key, the deploy still works, but you restart from the panel yourself: **Web > Sites > Restart**.

Logs are on the server under `~/admin/logs/sites/` (application output) and `~/admin/logs/http/` (access logs).

### Things to know about the platform

- **Listening address.** alwaysdata starts the site with `IP` and `PORT` set (for example `fd00::4a16` and `8100`) and proxies HTTPS traffic to exactly that address. `run.sh` keeps those values even if `.env` contains `IP`, `PORT` or `PORTFOLIO_ADDR`, and refuses to start without `PORT`. The startup log confirms it with a line like `listening addr=[fd00::4a16]:8100 source=IP/PORT`.

- **Idle sleep.** A site with no traffic for 30 minutes is stopped and starts again on the next request. The binary starts in well under a second, so visitors won't notice.
- **Restarts.** alwaysdata sends SIGTERM and allows 30 seconds. The server stops taking traffic and finishes in-flight requests within 15 seconds.
- **Free plan.** The plan gives 256 MB RAM, 1 GB disk shared with the database, and may not be used for profit. The server uses roughly 20 to 30 MB.
- **Visitor IPs.** `PORTFOLIO_TRUSTED_PROXIES` trusts only private network ranges, so the rate limiter sees real visitor IPs through alwaysdata's proxy. After the first deploy, check that `client_ip` in `~/admin/logs/sites/` shows public addresses.

## 3. Contact messages: PostgreSQL and the admin page

Contact form submissions are saved to PostgreSQL. You read and manage them at **https://tanvirs.alwaysdata.net/admin**, and reply from your own email. No email is sent by the site, and no address appears on it.

### Create the database (once)

1. In the alwaysdata panel, open **Databases > PostgreSQL > Add a database**. Name it `tanvirs_portfolio`.
2. In **Databases > PostgreSQL > Users**, add a user such as `tanvirs_portfolio` with a strong password, and give it full rights on that database.
3. Put the connection string in `alwaysdata.env`:
   ```sh
   DATABASE_URL="postgres://tanvirs_portfolio:<password>@postgresql-tanvirs.alwaysdata.net:5432/tanvirs_portfolio?sslmode=prefer"
   ```
   If the password has special characters, URL-encode them (for example `@` becomes `%40`).

The tables are created automatically on the first start. Migrations are embedded in the binary and run once.

### Set your admin login

In `alwaysdata.env`:

```sh
ADMIN_USERNAME=tanvir
ADMIN_PASSWORD="<at least 12 characters>"
```

The login is seeded into the database at startup, with the password stored as a bcrypt hash. To change it, edit `ADMIN_PASSWORD` and run `bash deploy/alwaysdata/deploy.sh env`; that also signs out every existing session.

### Using the admin page

- **Inbox:** every message, newest first, with tabs for New, Read, Replied and Archived, a search box, and CSV export.
- **Message:** opening it marks it read. **Reply by email** opens your mail app with the visitor's address, a subject and their message quoted. Then press **Mark as replied**.
- **Also:** a private note, archive, or permanent delete (with a confirmation step).

### Security

- Sessions use an HttpOnly, Secure, SameSite=Strict cookie, valid for 12 hours (`ADMIN_SESSION_HOURS`). Only a hash of the session token is stored.
- Every action is protected against cross-site requests.
- Logins are limited to 10 attempts per IP every 15 minutes, and failures are logged.
- `/admin` is excluded from search engines.

### If the database is down

The site keeps serving pages. The contact form switches to a short "unavailable, reach me on GitHub" note, and `/admin` returns the site's 404 page until the database is back and the site restarts.

## 4. Check it end to end

1. Open https://tanvirs.alwaysdata.net and confirm the padlock and the page load.
2. `deploy.sh` should end with `contact form enabled: {"enabled":true}`.
3. Submit the contact form, then sign in at https://tanvirs.alwaysdata.net/admin. The message should be at the top of the inbox.
4. If the form says it's unavailable, check the server log for `database unavailable`:
   ```sh
   ssh tanvirs@ssh-tanvirs.alwaysdata.net 'grep -h database ~/admin/logs/sites/* | tail'
   ```
   Most often the cause is a wrong password, or special characters that need URL-encoding in `DATABASE_URL`.
