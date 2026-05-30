import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

function getDb() {
  if (!fs.existsSync(dbPath)) return { nodes: [] };
  const file = fs.readFileSync(dbPath, 'utf8');
  try {
    return JSON.parse(file);
  } catch {
    return { nodes: [] };
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const index = db.nodes.findIndex((n: any) => n.id.toString() === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }
  db.nodes[index] = { ...db.nodes[index], ...body };
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return NextResponse.json(db.nodes[index]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  db.nodes = db.nodes.filter((n: any) => n.id.toString() !== id);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return NextResponse.json({ success: true });
}
