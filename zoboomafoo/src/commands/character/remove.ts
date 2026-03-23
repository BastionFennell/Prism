import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { CharacterService } from '../../services/CharacterService';
import { GameService } from '../../services/GameService';
import { MembershipService } from '../../services/MembershipService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { resolveGame, requireMembership } from '../../utils/context';

export const removeSubcommand = new SlashCommandSubcommandBuilder()
  .setName('remove')
  .setDescription('Remove a character from a game')
  .addStringOption((o) =>
    o.setName('name').setDescription('Character name').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  );

export async function handleRemove(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    requireMembership(interaction, game, new MembershipService(db), config);

    const name = interaction.options.getString('name', true);

    const characterService = new CharacterService(db);
    const character = characterService.findCharacterByName(game.id, name);
    if (!character) throw new AppError(`No character named "${name}" found in **${game.title}**.`);

    const founder = isFounder(interaction.member!, config);
    characterService.removeCharacter(character.id, interaction.user.id, founder);

    await interaction.editReply({ content: `🗑️ **${name}** removed from **${game.title}**.` });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
