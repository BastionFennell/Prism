import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, EmbedBuilder, Colors } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { CharacterService } from '../../services/CharacterService';
import { GameService } from '../../services/GameService';
import { handleCommandError } from '../../utils/errors';

export const listSubcommand = new SlashCommandSubcommandBuilder()
  .setName('list')
  .setDescription('View the character roster for a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleList(
  interaction: ChatInputCommandInteraction,
  _config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply();

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    const characterService = new CharacterService(db);
    const characters = characterService.getCharactersForGame(gameId);

    if (characters.length === 0) {
      await interaction.editReply({ content: `No characters registered for **${game.title}** yet.` });
      return;
    }

    // One embed per character (Discord only supports one image per embed)
    const embeds = characters.slice(0, 10).map((c, i) => {
      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle(c.characterName)
        .setAuthor({ name: i === 0 ? `🎭 ${game.title} — Character Roster` : game.title });

      if (c.summary) embed.setDescription(c.summary);

      embed.addFields({ name: 'Player', value: `<@${c.userId}>`, inline: true });

      if (c.sheetUrl) {
        embed.addFields({ name: 'Character Sheet', value: `[View Sheet](${c.sheetUrl})`, inline: true });
      }

      if (c.details) {
        embed.addFields({ name: 'Details', value: c.details.slice(0, 1024), inline: false });
      }

      if (c.imageUrl) embed.setImage(c.imageUrl);

      return embed;
    });

    await interaction.editReply({ embeds });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
