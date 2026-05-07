'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Tab = 'create' | 'join';

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');
      sessionStorage.setItem('playerName', name.trim());
      sessionStorage.setItem('playerId', String(data.playerId));
      sessionStorage.setItem('roomCode', data.roomCode);
      router.push(`/room/${data.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/join-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: name.trim(), roomCode: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join room');
      sessionStorage.setItem('playerName', name.trim());
      sessionStorage.setItem('playerId', String(data.playerId));
      sessionStorage.setItem('roomCode', data.roomCode);
      router.push(`/room/${data.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
      <div className="text-center">
        <div className="text-6xl mb-3">🕵️</div>
        <h1 className="text-3xl font-bold text-gray-900">Thief</h1>
        <p className="text-gray-500 mt-1">A party game of deception &amp; deduction</p>
      </div>

      <div className="card w-full">
        <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
          <button
            onClick={() => { setTab('create'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'create' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}
          >
            Create Room
          </button>
          <button
            onClick={() => { setTab('join'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'join' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}
          >
            Join Room
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
              <input
                className="input"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={30}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading || !name.trim()}>
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
              <input
                className="input"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={30}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Room code</label>
              <input
                className="input uppercase tracking-widest font-mono"
                placeholder="ABC123"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading || !name.trim() || !code.trim()}>
              {loading ? 'Joining...' : 'Join Room'}
            </button>
          </form>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">4 players needed to start · Roles assigned automatically</p>
    </div>
  );
}
