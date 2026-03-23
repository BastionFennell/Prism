import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commandDataList } from './index';
import { db } from '../db';
import { botConfig } from '../db/schema';

async function deploy() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in .env');
    process.exit(1);
  }

  // Guild ID priority: env var → bot_config DB row
  const envGuildId = process.env.DISCORD_GUILD_ID;
  let guildId: string;

  if (envGuildId) {
    guildId = envGuildId;
  } else {
    const [config] = db.select().from(botConfig).limit(1).all();
    if (!config) {
      console.error('DISCORD_GUILD_ID is not set in .env and no bot_config row exists in the database.');
      process.exit(1);
    }
    guildId = config.guildId;
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const body = commandDataList.map((c) => c.toJSON());

  console.log(`Registering ${body.length} slash commands to guild ${guildId}...`);

  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body }
  );

  console.log('✅ Slash commands registered successfully.');
}

deploy().catch(console.error);
