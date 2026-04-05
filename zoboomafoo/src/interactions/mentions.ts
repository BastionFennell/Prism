import { Message } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { reactionBannedChannels } from '../db/schema';
import { loadConfig } from '../config';
import { isFounder } from '../permissions';
import { YouTubeAIService } from '../services/YouTubeAIService';

const RESPONSES = [
  'ZABOOOO!! 🦎🎉',
  'Oh WOW you tagged me!! This is the BEST DAY EVER!! 🌟',
  'Did someone say adventure?? 🗺️⚔️',
  '*leaps around excitedly* WHAT IS IT WHAT IS IT WHAT IS IT 🦎',
  'Zoboomafoo is HERE and he is READY!! For what? Anything!! 🎲',
  '*sniffs the air* ...something exciting is about to happen 🌿',
  'The lemur acknowledges your message and finds it satisfactory. 🦎👍',
  'ZABOO MAFOO!! 🎺🌟',
  '*knocks over a pile of dice* oops. anyway, hi!! 🎲',
  'You rang? Zoboomafoo has been waiting by the door ALL day!! 🚪',
  'I was JUST thinking about you!! (I wasn\'t, but it feels right) 🦎💚',
  'The answer, my friend, is blowing in the jungle breeze. 🌿',
  'Signs point to YES! 🦎✨',
  'The lemur has spoken: absolutely not. 🦎',
  'Outlook unclear - Zoboomafoo is currently distracted by a bug 🐛',
  'All signs point to... more snacks. 🍃',
  'Cannot predict now - Zoboomafoo is doing his happy dance 🦎💃',
  'It is certain! The jungle agrees! 🌿✅',
  'My sources say no. (The sources are bugs.) 🐛',
  'Ask again later. Zoboomafoo is napping. 😴',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function handleMention(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.client.user) return;
  if (!message.mentions.has(message.client.user.id)) return;

  const banned = db
    .select()
    .from(reactionBannedChannels)
    .where(eq(reactionBannedChannels.channelId, message.channelId))
    .all();
  if (banned.length > 0) return;

  // Strip the bot mention to get the actual question
  const content = message.content
    .replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), '')
    .trim();

  // Founders with a question get AI-powered responses
  const config = loadConfig();
  const member = message.member;
  if (member && isFounder(member, config) && content.length > 0) {
    await handleFounderMention(message, content);
  } else {
    await message.reply(pick(RESPONSES));
  }
}

async function handleFounderMention(message: Message, question: string): Promise<void> {
  // Rate limit check
  if (!YouTubeAIService.checkRateLimit(message.author.id)) {
    await message.reply('Hold your lemurs! I\'m still catching my breath from the last question. Try again in a few seconds! 🦎💨');
    return;
  }

  // Show typing indicator
  await message.channel.sendTyping();

  try {
    const aiService = new YouTubeAIService(message.client);
    const response = await aiService.answer(question);

    if (response.length > 2000) {
      const reply = await message.reply(response.slice(0, 1997) + '...');
      const thread = await reply.startThread({ name: 'Zoboomafoo Analysis' });
      const remaining = response.slice(1997);
      for (let i = 0; i < remaining.length; i += 2000) {
        await thread.send(remaining.slice(i, i + 2000));
      }
    } else {
      await message.reply(response);
    }
  } catch (err) {
    console.error('[mentions] AI response error:', err);
    await message.reply(
      'Oops! Zoboomafoo got tangled up in the vines trying to fetch that data. Try again in a moment! 🦎🌿'
    );
  }
}
