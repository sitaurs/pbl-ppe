# Implementation Plan: Node Detail Tree View

## Overview

Redesain halaman Kelola Node (`/nodes`) dari flat table menjadi interactive tree view dengan health scoring, step-by-step wizard, quick actions, dan status indicators. Implementasi menggunakan TypeScript, Next.js App Router, CSS transitions untuk animasi, dan fast-check untuk property-based tests.

## Tasks

- [x] 1. Set up core types, utilities, and data layer
  - [x] 1.1 Create TypeScript interfaces and type definitions
    - Create `src/lib/node-types.ts` with interfaces: `CameraConfig`, `ESP32Config`, `DetectionConfig`, `NodeData`, `NodeComposition`, `ComponentStatus`, `NodeStatus`, `HealthScore`, `ConnectionTestRequest`, `ConnectionTestResponse`
    - Define component props interfaces: `NodeTreeViewProps`, `StatusIndicatorProps`, `HealthScoreIndicatorProps`, `NodeWizardProps`, `WizardStepperProps`
    - _Requirements: 9.1, 7.1_

  - [x] 1.2 Implement legacy node migration utility
    - Create `src/lib/node-migration.ts` with `migrateNode()` function
    - Handle detection of already-migrated nodes (check for camera/esp32/detection fields)
    - Map `cameraSource` to `camera.url`, derive protocol from URL pattern (rtsp:// → rtsp, numeric → local, else → http)
    - Set defaults: resolution "640x480", esp32 empty/disabled, detection mode "realtime" with confidence 0.5
    - _Requirements: 9.3_

  - [x] 1.3 Write property test for legacy node migration (Property 9)
    - **Property 9: Legacy node migration produces valid extended schema**
    - **Validates: Requirements 9.3**
    - Use fast-check to generate arbitrary legacy node objects and verify migration output matches expected schema

  - [x] 1.4 Implement health score calculation
    - Create `src/lib/health-score.ts` with `calculateHealthScore()` function
    - Implement weighted scoring: full node (40/30/30), camera-only (60/40), esp32-only (60/40)
    - Return score (0-100), label ("Sehat"/"Perlu Perhatian"/"Kritis"), and color
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8_

  - [x] 1.5 Write property test for health score calculation (Property 3)
    - **Property 3: Health score calculation and labeling**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8**
    - Use fast-check to generate all composition types and status combinations, verify score formula and label thresholds

- [x] 2. Implement API endpoints
  - [x] 2.1 Update node API routes with nested object support
    - Update `src/app/api/nodes/route.ts` (GET, POST) to apply migration on read and persist both flat + nested fields on write
    - Update `src/app/api/nodes/[id]/route.ts` (PUT, DELETE) to sync flat fields with nested objects (e.g., `camera.url` → `cameraSource`)
    - Ensure backward compatibility: flat fields always present for ServiceAPDBackend.py
    - _Requirements: 9.2, 9.4_

  - [x] 2.2 Write property test for node save round-trip (Property 8)
    - **Property 8: Node save round-trip preserves both flat and nested fields**
    - **Validates: Requirements 9.2**
    - Use fast-check to generate valid NodeData objects, simulate PUT then GET, verify flat/nested field consistency

  - [x] 2.3 Create GET /api/nodes/[id]/status endpoint
    - Create `src/app/api/nodes/[id]/status/route.ts`
    - Implement camera status check: TCP connection probe to RTSP host:port with 3s timeout
    - Implement ESP32 status check: TCP probe to MQTT broker host:port with 3s timeout
    - Return "online"/"offline"/"unconfigured" for camera, "connected"/"disconnected"/"unconfigured" for ESP32
    - Handle local camera (always "online"), handle response within 3s max
    - _Requirements: 9.5_

  - [x] 2.4 Create POST /api/nodes/test-connection endpoint
    - Create `src/app/api/nodes/test-connection/route.ts`
    - Implement camera test: TCP socket or ffprobe to RTSP URL with 10s timeout
    - Implement MQTT test: use mqtt npm package for TLS connection with 10s timeout, measure latency
    - Validate request parameters: type must be "camera" or "mqtt", required fields per type
    - Return appropriate status (reachable/unreachable/connected/failed/timeout) with error messages
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 2.5 Write property test for connection test input validation (Property 10)
    - **Property 10: Connection test API input validation**
    - **Validates: Requirements 10.5**
    - Use fast-check to generate invalid request bodies and verify error responses with correct field indicators

- [x] 3. Checkpoint - Core data layer and API verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Tree View UI components
  - [x] 4.1 Create StatusIndicator component
    - Create `src/components/nodes/StatusIndicator.tsx`
    - Implement color-coded dot: online (#22c55e + pulse 1.5s), offline (#ef4444, no anim), degraded (#f59e0b + pulse 3s), unconfigured (#9ca3af, no anim)
    - Add tooltip showing relative time since last status update on hover
    - Implement CSS transition (400ms) for status changes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 4.2 Write property test for status indicator mapping (Property 2)
    - **Property 2: Status indicator color and animation mapping**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - Use fast-check to verify all status values produce correct CSS class and color

  - [x] 4.3 Create HealthScoreIndicator component
    - Create `src/components/nodes/HealthScoreIndicator.tsx`
    - Implement SVG circular progress (36x36px) with stroke-dasharray/offset
    - Show color badge based on score: green (≥80 "Sehat"), yellow (50-79 "Perlu Perhatian"), red (<50 "Kritis")
    - Add smooth transition on score changes
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 4.4 Create CompositionIcon component
    - Create `src/components/nodes/CompositionIcon.tsx`
    - Render camera icon for "kamera saja", chip icon for "ESP32 saja", combined icon for "kamera + ESP32"
    - _Requirements: 7.5_

  - [x] 4.5 Create TreeItem and TreeSection components
    - Create `src/components/nodes/TreeItem.tsx` — leaf item with label + value, connector lines (├─, └─, │) via CSS pseudo-elements, 16px indentation per level
    - Create `src/components/nodes/TreeSection.tsx` — collapsible section (Camera, ESP32, Detection, Sector) with status indicator and section label
    - Add `role="treeitem"`, `aria-level`, `aria-expanded` attributes
    - _Requirements: 1.3, 1.6, 8.4_

  - [x] 4.6 Create NodeTreeView container component
    - Create `src/components/nodes/NodeTreeView.tsx`
    - Render tree sections conditionally based on node composition (camera+detection if has camera, esp32 if has esp32, sector always)
    - Implement `role="tree"` container with `aria-selected` tracking
    - Implement keyboard navigation: Arrow Up/Down for siblings, Arrow Right to expand/enter child, Arrow Left to collapse/go to parent, Enter/Space to toggle
    - _Requirements: 1.3, 1.4, 1.5, 8.3, 8.4_

  - [x] 4.7 Write property test for composition derivation and section visibility (Property 1)
    - **Property 1: Composition derivation determines tree section visibility**
    - **Validates: Requirements 1.3, 1.4, 1.5, 7.1, 7.2, 7.3**
    - Use fast-check to generate node data with null/non-null camera/esp32 and verify correct sections are rendered

  - [x] 4.8 Write property test for quick action button visibility (Property 6)
    - **Property 6: Quick action button conditional visibility**
    - **Validates: Requirements 5.1, 5.3, 5.5**
    - Use fast-check to generate node data and status, verify button visibility rules

- [x] 5. Implement Quick Actions and Live Preview
  - [x] 5.1 Create QuickActionButton component
    - Create `src/components/nodes/QuickActionButton.tsx`
    - Implement loading state, success/failure result display (visible for 5s then reset)
    - Handle disabled state, error messages with possible causes
    - _Requirements: 5.2, 5.6, 5.7_

  - [x] 5.2 Create LivePreviewPanel component
    - Create `src/components/nodes/LivePreviewPanel.tsx`
    - Implement WebSocket connection to backend WS server for frame streaming
    - Display frames as base64 JPEG images
    - Enforce singleton: only one preview active at a time
    - Implement close button that disconnects WebSocket within 2s
    - _Requirements: 5.4, 5.8_

  - [x] 5.3 Wire quick actions into NodeTreeView
    - Add "Test Koneksi" button on Camera section (visible when camera.url is non-empty)
    - Add "Lihat Live" button on Camera section (visible when camera status is "online")
    - Add "Test MQTT" button on ESP32 section (visible when mqttBroker and mqttTopic are non-empty)
    - Connect buttons to API calls (POST /api/nodes/test-connection)
    - _Requirements: 5.1, 5.3, 5.5_

- [x] 6. Checkpoint - Tree View components verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Node Wizard
  - [x] 7.1 Create WizardStepper component
    - Create `src/components/wizard/WizardStepper.tsx`
    - Show 4 steps with active/completed/pending/skipped states
    - Horizontal layout on desktop, compact on mobile
    - _Requirements: 4.2_

  - [x] 7.2 Create StepSectorInfo component (Step 1)
    - Create `src/components/wizard/StepSectorInfo.tsx`
    - Fields: node name (1-100 chars required), sector assignment (dropdown, required)
    - Inline validation error messages below invalid fields
    - _Requirements: 4.1, 4.6_

  - [x] 7.3 Create StepCameraConfig component (Step 2)
    - Create `src/components/wizard/StepCameraConfig.tsx`
    - Fields: RTSP URL (must start with "rtsp://"), resolution (dropdown), confidence threshold (0.01-1.00), detection mode (CPU/GPU)
    - "Skip — node ini tidak menggunakan kamera" option
    - "Test Koneksi" button (optional, non-blocking)
    - Inline validation per field
    - _Requirements: 4.1, 4.3, 4.6, 10.6, 10.7_

  - [x] 7.4 Create StepESP32Config component (Step 3)
    - Create `src/components/wizard/StepESP32Config.tsx`
    - Fields: MQTT broker host (required), MQTT topic (required)
    - "Skip — node ini tidak menggunakan ESP32" option
    - "Test MQTT" button (optional, non-blocking)
    - Inline validation per field
    - _Requirements: 4.1, 4.4, 4.6, 10.6, 10.7_

  - [x] 7.5 Create StepReview component (Step 4)
    - Create `src/components/wizard/StepReview.tsx`
    - Display read-only summary cards per section
    - Show "Tidak dikonfigurasi" for skipped sections
    - "Edit" button per section to navigate back to that step
    - "Simpan" button to save node
    - _Requirements: 4.7, 4.10_

  - [x] 7.6 Create NodeWizard container with state management
    - Create `src/components/wizard/NodeWizard.tsx`
    - Implement `useReducer` for multi-step form state
    - Handle step navigation with per-step validation
    - Enforce at least one component configured (not both skipped)
    - Preserve form data across forward/backward navigation
    - Show confirmation dialog on close with unsaved changes
    - Mobile: full-screen modal with swipe/buttons navigation
    - Call PUT/POST API on save, close wizard, update node list within 2s
    - _Requirements: 4.5, 4.6, 4.8, 4.9, 4.10, 7.4, 7.6, 8.5_

  - [x] 7.7 Write property test for wizard validation rules (Property 4)
    - **Property 4: Wizard step validation rules**
    - **Validates: Requirements 4.5, 4.6**
    - Use fast-check to generate form input combinations and skip states, verify validation accepts/rejects correctly

  - [x] 7.8 Write property test for wizard state persistence (Property 5)
    - **Property 5: Wizard state persistence across navigation**
    - **Validates: Requirements 4.8**
    - Use fast-check to generate sequences of navigation actions and verify data preservation

  - [x] 7.9 Write property test for composition change nullification (Property 7)
    - **Property 7: Composition change preserves invariant (unused fields become null)**
    - **Validates: Requirements 7.4, 7.7**
    - Use fast-check to generate composition transitions and verify null/preserved fields

- [x] 8. Checkpoint - Wizard components verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement NodeTable integration, animations, and page wiring
  - [x] 9.1 Create NodeRow component with expand/collapse
    - Create `src/components/nodes/NodeRow.tsx`
    - Render table row with: HealthScoreIndicator, CompositionIcon, sector name, PIC, actions
    - Click to expand/collapse tree view below row
    - Support multiple expanded nodes (non-accordion, max 20)
    - Implement animation lock to prevent double-click during transition
    - _Requirements: 1.1, 1.2, 6.4_

  - [x] 9.2 Create NodeTable component with state management
    - Create `src/components/nodes/NodeTable.tsx`
    - Manage expanded node IDs set (persist across sort/filter)
    - Implement status polling (10s interval) for expanded nodes only
    - Update health scores when status changes (within 5s)
    - Handle loading/error states for tree view data (5s timeout per section, retry button)
    - _Requirements: 1.7, 1.8, 3.9_

  - [x] 9.3 Write property test for expand state persistence (Property 11)
    - **Property 11: Expand state persistence across sort and filter**
    - **Validates: Requirements 1.7**
    - Use fast-check to generate sets of expanded IDs and sort/filter operations, verify visible expanded nodes retain state

  - [x] 9.4 Implement CSS animations and transitions
    - Add tree-view expand/collapse animations (200ms ease-out, slide-down + fade-in)
    - Add staggered animation for tree items (50ms delay per item, max 10 items)
    - Add row hover highlight (150ms transition, 5-8% opacity)
    - Add `@media (prefers-reduced-motion: reduce)` to disable all animations
    - Add status indicator pulse keyframes (1.5s online, 3s degraded)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 9.5 Refactor NodesPage to integrate all components
    - Update `src/app/nodes/page.tsx` to use NodeTable with NodeWizard
    - Wire up add/edit node actions to open wizard
    - Connect wizard save to refresh node list
    - Implement data fetching with migration applied on load
    - Wire status polling and health score updates
    - _Requirements: 1.1, 4.10, 9.2_

  - [x] 9.6 Implement mobile responsive layout
    - Tree view as full-width expandable card below row on <768px
    - All interactive elements minimum 44x44px touch targets
    - Tree indentation reduced to 12px on mobile
    - Quick action buttons stack vertically on narrow viewports
    - Focus management: move focus to first treeitem on open, return to trigger row on close
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 8.7_

  - [x] 9.7 Implement ARIA accessibility attributes
    - Add `role="tree"` on NodeTreeView, `role="treeitem"` on sections/items
    - Add `aria-expanded`, `aria-level`, `aria-selected` attributes
    - Ensure focus indicators (2px outline) on all interactive elements
    - Ensure color contrast minimum 4.5:1 (text) and 3:1 (graphical elements)
    - _Requirements: 8.3, 8.4, 8.6_

- [x] 10. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check library
- Unit tests validate specific examples and edge cases
- All animations respect `prefers-reduced-motion` media query
- Backward compatibility with ServiceAPDBackend.py is maintained by keeping flat fields in db.json
- Status polling only runs for expanded nodes to minimize API load

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "4.4"] },
    { "id": 2, "tasks": ["1.3", "1.5", "2.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "4.2", "4.3"] },
    { "id": 4, "tasks": ["2.5", "4.5", "5.1"] },
    { "id": 5, "tasks": ["4.6", "5.2", "7.1", "7.2"] },
    { "id": 6, "tasks": ["4.7", "4.8", "5.3", "7.3", "7.4"] },
    { "id": 7, "tasks": ["7.5", "7.6"] },
    { "id": 8, "tasks": ["7.7", "7.8", "7.9", "9.1"] },
    { "id": 9, "tasks": ["9.2", "9.4"] },
    { "id": 10, "tasks": ["9.3", "9.5"] },
    { "id": 11, "tasks": ["9.6", "9.7"] }
  ]
}
```
