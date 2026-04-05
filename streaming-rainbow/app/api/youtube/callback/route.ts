import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(
      new URL('/youtube/authorize?error=denied', req.url)
    );
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/youtube/callback`,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.access_token || !tokens.refresh_token) {
    console.error('YouTube token exchange failed:', tokens);
    return NextResponse.redirect(
      new URL('/youtube/authorize?error=token_exchange_failed', req.url)
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.youTubeToken.upsert({
    where: { id: 'singleton' },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
      authorizedBy: state ?? null,
    },
    create: {
      id: 'singleton',
      channelId: process.env.YOUTUBE_CHANNEL_ID!,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
      authorizedBy: state ?? null,
    },
  });

  return NextResponse.redirect(
    new URL('/youtube/authorize?success=true', req.url)
  );
}
