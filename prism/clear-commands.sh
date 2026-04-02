#!/bin/bash
# Clears all guild-scoped slash commands for the Prism bot.
node -e "
const { REST, Routes } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
rest.put(Routes.applicationGuildCommands('1485048549220814878', '1485480269552029808'), { body: [] })
  .then(() => console.log('Prism commands cleared.'))
  .catch(console.error);
"
