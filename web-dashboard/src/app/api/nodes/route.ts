import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

function getDb() {
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify({ nodes: [] }, null, 2));
  }
  const file = fs.readFileSync(dbPath, 'utf8');
  try {
    return JSON.parse(file);
  } catch {
    return { nodes: [] };
  }
}

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.nodes);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const newNode = { id: Date.now(), ...body, enabled: true };
  db.nodes.push(newNode);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return NextResponse.json(newNode);
}
