'use client';

/**
 * AuditLogFilters — filter bar untuk halaman /audit-log.
 *
 * Sesuai Req 13.4.
 */
import { Search } from 'lucide-react';
import { ALL_AUDIT_ACTIONS } from '@/lib/audit/action-types';

export interface AuditFilterState {
  from: string;
  to: string;
  action: string;
  userId: string;
  resourceType: string;
}

const RESOURCE_TYPES = ['', 'user', 'role', 'sector', 'node', 'violation', 'setting', 'audit-log', 'service-token'];

interface Props {
  value: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
  onApply: () => void;
  onReset: () => void;
}

export function AuditLogFilters({ value, onChange, onApply, onReset }: Props): React.ReactElement {
  const update = (patch: Partial<AuditFilterState>): void => onChange({ ...value, ...patch });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
      className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
    >
      <label className="flex flex-col gap-1 text-xs font-medium md:col-span-1">
        <span style={{ color: 'var(--text-secondary)' }}>Dari</span>
        <input
          type="datetime-local"
          value={value.from}
          onChange={(e) => update({ from: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium md:col-span-1">
        <span style={{ color: 'var(--text-secondary)' }}>Sampai</span>
        <input
          type="datetime-local"
          value={value.to}
          onChange={(e) => update({ to: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium md:col-span-1">
        <span style={{ color: 'var(--text-secondary)' }}>Action</span>
        <select value={value.action} onChange={(e) => update({ action: e.target.value })}>
          <option value="">Semua action</option>
          {ALL_AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium md:col-span-1">
        <span style={{ color: 'var(--text-secondary)' }}>Resource</span>
        <select value={value.resourceType} onChange={(e) => update({ resourceType: e.target.value })}>
          {RESOURCE_TYPES.map((r) => (
            <option key={r || 'all'} value={r}>
              {r === '' ? 'Semua resource' : r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium md:col-span-1">
        <span style={{ color: 'var(--text-secondary)' }}>User ID</span>
        <input
          type="text"
          value={value.userId}
          onChange={(e) => update({ userId: e.target.value })}
          placeholder="UUID atau system:..."
          className="font-mono text-xs"
        />
      </label>
      <div className="flex items-center gap-2 md:col-span-1">
        <button type="submit" className="btn-primary flex items-center gap-2 min-h-[44px] flex-1">
          <Search size={14} /> Terapkan
        </button>
        <button
          type="button"
          onClick={onReset}
          className="px-3 py-2 rounded-lg border min-h-[44px] text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          Reset
        </button>
      </div>
    </form>
  );
}

export default AuditLogFilters;
