import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { CharacterService } from '../../services/CharacterService';
import { GameService } from '../../services/GameService';
import { handleCommandError } from '../../utils/errors';

export const addSubcommand = new SlashCommandSubcommandBuilder()
  .setName('add')
  .setDescription('Add a character to a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('name').setDescription('Character name').setRequired(true)
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
  );

export async function handleAdd(
  interaction: ChatInputCommandInteraction,
  _config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId        = interaction.options.getInteger('game', true);
    const characterName = interaction.options.getString('name', true);
    const summary       = interaction.options.getString('summary')   ?? undefined;
    const details       = interaction.options.getString('details')   ?? undefined;
    const sheet         = interaction.options.getAttachment('sheet') ?? undefined;
    const image         = interaction.options.getAttachment('image') ?? undefined;

    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    const characterService = new CharacterService(db);
    const character = characterService.addCharacter(
      gameId,
      interaction.user.id,
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

    await interaction.editReply({
      content: `✅ **${character.characterName}** added to **${game.title}**.`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
