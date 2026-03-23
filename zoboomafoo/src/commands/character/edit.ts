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

export const editSubcommand = new SlashCommandSubcommandBuilder()
  .setName('edit')
  .setDescription('Edit a character')
  .addStringOption((o) =>
    o.setName('name').setDescription('Current character name').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('new_name').setDescription('New character name').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('summary').setDescription('New summary').setRequired(false)
  )
  .addAttachmentOption((o) =>
    o.setName('sheet').setDescription('New character sheet file').setRequired(false)
  )
  .addAttachmentOption((o) =>
    o.setName('image').setDescription('New character image').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('details').setDescription('New freeform details').setRequired(false)
  );

export async function handleEdit(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    requireMembership(interaction, game, new MembershipService(db), config);

    const name    = interaction.options.getString('name', true);
    const newName = interaction.options.getString('new_name') ?? undefined;
    const summary = interaction.options.getString('summary')  ?? undefined;
    const details = interaction.options.getString('details')  ?? undefined;
    const sheet   = interaction.options.getAttachment('sheet') ?? undefined;
    const image   = interaction.options.getAttachment('image') ?? undefined;

    const updates: Record<string, string | undefined> = {};
    if (newName)  updates.characterName = newName;
    if (summary)  updates.summary       = summary;
    if (details)  updates.details       = details;
    if (sheet)  { updates.sheetUrl = sheet.url; updates.sheetName = sheet.name; }
    if (image)  { updates.imageUrl = image.url; updates.imageName = image.name; }

    if (Object.keys(updates).length === 0) {
      throw new AppError('Provide at least one field to update.');
    }

    const characterService = new CharacterService(db);
    const character = characterService.findCharacterByName(game.id, name);
    if (!character) throw new AppError(`No character named "${name}" found in **${game.title}**.`);

    const founder = isFounder(interaction.member!, config);
    const updated = characterService.editCharacter(character.id, interaction.user.id, founder, updates);

    await interaction.editReply({ content: `✅ **${updated.characterName}** updated.` });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
