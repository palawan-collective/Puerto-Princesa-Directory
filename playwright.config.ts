import {defineConfig} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

process.env.ISLAVISTA_TEST_PASSWORD||=randomBytes(20).toString('base64url');
const data=process.env.ISLAVISTA_TEST_DATA||mkdtempSync(join(tmpdir(),'islavista-e2e-'));
const port=Number(process.env.ISLAVISTA_TEST_PORT||3031);
const baseURL=`http://127.0.0.1:${port}`;
const executablePath=process.env.CHROMIUM_EXECUTABLE|| (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);

export default defineConfig({
  testDir:'tests/browser',
  workers:1,
  timeout:75_000,
  use:{baseURL,launchOptions:{executablePath},trace:'retain-on-failure'},
  webServer:{
    command:`npm run dev -- --port ${port}`,url:baseURL,timeout:60_000,
    env:{ADMIN_PASSWORD:process.env.ISLAVISTA_TEST_PASSWORD,SESSION_SECRET:randomBytes(48).toString('hex'),ISLAVISTA_DATA_DIR:data,ISLAVISTA_NEXT_DEV_DIR:'.next-test',DIRECTORY_PREVIEW:'true',NEXT_TELEMETRY_DISABLED:'1'},
  },
});
