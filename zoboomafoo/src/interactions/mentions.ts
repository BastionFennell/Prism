import { Message } from 'discord.js';

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
  'Outlook unclear — Zoboomafoo is currently distracted by a bug 🐛',
  'All signs point to... more snacks. 🍃',
  'Cannot predict now — Zoboomafoo is doing his happy dance 🦎💃',
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

  await message.reply(pick(RESPONSES));
}
