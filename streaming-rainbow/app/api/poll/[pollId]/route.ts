import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeTopSlots } from '@/lib/topSlots';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { pollId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const poll = await prisma.poll.findUnique({
    where: { id: params.pollId },
    include: { availabilities: true },
  });
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const memberIds: string[] = JSON.parse(poll.memberDiscordIds);
  const myAvailability = poll.availabilities.find(a => a.discordUserId === session.user.id);
  const mySlots: string[] = myAvailability ? JSON.parse(myAvailability.slots) : [];

  // Build aggregate: slot -> count
  const slotCounts: Record<string, number> = {};
  for (const av of poll.availabilities) {
    const slots: string[] = JSON.parse(av.slots);
    for (const slot of slots) {
      slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
    }
  }

  const voters = poll.availabilities.map(a => ({
    discordUserId: a.discordUserId,
    discordUsername: a.discordUsername,
  }));

  return NextResponse.json({
    pollId: poll.id,
    gameName: poll.gameName,
    dateRangeStart: poll.dateRangeStart.toISOString(),
    dateRangeEnd: poll.dateRangeEnd.toISOString(),
    sessionDurationMinutes: poll.sessionDurationMinutes,
    dailyWindowStart: poll.dailyWindowStart,
    dailyWindowEnd: poll.dailyWindowEnd,
    timezone: poll.timezone,
    expiresAt: poll.expiresAt.toISOString(),
    status: poll.status,
    totalMembers: memberIds.length,
    voters,
    mySlots,
    slotCounts,
  });
}
