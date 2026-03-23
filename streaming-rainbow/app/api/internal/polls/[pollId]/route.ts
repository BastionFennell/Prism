import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyApiKey } from '@/lib/apiKey';
import { computeTopSlots, allMembersVoted } from '@/lib/topSlots';

export async function GET(
  req: NextRequest,
  { params }: { params: { pollId: string } }
) {
  const authError = verifyApiKey(req);
  if (authError) return authError;

  const poll = await prisma.poll.findUnique({
    where: { id: params.pollId },
    include: { availabilities: true },
  });
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const topSlots = computeTopSlots(poll, poll.availabilities);
  const memberIds: string[] = JSON.parse(poll.memberDiscordIds);
  const votedIds = poll.availabilities.map(a => a.discordUserId);

  return NextResponse.json({
    pollId: poll.id,
    status: poll.status,
    allMembersVoted: allMembersVoted(poll, poll.availabilities),
    voterCount: poll.availabilities.length,
    totalMembers: memberIds.length,
    votedDiscordIds: votedIds,
    topSlots,
    expiresAt: poll.expiresAt.toISOString(),
    timezone: poll.timezone,
    gameName: poll.gameName,
    gameId: poll.gameId,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { pollId: string } }
) {
  const authError = verifyApiKey(req);
  if (authError) return authError;

  await prisma.poll.deleteMany({ where: { id: params.pollId } });
  return NextResponse.json({ ok: true });
}
