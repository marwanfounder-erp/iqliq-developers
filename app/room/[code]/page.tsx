'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Pusher from 'pusher-js';

type Player = { id: number; name: string; token: string | null; score: number };
type Room = { id: number; code: string; state: string };
type GuessResult = { correct: boolean; guessedName: string; thiefName: string; thiefToken: string };

const TOKENS = [
  { id: 'key',        emoji: '🗝️', label: 'Key'         },
  { id: 'diamond',    emoji: '💎', label: 'Diamond'      },
  { id: 'phone',      emoji: '📱', label: 'Phone'        },
  { id: 'briefcase',  emoji: '💼', label: 'Briefcase'    },
  { id: 'mask',       emoji: '🎭', label: 'Mask'         },
  { id: 'crystal',    emoji: '🔮', label: 'Crystal'      },
  { id: 'scroll',     emoji: '📜', label: 'Scroll'       },
  { id: 'vase',       emoji: '🏺', label: 'Vase'         },
  { id: 'coin',       emoji: '🪙', label: 'Coin'         },
  { id: 'gift',       emoji: '🎁', label: 'Gift'         },
  { id: 'telescope',  emoji: '🔭', label: 'Telescope'    },
  { id: 'hat',        emoji: '🎩', label: 'Hat'          },
];

function tokenLabel(id: string | null) {
  if (!id) return null;
  const t = TOKENS.find(t => t.id === id);
  return t ? `${t.emoji} ${t.label}` : id;
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const [myPlayerName, setMyPlayerName] = useState('');
  const [myRole, setMyRole] = useState<string | null>(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [countingDown, setCountingDown] = useState(false);
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [selectedGuess, setSelectedGuess] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRoom = useCallback(async (pid?: number) => {
    const id = pid ?? myPlayerId;
    const url = `/api/room/${code}${id ? `?playerId=${id}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) { router.push('/'); return; }
    const data = await res.json();
    setRoom(data.room);
    setPlayers(data.players);
    setLoading(false);
  }, [code, myPlayerId, router]);

  // Bootstrap from sessionStorage
  useEffect(() => {
    const name = sessionStorage.getItem('playerName');
    const id = sessionStorage.getItem('playerId');
    const storedCode = sessionStorage.getItem('roomCode');
    if (!name || !id || storedCode !== code) { router.push('/'); return; }
    setMyPlayerName(name);
    const pid = parseInt(id);
    setMyPlayerId(pid);
    fetchRoom(pid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Pusher subscription
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;

    const pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusherClient.subscribe(`room-${code}`);

    channel.bind('player-joined', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });

    channel.bind('token-picked', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });

    channel.bind('roles-assigned', () => {
      setRoom(prev => prev ? { ...prev, state: 'revealing' } : prev);
      setRoleRevealed(false);
      setMyRole(null);
      setSelectedToken(null);
    });

    channel.bind('guessing-started', () => {
      setRoom(prev => prev ? { ...prev, state: 'guessing' } : prev);
    });

    channel.bind('guess-made', (data: GuessResult & { players: Player[] }) => {
      setRoom(prev => prev ? { ...prev, state: 'result' } : prev);
      setGuessResult({ correct: data.correct, guessedName: data.guessedName, thiefName: data.thiefName, thiefToken: data.thiefToken });
      setPlayers(data.players);
    });

    channel.bind('next-round', () => {
      setRoom(prev => prev ? { ...prev, state: 'waiting' } : prev);
      setRoleRevealed(false);
      setGuessResult(null);
      setMyRole(null);
      setSelectedToken(null);
      setSelectedGuess(null);
      setCountingDown(false);
      setCountdown(5);
      if (countdownRef.current) clearInterval(countdownRef.current);
      fetchRoom();
    });

    return () => {
      channel.unbind_all();
      pusherClient.unsubscribe(`room-${code}`);
      pusherClient.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  async function handleRevealRole() {
    if (!myPlayerId) return;
    const res = await fetch(`/api/room/${code}?playerId=${myPlayerId}`);
    const data = await res.json();
    setMyRole(data.myRole);
    setRoleRevealed(true);

    if (data.myRole === 'police') {
      setCountingDown(true);
      setCountdown(5);
      let c = 5;
      countdownRef.current = setInterval(async () => {
        c--;
        setCountdown(c);
        if (c <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setCountingDown(false);
          await fetch(`/api/room/${code}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start-guessing' }),
          });
        }
      }, 1000);
    }
  }

  async function handlePickToken() {
    if (!selectedToken || !myPlayerId) return;
    setActionLoading(true);
    await fetch('/api/pick-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: code, playerId: myPlayerId, token: selectedToken }),
    });
    setActionLoading(false);
  }

  async function handleAssignRoles() {
    setActionLoading(true);
    setError('');
    const res = await fetch('/api/assign-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: code }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    setActionLoading(false);
  }

  async function handleMakeGuess() {
    if (!selectedGuess) return;
    setActionLoading(true);
    await fetch('/api/make-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: code, guessedPlayerId: selectedGuess }),
    });
    setActionLoading(false);
  }

  async function handleNextRound() {
    setActionLoading(true);
    await fetch(`/api/room/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next-round' }),
    });
    setActionLoading(false);
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const myPlayer = players.find(p => p.id === myPlayerId);
  const isHost = players[0]?.id === myPlayerId;
  const allHaveTokens = players.length >= 4 && players.every(p => p.token !== null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">Loading room...</div>
      </div>
    );
  }

  if (!room) return null;

  // ─── WAITING PHASE ──────────────────────────────────────────────────────────
  if (room.state === 'waiting') {
    return (
      <div className="flex flex-col gap-4">
        <div className="card text-center">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Room Code</p>
          <button onClick={copyCode} className="group flex items-center justify-center gap-2 mx-auto">
            <span className="text-4xl font-bold tracking-widest text-gray-900 font-mono">{code}</span>
            <span className="text-gray-400 group-hover:text-[#5b50e8] transition-colors text-lg">
              {copied ? '✓' : '⎘'}
            </span>
          </button>
          <p className="text-xs text-gray-400 mt-1">{copied ? 'Copied!' : 'Tap to copy'}</p>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">
            Players <span className="text-gray-400 font-normal text-sm">({players.length}/8)</span>
          </h2>
          <div className="flex flex-col gap-2">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <span className="font-medium text-gray-800">{p.name}</span>
                  {i === 0 && <span className="text-xs bg-[#5b50e8]/10 text-[#5b50e8] px-1.5 py-0.5 rounded-md font-medium">Host</span>}
                  {p.id === myPlayerId && <span className="text-xs text-gray-400">(you)</span>}
                </div>
                <span className="text-sm">
                  {p.token ? (
                    <span className="text-green-600 font-medium">{tokenLabel(p.token)}</span>
                  ) : (
                    <span className="text-gray-300">picking...</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {myPlayer && !myPlayer.token && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Pick your token</h2>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {TOKENS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedToken(t.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                    selectedToken === t.id
                      ? 'border-[#5b50e8] bg-[#5b50e8]/5'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <span className="text-[10px] text-gray-500">{t.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={handlePickToken}
              disabled={!selectedToken || actionLoading}
              className="btn-primary w-full"
            >
              {actionLoading ? 'Saving...' : 'Lock in token'}
            </button>
          </div>
        )}

        {myPlayer?.token && !isHost && (
          <div className="card text-center text-gray-500 text-sm py-4">
            Waiting for host to start the game...
          </div>
        )}

        {isHost && (
          <div className="card">
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={handleAssignRoles}
              disabled={!allHaveTokens || actionLoading}
              className="btn-primary w-full"
            >
              {actionLoading ? 'Starting...' : allHaveTokens ? 'Start Game' : `Waiting for all players to pick tokens (${players.filter(p => p.token).length}/${players.length})`}
            </button>
            {players.length < 4 && (
              <p className="text-xs text-gray-400 text-center mt-2">Need at least 4 players</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── REVEALING PHASE ────────────────────────────────────────────────────────
  if (room.state === 'revealing') {
    const roleConfig: Record<string, { icon: string; label: string; color: string; desc: string }> = {
      police:   { icon: '🚔', label: 'Police',   color: 'text-blue-600',  desc: 'Find the thief! You\'ll have a moment to observe before guessing.' },
      thief:    { icon: '🦹', label: 'Thief',    color: 'text-red-600',   desc: 'Stay calm. Don\'t let the police figure out it\'s you!' },
      civilian: { icon: '🧑', label: 'Civilian', color: 'text-green-600', desc: 'You\'re innocent. Watch as the drama unfolds!' },
    };

    return (
      <div className="flex flex-col gap-4">
        <div className="card text-center">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Room</p>
          <span className="text-2xl font-bold tracking-widest text-gray-900 font-mono">{code}</span>
        </div>

        <div className="card flex flex-col items-center text-center gap-4">
          {!roleRevealed ? (
            <>
              <div className="text-5xl">🎭</div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Your role is ready</h2>
                <p className="text-gray-500 text-sm mt-1">Make sure no one else can see your screen</p>
              </div>
              <button onClick={handleRevealRole} className="btn-primary w-full">
                Reveal my role
              </button>
            </>
          ) : myRole && roleConfig[myRole] ? (
            <>
              <div className="text-6xl">{roleConfig[myRole].icon}</div>
              <div>
                <p className="text-sm text-gray-400 uppercase tracking-wider font-medium mb-1">You are</p>
                <h2 className={`text-3xl font-bold ${roleConfig[myRole].color}`}>
                  {roleConfig[myRole].label}
                </h2>
              </div>
              <p className="text-gray-500 text-sm">{roleConfig[myRole].desc}</p>

              {myRole === 'police' && countingDown && (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-[#5b50e8] flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{countdown}</span>
                  </div>
                  <p className="text-xs text-gray-400">Transitioning to guess screen...</p>
                </div>
              )}

              {myRole !== 'police' && (
                <div className="w-full bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
                  Police is reviewing the players...
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Players</h3>
          <div className="flex flex-col gap-1.5">
            {players.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{p.name}{p.id === myPlayerId ? ' (you)' : ''}</span>
                <span className="text-gray-400">{tokenLabel(p.token)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── GUESSING PHASE ─────────────────────────────────────────────────────────
  if (room.state === 'guessing') {
    const isPolice = myRole === 'police';
    const otherPlayers = players.filter(p => p.id !== myPlayerId);

    if (!isPolice) {
      return (
        <div className="flex flex-col gap-4">
          <div className="card text-center">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Room</p>
            <span className="text-2xl font-bold tracking-widest text-gray-900 font-mono">{code}</span>
          </div>
          <div className="card flex flex-col items-center gap-4 py-8">
            <div className="text-5xl">🚔</div>
            <h2 className="text-xl font-bold text-gray-900">Police is deciding...</h2>
            <p className="text-gray-500 text-sm text-center">Stay calm. The police is studying everyone's tokens.</p>
            <div className="flex gap-1 mt-2">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-[#5b50e8] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Players &amp; Tokens</h3>
            <div className="flex flex-col gap-1.5">
              {players.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{p.name}{p.id === myPlayerId ? ' (you)' : ''}</span>
                  <span className="text-gray-400">{tokenLabel(p.token)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="card text-center">
          <div className="text-4xl mb-1">🚔</div>
          <h1 className="text-xl font-bold text-gray-900">Who is the Thief?</h1>
          <p className="text-gray-500 text-sm mt-1">Study the tokens and make your guess</p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Select a suspect</h3>
          <div className="flex flex-col gap-2">
            {otherPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedGuess(p.id)}
                className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                  selectedGuess === p.id
                    ? 'border-[#5b50e8] bg-[#5b50e8]/5'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <span className="font-medium text-gray-800">{p.name}</span>
                <span className="text-gray-500">{tokenLabel(p.token)}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleMakeGuess}
          disabled={!selectedGuess || actionLoading}
          className="btn-primary w-full"
        >
          {actionLoading ? 'Submitting...' : 'Submit Guess'}
        </button>
      </div>
    );
  }

  // ─── RESULT PHASE ───────────────────────────────────────────────────────────
  if (room.state === 'result' && guessResult) {
    return (
      <div className="flex flex-col gap-4">
        <div className={`card text-center ${guessResult.correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="text-5xl mb-2">{guessResult.correct ? '✅' : '❌'}</div>
          <h1 className="text-2xl font-bold text-gray-900">
            {guessResult.correct ? 'Police wins!' : 'Thief wins!'}
          </h1>
          <p className="text-gray-600 text-sm mt-2">
            {guessResult.correct
              ? `${guessResult.guessedName} was caught red-handed!`
              : `The police guessed wrong.`}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">The Thief</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900 text-lg">{guessResult.thiefName}</p>
              <p className="text-gray-500 text-sm">was hiding with {tokenLabel(guessResult.thiefToken)}</p>
            </div>
            <div className="text-3xl">🦹</div>
          </div>
          {!guessResult.correct && (
            <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">
              Police guessed: <strong>{guessResult.guessedName}</strong>
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Scoreboard</h3>
          <div className="flex flex-col gap-2">
            {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 w-4">{i + 1}</span>
                  <span className="font-medium text-gray-800">
                    {p.name}
                    {p.id === myPlayerId && <span className="text-gray-400 font-normal"> (you)</span>}
                  </span>
                </div>
                <span className="font-bold text-gray-900">{p.score} <span className="font-normal text-gray-400 text-sm">pts</span></span>
              </div>
            ))}
          </div>
        </div>

        {isHost ? (
          <button onClick={handleNextRound} disabled={actionLoading} className="btn-primary w-full">
            {actionLoading ? 'Starting...' : 'Next Round'}
          </button>
        ) : (
          <div className="card text-center text-gray-500 text-sm py-3">
            Waiting for host to start next round...
          </div>
        )}

        <button onClick={() => router.push('/')} className="btn-secondary w-full">
          Leave Game
        </button>
      </div>
    );
  }

  // Intermediate state — result phase but guessResult not yet set (Pusher race)
  if (room.state === 'result') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">Loading results...</div>
      </div>
    );
  }

  return null;
}
