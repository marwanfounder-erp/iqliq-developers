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

    let result: Record<string, unknown> | null = null;
    try {
      const [row] = await sql`SELECT result_json FROM rooms WHERE id = ${room.id}`;
      result = row?.result_json ? JSON.parse(row.result_json) : null;
    } catch {
      // column not yet added
    }

    let roundCount = 0;
    try {
      const [rr] = await sql`SELECT round_count FROM rooms WHERE id = ${room.id}`;
      roundCount = rr?.round_count ?? 0;
    } catch {
      // column not yet added — run migration in schema.sql
    }

    return NextResponse.json({
      room: { id: room.id, code: room.code, state: room.state, roundCount },
      players,
      myRole,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[room GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params;
    const { action } = await req.json();

    const [room] = await sql`SELECT id, code, state FROM rooms WHERE code = ${code}`;
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    if (action === 'next-round') {
      if (room.state === 'gameover') {
        return NextResponse.json({ error: 'Game is over. Start a new game instead.' }, { status: 400 });
      }
      await sql`UPDATE players SET token = NULL, role = NULL WHERE room_id = ${room.id}`;
      await sql`UPDATE rooms SET state = 'waiting', result_json = NULL WHERE id = ${room.id}`;
      try {
        await pusher.trigger(`room-${room.code}`, 'next-round', {});
      } catch (pusherErr) {
        console.error('[room POST next-round] Pusher failed:', pusherErr instanceof Error ? pusherErr.message : pusherErr);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'new-game') {
      await sql`UPDATE players SET token = NULL, role = NULL, score = 0 WHERE room_id = ${room.id}`;
      await sql`UPDATE rooms SET state = 'waiting', result_json = NULL WHERE id = ${room.id}`;
      try {
        await sql`UPDATE rooms SET round_count = 0 WHERE id = ${room.id}`;
      } catch {
        // column not yet added
      }
      try {
        await pusher.trigger(`room-${room.code}`, 'new-game', {});
      } catch (pusherErr) {
        console.error('[room POST new-game] Pusher failed:', pusherErr instanceof Error ? pusherErr.message : pusherErr);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'start-guessing') {
      if (room.state !== 'revealing') {
        return NextResponse.json({ error: 'Not in revealing phase' }, { status: 400 });
      }
      await sql`UPDATE rooms SET state = 'guessing' WHERE id = ${room.id}`;
      try {
        await pusher.trigger(`room-${room.code}`, 'guessing-started', { state: 'guessing' });
      } catch (pusherErr) {
        console.error('[room POST start-guessing] Pusher failed:', pusherErr instanceof Error ? pusherErr.message : pusherErr);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[room POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
