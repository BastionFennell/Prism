import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyApiKey } from '@/lib/apiKey';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { pollId: string } }
) {
  const authError = verifyApiKey(req);
  if (authError) return authError;

  const poll = await prisma.poll.findUnique({ where: { id: params.pollId } });
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (poll.status !== 'collecting') {
    return NextResponse.json({ error: 'Poll is not in collecting state' }, { status: 409 });
  }

  await prisma.poll.update({
    where: { id: params.pollId },
    data: { status: 'completed' },
  });

  return NextResponse.json({ ok: true });
}
