export interface ChannelStats {
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

export interface VideoSummary {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  duration: string;
}

export interface VideoAnalytics {
  videoId: string;
  views: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  impressions: number;
  impressionsClickThroughRate: number;
  averageViewPercentage: number;
  subscribersGained: number;
}

export interface ChannelAnalytics {
  views: number;
  watchTimeMinutes: number;
  impressions: number;
  impressionsClickThroughRate: number;
  subscribersGained: number;
  subscribersLost: number;
}

interface CachedToken {
  accessToken: string;
  channelId: string;
  expiresAt: Date;
}

export class YouTubeService {
  private cachedToken: CachedToken | null = null;
  private channelId: string;
  private reauthorizeUrl: string | null = null;

  constructor() {
    this.channelId = process.env.YOUTUBE_CHANNEL_ID ?? '';
  }

  /** Returns the reauthorize URL if the last token fetch indicated one is needed */
  getReauthorizeUrl(): string | null {
    return this.reauthorizeUrl;
  }

  private async getToken(): Promise<CachedToken | null> {
    // Return cached token if still valid (with 60s buffer)
    if (this.cachedToken && this.cachedToken.expiresAt.getTime() > Date.now() + 60_000) {
      return this.cachedToken;
    }

    const url = process.env.STREAMING_RAINBOW_URL;
    const key = process.env.STREAMING_RAINBOW_API_KEY;
    if (!url || !key) return null;

    try {
      const res = await fetch(`${url}/api/internal/youtube/token`, {
        headers: { Authorization: `Bearer ${key}` },
      });

      if (res.status === 404) {
        this.reauthorizeUrl = `${url}/youtube/authorize`;
        return null;
      }

      if (res.status === 401) {
        const body = await res.json();
        this.reauthorizeUrl = body.reauthorizeUrl ?? `${url}/youtube/authorize`;
        return null;
      }

      if (!res.ok) return null;

      const data = await res.json();
      this.cachedToken = {
        accessToken: data.accessToken,
        channelId: data.channelId,
        expiresAt: new Date(data.expiresAt),
      };
      this.channelId = data.channelId;
      this.reauthorizeUrl = null;
      return this.cachedToken;
    } catch {
      return null;
    }
  }

