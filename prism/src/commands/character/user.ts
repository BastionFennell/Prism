import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, EmbedBuilder, Colors } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { CharacterService } from '../../services/CharacterService';
import { GameService } from '../../services/GameService';
import { handleCommandError } from '../../utils/errors';

export const userSubcommand = new SlashCommandSubcommandBuilder()
  .setName('user')
  .setDescription('View all characters for a user across all games')
  .addUserOption((o) =>
    o.setName('user').setDescription('User to look up (defaults to yourself)').setRequired(false)
  );

export async function handleUser(
  interaction: ChatInputCommandInteraction,
  _config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply();

    const target = interaction.options.getUser('user') ?? interaction.user;
    const characterService = new CharacterService(db);
    const gameService = new GameService(db, client);

    const characters = characterService.getCharactersForUser(target.id);

    if (characters.length === 0) {
      await interaction.editReply({ content: `<@${target.id}> has no characters registered.` });
      return;
    }

    // Group by game for display
    const byGame = new Map<number, typeof characters>();
    for (const c of characters) {
      if (!byGame.has(c.gameId)) byGame.set(c.gameId, []);
      byGame.get(c.gameId)!.push(c);
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎭 Characters — ${target.displayName}`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(Colors.Purple);

    for (const [gameId, chars] of byGame) {
      let gameTitle = `Game #${gameId}`;
      try {
        gameTitle = gameService.getGame(gameId).title;
      } catch { /* game may be archived/cleared */ }

      const lines = chars.map((c) => {
        const parts = [c.characterName];
        if (c.summary) parts.push(`— ${c.summary}`);
        const links: string[] = [];
        if (c.sheetUrl) links.push(`[Character Sheet](${c.sheetUrl})`);
        if (c.imageUrl) links.push(`[Image](${c.imageUrl})`);
        if (links.length) parts.push(`· ${links.join(' ')}`);
        return parts.join(' ');
      });

      embed.addFields({ name: gameTitle, value: lines.join('\n').slice(0, 1024), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
