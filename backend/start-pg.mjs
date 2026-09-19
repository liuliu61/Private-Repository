import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync } from 'fs';

const dataDir = '/home/user/Doubao/chats/38441126705860866/Private-Repository/backend/pgdata';
mkdirSync(dataDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'finance',
  password: 'finance_password',
  port: 5432,
  persistent: true,
});

import { existsSync } from 'fs';
const alreadyInit = existsSync(dataDir + '/PG_VERSION');
if (!alreadyInit) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('agent_finance');
  console.log('DB_CREATED');
} catch (e) {
  console.log('DB_EXISTS_OR_ERR', e.message);
}
console.log('PG_READY port=5432');
// keep alive
setInterval(() => {}, 1 << 30);
