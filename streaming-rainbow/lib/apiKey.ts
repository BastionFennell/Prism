import { NextRequest, NextResponse } from 'next/server';

export function verifyApiKey(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('Authorization');
  const expected = `Bearer ${process.env.STREAMING_RAINBOW_API_KEY}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
