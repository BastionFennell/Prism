import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import LoginButton from '@/app/components/LoginButton';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const apiKey = process.env.STREAMING_RAINBOW_API_KEY ?? '(not set — add to Vercel env vars)';

  if (!session) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.logo}>🌈</div>
          <h1 style={styles.title}>Streaming Rainbow Admin</h1>
          <p style={styles.subtitle}>Log in with Discord to view the API key.</p>
          <LoginButton />
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.logo}>🌈</div>
        <h1 style={styles.title}>Streaming Rainbow Admin</h1>
        <p style={{ color: '#71717a', marginBottom: 28, fontSize: 14 }}>
          Logged in as <strong style={{ color: '#ccc' }}>{session.user.name}</strong>
        </p>

        <h2 style={{ fontSize: 16, color: '#e2e8f0', margin: '0 0 8px' }}>Zoboomafoo API Key</h2>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 12px' }}>
          Add this to your Zoboomafoo <code style={{ background: '#27272a', padding: '1px 5px', borderRadius: 3 }}>.env</code> file:
        </p>

        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>STREAMING_RAINBOW_API_KEY</div>
          <code style={{ color: '#a78bfa', fontSize: 15, wordBreak: 'break-all' }}>{apiKey}</code>
        </div>

        <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
          Also set <code style={{ background: '#27272a', padding: '1px 5px', borderRadius: 3 }}>STREAMING_RAINBOW_URL</code> in Zoboomafoo{' '}
          <code style={{ background: '#27272a', padding: '1px 5px', borderRadius: 3 }}>.env</code> to the URL of this app.
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
    padding: 24,
  },
  card: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 12,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 480,
  },
  logo: {
    fontSize: 36,
    marginBottom: 12,
  },
  title: {
    color: '#f4f4f5',
    margin: '0 0 8px',
    fontSize: 24,
    fontWeight: 700,
  },
  subtitle: {
    color: '#71717a',
    margin: '0 0 24px',
    fontSize: 15,
  },
};
