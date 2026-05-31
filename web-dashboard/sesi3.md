# Sesi 3 — Implementasi Penuh Node Detail Tree View

## Ringkasan

Pada sesi ini, seluruh spec **Node Detail Tree View** diimplementasikan dari nol hingga selesai. Total **47 task** di-eksekusi secara paralel menggunakan wave-based scheduling (11 wave), menghasilkan **30+ file baru** dan beberapa file yang diupdate.

---

## Timeline Eksekusi

### 1. Run All Tasks — Orchestration

Saya membaca `tasks.md`, meng-queue semua 41 leaf tasks, dan mengeksekusi berdasarkan dependency graph (Task Dependency Graph) secara paralel per wave.

---

### Wave 0 — Foundation Types

| Task | File | Deskripsi |
|------|------|-----------|
| 1.1 | `src/lib/node-types.ts` | TypeScript interfaces: `CameraConfig`, `ESP32Config`, `DetectionConfig`, `NodeData`, `NodeComposition`, `ComponentStatus`, `NodeStatus`, `HealthScore`, `ConnectionTestRequest`, `ConnectionTestResponse`, `NodeTreeViewProps`, `StatusIndicatorProps`, `HealthScoreIndicatorProps`, `NodeWizardProps`, `WizardStepperProps` |

---

### Wave 1 — Core Utilities + First Component

| Task | File | Deskripsi |
|------|------|-----------|
| 1.2 | `src/lib/node-migration.ts` | `migrateNode()` — konversi flat-field legacy nodes ke extended schema. Deteksi already-migrated, derive protocol (rtsp/local/http), set defaults |
| 1.4 | `src/lib/health-score.ts` | `calculateHealthScore()` — weighted scoring per composition type (camera 40/30/30, camera-only 60/40, esp32-only 60/40). Labels: Sehat/Perlu Perhatian/Kritis |
| 4.4 | `src/components/nodes/CompositionIcon.tsx` | Icon component: Camera icon, Chip icon, atau combined berdasarkan NodeComposition type |

---

### Wave 2 — Property Tests + API + StatusIndicator

