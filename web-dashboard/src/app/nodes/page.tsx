'use client';

import { useState, useEffect, useMemo } from 'react';
import { Server, Plus, Trash2, X, MapPin, Phone, Search, Download, Pencil, Copy, Power, ChevronUp, ChevronDown } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

interface NodeData {
  id: number;
  sektorId: string;
  sektorName: string;
  picName: string;
  picPhone: string;
  cameraSource: string;
  enabled: boolean;
}

type SortKey = 'sektorId' | 'sektorName' | 'cameraSource' | 'picName' | 'picPhone' | 'enabled';
type SortDir = 'asc' | 'desc';

export default function NodesPage() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNode, setEditNode] = useState<NodeData | null>(null);
  const [form, setForm] = useState({
    sektorId: '',
    sektorName: '',
    cameraSource: '0',
    picName: '',
    picPhone: '62'
  });

  useEffect(() => { fetchNodes(); }, []);

  const fetchNodes = async () => {
    try {
      const res = await fetch('/api/nodes');
      if (res.ok) setNodes(await res.json());
    } catch {} finally { setLoading(false); }
  };

  // Search filter
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.filter(n =>
      n.sektorName.toLowerCase().includes(q) ||
      n.sektorId.toLowerCase().includes(q) ||
      n.picName.toLowerCase().includes(q)
    );
  }, [nodes, searchQuery]);

  // Sort
  const sortedNodes = useMemo(() => {
    if (!sortKey) return filteredNodes;
    return [...filteredNodes].sort((a, b) => {
      const aVal = String(a[sortKey]).toLowerCase();
      const bVal = String(b[sortKey]).toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredNodes, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortArrow = ({ column }: { column: SortKey }) => (
    <span className="inline-flex flex-col ml-1 leading-none text-[9px]" style={{ color: sortKey === column ? 'var(--accent)' : 'var(--text-muted)' }}>
      <ChevronUp size={10} strokeWidth={sortKey === column && sortDir === 'asc' ? 3 : 1.5} />
      <ChevronDown size={10} strokeWidth={sortKey === column && sortDir === 'desc' ? 3 : 1.5} />
    </span>
  );

  // Selection
  const allFilteredSelected = sortedNodes.length > 0 && sortedNodes.every(n => selectedIds.has(n.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedNodes.map(n => n.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  // CRUD handlers
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setShowAddModal(false);
        setForm({ sektorId: '', sektorName: '', cameraSource: '0', picName: '', picPhone: '62' });
        fetchNodes();
      }
    } catch {}
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNode) return;
    try {
      const res = await fetch(`/api/nodes/${editNode.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setEditNode(null);
        fetchNodes();
      }
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus node ini?')) return;
    try {
      await fetch(`/api/nodes/${id}`, { method: 'DELETE' });
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
      fetchNodes();
    } catch {}
  };

  const handleDuplicate = async (node: NodeData) => {
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sektorId: node.sektorId,
          sektorName: `${node.sektorName} (Copy)`,
          picName: node.picName,
          picPhone: node.picPhone,
          cameraSource: node.cameraSource
        })
      });
      if (res.ok) fetchNodes();
    } catch {}
  };

  const handleToggleEnabled = async (node: NodeData) => {
    try {
      await fetch(`/api/nodes/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !node.enabled })
      });
      fetchNodes();
    } catch {}
  };

  // Bulk actions
  const handleBulk = async (action: 'delete' | 'enable' | 'disable') => {
    if (action === 'delete' && !confirm(`Hapus ${selectedIds.size} node?`)) return;
    try {
      await fetch('/api/nodes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selectedIds) })
      });
      setSelectedIds(new Set());
      fetchNodes();
    } catch {}
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ['sektorId', 'sektorName', 'picName', 'picPhone', 'cameraSource', 'enabled'];
    const rows = nodes.map(n => headers.map(h => `"${String((n as any)[h]).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nodes_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEditModal = (node: NodeData) => {
    setEditNode(node);
    setForm({
      sektorId: node.sektorId,
      sektorName: node.sektorName,
      cameraSource: node.cameraSource,
      picName: node.picName,
      picPhone: node.picPhone
    });
  };

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Kelola Node</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manajemen node kamera & sektor</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={exportCSV} className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg font-medium text-sm transition-all" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }} title="Export CSV">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2 min-h-[44px]">
            <Plus size={14} /> Tambah Node
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="stagger-item stagger-2 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Cari berdasarkan nama sektor, ID, atau PIC..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10"
            style={{ minHeight: '44px' }}
          />
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="stagger-item mb-4 p-3 rounded-lg flex flex-wrap items-center gap-2" style={{ background: '#f0f4fa', border: '1px solid var(--border)' }}>
          <span className="text-sm font-medium mr-2" style={{ color: 'var(--text-secondary)' }}>{selectedIds.size} dipilih</span>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => handleBulk('delete')} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold min-h-[44px] transition-all" style={{ background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca' }}>
              <Trash2 size={12} /> Hapus ({selectedIds.size})
            </button>
            <button onClick={() => handleBulk('disable')} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold min-h-[44px] transition-all" style={{ background: '#f5f5f5', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <Power size={12} /> Nonaktifkan
            </button>
            <button onClick={() => handleBulk('enable')} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold min-h-[44px] transition-all" style={{ background: '#e8ecf5', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
              <Power size={12} /> Aktifkan
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden stagger-item stagger-3">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="skeleton h-10 rounded-lg" />
            <div className="skeleton h-10 rounded-lg" />
            <div className="skeleton h-10 rounded-lg" />
          </div>
        ) : nodes.length === 0 ? (
          /* Empty State */
          <div className="p-10 text-center">
            <Server size={40} className="mx-auto mb-4 opacity-20" />
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Belum Ada Node Terdaftar</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Ikuti langkah berikut untuk memulai:</p>
            <div className="max-w-xs mx-auto text-left space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>1</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Klik tombol <strong>Tambah Node</strong> di atas</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>2</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Isi data sektor dan sumber kamera</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>3</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Assign PIC beserta nomor WA</span>
              </div>
            </div>
          </div>
        ) : sortedNodes.length === 0 ? (
          <div className="p-10 text-center">
            <Search size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Tidak ditemukan node yang cocok dengan pencarian.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-center px-3 py-3 w-10">
                    <span
                      onClick={toggleSelectAll}
                      className="inline-flex items-center justify-center w-[44px] h-[44px] rounded cursor-pointer transition-all"
                    >
                      <span
                        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded border-2 transition-all"
                        style={{
                          borderColor: allFilteredSelected ? 'var(--accent)' : 'var(--border-strong)',
                          background: allFilteredSelected ? 'var(--accent)' : 'transparent'
                        }}
                      >
                        {allFilteredSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </span>
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('sektorId')}>
                    <span className="inline-flex items-center">ID Sektor <SortArrow column="sektorId" /></span>
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('sektorName')}>
                    <span className="inline-flex items-center">Nama Sektor <SortArrow column="sektorName" /></span>
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('cameraSource')}>
                    <span className="inline-flex items-center">Sumber Kamera <SortArrow column="cameraSource" /></span>
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('picName')}>
                    <span className="inline-flex items-center">PIC <SortArrow column="picName" /></span>
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('picPhone')}>
                    <span className="inline-flex items-center">No WA <SortArrow column="picPhone" /></span>
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('enabled')}>
                    <span className="inline-flex items-center">Status <SortArrow column="enabled" /></span>
                  </th>
                  <th className="text-center px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sortedNodes.map((node) => (
                  <tr key={node.id} className={selectedIds.has(node.id) ? '!bg-blue-50/50' : ''}>
                    <td className="text-center px-3 py-3">
                      <span
                        onClick={() => toggleSelect(node.id)}
                        className="inline-flex items-center justify-center w-[44px] h-[44px] rounded cursor-pointer transition-all"
                      >
                        <span
                          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded border-2 transition-all"
                          style={{
                            borderColor: selectedIds.has(node.id) ? 'var(--accent)' : 'var(--border-strong)',
                            background: selectedIds.has(node.id) ? 'var(--accent)' : 'transparent'
                          }}
                        >
                          {selectedIds.has(node.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'white' }}>
                        {node.sektorId}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{node.sektorName}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{node.cameraSource}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin size={12} style={{ color: 'var(--accent)' }} />
                        {node.picName}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Phone size={12} style={{ color: 'var(--orange)' }} />
                        <span className="font-mono text-xs">{node.picPhone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {node.enabled ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                          <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--accent)' }} />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }} />
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditModal(node)} className="p-2 rounded-lg hover:bg-blue-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Edit" style={{ color: 'var(--accent)' }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDuplicate(node)} className="p-2 rounded-lg hover:bg-blue-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Duplikat" style={{ color: 'var(--text-secondary)' }}>
                          <Copy size={14} />
                        </button>
                        <button onClick={() => handleToggleEnabled(node)} className="p-2 rounded-lg hover:bg-blue-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title={node.enabled ? 'Nonaktifkan' : 'Aktifkan'} style={{ color: node.enabled ? 'var(--orange)' : 'var(--text-muted)' }}>
                          <Power size={14} />
                        </button>
                        <button onClick={() => handleDelete(node.id)} className="btn-danger p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Hapus">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Counter */}
      {!loading && nodes.length > 0 && (
        <div className="mt-3 text-xs stagger-item stagger-4" style={{ color: 'var(--text-muted)' }}>
          Menampilkan {sortedNodes.length} dari {nodes.length} node
          {searchQuery.trim() && ` (filter aktif)`}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(26,26,46,0.5)' }} onClick={() => setShowAddModal(false)}>
          <div className="card p-5 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Tambah Node</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-lg hover:bg-black/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X size={18} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>ID Sektor</label>
                  <input value={form.sektorId} onChange={e => setForm({...form, sektorId: e.target.value})} placeholder="S-01" required className="w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Nama Sektor</label>
                  <input value={form.sektorName} onChange={e => setForm({...form, sektorName: e.target.value})} placeholder="Area Gudang" required className="w-full" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Sumber Kamera</label>
                <input value={form.cameraSource} onChange={e => setForm({...form, cameraSource: e.target.value})} placeholder="rtsp://... atau 0" required className="w-full" />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Gunakan "0" untuk webcam lokal, atau URL RTSP untuk IP Camera (contoh: rtsp://192.168.1.10/live/ch00_1)</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Nama PIC</label>
                  <input value={form.picName} onChange={e => setForm({...form, picName: e.target.value})} placeholder="Pak Budi" required className="w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No WA PIC</label>
                  <input value={form.picPhone} onChange={e => setForm({...form, picPhone: e.target.value})} placeholder="628xxx" required className="w-full" />
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm min-h-[44px]" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Batal</button>
                <button type="submit" className="flex-1 btn-primary min-h-[44px]">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(26,26,46,0.5)' }} onClick={() => setEditNode(null)}>
          <div className="card p-5 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Edit Node — {editNode.sektorName}</h2>
              <button onClick={() => setEditNode(null)} className="p-2 rounded-lg hover:bg-black/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X size={18} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>ID Sektor</label>
                  <input value={form.sektorId} onChange={e => setForm({...form, sektorId: e.target.value})} placeholder="S-01" required className="w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Nama Sektor</label>
                  <input value={form.sektorName} onChange={e => setForm({...form, sektorName: e.target.value})} placeholder="Area Gudang" required className="w-full" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Sumber Kamera</label>
                <input value={form.cameraSource} onChange={e => setForm({...form, cameraSource: e.target.value})} placeholder="rtsp://... atau 0" required className="w-full" />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Gunakan "0" untuk webcam lokal, atau URL RTSP untuk IP Camera</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Nama PIC</label>
                  <input value={form.picName} onChange={e => setForm({...form, picName: e.target.value})} placeholder="Pak Budi" required className="w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No WA PIC</label>
                  <input value={form.picPhone} onChange={e => setForm({...form, picPhone: e.target.value})} placeholder="628xxx" required className="w-full" />
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setEditNode(null)} className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm min-h-[44px]" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Batal</button>
                <button type="submit" className="flex-1 btn-primary min-h-[44px]">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
