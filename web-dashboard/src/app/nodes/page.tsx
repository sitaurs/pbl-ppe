'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Server, Plus, Trash2, Search, Download, Power, ChevronUp, ChevronDown } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import NodeTable from '@/components/nodes/NodeTable';
import NodeWizard from '@/components/wizard/NodeWizard';
import LivePreviewPanel from '@/components/nodes/LivePreviewPanel';
import type { NodeData } from '@/lib/node-types';

type SortKey = 'sektorId' | 'sektorName' | 'cameraSource' | 'picName' | 'picPhone' | 'enabled';
type SortDir = 'asc' | 'desc';

/**
 * NodesPage — Main page for managing nodes (/nodes).
 *
 * Integrates:
 * - NodeTable with expandable tree view, health scores, and status polling
 * - NodeWizard for add/edit flows (multi-step wizard)
 * - LivePreviewPanel for camera streaming (singleton)
 * - Bulk actions, search, sort, and export functionality
 *
 * Data flow:
 * - Fetches nodes from GET /api/nodes on load (migration applied server-side)
 * - Add node: opens wizard in "add" mode → POST /api/nodes → refresh list
 * - Edit node: opens wizard in "edit" mode with initialData → PUT /api/nodes/[id] → refresh list
 * - Delete: confirmation dialog → DELETE /api/nodes/[id] → refresh list
 * - Duplicate: POST /api/nodes with copied data → refresh list
 * - Toggle enabled: PUT /api/nodes/[id] with toggled enabled → refresh list
 *
 * Requirements: 1.1, 4.10, 9.2
 */
