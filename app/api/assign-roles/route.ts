import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import pusher from '@/lib/pusher';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(req: NextRequest) {
  try {
    const { roomCode } = await req.json();
    if (!roomCode) return NextResponse.json({ error: 'roomCode is required' }, { status: 400 });

    const [room] = await sql`SELECT id, code, state FROM rooms WHERE code = ${roomCode}`;
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.state !== 'waiting') {
      return NextResponse.json({ error: 'Game already started' }, { status: 400 });
    }

    const players = await sql`
      SELECT id FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;
    if (players.length < 4) {
      return NextResponse.json({ error: 'Need at least 4 players' }, { status: 400 });
    }

    const allHaveTokens = await sql`
      SELECT COUNT(*) as count FROM players WHERE room_id = ${room.id} AND token IS NULL
    `;
    if (parseInt(allHaveTokens[0].count) > 0) {
      return NextResponse.json({ error: 'All players must pick a token first' }, { status: 400 });
    }

    const roles: string[] = ['thief', 'police', ...Array(players.length - 2).fill('civilian')];
    const shuffled = shuffle(roles);

    for (let i = 0; i < players.length; i++) {
      await sql`UPDATE players SET role = ${shuffled[i]} WHERE id = ${players[i].id}`;
    }

    await sql`UPDATE rooms SET state = 'revealing' WHERE id = ${room.id}`;
    await pusher.trigger(`room-${room.code}`, 'roles-assigned', { state: 'revealing' });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
