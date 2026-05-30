import { NextResponse } from 'next/server';
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

export async function POST(req: Request) {
  const { action, ids } = await req.json();

  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Invalid request. Requires action and ids[]' }, { status: 400 });
  }

  const db = getDb();

  switch (action) {
    case 'delete':
      db.nodes = db.nodes.filter((n: any) => !ids.includes(n.id));
      break;
    case 'enable':
      db.nodes = db.nodes.map((n: any) => ids.includes(n.id) ? { ...n, enabled: true } : n);
      break;
    case 'disable':
      db.nodes = db.nodes.map((n: any) => ids.includes(n.id) ? { ...n, enabled: false } : n);
      break;
    default:
      return NextResponse.json({ error: 'Unknown action. Use: delete, enable, disable' }, { status: 400 });
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return NextResponse.json({ success: true, affected: ids.length });
}