| Task | File | Deskripsi |
|------|------|-----------|
| 1.3 | `src/lib/__tests__/node-migration.property.test.ts` | Property 9: fast-check test untuk migrasi legacy nodes (5 properties, 100 runs each) |
| 1.5 | `src/lib/__tests__/health-score.property.test.ts` | Property 3: fast-check test untuk health score formula & labeling (8 properties, 200 runs) |
| 2.1 | `src/app/api/nodes/route.ts` (updated) | GET: apply `migrateNode()` on read. POST: persist flat+nested, sync via `syncFlatFields()` |
| 2.1 | `src/app/api/nodes/[id]/route.ts` (updated) | PUT: merge + syncFlatFields. GET: apply migration. DELETE: unchanged |
| 4.1 | `src/components/nodes/StatusIndicator.tsx` | Color-coded dot: online (#22c55e+pulse 1.5s), offline (#ef4444), degraded (#f59e0b+pulse 3s), unconfigured (#9ca3af). Tooltip with relative time |

---

### Wave 3 — More APIs + Tests + Components

| Task | File | Deskripsi |
|------|------|-----------|
| 2.2 | `src/lib/sync-flat-fields.ts` | Extracted `syncFlatFields()` ke shared module |
| 2.2 | `src/lib/__tests__/node-roundtrip.property.test.ts` | Property 8: round-trip preserves flat+nested (5 properties) |
| 2.3 | `src/app/api/nodes/[id]/status/route.ts` | **NEW** — GET endpoint: TCP probe ke camera RTSP host:port (3s timeout), TCP probe ke MQTT broker. Returns online/offline/unconfigured |
| 2.4 | `src/app/api/nodes/test-connection/route.ts` | **NEW** — POST endpoint: Camera test (TCP probe 10s), MQTT test (mqtt npm TLS 10s). Input validation |
| 4.2 | `src/components/nodes/__tests__/status-indicator.property.test.ts` | Property 2: status→color+animation mapping (7 properties) |
| 4.3 | `src/components/nodes/HealthScoreIndicator.tsx` | SVG circular progress (36x36px), stroke-dasharray, color badge, smooth transition |

---

### Wave 4 — Tree Components + QuickAction + Validation Test

| Task | File | Deskripsi |
|------|------|-----------|
| 2.5 | `src/lib/connection-test-validation.ts` | Extracted validation logic dari API route |
| 2.5 | `src/lib/__tests__/connection-test-validation.property.test.ts` | Property 10: input validation (8 properties) |
| 4.5 | `src/components/nodes/TreeItem.tsx` | Leaf item: label+value, connector lines (├─ └─), 16px indent, role="treeitem" |
| 4.5 | `src/components/nodes/TreeSection.tsx` | Collapsible section: expand/collapse, StatusIndicator, chevron, aria-expanded, keyboard nav |
| 5.1 | `src/components/nodes/QuickActionButton.tsx` | States: idle/loading/success/failure. 5s auto-reset. Error with possible causes |

---

### Wave 5 — NodeTreeView + LivePreview + Wizard Start

| Task | File | Deskripsi |
|------|------|-----------|
| 4.6 | `src/components/nodes/NodeTreeView.tsx` | Container: conditional sections, role="tree", full keyboard nav (Arrow Up/Down/Left/Right, Enter/Space, Home/End), quick action visibility logic |
| 5.2 | `src/components/nodes/LivePreviewPanel.tsx` | WebSocket frame viewer: base64 JPEG, singleton, close within 2s, reconnect button |
| 7.1 | `src/components/wizard/WizardStepper.tsx` | 4-step horizontal stepper: active/completed/pending/skipped states, responsive |
| 7.2 | `src/components/wizard/StepSectorInfo.tsx` | Step 1: node name (1-100 chars), sector dropdown, inline validation, touched state |

---

### Wave 6 — Property Tests + More Wizard Steps + Quick Actions Wire

| Task | File | Deskripsi |
|------|------|-----------|
| 4.7 | `src/components/nodes/__tests__/composition-derivation.property.test.ts` | Property 1: composition→visibility (9 properties) |
| 4.8 | `src/components/nodes/__tests__/quick-action-visibility.property.test.ts` | Property 6: button visibility rules (11 properties) |
| 5.3 | (verified existing) | Quick actions already wired in NodeTreeView — verified completeness |
| 7.3 | `src/components/wizard/StepCameraConfig.tsx` | Step 2: RTSP URL, resolution, confidence, detection mode, skip toggle, test connection button |
| 7.4 | `src/components/wizard/StepESP32Config.tsx` | Step 3: MQTT broker, topic, skip toggle, test MQTT button |

---

### Wave 7 — StepReview + NodeWizard Container

| Task | File | Deskripsi |
|------|------|-----------|
| 7.5 | `src/components/wizard/StepReview.tsx` | Step 4: read-only summary cards, "Tidak dikonfigurasi" for skipped, Edit buttons, Simpan button |
| 7.6 | `src/components/wizard/NodeWizard.tsx` | Full wizard container: `useReducer` state, per-step validation, "at least one component" rule, close confirmation dialog, mobile full-screen, swipe gesture, API save (POST/PUT) |

---

### Wave 8 — Wizard Property Tests + NodeRow

| Task | File | Deskripsi |
|------|------|-----------|
| 7.7 | `src/components/wizard/__tests__/wizard-validation.property.test.ts` | Property 4: step validation accepts/rejects (12 properties) |
| 7.8 | `src/components/wizard/__tests__/wizard-state-persistence.property.test.ts` | Property 5: data preserved across navigation (7 properties) |
| 7.9 | `src/components/wizard/__tests__/composition-nullification.property.test.ts` | Property 7: skipped→null fields (5 properties) |
| 9.1 | `src/components/nodes/NodeRow.tsx` | Table row: HealthScore, CompositionIcon, sector, PIC, actions. Expand/collapse tree below. 200ms animation lock |

---

### Wave 9 — NodeTable + CSS Animations

| Task | File | Deskripsi |
|------|------|-----------|
| 9.2 | `src/components/nodes/NodeTable.tsx` | State management: expandedIds Set (max 20), status polling 10s interval (expanded only), health score recalc, error/retry, 5s timeout |
| 9.4 | `src/styles/node-tree-animations.css` | **NEW** — Consolidated CSS: expand/collapse keyframes, staggered items, row hover, status pulses, prefers-reduced-motion |
| 9.4 | `src/app/layout.tsx` (updated) | Added `import '@/styles/node-tree-animations.css'` |

---

### Wave 10 — Property Test + Page Integration

| Task | File | Deskripsi |
|------|------|-----------|
| 9.3 | `src/components/nodes/__tests__/expand-state-persistence.property.test.ts` | Property 11: expand state across sort/filter (5 properties) |
| 9.5 | `src/app/nodes/page.tsx` (refactored) | Full page: NodeTable + NodeWizard + LivePreviewPanel. Add/edit/delete/duplicate/toggle/export. Search + sort + bulk actions |

---

### Wave 11 — Mobile + Accessibility

| Task | File | Deskripsi |
|------|------|-----------|
| 9.6 | CSS + NodeRow (updated) | Mobile responsive: full-width card <768px, 44px touch targets, 12px indent, vertical buttons, focus management (move to first treeitem on expand, return to row on collapse) |
| 9.7 | Multiple files (updated) | ARIA: aria-selected sync, tabIndex on TreeItem, focus-visible CSS, contrast verification |

---

### Checkpoints

| Checkpoint | Hasil |
|-----------|-------|
| 3. Core data layer | ✅ 160 tests pass, 0 TS errors |
| 6. Tree View components | ✅ All green |
| 8. Wizard components | ✅ All green |
| 10. Final integration | ✅ 18 test files, 160 tests, tsc --noEmit clean |

---

## Post-Implementation: Animasi Enhancement

Setelah semua tasks selesai, user request tambahan animasi. Perubahan:

### File: `src/styles/node-tree-animations.css`

**Expand/Collapse container:**
- Sebelum: 200ms ease-out, simple translateY(-4px)
- Sesudah: 300ms cubic-bezier(0.34, 1.56, 0.64, 1) — spring-like bounce, scaleY effect, translateY(-8px)

**Text entry (tree items):**
- Sebelum: Simple fade + translateY(-4px), 50ms stagger
- Sesudah: translateX(-12px) + translateY(-4px) + blur(2px) → clear, 60ms stagger, cubic-bezier easing

**Text exit (NEW):**
- `@keyframes tree-item-slide-out`: fade-out + translateX(-8px) + translateY(4px) + blur(2px)
- 30ms stagger antar item saat collapse
- `.tree-item-exit` class + `.tree-section-items-exit` parent class

**Chevron:**
- Sebelum: 200ms ease-out
- Sesudah: 300ms cubic-bezier(0.34, 1.56, 0.64, 1) — spring overshoot

### File: `src/components/nodes/TreeSection.tsx`

- Added `collapsing` state + `useRef` timer
- Collapse flow: `setCollapsing(true)` → text exit animations play (250ms) → `setExpanded(false)` → container hides
- Expand flow: instant `setExpanded(true)`, staggered entry animations play
- Added `.tree-section-children--collapsing` class
- Added `.tree-section-items-exit` class on connector div during collapse
- Updated chevron transition to spring cubic-bezier

---

## Daftar Semua File Baru

```
src/lib/
├── node-types.ts
├── node-migration.ts
├── health-score.ts
├── sync-flat-fields.ts
├── connection-test-validation.ts
└── __tests__/
    ├── node-migration.property.test.ts
    ├── health-score.property.test.ts
    ├── node-roundtrip.property.test.ts
    └── connection-test-validation.property.test.ts

src/app/api/nodes/
├── route.ts (updated)
├── [id]/
│   ├── route.ts (updated)
│   └── status/
│       └── route.ts (NEW)
└── test-connection/
    └── route.ts (NEW)

src/components/nodes/
├── StatusIndicator.tsx
├── HealthScoreIndicator.tsx
├── CompositionIcon.tsx
├── TreeItem.tsx
├── TreeSection.tsx
├── NodeTreeView.tsx
├── QuickActionButton.tsx
├── LivePreviewPanel.tsx
├── NodeRow.tsx
├── NodeTable.tsx
└── __tests__/
    ├── status-indicator.property.test.ts
    ├── composition-derivation.property.test.ts
    ├── quick-action-visibility.property.test.ts
    ├── expand-state-persistence.property.test.ts
    ├── node-tree-view.test.ts
    ├── node-row.test.ts
    ├── node-table.test.ts
    └── live-preview-panel.test.ts

src/components/wizard/
├── WizardStepper.tsx
├── StepSectorInfo.tsx
├── StepCameraConfig.tsx
├── StepESP32Config.tsx
├── StepReview.tsx
├── NodeWizard.tsx
└── __tests__/
    ├── step-sector-info.test.ts
    ├── step-esp32-config.test.ts
    ├── step-review.test.ts
    ├── wizard-validation.property.test.ts
    ├── wizard-state-persistence.property.test.ts
    └── composition-nullification.property.test.ts

src/styles/
└── node-tree-animations.css (NEW)

src/app/
├── layout.tsx (updated — import CSS)
└── nodes/
    └── page.tsx (refactored)
```

---

## Dependensi Baru

| Package | Version | Purpose |
|---------|---------|---------|
| `fast-check` | devDependency | Property-based testing |
| `vitest` | devDependency | Test runner |
| `mqtt` | dependency | MQTT TLS connection test |

---

## Property-Based Tests Summary

| # | Property | File | Validates |
|---|----------|------|-----------|
| 1 | Composition derivation → section visibility | composition-derivation.property.test.ts | Req 1.3, 1.4, 1.5, 7.1-7.3 |
| 2 | Status indicator color/animation mapping | status-indicator.property.test.ts | Req 2.1-2.4 |
| 3 | Health score calculation & labeling | health-score.property.test.ts | Req 3.1-3.4, 3.6-3.8 |
| 4 | Wizard step validation rules | wizard-validation.property.test.ts | Req 4.5, 4.6 |
| 5 | Wizard state persistence across navigation | wizard-state-persistence.property.test.ts | Req 4.8 |
| 6 | Quick action button visibility | quick-action-visibility.property.test.ts | Req 5.1, 5.3, 5.5 |
| 7 | Composition change nullification | composition-nullification.property.test.ts | Req 7.4, 7.7 |
| 8 | Node save round-trip | node-roundtrip.property.test.ts | Req 9.2 |
| 9 | Legacy node migration | node-migration.property.test.ts | Req 9.3 |
| 10 | Connection test input validation | connection-test-validation.property.test.ts | Req 10.5 |
| 11 | Expand state persistence | expand-state-persistence.property.test.ts | Req 1.7 |

---

## Cara Menjalankan

```bash
# Frontend (Next.js dev server)
cd web-dashboard
npm run dev
# → http://localhost:3000/nodes

# Run tests
npm test
# atau
npx vitest --run

# TypeScript check
npx tsc --noEmit
```

---

## Status Akhir

- ✅ 47/47 tasks completed
- ✅ 160 tests passing
- ✅ 0 TypeScript errors
- ✅ Dev server running di localhost:3000
- ✅ Enhanced animations (spring expand/collapse + staggered text entry/exit)
