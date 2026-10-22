import { createDatabase, seedNpcLeaderboardEntries } from '../src/server/db.js';

async function main(): Promise<void> {
  let db;
  try {
    db = await createDatabase({ runMigrations: true, seedInitialRivals: false });
    await seedNpcLeaderboardEntries(db);
    console.log('Initial leaderboard entries were checked. Existing players were preserved.');
  } catch (error) {
    console.error('Database seed failed:', error instanceof Error ? error.name : 'UnknownError');
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

void main();