export default function NodesPage() {
  // --- Data State ---
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Search & Sort ---
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // --- Selection (for bulk actions) ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // --- Wizard State ---
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<'add' | 'edit'>('add');
  const [wizardInitialData, setWizardInitialData] = useState<Partial<NodeData> | undefined>(undefined);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);

  // --- Live Preview ---
  const [livePreviewNodeId, setLivePreviewNodeId] = useState<number | null>(null);

  // --- Data Fetching ---
  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/nodes');
      if (res.ok) {
        const data = await res.json();
        setNodes(data);
      }
    } catch {
      // Silent fail — nodes remain empty
    } finally {
      setLoading(false);
    }
  };

  // --- Search Filter ---
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.filter(n =>
      n.sektorName.toLowerCase().includes(q) ||
      n.sektorId.toLowerCase().includes(q) ||
      n.picName.toLowerCase().includes(q)
    );
  }, [nodes, searchQuery]);

  // --- Sort ---
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

  // --- Selection ---
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

  // --- Wizard Handlers ---

  /** Open wizard in "add" mode */
  const handleOpenAddWizard = useCallback(() => {
    setWizardMode('add');
    setWizardInitialData(undefined);
    setEditingNodeId(null);
    setWizardOpen(true);
  }, []);

  /** Open wizard in "edit" mode with node data */
  const handleOpenEditWizard = useCallback((node: NodeData) => {
    setWizardMode('edit');
    setWizardInitialData(node);
    setEditingNodeId(node.id);
    setWizardOpen(true);
  }, []);

  /** Close wizard */
  const handleCloseWizard = useCallback(() => {
    setWizardOpen(false);
    setWizardInitialData(undefined);
    setEditingNodeId(null);
  }, []);

  /**
   * Handle wizard save — POST (add) or PUT (edit) to API, then refresh node list.
   * Requirement 4.10: save, close wizard, and show updated list within 2s.
   */
  const handleWizardSave = useCallback(async (data: Omit<NodeData, 'id'>) => {
    if (wizardMode === 'edit' && editingNodeId !== null) {
      // PUT existing node
      const res = await fetch(`/api/nodes/${editingNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Failed to update node');
      }
    } else {
      // POST new node
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Failed to create node');
      }
    }

    // Close wizard and refresh list
    handleCloseWizard();
    await fetchNodes();
  }, [wizardMode, editingNodeId, handleCloseWizard]);

  // --- Node Actions ---

  /** Delete node with confirmation */
  const handleDelete = useCallback(async (nodeId: number) => {
    if (!confirm('Hapus node ini?')) return;
    try {
      await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' });
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      await fetchNodes();
    } catch {
      // Silent fail
    }
  }, []);

  /** Duplicate node */
  const handleDuplicate = useCallback(async (node: NodeData) => {
    try {
      const duplicateData = {
        sektorId: node.sektorId,
        sektorName: `${node.sektorName} (Copy)`,
        picName: node.picName,
        picPhone: node.picPhone,
        cameraSource: node.cameraSource,
        camera: node.camera,
        esp32: node.esp32,
        detection: node.detection,
        enabled: node.enabled,
      };
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateData),
      });
      if (res.ok) await fetchNodes();
    } catch {
      // Silent fail
    }
  }, []);

  /** Toggle node enabled/disabled */
  const handleToggleEnabled = useCallback(async (node: NodeData) => {
    try {
      await fetch(`/api/nodes/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !node.enabled }),
      });
      await fetchNodes();
    } catch {
      // Silent fail
    }
  }, []);

  // --- Live Preview ---
  const handleViewLive = useCallback((nodeId: number) => {
    setLivePreviewNodeId(nodeId);
  }, []);

  const handleCloseLivePreview = useCallback(() => {
    setLivePreviewNodeId(null);
  }, []);

  // --- Bulk Actions ---
  const handleBulk = async (action: 'delete' | 'enable' | 'disable') => {
    if (action === 'delete' && !confirm(`Hapus ${selectedIds.size} node?`)) return;
    try {
      await fetch('/api/nodes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      await fetchNodes();
    } catch {
      // Silent fail
    }
  };

  // --- Export CSV ---
  const exportCSV = () => {
    const headers = ['sektorId', 'sektorName', 'picName', 'picPhone', 'cameraSource', 'enabled'];
    const rows = nodes.map(n =>
      headers.map(h => `"${String((n as unknown as Record<string, unknown>)[h]).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nodes_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Sort Arrow UI ---
  const SortArrow = ({ column }: { column: SortKey }) => (
    <span className="inline-flex flex-col ml-1 leading-none text-[9px]" style={{ color: sortKey === column ? 'var(--accent)' : 'var(--text-muted)' }}>
      <ChevronUp size={10} strokeWidth={sortKey === column && sortDir === 'asc' ? 3 : 1.5} />
      <ChevronDown size={10} strokeWidth={sortKey === column && sortDir === 'desc' ? 3 : 1.5} />
    </span>
  );

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Kelola Node</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manajemen node kamera & sektor</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg font-medium text-sm transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            title="Export CSV"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={handleOpenAddWizard}
            className="btn-primary flex items-center gap-2 min-h-[44px]"
          >
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
          <span className="text-sm font-medium mr-2" style={{ color: 'var(--text-secondary)' }}>
            {selectedIds.size} dipilih
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBulk('delete')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold min-h-[44px] transition-all"
              style={{ background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca' }}
            >
              <Trash2 size={12} /> Hapus ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBulk('disable')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold min-h-[44px] transition-all"
              style={{ background: '#f5f5f5', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Power size={12} /> Nonaktifkan
            </button>
            <button
              onClick={() => handleBulk('enable')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold min-h-[44px] transition-all"
              style={{ background: '#e8ecf5', color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              <Power size={12} /> Aktifkan
            </button>
          </div>
        </div>
      )}

      {/* Main Content: NodeTable or Empty/Loading States */}
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
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Isi data sektor dan konfigurasi kamera/ESP32</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>3</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Review konfigurasi dan simpan node baru</span>
              </div>
            </div>
          </div>
        ) : sortedNodes.length === 0 ? (
          <div className="p-10 text-center">
            <Search size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Tidak ditemukan node yang cocok dengan pencarian.</p>
          </div>
        ) : (
          /* NodeTable with tree view, health scores, and status polling */
          <NodeTable
            nodes={sortedNodes}
            onEdit={handleOpenEditWizard}
            onDuplicate={handleDuplicate}
            onToggleEnabled={handleToggleEnabled}
            onDelete={handleDelete}
            onViewLive={handleViewLive}
          />
        )}
      </div>

      {/* Counter */}
      {!loading && nodes.length > 0 && (
        <div className="mt-3 text-xs stagger-item stagger-4" style={{ color: 'var(--text-muted)' }}>
          Menampilkan {sortedNodes.length} dari {nodes.length} node
          {searchQuery.trim() && ` (filter aktif)`}
        </div>
      )}

      {/* Node Wizard (Add/Edit) */}
      {wizardOpen && (
        <NodeWizard
          mode={wizardMode}
          initialData={wizardInitialData}
          onSave={handleWizardSave}
          onClose={handleCloseWizard}
        />
      )}

      {/* Live Preview Panel (Singleton) */}
      {livePreviewNodeId !== null && (
        <LivePreviewPanel
          nodeId={livePreviewNodeId}
          onClose={handleCloseLivePreview}
        />
      )}
    </PageTransition>
  );
}
