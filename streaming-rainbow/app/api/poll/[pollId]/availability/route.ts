import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { pollId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const poll = await prisma.poll.findUnique({ where: { id: params.pollId } });
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (poll.status !== 'collecting') {
    return NextResponse.json({ error: 'This poll is no longer accepting responses' }, { status: 409 });
  }

  const { slots } = await req.json();
  if (!Array.isArray(slots)) {
    return NextResponse.json({ error: 'slots must be an array' }, { status: 400 });
  }

  const username = session.user.name ?? session.user.id;

  await prisma.availability.upsert({
    where: {
      pollId_discordUserId: {
        pollId: params.pollId,
        discordUserId: session.user.id,
      },
    },
    update: {
      slots: JSON.stringify(slots),
      discordUsername: username,
    },
    create: {
      pollId: params.pollId,
      discordUserId: session.user.id,
      discordUsername: username,
      slots: JSON.stringify(slots),
    },
  });

  return NextResponse.json({ ok: true });
}
