import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { CharacterService } from '../../services/CharacterService';
import { GameService } from '../../services/GameService';
import { MembershipService } from '../../services/MembershipService';
import { handleCommandError, AppError } from '../../utils/errors';
import { resolveGame, requireMembership } from '../../utils/context';
import { isFounder } from '../../permissions';

export const addSubcommand = new SlashCommandSubcommandBuilder()
  .setName('add')
  .setDescription('Add a character to a game')
  .addStringOption((o) =>
    o.setName('name').setDescription('Character name').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('summary').setDescription('Short description').setRequired(false)
  )
  .addAttachmentOption((o) =>
    o.setName('sheet').setDescription('Character sheet file').setRequired(false)
  )
  .addAttachmentOption((o) =>
    o.setName('image').setDescription('Character image').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('details').setDescription('Freeform character details').setRequired(false)
  )
  .addUserOption((o) =>
    o.setName('player').setDescription('Player to link this character to (Founders only)').setRequired(false)
  );

export async function handleAdd(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);

    const targetPlayer = interaction.options.getUser('player');

    if (targetPlayer) {
      if (!isFounder(interaction.member!, config)) {
        throw new AppError('Only Founders can add characters on behalf of another player.');
      }
    } else {
      requireMembership(interaction, game, new MembershipService(db), config);
    }

    const ownerId = targetPlayer?.id ?? interaction.user.id;

    const characterName = interaction.options.getString('name', true);
    const summary       = interaction.options.getString('summary')   ?? undefined;
    const details       = interaction.options.getString('details')   ?? undefined;
    const sheet         = interaction.options.getAttachment('sheet') ?? undefined;
    const image         = interaction.options.getAttachment('image') ?? undefined;

    const characterService = new CharacterService(db);
    const character = characterService.addCharacter(
      game.id,
      ownerId,
      {
        characterName,
        summary,
        details,
        sheetUrl:  sheet?.url,
        sheetName: sheet?.name,
        imageUrl:  image?.url,
        imageName: image?.name,
      },
      interaction.user.id
    );

    const ownerNote = targetPlayer ? ` for <@${targetPlayer.id}>` : '';
    await interaction.editReply({
      content: `✅ **${character.characterName}** added to **${game.title}**${ownerNote}.`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
