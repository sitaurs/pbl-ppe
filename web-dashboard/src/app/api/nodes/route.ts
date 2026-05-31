import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { migrateNode } from '@/lib/node-migration';
import { syncFlatFields } from '@/lib/sync-flat-fields';

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
  // Apply migration on read for legacy nodes
  const migratedNodes = db.nodes.map((node: any) => migrateNode(node));
  return NextResponse.json(migratedNodes);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();

  // Build node with both flat + nested fields
  const newNode = { id: Date.now(), ...body, enabled: body.enabled ?? true };

  // Sync flat fields from nested objects for backward compatibility
  const syncedNode = syncFlatFields(newNode);

  // Ensure flat fields are always present
  syncedNode.sektorId = syncedNode.sektorId || '';
  syncedNode.sektorName = syncedNode.sektorName || '';
  syncedNode.picName = syncedNode.picName || '';
  syncedNode.picPhone = syncedNode.picPhone || '';
  syncedNode.cameraSource = syncedNode.cameraSource || '0';
  syncedNode.enabled = syncedNode.enabled ?? true;

  db.nodes.push(syncedNode);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return NextResponse.json(syncedNode);
}
