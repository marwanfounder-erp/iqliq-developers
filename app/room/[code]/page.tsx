'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Pusher from 'pusher-js';

type Player = { id: number; name: string; token: string | null; score: number };
type Room = { id: number; code: string; state: string };
type GuessResult = { correct: boolean; guessedName: string; thiefName: string; thiefToken: string };

const TOKENS = [
  { id: 'key',       emoji: '🗝️', label: 'Key'        },
  { id: 'diamond',   emoji: '💎', label: 'Diamond'     },
  { id: 'phone',     emoji: '📱', label: 'Phone'       },
  { id: 'briefcase', emoji: '💼', label: 'Briefcase'   },
  { id: 'mask',      emoji: '🎭', label: 'Mask'        },
  { id: 'crystal',   emoji: '🔮', label: 'Crystal'     },
  { id: 'scroll',    emoji: '📜', label: 'Scroll'      },
  { id: 'vase',      emoji: '🏺', label: 'Vase'        },
  { id: 'coin',      emoji: '🪙', label: 'Coin'        },
  { id: 'gift',      emoji: '🎁', label: 'Gift'        },
  { id: 'telescope', emoji: '🔭', label: 'Telescope'   },
  { id: 'hat',       emoji: '🎩', label: 'Hat'         },
];

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-orange-100 text-orange-700',
];

function tokenLabel(id: string | null) {
  if (!id) return null;
  const t = TOKENS.find(t => t.id === id);
  return t ? `${t.emoji} ${t.label}` : id;
}

