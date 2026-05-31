'use client';

/**
 * SectorAssignmentSelector — multi-select sektor.
 *
 * Sesuai design.md §Frontend Components & Pages dan Req 5.3.
 *
 * Props:
 *  - value: string[]            (sectorIds yang sudah dipilih)
 *  - onChange: (next) => void
 *  - sectors: { id, name }[]    (opsi yang tersedia)
 *  - disabled?: boolean
 */
import { useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export interface SectorOption {
  id: string;
  name: string;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  sectors: SectorOption[];
  disabled?: boolean;
  placeholder?: string;
}

export function SectorAssignmentSelector({
  value,
  onChange,
  sectors,
  disabled,
  placeholder = 'Pilih sektor...',
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sectors;
    return sectors.filter(
      (s) => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [sectors, search]);

  function toggle(id: string): void {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="w-full flex items-center justify-between gap-2 min-h-[44px] px-3 py-2 rounded-lg border bg-white text-left text-sm cursor-pointer aria-disabled:opacity-50"
        style={{ borderColor: 'var(--border)' }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {value.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            value.map((id) => {
              const sector = sectors.find((s) => s.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                  style={{ background: '#e8ecf5', color: 'var(--accent)' }}
                >
                  {id}
                  {sector?.name && <span className="text-slate-500">— {sector.name}</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    aria-label={`Hapus ${id}`}
                    className="hover:bg-black/10 rounded"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })
          )}
        </div>
        <ChevronDown size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
      </div>
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border shadow-lg max-h-72 overflow-hidden flex flex-col"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--border)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari sektor..."
              className="w-full px-2 py-1.5 text-sm"
              autoFocus
            />
          </div>
          <ul role="listbox" className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">Tidak ada sektor cocok.</li>
            ) : (
              filtered.map((s) => {
                const checked = selectedSet.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(s.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <span
                        className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                        style={{
                          borderColor: checked ? 'var(--accent)' : 'var(--border-strong)',
                          background: checked ? 'var(--accent)' : 'transparent',
                        }}
                      >
                        {checked && <Check size={11} color="white" />}
                      </span>
                      <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                        {s.id}
                      </span>
                      <span className="truncate text-slate-700">{s.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SectorAssignmentSelector;
