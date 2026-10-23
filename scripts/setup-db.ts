import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());
process.env.SKIP_DATABASE_SEED = 'true';

const { initDatabase } = await import('../src/lib/database/db');
const result = await initDatabase();
if (!result.success) {
  throw new Error(result.message);
}

console.log(result.message);