function Avatar({ name, index, size = 'md' }: { name: string; index: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const sizeClass = size === 'lg' ? 'w-14 h-14 text-xl' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';
  return (
    <div className={`${sizeClass} ${color} rounded-full flex items-center justify-center font-bold flex-shrink-0`}>
      {name[0].toUpperCase()}
    </div>
  );
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [countingDown, setCountingDown] = useState(false);
  const [hideCountdown, setHideCountdown] = useState(5);
  const [roleHidden, setRoleHidden] = useState(false);
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
    // Sync role — safe because the reveal UI is gated by roleRevealed, not myRole
    if (data.myRole) setMyRole(data.myRole);
    // Sync persisted result so ALL devices exit the loading spinner simultaneously
    if (data.result) setGuessResult(data.result);
    setLoading(false);
  }, [code, myPlayerId, router]);

  useEffect(() => {
    const name = sessionStorage.getItem('playerName');
    const id = sessionStorage.getItem('playerId');
    const storedCode = sessionStorage.getItem('roomCode');
    if (!name || !id || storedCode !== code) { router.push('/'); return; }
    const pid = parseInt(id);
    setMyPlayerId(pid);
    fetchRoom(pid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Poll every 2 s in all states — primary update mechanism when Pusher isn't
  // configured, and a safety net for any missed events.
  useEffect(() => {
    if (!myPlayerId) return;
    const interval = setInterval(() => fetchRoom(), 2000);
    return () => clearInterval(interval);
  }, [myPlayerId, fetchRoom]);

  // Pusher subscription
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    const pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
    const channel = pusherClient.subscribe(`room-${code}`);

    channel.bind('player-joined', (data: { players: Player[] }) => setPlayers(data.players));
    channel.bind('token-picked', (data: { players: Player[] }) => setPlayers(data.players));
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
      setGuessResult(data);
      setPlayers(data.players);
    });
    channel.bind('next-round', () => {
      setRoom(prev => prev ? { ...prev, state: 'waiting' } : prev);
      setRoleRevealed(false);
      setRoleHidden(false);
      setHideCountdown(5);
      setGuessResult(null);
      setMyRole(null);
      setSelectedToken(null);
      setSelectedGuess(null);
      setCountingDown(false);
      setCountdown(5);
      if (countdownRef.current) clearInterval(countdownRef.current);
      fetchRoom();
    });

    return () => { channel.unbind_all(); pusherClient.unsubscribe(`room-${code}`); pusherClient.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleRevealRole() {
    if (!myPlayerId) return;
    // Use cached role if already fetched, otherwise fetch now
    let role = myRole;
    if (!role) {
      const res = await fetch(`/api/room/${code}?playerId=${myPlayerId}`);
      const data = await res.json();
      role = data.myRole;
      setMyRole(role);
    }
    setRoleRevealed(true);
    setRoleHidden(false);
    setHideCountdown(5);

    if (role === 'police') {
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
          // Immediately apply guessing state so police sees the guess UI
          setRoom(prev => prev ? { ...prev, state: 'guessing' } : prev);
        }
      }, 1000);
    } else {
      // Non-police: auto-hide role after 5 s so others can't peek at the screen
      let h = 5;
      const hideTimer = setInterval(() => {
        h--;
        setHideCountdown(h);
        if (h <= 0) {
          clearInterval(hideTimer);
          setRoleHidden(true);
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
    await fetchRoom();
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
    if (!res.ok) {
      setError(data.error);
      setActionLoading(false);
      return;
    }
    await fetchRoom();
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
    // Result is stored in DB — fetchRoom will pick it up for ALL devices at the
    // same time via polling. Do NOT apply it locally here so the police and
    // everyone else see the reveal simultaneously.
    await fetchRoom();
    setActionLoading(false);
  }

  async function handleNextRound() {
    setActionLoading(true);
    await fetch(`/api/room/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next-round' }),
    });
    setRoleRevealed(false);
    setRoleHidden(false);
    setHideCountdown(5);
    setGuessResult(null);
    setMyRole(null);
    setSelectedToken(null);
    setSelectedGuess(null);
    await fetchRoom();
    setActionLoading(false);
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const myPlayer = players.find(p => p.id === myPlayerId);
  const myPlayerIndex = players.findIndex(p => p.id === myPlayerId);
  const isHost = players[0]?.id === myPlayerId;
  const tokensPicked = players.filter(p => p.token).length;
  const allHaveTokens = players.length >= 4 && tokensPicked === players.length;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#5b50e8] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Joining room...</p>
        </div>
      </div>
    );
  }

  if (!room) return null;

  // ── Room code badge (reused across phases) ────────────────────────────────

  const RoomBadge = () => (
    <button onClick={copyCode} className="flex items-center gap-2 self-center bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm hover:shadow transition-all">
      <span className="text-xs text-gray-400 font-medium">Room</span>
      <span className="font-bold tracking-widest text-gray-900 font-mono text-lg">{code}</span>
      <span className="text-gray-300 text-sm">{copied ? '✓' : '⎘'}</span>
    </button>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // WAITING
  // ═══════════════════════════════════════════════════════════════════════════

  if (room.state === 'waiting') {
    return (
      <div className="flex flex-col gap-4">
        <RoomBadge />

        {/* Player list */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Players</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{players.length} joined</span>
          </div>
          <div className="flex flex-col gap-3">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <Avatar name={p.name} index={i} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-800 truncate">{p.name}</span>
                    {i === 0 && <span className="text-[10px] bg-[#5b50e8]/10 text-[#5b50e8] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">Host</span>}
                    {p.id === myPlayerId && <span className="text-xs text-gray-400">you</span>}
                  </div>
                </div>
                {p.token ? (
                  <span className="text-sm font-medium text-gray-600 shrink-0">{tokenLabel(p.token)}</span>
                ) : (
                  <div className="flex gap-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {players.length >= 4 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Tokens picked</span>
                <span className="font-semibold text-gray-700">{tokensPicked}/{players.length}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#5b50e8] rounded-full transition-all duration-500"
                  style={{ width: `${(tokensPicked / players.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Token picker */}
        {myPlayer && !myPlayer.token && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-1">Pick your token</h2>
            <p className="text-sm text-gray-400 mb-4">Choose an item to carry — the thief will try to blend in</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {TOKENS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedToken(t.id)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all active:scale-95 ${
                    selectedToken === t.id
                      ? 'border-[#5b50e8] bg-[#5b50e8]/5 shadow-sm'
                      : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                  }`}
                >
                  <span className="text-2xl leading-none">{t.emoji}</span>
                  <span className="text-[10px] text-gray-500 leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
            <button onClick={handlePickToken} disabled={!selectedToken || actionLoading} className="btn-primary w-full">
              {actionLoading ? 'Locking in...' : selectedToken ? `Lock in ${tokenLabel(selectedToken)}` : 'Pick a token above'}
            </button>
          </div>
        )}

        {myPlayer?.token && !isHost && (
          <div className="card text-center py-5">
            <p className="text-2xl mb-2">{tokenLabel(myPlayer.token)}</p>
            <p className="text-sm text-gray-500">Your token is locked in</p>
            <p className="text-xs text-gray-400 mt-1">Waiting for host to start...</p>
          </div>
        )}

        {isHost && (
          <div className="card">
            {error && <p className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded-lg">{error}</p>}
            <button onClick={handleAssignRoles} disabled={!allHaveTokens || actionLoading} className="btn-primary w-full">
              {actionLoading
                ? 'Starting game...'
                : players.length < 4
                ? 'Need at least 4 players'
                : !allHaveTokens
                ? `Waiting for tokens (${tokensPicked}/${players.length})`
                : '🎮 Start Game'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">Only you can start as the host</p>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVEALING
  // ═══════════════════════════════════════════════════════════════════════════

  if (room.state === 'revealing') {
    const roleConfig: Record<string, { icon: string; label: string; bg: string; text: string; ring: string; desc: string }> = {
      police:   { icon: '🚔', label: 'Police',   bg: 'bg-blue-50',   text: 'text-blue-700',  ring: 'ring-blue-200',  desc: 'Memorise everyone\'s tokens. You\'ll have a few seconds to observe before you guess.' },
      thief:    { icon: '🦹', label: 'Thief',    bg: 'bg-red-50',    text: 'text-red-700',   ring: 'ring-red-200',   desc: 'You stole something! Stay calm and don\'t let the police figure out it\'s you.' },
      civilian: { icon: '🧑', label: 'Civilian', bg: 'bg-green-50',  text: 'text-green-700', ring: 'ring-green-200', desc: 'You\'re innocent. Watch the drama unfold!' },
    };
    const cfg = myRole && roleConfig[myRole];

    return (
      <div className="flex flex-col gap-4">
        <RoomBadge />

        <div className="card flex flex-col items-center text-center gap-5">
          {!roleRevealed ? (
            <>
              <div className="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center text-4xl shadow-lg mt-2">
                🎭
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Your role is ready</h2>
                <p className="text-gray-400 text-sm mt-1">Make sure no one else can see your screen</p>
              </div>
              <button onClick={handleRevealRole} className="btn-primary w-full text-lg py-4">
                Reveal my role
              </button>
            </>
          ) : cfg ? (
            <>
              <div className={`w-24 h-24 ${cfg.bg} ring-4 ${cfg.ring} rounded-3xl flex items-center justify-center text-5xl shadow-sm mt-2`}>
                {cfg.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">You are the</p>
                <h2 className={`text-4xl font-black ${cfg.text}`}>{cfg.label}</h2>
              </div>
              <p className="text-gray-500 text-sm max-w-xs">{cfg.desc}</p>

              {myRole === 'police' && countingDown && (
                <div className="w-full">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="w-14 h-14 rounded-full bg-[#5b50e8] flex items-center justify-center shadow-lg">
                      <span className="text-2xl font-black text-white">{countdown}</span>
                    </div>
                    <p className="text-sm text-gray-500 text-left">Get ready to<br /><strong>pick the thief</strong></p>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5b50e8] rounded-full transition-all duration-1000"
                      style={{ width: `${(countdown / 5) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {myRole !== 'police' && !roleHidden && (
                <div className="w-full">
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center mb-2">
                    <p className="text-xs text-amber-600 font-medium">Screen hides in {hideCountdown}s — don&apos;t let others peek!</p>
                  </div>
                  <button onClick={() => setRoleHidden(true)} className="btn-secondary w-full text-sm py-2">
                    Hide now
                  </button>
                </div>
              )}
              {myRole !== 'police' && roleHidden && (
                <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
                  <p className="text-2xl mb-1">🔒</p>
                  <p className="text-sm text-gray-500">Role hidden</p>
                  <button onClick={() => { setRoleHidden(false); setHideCountdown(3); }} className="text-xs text-[#5b50e8] mt-1 underline">
                    Peek again (3 s)
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">All Players</h3>
          <div className="flex flex-col gap-3">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <Avatar name={p.name} index={i} size="sm" />
                <span className="flex-1 text-gray-700 font-medium">{p.name}{p.id === myPlayerId ? ' (you)' : ''}</span>
                <span className="text-gray-400 text-sm">{tokenLabel(p.token)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUESSING
  // ═══════════════════════════════════════════════════════════════════════════

  if (room.state === 'guessing') {
    const isPolice = myRole === 'police';
    const suspects = players.filter(p => p.id !== myPlayerId);
    const selectedPlayer = players.find(p => p.id === selectedGuess);

    if (!isPolice) {
      return (
        <div className="flex flex-col gap-4">
          <RoomBadge />
          <div className="card flex flex-col items-center gap-5 py-8 text-center">
            <div className="relative">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-4xl">🚔</div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#5b50e8] rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-ping" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Police is deciding...</h2>
              <p className="text-sm text-gray-400 mt-1">Stay calm. Act natural.</p>
            </div>
          </div>

          <div className="card">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Players &amp; Tokens</h3>
            <div className="flex flex-col gap-3">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Avatar name={p.name} index={i} size="sm" />
                  <span className="flex-1 text-gray-700 font-medium">{p.name}{p.id === myPlayerId ? ' (you)' : ''}</span>
                  <span className="text-gray-500">{tokenLabel(p.token)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="card bg-[#5b50e8] border-0 text-center py-5">
          <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mb-1">You are the Police</p>
          <h1 className="text-white text-2xl font-black">Who is the Thief?</h1>
          <p className="text-blue-200 text-sm mt-1">Study the tokens — one person is hiding something</p>
        </div>

        <div className="flex flex-col gap-2">
          {suspects.map((p, i) => {
            const playerIndex = players.findIndex(pl => pl.id === p.id);
            const isSelected = selectedGuess === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedGuess(isSelected ? null : p.id)}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] text-left ${
                  isSelected
                    ? 'border-[#5b50e8] bg-[#5b50e8]/5 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <Avatar name={p.name} index={playerIndex} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{p.name}</p>
                  <p className="text-sm text-gray-400 mt-0.5">{tokenLabel(p.token)}</p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                  isSelected ? 'border-[#5b50e8] bg-[#5b50e8]' : 'border-gray-200'
                }`}>
                  {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                </div>
              </button>
            );
          })}
        </div>

        {selectedPlayer && (
          <button
            onClick={handleMakeGuess}
            disabled={actionLoading}
            className="btn-primary w-full text-base py-4"
          >
            {actionLoading ? 'Submitting...' : `Accuse ${selectedPlayer.name} 🚨`}
          </button>
        )}

        {!selectedPlayer && (
          <div className="text-center text-sm text-gray-400 py-2">
            Tap a player to select them
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULT
  // ═══════════════════════════════════════════════════════════════════════════

  if (room.state === 'result') {
    if (!guessResult) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#5b50e8] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className={`card text-center py-7 border-2 ${guessResult.correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="text-5xl mb-3">{guessResult.correct ? '🎉' : '💀'}</div>
          <h1 className="text-2xl font-black text-gray-900">
            {guessResult.correct ? 'Police wins!' : 'Thief escapes!'}
          </h1>
          <p className="text-gray-500 text-sm mt-2 max-w-xs mx-auto">
            {guessResult.correct
              ? `${guessResult.guessedName} was caught red-handed!`
              : `Police guessed ${guessResult.guessedName} — wrong call.`}
          </p>
        </div>

        <div className="card">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">The Thief Was</p>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-red-50 ring-2 ring-red-200 rounded-2xl flex items-center justify-center text-3xl">
              🦹
            </div>
            <div>
              <p className="text-xl font-black text-gray-900">{guessResult.thiefName}</p>
              <p className="text-gray-400 text-sm">carrying {tokenLabel(guessResult.thiefToken)}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Scoreboard</p>
          <div className="flex flex-col gap-2">
            {[...players]
              .sort((a, b) => b.score - a.score)
              .map((p, i) => {
                const playerIndex = players.findIndex(pl => pl.id === p.id);
                return (
                  <div key={p.id} className="flex items-center gap-3 py-1">
                    <span className="text-xs font-bold text-gray-300 w-4">#{i + 1}</span>
                    <Avatar name={p.name} index={playerIndex} size="sm" />
                    <span className="flex-1 font-medium text-gray-800">
                      {p.name}
                      {p.id === myPlayerId && <span className="text-gray-400 font-normal text-sm"> (you)</span>}
                    </span>
                    <span className="font-black text-gray-900 text-lg">{p.score}</span>
                    <span className="text-xs text-gray-400">pts</span>
                  </div>
                );
              })}
          </div>
        </div>

        {isHost ? (
          <button onClick={handleNextRound} disabled={actionLoading} className="btn-primary w-full py-4 text-base">
            {actionLoading ? 'Starting...' : '▶ Next Round'}
          </button>
        ) : (
          <div className="card text-center text-gray-400 text-sm py-3">
            Waiting for host to start next round...
          </div>
        )}

        <button onClick={() => router.push('/')} className="btn-secondary w-full">
          Leave Game
        </button>
      </div>
    );
  }

  return null;
}
