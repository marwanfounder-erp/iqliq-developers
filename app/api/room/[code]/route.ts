import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import pusher from '@/lib/pusher';

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params;
    const playerId = req.nextUrl.searchParams.get('playerId');

    const [room] = await sql`SELECT id, code, state FROM rooms WHERE code = ${code}`;
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const players = await sql`
      SELECT id, name, token, score FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;

    let myRole: string | null = null;
    if (playerId) {
      const [player] = await sql`
        SELECT role FROM players WHERE id = ${parseInt(playerId)} AND room_id = ${room.id}
      `;
      myRole = player?.role ?? null;
    }

    return NextResponse.json({ room, players, myRole });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params;
    const { action } = await req.json();

    const [room] = await sql`SELECT id, code, state FROM rooms WHERE code = ${code}`;
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    if (action === 'next-round') {
      await sql`UPDATE players SET token = NULL, role = NULL WHERE room_id = ${room.id}`;
      await sql`UPDATE rooms SET state = 'waiting' WHERE id = ${room.id}`;
      await pusher.trigger(`room-${room.code}`, 'next-round', {});
      return NextResponse.json({ ok: true });
    }

    if (action === 'start-guessing') {
      if (room.state !== 'revealing') {
        return NextResponse.json({ error: 'Not in revealing phase' }, { status: 400 });
      }
      await sql`UPDATE rooms SET state = 'guessing' WHERE id = ${room.id}`;
      await pusher.trigger(`room-${room.code}`, 'guessing-started', { state: 'guessing' });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
