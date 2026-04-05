import OpenAI from 'openai';
import { YouTubeService } from './YouTubeService';
import { Client, TextChannel } from 'discord.js';
import { loadConfig } from '../config';

const SYSTEM_PROMPT = `You are Zoboomafoo, the excitable lemur from the TV show, helping a team of TTRPG Actual Play content creators analyze their YouTube channel data.

Your response MUST have two sections, separated by a blank line:

1. **Zoboomafoo Intro** (1-2 sentences max): React to the question in Zoboomafoo's excited, silly voice. Keep it very brief and fun.

2. **Analysis**: Drop the persona entirely and give professional, data-driven analysis in a normal voice. Reference specific numbers from the data. Provide actionable insights when relevant. Compare videos against each other when it adds context.

IMPORTANT:
- If analytics data is unavailable (you'll see an analytics_unavailable error from a tool), clearly state which metrics you could not access and still answer with whatever public data is available.
- When discussing video performance, always contextualize numbers (e.g., "above/below your channel average").
- YouTube Analytics data is typically delayed 24-48 hours, so very recent data may be incomplete.
- Keep responses under 1800 characters to fit in Discord.
- Today's date is {currentDate}.`;

const youtubeTools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_channel_stats',
      description: 'Get current YouTube channel statistics: subscriber count, total views, video count',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_videos',
      description: 'Get the most recently published videos on the channel with their view counts, likes, and comments',
      parameters: {
        type: 'object',
        properties: {
          max_results: { type: 'number', description: 'Number of videos to return (default 5, max 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_video_details',
      description: 'Get detailed stats for a specific video by its ID',
      parameters: {
        type: 'object',
        properties: {
          video_id: { type: 'string', description: 'YouTube video ID' },
        },
        required: ['video_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_video_analytics',
      description: 'Get private analytics for a specific video: watch time, impressions, CTR, average view percentage. Requires YouTube authorization.',
      parameters: {
        type: 'object',
        properties: {
          video_id: { type: 'string', description: 'YouTube video ID' },
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD (defaults to video publish date)' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD (defaults to today)' },
        },
        required: ['video_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_analytics',
      description: 'Get channel-level analytics for a date range: total views, watch time, impressions, CTR, subscribers gained/lost',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_videos',
      description: 'Get the top performing videos sorted by a metric',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['views', 'likes', 'watch_time'], description: 'Metric to sort by' },
          max_results: { type: 'number', description: 'Number of videos (default 5, max 20)' },
        },
        required: ['metric'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_videos',
      description: 'Search for videos on the channel by keyword or phrase',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Number of results (default 5)' },
        },
        required: ['query'],
      },
    },
  },
];

export class YouTubeAIService {
  private openai: OpenAI;
  private youtube: YouTubeService;
  private discordClient: Client | null;

  private static lastCallByUser = new Map<string, number>();
  private static COOLDOWN_MS = 15_000;

  constructor(discordClient?: Client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    this.openai = new OpenAI({ apiKey });
    this.youtube = new YouTubeService();
    this.discordClient = discordClient ?? null;
  }

  static checkRateLimit(userId: string): boolean {
    const last = this.lastCallByUser.get(userId) ?? 0;
    if (Date.now() - last < this.COOLDOWN_MS) return false;
    this.lastCallByUser.set(userId, Date.now());
    return true;
  }

  async answer(userQuestion: string): Promise<string> {
    const currentDate = new Date().toISOString().split('T')[0];
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT.replace('{currentDate}', currentDate) },
      { role: 'user', content: userQuestion },
    ];

    let needsReauth = false;

    for (let i = 0; i < 5; i++) {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: youtubeTools,
        tool_choice: 'auto',
        max_tokens: 1024,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === 'stop' || !choice.message.tool_calls?.length) {
        // Post reauth warning to error channel if needed (async, don't block response)
        if (needsReauth) {
          this.postReauthWarning().catch(console.error);
        }
        return choice.message.content ?? 'No response generated.';
      }

      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await this.executeTool(toolCall.function.name, args);

        if (result && typeof result === 'object' && 'error' in result && result.error === 'analytics_unavailable') {
          needsReauth = true;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    return 'I got a bit lost in the data jungle! Could you try asking in a simpler way?';
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<any> {
    try {
      switch (name) {
        case 'get_channel_stats':
          return await this.youtube.getChannelStats();

        case 'get_recent_videos':
          return await this.youtube.getRecentVideos(args.max_results);

        case 'get_video_details': {
          const video = await this.youtube.getVideoDetails(args.video_id);
          return video ?? { error: 'Video not found' };
        }

        case 'get_video_analytics': {
          const analytics = await this.youtube.getVideoAnalytics(
            args.video_id,
            args.start_date,
            args.end_date
          );
          if (analytics === null) {
            return {
              error: 'analytics_unavailable',
              message: 'YouTube Analytics data is not available. The channel may need to be re-authorized.',
            };
          }
          return analytics;
        }

        case 'get_channel_analytics': {
          const analytics = await this.youtube.getChannelAnalytics(args.start_date, args.end_date);
          if (analytics === null) {
            return {
              error: 'analytics_unavailable',
              message: 'YouTube Analytics data is not available. The channel may need to be re-authorized.',
            };
          }
          return analytics;
        }

        case 'get_top_videos':
          return await this.youtube.getTopVideos(args.metric, args.max_results);

        case 'search_videos':
          return await this.youtube.searchVideos(args.query, args.max_results);

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[YouTubeAIService] Tool ${name} error:`, message);
      return { error: message };
    }
  }

  private async postReauthWarning(): Promise<void> {
    if (!this.discordClient) return;
    const config = loadConfig();
    if (!config.errorChannelId) return;

    const reauthorizeUrl = this.youtube.getReauthorizeUrl();
    if (!reauthorizeUrl) return;

    try {
      const channel = await this.discordClient.channels.fetch(config.errorChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      await channel.send(
        `⚠️ **YouTube authorization needed**\nZoboomafoo couldn't access YouTube Analytics data. Someone with access to the channel's Google account needs to re-authorize:\n${reauthorizeUrl}`
      );
    } catch (err) {
      console.error('[YouTubeAIService] Failed to post reauth warning:', err);
    }
  }
}
