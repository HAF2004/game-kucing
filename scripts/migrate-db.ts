import { createDatabase } from '../src/server/db';

async function main(): Promise<void> {
  let db;
  try {
    db = await createDatabase({ runMigrations: true, seedInitialRivals: false });
    console.log('Database schema is current.');
  } catch (error) {
    console.error('Database migration failed:', error instanceof Error ? error.name : 'UnknownError');
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

void main();
