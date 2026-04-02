import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { CharacterService } from '../../services/CharacterService';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const removeSubcommand = new SlashCommandSubcommandBuilder()
  .setName('remove')
  .setDescription('Remove a character from a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('name').setDescription('Character name').setRequired(true)
  );

export async function handleRemove(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId = interaction.options.getInteger('game', true);
    const name   = interaction.options.getString('name', true);

    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    const characterService = new CharacterService(db);
    const character = characterService.findCharacterByName(gameId, name);
    if (!character) throw new AppError(`No character named "${name}" found in **${game.title}**.`);

    const founder = isFounder(interaction.member!, config);
    characterService.removeCharacter(
      character.id,
      interaction.user.id,
      founder ? null : game.gmUserId,
      founder
    );

    await interaction.editReply({ content: `🗑️ **${name}** removed from **${game.title}**.` });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
