'use client';

import { Camera, Cpu } from 'lucide-react';
import { NodeComposition } from '@/lib/node-types';

interface CompositionIconProps {
  composition: NodeComposition;
  size?: number;
  className?: string;
}

/**
 * CompositionIcon — Renders an icon representing the node's device composition.
 * - "camera-only": camera icon
 * - "esp32-only": chip/CPU icon
 * - "camera-esp32": combined camera + chip icons
 *
 * Requirements: 7.5
 */
export default function CompositionIcon({
  composition,
  size = 18,
  className = '',
}: CompositionIconProps) {
  switch (composition) {
    case 'camera-only':
      return (
        <span
          className={`inline-flex items-center ${className}`}
          title="Kamera saja"
          aria-label="Komposisi: kamera saja"
        >
          <Camera size={size} />
        </span>
      );

    case 'esp32-only':
      return (
        <span
          className={`inline-flex items-center ${className}`}
          title="ESP32 saja"
          aria-label="Komposisi: ESP32 saja"
        >
          <Cpu size={size} />
        </span>
      );

    case 'camera-esp32':
      return (
        <span
          className={`inline-flex items-center gap-1 ${className}`}
          title="Kamera + ESP32"
          aria-label="Komposisi: kamera dan ESP32"
        >
          <Camera size={size} />
          <Cpu size={size} />
        </span>
      );
  }
}
