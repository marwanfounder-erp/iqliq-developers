import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const { playerName, roomCode } = await req.json();
    if (!playerName?.trim() || !roomCode?.trim()) {
      return NextResponse.json({ error: 'Name and room code are required' }, { status: 400 });
    }

    const [room] = await sql`SELECT id, code, state FROM rooms WHERE code = ${roomCode.trim()}`;
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.state !== 'waiting') {
      return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
    }

    const existingPlayers = await sql`SELECT id FROM players WHERE room_id = ${room.id}`;
    if (existingPlayers.length >= 8) {
      return NextResponse.json({ error: 'Room is full' }, { status: 400 });
    }

    const [player] = await sql`
      INSERT INTO players (room_id, name) VALUES (${room.id}, ${playerName.trim()}) RETURNING id
    `;

    const players = await sql`
      SELECT id, name, token, score FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;

    await pusher.trigger(`room-${room.code}`, 'player-joined', { players });

    return NextResponse.json({ roomCode: room.code, playerId: player.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