  private async ytFetch(path: string, params: Record<string, string>): Promise<any> {
    const token = await this.getToken();
    const qs = new URLSearchParams(params);

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token.accessToken}`;
    }

    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YouTube API error: ${res.status} ${text}`);
    }
    return res.json();
  }

  private async analyticsFetch(params: Record<string, string>): Promise<any | null> {
    const token = await this.getToken();
    if (!token) return null;

    const qs = new URLSearchParams({
      ids: 'channel==MINE',
      ...params,
    });

    const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) return null;
    return res.json();
  }

  async getChannelStats(): Promise<ChannelStats> {
    const data = await this.ytFetch('channels', {
      part: 'statistics,snippet',
      id: this.channelId,
    });

    const channel = data.items?.[0];
    if (!channel) throw new Error('Channel not found');

    return {
      channelTitle: channel.snippet.title,
      subscriberCount: parseInt(channel.statistics.subscriberCount ?? '0'),
      viewCount: parseInt(channel.statistics.viewCount ?? '0'),
      videoCount: parseInt(channel.statistics.videoCount ?? '0'),
    };
  }

  async getRecentVideos(maxResults = 5): Promise<VideoSummary[]> {
    const searchData = await this.ytFetch('search', {
      part: 'snippet',
      channelId: this.channelId,
      type: 'video',
      order: 'date',
      maxResults: String(Math.min(maxResults, 20)),
    });

    const videoIds = searchData.items?.map((item: any) => item.id.videoId).join(',');
    if (!videoIds) return [];

    return this.fetchVideoDetails(videoIds);
  }

  async getVideoDetails(videoId: string): Promise<VideoSummary | null> {
    const videos = await this.fetchVideoDetails(videoId);
    return videos[0] ?? null;
  }

  async getTopVideos(metric: 'views' | 'likes' | 'watch_time', maxResults = 5): Promise<VideoSummary[]> {
    if (metric === 'watch_time') {
      // Analytics API needed for watch time sorting
      const analytics = await this.analyticsFetch({
        metrics: 'estimatedMinutesWatched',
        dimensions: 'video',
        sort: '-estimatedMinutesWatched',
        maxResults: String(Math.min(maxResults, 20)),
        startDate: '2020-01-01',
        endDate: new Date().toISOString().split('T')[0],
      });

      if (!analytics?.rows?.length) {
        // Fallback to views
        return this.getTopVideosByPublicMetric('viewCount', maxResults);
      }

      const videoIds = analytics.rows.map((row: any[]) => row[0]).join(',');
      return this.fetchVideoDetails(videoIds);
    }

    const order = metric === 'views' ? 'viewCount' : 'viewCount'; // YT API doesn't sort by likes
    return this.getTopVideosByPublicMetric(order, maxResults);
  }

  private async getTopVideosByPublicMetric(order: string, maxResults: number): Promise<VideoSummary[]> {
    const searchData = await this.ytFetch('search', {
      part: 'snippet',
      channelId: this.channelId,
      type: 'video',
      order,
      maxResults: String(Math.min(maxResults, 20)),
    });

    const videoIds = searchData.items?.map((item: any) => item.id.videoId).join(',');
    if (!videoIds) return [];

    return this.fetchVideoDetails(videoIds);
  }

  async searchVideos(query: string, maxResults = 5): Promise<VideoSummary[]> {
    const searchData = await this.ytFetch('search', {
      part: 'snippet',
      channelId: this.channelId,
      type: 'video',
      q: query,
      maxResults: String(Math.min(maxResults, 20)),
    });

    const videoIds = searchData.items?.map((item: any) => item.id.videoId).join(',');
    if (!videoIds) return [];

    return this.fetchVideoDetails(videoIds);
  }

  async getVideoAnalytics(videoId: string, startDate?: string, endDate?: string): Promise<VideoAnalytics | null> {
    const today = new Date().toISOString().split('T')[0];
    const data = await this.analyticsFetch({
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,impressions,impressionsClickThroughRate,averageViewPercentage,subscribersGained',
      filters: `video==${videoId}`,
      startDate: startDate ?? '2020-01-01',
      endDate: endDate ?? today,
    });

    if (!data?.rows?.length) return null;

    const row = data.rows[0];
    return {
      videoId,
      views: row[0],
      watchTimeMinutes: row[1],
      averageViewDurationSeconds: row[2],
      impressions: row[3],
      impressionsClickThroughRate: row[4],
      averageViewPercentage: row[5],
      subscribersGained: row[6],
    };
  }

  async getChannelAnalytics(startDate: string, endDate: string): Promise<ChannelAnalytics | null> {
    const data = await this.analyticsFetch({
      metrics: 'views,estimatedMinutesWatched,impressions,impressionsClickThroughRate,subscribersGained,subscribersLost',
      startDate,
      endDate,
    });

    if (!data?.rows?.length) return null;

    const row = data.rows[0];
    return {
      views: row[0],
      watchTimeMinutes: row[1],
      impressions: row[2],
      impressionsClickThroughRate: row[3],
      subscribersGained: row[4],
      subscribersLost: row[5],
    };
  }

  private async fetchVideoDetails(videoIds: string): Promise<VideoSummary[]> {
    const data = await this.ytFetch('videos', {
      part: 'snippet,statistics,contentDetails',
      id: videoIds,
    });

    return (data.items ?? []).map((item: any) => ({
      videoId: item.id,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      viewCount: parseInt(item.statistics.viewCount ?? '0'),
      likeCount: parseInt(item.statistics.likeCount ?? '0'),
      commentCount: parseInt(item.statistics.commentCount ?? '0'),
      thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? '',
      duration: item.contentDetails.duration,
    }));
  }
}
