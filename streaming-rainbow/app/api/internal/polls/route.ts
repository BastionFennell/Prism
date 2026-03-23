import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyApiKey } from '@/lib/apiKey';

export async function POST(req: NextRequest) {
  const authError = verifyApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const {
      guildId,
      gameId,
      gameName,
      memberDiscordIds,
      dateRangeStart,
      dateRangeEnd,
      sessionDurationMinutes,
      dailyWindowStart,
      dailyWindowEnd,
      timezone,
      expiresAt,
    } = body;

    if (!guildId || !gameId || !gameName || !memberDiscordIds || !dateRangeStart ||
        !dateRangeEnd || !sessionDurationMinutes || !dailyWindowStart || !dailyWindowEnd ||
        !timezone || !expiresAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const poll = await prisma.poll.create({
      data: {
        guildId,
        gameId,
        gameName,
        memberDiscordIds: JSON.stringify(memberDiscordIds),
        dateRangeStart: new Date(dateRangeStart),
        dateRangeEnd: new Date(dateRangeEnd),
        sessionDurationMinutes,
        dailyWindowStart,
        dailyWindowEnd,
        timezone,
        expiresAt: new Date(expiresAt),
        status: 'collecting',
      },
    });

    return NextResponse.json({ pollId: poll.id });
  } catch (err) {
    console.error('POST /api/internal/polls error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
