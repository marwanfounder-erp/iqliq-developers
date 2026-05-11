import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import pusher from '@/lib/pusher';

type PlayerRow = { id: number; name: string; token: string; role: string; score: number };

const TOTAL_ROUNDS = 10;

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

    const thief    = players.find(p => p.role === 'thief');
    const police   = players.find(p => p.role === 'police');
    const king     = players.find(p => p.role === 'king');
    const queen    = players.find(p => p.role === 'queen');
    const minister = players.find(p => p.role === 'minister');
    const guessed  = players.find(p => p.id === parseInt(guessedPlayerId));

    if (!thief || !guessed) {
      return NextResponse.json({ error: 'Invalid player' }, { status: 400 });
    }

    const correct = thief.id === guessed.id;

    // Automatic role points awarded every round
    const pointsEarned: { id: number; pts: number }[] = [];
    if (king) {
      await sql`UPDATE players SET score = score + 2000 WHERE id = ${king.id}`;
      pointsEarned.push({ id: king.id, pts: 2000 });
    }
    if (queen) {
      await sql`UPDATE players SET score = score + 1000 WHERE id = ${queen.id}`;
      pointsEarned.push({ id: queen.id, pts: 1000 });
    }
    if (minister) {
      await sql`UPDATE players SET score = score + 700 WHERE id = ${minister.id}`;
      pointsEarned.push({ id: minister.id, pts: 700 });
    }

    // Police vs Thief outcome
    if (correct) {
      if (police) {
        await sql`UPDATE players SET score = score + 2500 WHERE id = ${police.id}`;
        pointsEarned.push({ id: police.id, pts: 2500 });
      }
    } else {
      await sql`UPDATE players SET score = score + 700 WHERE id = ${thief.id}`;
      pointsEarned.push({ id: thief.id, pts: 700 });
    }

    // Increment round count and check for game over
    let gameOver = false;
    try {
      const [rr] = await sql`
        UPDATE rooms SET round_count = round_count + 1 WHERE id = ${room.id} RETURNING round_count
      `;
      gameOver = (rr?.round_count ?? 0) >= TOTAL_ROUNDS;
    } catch {
      // round_count column not yet added — run migration in schema.sql
    }

    const newState = gameOver ? 'gameover' : 'result';

    const resultJson = JSON.stringify({
      correct,
      guessedName: guessed.name,
      thiefName: thief.name,
      thiefToken: thief.token,
      gameOver,
      pointsEarned,
    });

    await sql`UPDATE rooms SET state = ${newState}, result_json = ${resultJson} WHERE id = ${room.id}`;

    const updatedPlayers = await sql`
      SELECT id, name, token, score FROM players WHERE room_id = ${room.id} ORDER BY joined_at
    `;

    const payload = {
      correct,
      guessedName: guessed.name,
      thiefName: thief.name,
      thiefToken: thief.token,
      gameOver,
      pointsEarned,
      players: updatedPlayers,
    };

    try {
      await pusher.trigger(`room-${room.code}`, 'guess-made', payload);
    } catch (pusherErr) {
      console.error('[make-guess] Pusher failed:', pusherErr instanceof Error ? pusherErr.message : pusherErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[make-guess]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
