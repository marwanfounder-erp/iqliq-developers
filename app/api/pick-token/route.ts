import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const { roomCode, playerId, token } = await req.json();
    if (!roomCode || !playerId || !token) {
      return NextResponse.json({ error: 'roomCode, playerId, and token are required' }, { status: 400 });
    }

    const [room] = await sql`SELECT id, code, state FROM rooms WHERE code = ${roomCode}`;
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.state !== 'waiting') {
      return NextResponse.json({ error: 'Cannot pick token now' }, { status: 400 });
    }

    await sql`UPDATE players SET token = ${token} WHERE id = ${playerId} AND room_id = ${room.id}`;

    const players = await sql`
      SELECT id, name, token, score FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;

    try {
      await pusher.trigger(`room-${room.code}`, 'token-picked', { players });
    } catch (pusherErr) {
      console.error('[pick-token] Pusher failed:', pusherErr instanceof Error ? pusherErr.message : pusherErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pick-token]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
