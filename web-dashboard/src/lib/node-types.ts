// lib/node-types.ts
// TypeScript interfaces and type definitions for Node Detail Tree View
// Requirements: 9.1, 7.1

// --- Core Data Interfaces ---

export interface CameraConfig {
  url: string; // max 512 chars, e.g. "rtsp://192.168.1.10/live/ch00_1"
  resolution: string; // format "WxH", e.g. "1280x720"
  protocol: 'rtsp' | 'http' | 'local';
}

export interface ESP32Config {
  mqttTopic: string; // max 128 chars
  mqttBroker: string; // max 256 chars
  enabled: boolean;
}

export interface DetectionConfig {
  mode: 'realtime' | 'scheduled' | 'disabled';
  confidenceThreshold: number; // 0.1 - 1.0
}

export interface NodeData {
  // Flat fields (backward compat with ServiceAPDBackend.py)
  id: number;
  sektorId: string;
  sektorName: string;
  picName: string;
  picPhone: string;
  cameraSource: string;
  enabled: boolean;

  // Extended nested objects (nullable for composition flexibility)
  camera: CameraConfig | null;
  esp32: ESP32Config | null;
  detection: DetectionConfig | null;
}

export type NodeComposition = 'camera-only' | 'esp32-only' | 'camera-esp32';

export type ComponentStatus = 'online' | 'offline' | 'degraded' | 'unconfigured';

export interface NodeStatus {
  camera: ComponentStatus;
  esp32: ComponentStatus;
  lastUpdated: string; // ISO timestamp
}

export interface HealthScore {
  score: number; // 0-100
  label: 'Sehat' | 'Perlu Perhatian' | 'Kritis';
  color: 'green' | 'yellow' | 'red';
}

export interface ConnectionTestRequest {
  type: 'camera' | 'mqtt';
  // Camera fields
  url?: string;
  // MQTT fields
  broker?: string;
  port?: number;
  username?: string;
  password?: string;
}

export interface ConnectionTestResponse {
  status: 'reachable' | 'unreachable' | 'connected' | 'failed' | 'timeout';
  latency?: number; // ms (MQTT only)
  metadata?: {
    resolution?: string; // Camera only
  };
  error?: string;
}

// --- Component Props Interfaces ---

export interface NodeTreeViewProps {
  node: NodeData;
  status: NodeStatus | null;
  onTestConnection: (type: 'camera' | 'mqtt') => Promise<ConnectionTestResponse>;
  onViewLive: (nodeId: number) => void;
}

export interface StatusIndicatorProps {
  status: ComponentStatus;
  lastUpdated?: string; // ISO timestamp for tooltip
}

export interface HealthScoreIndicatorProps {
  score: number;
  size?: number; // default 36
}

export interface NodeWizardProps {
  mode: 'add' | 'edit';
  initialData?: Partial<NodeData>;
  onSave: (data: Omit<NodeData, 'id'>) => Promise<void>;
  onClose: () => void;
}

export interface WizardStepperProps {
  currentStep: number; // 0-3
  completedSteps: Set<number>;
  skippedSteps: Set<number>;
}
