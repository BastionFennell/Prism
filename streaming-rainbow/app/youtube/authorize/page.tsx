import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import LoginButton from '@/app/components/LoginButton';

export const dynamic = 'force-dynamic';

export default async function YouTubeAuthorizePage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.logo}>🌈</div>
          <h1 style={styles.title}>YouTube Authorization</h1>
          <p style={styles.subtitle}>Log in with Discord to manage YouTube authorization.</p>
          <LoginButton />
        </div>
      </main>
    );
  }

  const token = await prisma.youTubeToken.findUnique({
    where: { id: 'singleton' },
  });

  const isAuthorized = token && token.refreshToken;
  const isExpired = token && token.expiresAt <= new Date();

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.logo}>🌈</div>
        <h1 style={styles.title}>YouTube Authorization</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '0 0 24px' }}>
          Logged in as <span style={{ color: '#ccc' }}>{session.user.name}</span>
        </p>

        {searchParams.success && (
          <div style={{ ...styles.banner, background: '#052e16', borderColor: '#16a34a' }}>
            YouTube authorized successfully.
          </div>
        )}

        {searchParams.error === 'denied' && (
          <div style={{ ...styles.banner, background: '#450a0a', borderColor: '#dc2626' }}>
            Authorization was denied. Please try again.
          </div>
        )}

        {searchParams.error === 'token_exchange_failed' && (
          <div style={{ ...styles.banner, background: '#450a0a', borderColor: '#dc2626' }}>
            Token exchange failed. Please try again.
          </div>
        )}

        <div style={styles.statusCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: isAuthorized ? (isExpired ? '#eab308' : '#16a34a') : '#dc2626',
            }} />
            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
              {isAuthorized ? (isExpired ? 'Token expired' : 'Authorized') : 'Not authorized'}
            </span>
          </div>

          {token && (
            <div style={{ fontSize: 13, color: '#71717a', lineHeight: 1.6 }}>
              <div>Channel: {token.channelId}</div>
              <div>Last authorized: {token.updatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              {token.authorizedBy && <div>Authorized by: {token.authorizedBy}</div>}
            </div>
          )}
        </div>

        <a
          href="/api/youtube/auth"
          style={styles.button}
        >
          {isAuthorized ? 'Re-authorize YouTube' : 'Authorize YouTube'}
        </a>

        <p style={{ color: '#52525b', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
          This grants Zoboomafoo read-only access to YouTube channel data and analytics.
          You can revoke access at any time from your Google account settings.
        </p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 16px',
  },
  card: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 12,
    padding: '32px 28px',
    width: '100%',
    maxWidth: 480,
  },
  logo: {
    fontSize: 32,
    marginBottom: 8,
  },
  title: {
    color: '#f4f4f5',
    margin: '0 0 4px',
    fontSize: 24,
    fontWeight: 700,
  },
  subtitle: {
    color: '#71717a',
    margin: '0 0 24px',
    fontSize: 15,
  },
  banner: {
    border: '1px solid',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 20,
    color: '#e2e8f0',
    fontSize: 14,
  },
  statusCard: {
    background: '#1e1e20',
    borderRadius: 8,
    padding: '16px',
    marginBottom: 20,
  },
  button: {
    display: 'inline-block',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
  },
};
