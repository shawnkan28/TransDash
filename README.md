# TransDash

A self-hosted personal finance dashboard. Import your bank transactions, reconcile
them against your statements, track monthly and yearly budgets, and log new
spending from your phone.

Everything runs on your own machine: a Svelte front end, and a small SQLite API
served by the same Vite process. There is no separate backend to run and no
cloud service involved.

- **Front end:** Svelte 5, Tailwind CSS 4, Chart.js
- **Storage:** a single SQLite file, `data/transdash.sqlite` (via `node-sqlite3-wasm`, so no native build step)
- **Server:** Vite's dev or preview server, with the API added by `vite.sqlitePlugin.ts`

---

## Requirements

- **Node.js 22.12 or newer** (the Docker image uses Node 24)
- npm
- **Docker** (optional), for running it on a server such as a Raspberry Pi

---

## Setup

```bash
git clone <your repo url> TransDash
cd TransDash
npm install
```

The `data/` folder holds your database, backups and any CSVs you import. It is
created on first start and is **ignored by Git**, so your financial data never
ends up in the repository.

---

## Starting the app

### Development

```bash
npm run dev
```

Open <http://localhost:5173>. Changes to the code reload in the browser
straight away. The server also listens on your network, so a phone on the same
Wi-Fi can open `http://<your-pc's-ip>:5173`.

### Production (without Docker)

```bash
npm run build
npm run preview
```

Open <http://localhost:4173>. `preview` serves the built app from `dist/`
together with the same SQLite API.

### Production with Docker (e.g. Raspberry Pi)

Build the image on the machine that will run it:

```bash
docker build -t transdash:latest .
```

Then run it with Docker Compose. Save this as `docker-compose.yml`:

```yaml
services:
  app:
    container_name: transdash
    image: transdash:latest
    ports:
      - "8080:4173"
    restart: always
    environment:
      - SKIP_STARTUP_SCRIPT=1
    volumes:
      - ./data:/budgetapp/data
```

```bash
docker compose up -d
```

Open `http://<server>:8080`.

Two things to get right:

- **The volume must point at `/budgetapp/data`**, the app's working folder in
  the image. Mounting anywhere else leaves your data inside the container, where
  it can be lost when the container is recreated.
- **The container runs as root**, so files it creates in `./data` are owned by
  root on the host. To edit or copy them as yourself:

  ```bash
  sudo chown -R $USER:$USER data
  ```

### Opening it by a hostname

The dev and preview servers only answer to `localhost`, IP addresses and the
host names listed in `server.allowedHosts` in `vite.config.ts` (currently
`shawn-rpi`). Add any other name you browse to it by, such as a
`*.local` name or a reverse-proxy domain.

---

## First run: getting your data in

When the database has no transactions, the app opens on an **Import
Transactions** screen. Upload a CSV with these columns (see
`trans-example.csv` for a sample):

| Column | Example |
| :--- | :--- |
| Transaction ID | `i-doGaa_DeUC` |
| Note | `Bus/MRT` |
| Date | `2021-11-27T00:00:00.000000+08:00` |
| Value | `1.84` (always positive; the category decides income or expense) |
| Currency Code | `SGD` |
| Category | `Transportation` |
| Exchange Rate | `1.0` |
| Statement | `Jan-22` (blank if not yet reconciled) |
| Transaction Type | `Expense` or `Income` |
| Account Name | `OCBC 365` |
| Account Type | `Credit Card`, `Savings`, `Checking`, `Cash` or `Investment` |
| Category Group | `General` |
| Affect Cash Flow | `True` or `False` |

An upload **replaces** all transactions in the database with the file's
contents, so use it for the first import, not to add to existing data.

Then set up the rest in **Settings** (see below): your accounts and their
types, category rules, and your salary and budgets.

### Migrating from the old CSV/JSON files

Older versions kept data in `data/data.csv`, `data/categories.csv`,
`data/settings.json` and `data/start_balances.csv`. To move those into SQLite:

```bash
npm run migrate
```

It rebuilds the tables from the files and checks the result before saving. The
same import is available as **Settings → Data Management → Re-import from
data.csv**, which takes a backup first. After migrating, the running app no
longer reads those files.

---

## Using the app

### Dashboard

Your overall balance, income and expenses, with yearly cash-flow and
spending-habit charts.

### Review

Reconcile transactions against your bank or card statements. Statements are
named in `Mmm-YY` format, for example `Sep-26`.

- **By Account:** pick an account, choose the statement you have open, and
  assign each unassigned transaction to it (or use **Assign all**). Then type
  the statement's start and end balances; the app checks its computed end
  balance against yours. **New Entry** adds anything that is missing, prefilled
  with that account and statement.
