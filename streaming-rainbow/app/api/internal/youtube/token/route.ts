import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyApiKey } from '@/lib/apiKey';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyApiKey(req);
  if (authError) return authError;

  const token = await prisma.youTubeToken.findUnique({
    where: { id: 'singleton' },
  });

  if (!token) {
    return NextResponse.json({ error: 'No YouTube token configured' }, { status: 404 });
  }

  // Auto-refresh if expired
  if (token.expiresAt <= new Date()) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: token.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const refreshed = await refreshRes.json();

      if (!refreshed.access_token) {
        return NextResponse.json({
          error: 'Token refresh failed — reauthorization required',
          reauthorizeUrl: `${process.env.NEXTAUTH_URL}/youtube/authorize`,
        }, { status: 401 });
      }

      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

      await prisma.youTubeToken.update({
        where: { id: 'singleton' },
        data: {
          accessToken: refreshed.access_token,
          expiresAt: newExpiresAt,
        },
      });

      return NextResponse.json({
        accessToken: refreshed.access_token,
        channelId: token.channelId,
        expiresAt: newExpiresAt.toISOString(),
      });
    } catch (err) {
      console.error('YouTube token refresh error:', err);
      return NextResponse.json({
        error: 'Token refresh failed',
        reauthorizeUrl: `${process.env.NEXTAUTH_URL}/youtube/authorize`,
      }, { status: 401 });
    }
  }

  return NextResponse.json({
    accessToken: token.accessToken,
    channelId: token.channelId,
    expiresAt: token.expiresAt.toISOString(),
  });
}
