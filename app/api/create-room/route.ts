import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const { playerName } = await req.json();
    if (!playerName?.trim()) {
      return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
    }

    let code = generateCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await sql`SELECT id FROM rooms WHERE code = ${code}`;
      if (existing.length === 0) break;
      code = generateCode();
      attempts++;
    }

    const [room] = await sql`
      INSERT INTO rooms (code) VALUES (${code}) RETURNING id, code, state
    `;

    const [player] = await sql`
      INSERT INTO players (room_id, name) VALUES (${room.id}, ${playerName.trim()}) RETURNING id
    `;

    return NextResponse.json({ roomCode: room.code, playerId: player.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
