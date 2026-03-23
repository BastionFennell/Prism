import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeTopSlots } from '@/lib/topSlots';
import PollGrid from './PollGrid';
import LoginButton from '@/app/components/LoginButton';

export default async function PollPage({ params }: { params: { pollId: string } }) {
  const session = await getServerSession(authOptions);

  const poll = await prisma.poll.findUnique({
    where: { id: params.pollId },
    include: { availabilities: true },
  });

  if (!poll) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.title}>Poll not found</h1>
          <p style={styles.subtitle}>This scheduling poll doesn't exist or has expired.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.logo}>🌈</div>
          <h1 style={styles.title}>Streaming Rainbow</h1>
          <h2 style={{ ...styles.subtitle, fontSize: 20, color: '#ccc', marginBottom: 8 }}>
            Schedule a session for
          </h2>
          <h3 style={{ fontSize: 24, color: '#fff', margin: '0 0 24px' }}>{poll.gameName}</h3>
          <p style={{ color: '#888', marginBottom: 24, fontSize: 14 }}>
            Log in with Discord to vote on your availability.
          </p>
          <LoginButton />
        </div>
      </main>
    );
  }

  const memberIds: string[] = JSON.parse(poll.memberDiscordIds);
  const myAvailability = poll.availabilities.find(a => a.discordUserId === session.user.id);
  const mySlots: string[] = myAvailability ? JSON.parse(myAvailability.slots) : [];

  const slotCounts: Record<string, number> = {};
  for (const av of poll.availabilities) {
    const slots: string[] = JSON.parse(av.slots);
    for (const slot of slots) {
      slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
    }
  }

  const topSlots = computeTopSlots(poll, poll.availabilities);
  const expiresAt = poll.expiresAt;
  const isClosed = poll.status !== 'collecting';

  const formattedExpiry = expiresAt.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const pollData = {
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
    voters: poll.availabilities.map(a => ({
      discordUserId: a.discordUserId,
      discordUsername: a.discordUsername,
    })),
    mySlots,
    slotCounts,
  };

  return (
    <main style={styles.main}>
      <div style={{ ...styles.card, maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={styles.logo}>🌈</div>
            <h1 style={styles.title}>Schedule a session</h1>
            <h2 style={{ margin: 0, fontSize: 18, color: '#a78bfa', fontWeight: 500 }}>{poll.gameName}</h2>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, color: '#666' }}>
            <div>Logged in as <span style={{ color: '#ccc' }}>{session.user.name}</span></div>
            {!isClosed && <div style={{ marginTop: 4 }}>Poll closes {formattedExpiry}</div>}
          </div>
        </div>

        {isClosed && (
          <div style={{ background: '#3b0764', border: '1px solid #7c3aed', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#d8b4fe' }}>
            This poll is closed. A vote has been posted in Discord to pick the final time.
          </div>
        )}

        {topSlots.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, color: '#888', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Top availability spots
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topSlots.map((s, i) => (
                <div key={s.startAt} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                  <span style={{ color: '#666', width: 16 }}>{i + 1}.</span>
                  <span style={{ color: '#e2e8f0' }}>{s.label}</span>
                  <span style={{ color: '#888' }}>{s.availableCount}/{s.totalMembers} available</span>
                  <div style={{ flex: 1, height: 6, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden', maxWidth: 120 }}>
                    <div style={{
                      width: `${(s.availableCount / s.totalMembers) * 100}%`,
                      height: '100%',
                      background: s.availableCount === s.totalMembers ? '#16a34a' : '#22c55e',
                      borderRadius: 3,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <h3 style={{ fontSize: 14, color: '#888', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Mark your availability — click or drag to toggle
        </h3>

        <PollGrid pollData={pollData} userId={session.user.id} />
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px',
  },
  card: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 12,
    padding: '32px 28px',
    width: '100%',
  },
  logo: {
    fontSize: 32,
    marginBottom: 8,
  },
  title: {
    color: '#f4f4f5',
    margin: '0 0 4px',
    fontSize: 26,
    fontWeight: 700,
  },
  subtitle: {
    color: '#71717a',
    margin: '0 0 24px',
    fontSize: 15,
  },
};
