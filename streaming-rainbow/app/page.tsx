export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#0f0f0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', color: '#71717a' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🌈</div>
        <h1 style={{ color: '#f4f4f5', fontSize: 28, margin: '0 0 8px' }}>Streaming Rainbow</h1>
        <p style={{ margin: 0, fontSize: 15 }}>Session scheduling for Zoboomafoo</p>
      </div>
    </main>
  );
}
