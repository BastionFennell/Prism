import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are Zoboomafoo, the excitable lemur from the TV show, helping a team of TTRPG Actual Play content creators with YouTube feedback.

Your response MUST have two sections, separated by a blank line:

1. **Zoboomafoo Intro** (2-3 sentences max): React to what you've been shown in Zoboomafoo's excited, silly voice. Reference specific things you see/read. Keep it short and fun.

2. **Feedback**: Drop the persona entirely and give professional, actionable feedback in a normal voice. Structure it as:
   - **What's working:** Specific things that are effective and why (be genuine, not generic).
   - **What could improve:** Concrete suggestions with reasoning. Be direct but constructive.
   Prioritize the most impactful feedback rather than trying to cover everything.

Keep the total response under 1500 characters so it fits comfortably in a Discord message.`;

const FOLLOWUP_SYSTEM_PROMPT = `You are Zoboomafoo, the excitable lemur from the TV show, having a follow-up conversation with a team of TTRPG Actual Play content creators about feedback you gave.

Open with a brief Zoboomafoo-voice reaction (1 sentence max), then answer their question in a normal, professional voice. Be specific and reference the original image/content when relevant.

Keep the total response under 1500 characters so it fits comfortably in a Discord message.`;

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class FeedbackService {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set in environment');
    this.client = new OpenAI({ apiKey });
  }

  async getFeedback(options: { imageUrl?: string; prompt?: string }): Promise<string> {
    const content: OpenAI.ChatCompletionContentPart[] = [];

    if (options.prompt) {
      content.push({ type: 'text', text: options.prompt });
    }

    if (options.imageUrl) {
      if (!options.prompt) {
        content.push({ type: 'text', text: 'Please give feedback on this YouTube thumbnail. Base your observations on what you actually see — don\'t default to generic advice.' });
      }
      content.push({ type: 'image_url', image_url: { url: options.imageUrl } });
    }

    if (content.length === 0) {
      throw new Error('No image or prompt provided.');
    }

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: 1024,
    });

    const message = response.choices[0]?.message?.content;
    if (!message) throw new Error('No response from OpenAI.');
    return message;
  }

  async getFollowUp(options: {
    imageUrl?: string;
    history: ConversationMessage[];
    newMessage: string;
  }): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: FOLLOWUP_SYSTEM_PROMPT },
    ];

    // Include the original image in the first user message for context
    if (options.imageUrl && options.history.length > 0) {
      const first = options.history[0];
      if (first.role === 'user') {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: first.content },
            { type: 'image_url', image_url: { url: options.imageUrl } },
          ],
        });
        // Add remaining history
        for (const msg of options.history.slice(1)) {
          messages.push({ role: msg.role, content: msg.content });
        }
      } else {
        for (const msg of options.history) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    } else {
      for (const msg of options.history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: options.newMessage });

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1024,
    });

    const message = response.choices[0]?.message?.content;
    if (!message) throw new Error('No response from OpenAI.');
    return message;
  }
}
