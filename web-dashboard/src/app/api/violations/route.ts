import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const violationsPath = path.join(process.cwd(), 'data', 'violations.json');

function getViolations(): any[] {
  if (!fs.existsSync(violationsPath)) {
    fs.mkdirSync(path.dirname(violationsPath), { recursive: true });
    fs.writeFileSync(violationsPath, JSON.stringify([], null, 2));
  }
  const file = fs.readFileSync(violationsPath, 'utf8');
  try {
    return JSON.parse(file);
  } catch {
    return [];
  }
}

export async function GET() {
  const violations = getViolations();
  // Return newest first
  return NextResponse.json(violations.reverse());
}

export async function POST(req: Request) {
  const violations = getViolations();
  const body = await req.json();
  const entry = { id: Date.now(), timestamp: new Date().toISOString(), ...body };
  violations.push(entry);
  // Keep last 500 entries max
  const trimmed = violations.slice(-500);
  fs.writeFileSync(violationsPath, JSON.stringify(trimmed, null, 2));
  return NextResponse.json(entry);
}
