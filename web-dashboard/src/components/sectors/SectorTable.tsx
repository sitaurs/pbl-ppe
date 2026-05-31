'use client';

/**
 * SectorTable — kolom: id, name, description, nodeCount, assignedUsersCount, aksi.
 */
import { Pencil, Users, Trash2 } from 'lucide-react';
import { PermissionGate } from '@/components/access/PermissionGate';

export interface SectorRow {
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
  assignedUserCount: number;
}

interface Props {
  sectors: SectorRow[];
  onEdit: (sector: SectorRow) => void;
  onAssign: (sector: SectorRow) => void;
  onDelete: (sector: SectorRow) => void;
}

export function SectorTable({ sectors, onEdit, onAssign, onDelete }: Props): React.ReactElement {
  if (sectors.length === 0) {
    return (
      <div className="p-10 text-center" style={{ color: 'var(--text-muted)' }}>
        Belum ada sektor terdaftar.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left px-4 py-3">ID</th>
            <th className="text-left px-4 py-3">Nama</th>
            <th className="text-left px-4 py-3">Deskripsi</th>
            <th className="text-left px-4 py-3">Node</th>
            <th className="text-left px-4 py-3">User Tertugas</th>
            <th className="text-right px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'white' }}>
                  {s.id}
                </span>
              </td>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {s.description ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm">{s.nodeCount}</td>
              <td className="px-4 py-3 text-sm">{s.assignedUserCount}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <PermissionGate permission="sector:update">
                    <button
                      type="button"
                      onClick={() => onEdit(s)}
                      className="p-2 rounded-lg hover:bg-blue-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Edit sektor"
                      style={{ color: 'var(--accent)' }}
                    >
                      <Pencil size={14} />
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="sector:assign-pic">
                    <button
                      type="button"
                      onClick={() => onAssign(s)}
                      className="p-2 rounded-lg hover:bg-blue-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Tugaskan user"
                      style={{ color: 'var(--orange)' }}
                    >
                      <Users size={14} />
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="sector:delete">
                    <button
                      type="button"
                      onClick={() => onDelete(s)}
                      className="btn-danger p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Hapus sektor"
                    >
                      <Trash2 size={14} />
                    </button>
                  </PermissionGate>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SectorTable;
