import 'dotenv/config';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { db } from './db';
import { client } from './client';
import { loadConfig } from './config';
import { registerInteractionHandlers, setSchedulingPollService } from './interactions';

async function main() {
  // 1. Run pending migrations
  console.log('[startup] Running database migrations...');
  migrate(db, { migrationsFolder: path.join(__dirname, '../src/db/migrations') });
  console.log('[startup] Migrations complete.');

  // 2. Load config from env + DB
  console.log('[startup] Loading config...');
  const config = loadConfig();
  console.log('[startup] Config loaded.');

  // 3. Register interaction handlers
  registerInteractionHandlers(client);

  // 4. On ready
  client.once('ready', async (readyClient) => {
    console.log(`[startup] Logged in as ${readyClient.user.tag}`);

    if (!config.guildId) {
      console.warn('[startup] WARNING: Bot is not configured. Use /admin setup to configure.');
      return;
    }

    // 5. Render schedule on startup
    try {
      const { ScheduleService } = await import('./services/ScheduleService');
      const scheduleService = new ScheduleService(db, readyClient, config);
      await scheduleService.renderSchedule();
      console.log('[startup] Schedule rendered.');
    } catch (err) {
      console.error('[startup] Failed to render schedule on startup:', err);
    }

    // 6. Start reminder polling
    const { ReminderService } = await import('./services/ReminderService');
    new ReminderService(db, readyClient).start();

    // 7. Start announcement polling
    const { AnnouncementService } = await import('./services/AnnouncementService');
    new AnnouncementService(db, readyClient).start();

    // 8. Start scheduling poll polling
    const { SchedulingPollService } = await import('./services/SchedulingPollService');
    const schedulingPollSvc = new SchedulingPollService(db, readyClient, config);
    setSchedulingPollService(schedulingPollSvc);
    schedulingPollSvc.start();

    console.log('[startup] Startup complete.');
  });

  // 7. Login
  console.log('[startup] Connecting to Discord...');
  await client.login(config.token);
}

main().catch((err) => {
  console.error('[fatal] Startup failed:', err);
  process.exit(1);
});
