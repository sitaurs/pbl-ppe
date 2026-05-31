'use client';

/**
 * PermissionTreePicker — tree (per resource) dengan tri-state checkbox per
 * grup. Sesuai design.md §Frontend Components & Pages dan Req 6.3.
 */
import { useEffect, useMemo, useRef } from 'react';
import { ALL_PERMISSIONS, type PermissionId } from '@/lib/rbac/permission-types';

interface Props {
  value: PermissionId[];
  onChange: (next: PermissionId[]) => void;
  disabled?: boolean;
}

interface Group {
  resource: string;
  permissions: PermissionId[];
}

const RESOURCE_LABELS: Record<string, string> = {
  node: 'Node',
  violation: 'Pelanggaran',
  report: 'Laporan',
  live: 'Live Monitor',
  sector: 'Sektor',
  setting: 'Pengaturan',
  user: 'User',
  role: 'Role',
  'audit-log': 'Audit Log',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Tambah',
  read: 'Lihat',
  update: 'Ubah',
  delete: 'Hapus',
  toggle: 'Toggle Aktif',
  'test-connection': 'Test Koneksi',
  acknowledge: 'Acknowledge',
  export: 'Ekspor',
  generate: 'Generate',
  view: 'Lihat',
  'assign-pic': 'Tugaskan PIC',
  'update:branding': 'Ubah Branding',
  'update:notification': 'Ubah Notifikasi',
  'update:system': 'Ubah Sistem',
  'reset-password': 'Reset Password',
  'assign-permission': 'Tugaskan Permission',
};

function buildGroups(): Group[] {
  const map = new Map<string, PermissionId[]>();
  for (const p of ALL_PERMISSIONS) {
    const colon = p.indexOf(':');
    const resource = p.slice(0, colon);
    const list = map.get(resource) ?? [];
    list.push(p);
    map.set(resource, list);
  }
  return Array.from(map.entries()).map(([resource, permissions]) => ({ resource, permissions }));
}

const GROUPS: Group[] = buildGroups();

export function PermissionTreePicker({ value, onChange, disabled }: Props): React.ReactElement {
  const selected = useMemo(() => new Set(value), [value]);

  function toggleSingle(permission: PermissionId): void {
    const next = new Set(selected);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    onChange(Array.from(next));
  }

  function toggleGroup(group: Group, allChecked: boolean): void {
    const next = new Set(selected);
    if (allChecked) {
      for (const p of group.permissions) next.delete(p);
    } else {
      for (const p of group.permissions) next.add(p);
    }
    onChange(Array.from(next));
  }

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => {
        const checkedCount = group.permissions.filter((p) => selected.has(p)).length;
        const allChecked = checkedCount === group.permissions.length;
        const someChecked = checkedCount > 0 && !allChecked;
        return (
          <GroupSection
            key={group.resource}
            group={group}
            selected={selected}
            allChecked={allChecked}
            someChecked={someChecked}
            disabled={disabled}
            onToggleGroup={() => toggleGroup(group, allChecked)}
            onToggleSingle={toggleSingle}
          />
        );
      })}
    </div>
  );
}

interface GroupSectionProps {
  group: Group;
  selected: Set<PermissionId>;
  allChecked: boolean;
  someChecked: boolean;
  disabled?: boolean;
  onToggleGroup: () => void;
  onToggleSingle: (p: PermissionId) => void;
}

function GroupSection({
  group,
  selected,
  allChecked,
  someChecked,
  disabled,
  onToggleGroup,
  onToggleSingle,
}: GroupSectionProps): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someChecked;
  }, [someChecked]);

  return (
    <fieldset className="border rounded-lg" style={{ borderColor: 'var(--border)' }}>
      <legend className="px-2 ml-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {RESOURCE_LABELS[group.resource] ?? group.resource}
      </legend>
      <div className="p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input
            ref={ref}
            type="checkbox"
            checked={allChecked}
            onChange={onToggleGroup}
            disabled={disabled}
            className="w-4 h-4"
            style={{ width: 'auto', padding: 0 }}
          />
          <span>Pilih semua {RESOURCE_LABELS[group.resource] ?? group.resource}</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-5">
          {group.permissions.map((p) => {
            const action = p.slice(p.indexOf(':') + 1);
            return (
              <label
                key={p}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p)}
                  onChange={() => onToggleSingle(p)}
                  disabled={disabled}
                  className="w-4 h-4"
                  style={{ width: 'auto', padding: 0 }}
                />
                <span>{ACTION_LABELS[action] ?? action}</span>
                <code className="text-[10px] text-slate-400 ml-auto">{p}</code>
              </label>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}

export default PermissionTreePicker;