- **All Unassigned:** every transaction without a statement, across accounts.
- **View Statement:** browse what is in a given statement.
- **View Summary:** balances per statement and account.

The **Review** badge in the sidebar counts transactions still to assign.

### Transactions

Search, filter and sort all transactions; edit or delete any of them.

### Budget & Expense

- **Travel Budget:** budget vs. actual spend for the Travel category group.
- **Daily Spendings:** set a target daily spend; days above it are flagged.
  Also shows total cash-flow expenses per month.
- **Monthly Budget:** this month's spending per budget, by category.
- **Yearly Budget:** yearly budgets and trends.

**How overspend is handled:** when a monthly budget goes over, the excess is
first taken from the leftover of budgets marked **Covers Overspend**, until
they are all at $0. Only then does it come out of **Savings**. Each budget that
absorbed some shows an "Includes $X overspend from other budgets" note.

### On your phone

Below tablet width the app switches to a phone layout:

- **Budget summary:** this month's (or year's) budgets with what is left; tap
  one to see the entries counted toward it.
- **This Week's Entries** and **scheduled payments that are due**.
- **The + button:** opens your **Quick Add Buttons** (prefilled note, category
  and amount), plus **Add Credit Card Payment**.

**Add Credit Card Payment** records paying a card bill from a savings account
in one step. Pick the savings account, the card, the amount and the date, and it
adds two entries:

| Account | Category | Type | Note |
| :--- | :--- | :--- | :--- |
| the credit card | Credit Card Balance | Income | `Pay CC Bill - From <savings account>` |
| the savings account | Credit Card Payment | Expense | `Pay For <card>` |

Tip: add the app to your home screen (Share → Add to Home Screen on iPhone,
Install app on Android) and it opens full screen like a native app.

### Settings

| Tab | What it is for |
| :--- | :--- |
| **Category Rules** | Each category's type (income/expense), group, whether it affects cash flow, and which monthly budget it counts toward |
| **Account** | Your accounts and their types. Type matters: card payments look for `Savings` and `Credit Card` accounts. Disable old accounts to hide them from pickers |
| **Statement Management** | The list of statement periods (`Mmm-YY`) |
| **Budgets** | Monthly salary; each monthly budget's share of it, whether it is Savings, and whether it **Covers Overspend**; yearly budgets |
| **Quick Add Buttons** | The phone shortcuts: label, default note, category and amount |
| **Scheduled** | Recurring payments (e.g. subscriptions) that appear as due on the phone for you to confirm |
| **Data Management** | Backups, restore, SQL exports and the CSV re-import |

### Light and dark mode

The app follows your device's light or dark setting. The **Dark Mode** switch
in the sidebar overrides it, and the choice is remembered in that browser.

---

## Backups

The app writes `data/transdash.backup.sql`, a plain SQL dump of the whole
database, every day at midnight, and keeps an undo point before any import or
restore. You can also back up, restore and download from **Settings → Data
Management**, or run:

```bash
npm run backup
```

These copies sit on the same disk as the database. Copy them somewhere else
too. See [docs/BACKUPS.md](docs/BACKUPS.md) for scheduling, restoring by hand
and off-box copies.

---

## Configuration

Set these as environment variables (in Docker, under `environment:`):

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `TZ` | host's zone (`Asia/Singapore` in Docker) | Timezone for the daily backup |
| `BACKUP_HOUR` | `0` | Hour of the day (0–23) to write the daily backup |
| `BACKUP_SCHEDULE` | on | `0` or `false` turns the daily backup off |
| `SKIP_STARTUP_SCRIPT` | off | `1` or `true` skips the startup script (set this in Docker) |
| `STARTUP_SCRIPT` | paths in `vite.config.ts` | A `.py` or `.ps1` script to run once when the server starts, e.g. a statement downloader. It receives `TRANS_SAVE_PATH`, the full path of the database |
| `PYTHON` / `POWERSHELL` | `python` / `powershell` | Interpreter used for the startup script |

---

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Development server on port 5173 |
| `npm run build` | Build the app into `dist/` |
| `npm run preview` | Serve the build, with the API, on port 4173 |
| `npm run check` | Type-check the project |
| `npm run migrate` | Import the old CSV/JSON files into SQLite |
| `npm run backup` | Write `data/transdash.backup.sql` now |

---

## Project layout

```text
src/            Svelte app (components, stores, helpers)
server/         SQLite schema, data access, backups, CSV migration
public/         Icons and the web app manifest
data/           Your database and backups (not in Git)
docs/           Further documentation
vite.*.ts       Vite config and the plugins that add the API and startup script
```

The database schema upgrades itself on start. New columns are added to an
existing `transdash.sqlite` automatically, so after updating the code just
restart the server.
