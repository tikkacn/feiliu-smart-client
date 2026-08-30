# guide.uutec.net distribution sync

`update_feiliu_smart.py` mirrors the latest stable GitHub release to the
existing Cloudflare R2 bucket and publishes three backup-client records in the
guide site's SQLite database:

- Windows x64 (`.exe`)
- macOS Intel (`.dmg`)
- macOS Apple Silicon (`.dmg`)

The script deliberately requires all three release assets before changing the
database. It then uploads a short-lived `feiliu-smart/latest.json` manifest,
which the desktop client's manual update button reads.

Deploy the script beside the guide site's existing
`software_sync_common.py`. The server's existing R2 environment file provides
credentials; no credentials belong in this repository.

Enable the cron entry only after the first stable release exists:

```cron
*/10 * * * * cd /www/wwwroot/guide.uutec.net && /usr/bin/flock -n /tmp/feiliu-smart-sync.lock /usr/bin/python3 scripts/update_feiliu_smart.py >> data/software-sync/feiliu-smart.log 2>&1
```
