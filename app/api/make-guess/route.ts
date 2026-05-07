import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import pusher from '@/lib/pusher';

type PlayerRow = { id: number; name: string; token: string; role: string; score: number };

export async function POST(req: NextRequest) {
  try {
    const { roomCode, guessedPlayerId } = await req.json();
    if (!roomCode || !guessedPlayerId) {
      return NextResponse.json({ error: 'roomCode and guessedPlayerId are required' }, { status: 400 });
    }

    const [room] = await sql`SELECT id, code, state FROM rooms WHERE code = ${roomCode}`;
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.state !== 'guessing') {
      return NextResponse.json({ error: 'Not in guessing phase' }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, name, token, role, score FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;
    const players = rows as PlayerRow[];

    const thief = players.find(p => p.role === 'thief');
    const guessed = players.find(p => p.id === parseInt(guessedPlayerId));

    if (!thief || !guessed) {
      return NextResponse.json({ error: 'Invalid player' }, { status: 400 });
    }

    const correct = thief.id === guessed.id;

    if (correct) {
      const police = players.find(p => p.role === 'police');
      if (police) await sql`UPDATE players SET score = score + 1 WHERE id = ${police.id}`;
    } else {
      await sql`UPDATE players SET score = score + 1 WHERE id = ${thief.id}`;
    }

    await sql`UPDATE rooms SET state = 'result' WHERE id = ${room.id}`;

    const updatedPlayers = await sql`
      SELECT id, name, token, score FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;

    const payload = {
      correct,
      guessedName: guessed.name,
      thiefName: thief.name,
      thiefToken: thief.token,
      players: updatedPlayers,
    };

    try {
      await pusher.trigger(`room-${room.code}`, 'guess-made', payload);
    } catch (pusherErr) {
      console.error('[make-guess] Pusher failed:', pusherErr instanceof Error ? pusherErr.message : pusherErr);
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[make-guess]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
