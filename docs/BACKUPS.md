# Backups

The database is a single file, `data/transdash.sqlite`. Everything below is
about getting consistent copies of it and getting them somewhere safe.

## What a backup is

A plain **SQL dump** — the same thing `sqlite3 mydb .dump` produces, generated
in JS because the `sqlite3` CLI is not installed here and is not in the Alpine
image either.

Text is the durable format: greppable, diffable, compressible, and replayable by
any SQLite version, or by anything else that speaks SQL. The `.sqlite` file is
only ever a rebuildable convenience.

Each dump is written to a `.partial` name and renamed on completion, so an
interrupted write cannot leave a truncated file that looks usable.

## The daily backup

`data/transdash.backup.sql` — one file, same name, **rewritten every day at
00:00 local time**. There is no rotation and nothing accumulates; yesterday's
copy is replaced.

Pressing **Back up now** in Settings rewrites the same file rather than adding
another.

| Variable | Default | Effect |
|---|---|---|
| `TZ` | host's zone | The timezone `BACKUP_HOUR` is measured in |
| `BACKUP_HOUR` | `0` | Hour of the day to write it, 0-23 |
| `BACKUP_SCHEDULE` | on | Set to `0` or `false` to switch the daily run off |

### Which midnight?

`BACKUP_HOUR` is interpreted in the **server process's** timezone, not the
browser's. That is the host's zone for `npm run dev` and `npm run preview`, and
whatever `TZ` says in Docker.

This matters because `node:*-alpine` ships no timezone data: without `tzdata`
installed the process runs in UTC whatever `TZ` is set to, so a `00:00` backup
quietly happens at 08:00 in Singapore. The Dockerfile installs `tzdata` and sets
`TZ=Asia/Singapore` for that reason.

The Settings page names the zone it is actually using, so this can always be
checked rather than assumed.

```bash
BACKUP_HOUR=3 npm run preview      # 03:00 instead of midnight
BACKUP_SCHEDULE=0 npm run preview  # no automatic backup
```

The schedule re-arms by recomputing the delay to the next occurrence after each
run, rather than repeating a fixed 24h interval, so it stays on the wall clock
across DST changes.

If the app was not running at the scheduled hour, it writes one on the next
start when the existing file is not from today, rather than waiting a full day.

## Generating a file yourself

**Settings → Data Management → Generate a SQL file.** Type a name (or take the
suggested timestamped one) and it writes `data/<name>.sql` — the same dump the
daily backup uses, but yours to keep, move or delete.

These are listed with a download and a delete button, and are never touched by
the daily run. Writing over an existing one asks first.

Names are restricted to letters, numbers, dots, dashes and underscores; `.sql`
is added if you leave it off. Any directory part is dropped, so an export always
lands in `data/`, and the app's own filenames are refused.

## Undo points

Separate from the daily backup, and kept in `data/backups/` under timestamped
names so that a destructive action can never overwrite the file you would
actually reach for:

| Name | Written |
|---|---|
| `transdash-<timestamp>-pre-import.sql` | before a re-import from `data.csv` |
| `transdash-<timestamp>-pre-restore.sql` | before restoring any backup |

The newest 14 are kept; older ones are pruned.

## Scheduling from outside the app

The built-in timer only runs while the server does. To have the schedule survive
the app being down, switch it off and drive it from cron instead:

```bash
crontab -e
```

```cron
# Rewrite data/transdash.backup.sql every day at midnight.
0 0 * * * cd /home/shawn/dev/TransDash && /usr/bin/npm run backup >> /home/shawn/transdash-backup.log 2>&1
```

`npm run backup` writes the same file the schedule does.

## Restoring

**Settings → Data Management → Backups → Restore.**

The dump is first replayed into a throwaway database and integrity-checked, and
only then swapped into place — so a truncated or corrupt dump is refused while
the live database is still untouched. A `pre-restore` dump is written first, so
restoring the wrong backup is itself undoable.

### Restoring by hand

A dump is just SQL, so nothing about this depends on the app:

```bash
# With the sqlite3 CLI, wherever you have it:
sqlite3 restored.sqlite < transdash-2026-09-24T03-00-00-000Z-daily.sql

# Then put it in place with the server stopped:
cp restored.sqlite data/transdash.sqlite
```

You can also just read it. `grep` a note, `diff` two dumps to see what changed
between days, or load it into any other SQL database.

## Off-box copies

**Everything above lives on the same disk as the database.** It protects against
a bad import, a mistaken delete or corruption — not against the SD card failing
or the Pi being lost. For that, copy the snapshots somewhere else:

```cron
# After the nightly dump, copy it to another machine.
30 0 * * * rsync -a /home/shawn/dev/TransDash/data/transdash.backup.sql user@nas:/backups/transdash/
```

Dumps compress well if you are storing many of them:

```bash
gzip -k data/backups/*.sql      # ~1.6 MB -> a few hundred KB each
```

The **Download** button next to each backup does the same thing by hand, which
is useful for pulling a copy onto a phone or laptop.
