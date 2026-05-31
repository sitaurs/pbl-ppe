import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { migrateNode } from '@/lib/node-migration';
import { syncFlatFields } from '@/lib/sync-flat-fields';

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

  // Merge existing node with incoming body
  const merged = { ...db.nodes[index], ...body };

  // Sync flat fields with nested objects for backward compatibility
  const syncedNode = syncFlatFields(merged);

  // Ensure flat fields are always present (ServiceAPDBackend.py reads these)
  syncedNode.sektorId = syncedNode.sektorId || '';
  syncedNode.sektorName = syncedNode.sektorName || '';
  syncedNode.picName = syncedNode.picName || '';
  syncedNode.picPhone = syncedNode.picPhone || '';
  syncedNode.cameraSource = syncedNode.cameraSource || '0';
  syncedNode.enabled = syncedNode.enabled ?? true;

  db.nodes[index] = syncedNode;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return NextResponse.json(syncedNode);
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const node = db.nodes.find((n: any) => n.id.toString() === id);
  if (!node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }
  // Apply migration for legacy nodes on read
  return NextResponse.json(migrateNode(node));
}
