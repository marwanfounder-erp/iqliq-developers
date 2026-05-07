import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import pusher from '@/lib/pusher';

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

    const players = await sql`
      SELECT id, name, token, role, score FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;

    const thief = players.find((p: { role: string }) => p.role === 'thief');
    const guessed = players.find((p: { id: number }) => p.id === parseInt(guessedPlayerId));

    if (!thief || !guessed) {
      return NextResponse.json({ error: 'Invalid player' }, { status: 400 });
    }

    const correct = thief.id === guessed.id;

    if (correct) {
      const police = players.find((p: { role: string }) => p.role === 'police');
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

    await pusher.trigger(`room-${room.code}`, 'guess-made', payload);

    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
