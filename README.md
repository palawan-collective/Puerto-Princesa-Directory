# IslaVista

IslaVista is a local tourism guide and business directory. The workbook and JSON seed contain 3,135 business records across 37 source fields.

Run with Node.js 22 or newer. From this directory:

```sh
npm ci
npm run local
```

The launcher selects a free port, starting at 3000, and opens the matching admin URL. It prints both the admin and directory addresses in the terminal. Local mode binds to your computer and opens the editor without a login. Keep the terminal open while you work.

Edits and uploads persist in `.local-data`. Keep that folder with your working copy. JSON backups include media metadata and use the files in local storage. Video uploads require FFmpeg and FFprobe. Live map tiles require an internet connection.

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` to verify changes. Playwright uses isolated test data. Outside local mode, the admin uses the session settings in `.env.example`.
