'use client';

import PageTransition from '@/components/PageTransition';
import { MapPin, Crosshair, Flame, Radio } from 'lucide-react';

export default function MapPage() {
  const plannedFeatures = [
    { icon: MapPin, label: 'Lokasi GPS setiap sektor' },
    { icon: Crosshair, label: 'Marker per sektor dengan status real-time' },
    { icon: Flame, label: 'Heatmap pelanggaran berdasarkan frekuensi' },
    { icon: Radio, label: 'Radius monitoring per kamera' },
  ];

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-6 stagger-item stagger-1">
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Peta Sektor</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Visualisasi lokasi sektor monitoring</p>
      </div>

      {/* Main placeholder card */}
      <div className="card p-8 md:p-12 stagger-item stagger-2">
        <div className="max-w-lg mx-auto text-center">
          {/* Map illustration placeholder */}
          <div
            className="w-full h-48 md:h-64 rounded-xl border-2 border-dashed flex items-center justify-center mb-8"
            style={{ borderColor: 'var(--border-strong)', background: '#faf8f6' }}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--orange)', opacity: 0.9 }}>
                <MapPin size={32} color="white" />
              </div>
              {/* Decorative dots around pin */}
              <svg width="120" height="40" viewBox="0 0 120 40" fill="none" className="opacity-30">
                <circle cx="20" cy="20" r="3" fill="var(--accent)" />
                <circle cx="50" cy="10" r="2" fill="var(--orange)" />
                <circle cx="80" cy="25" r="4" fill="var(--accent)" />
                <circle cx="100" cy="15" r="2.5" fill="var(--orange)" />
                <circle cx="35" cy="35" r="2" fill="var(--accent)" />
                <circle cx="70" cy="35" r="3" fill="var(--orange)" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-lg md:text-xl font-bold mb-3" style={{ color: 'var(--accent)' }}>
            Peta Interaktif — Segera Hadir
          </h2>

          {/* Description */}
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
            Fitur ini akan menampilkan peta lokasi setiap sektor dengan status real-time, 
            marker pelanggaran, dan navigasi langsung ke kamera.
          </p>

          {/* Planned features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {plannedFeatures.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#faf8f6', border: '1px solid var(--border)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--orange)', opacity: 0.85 }}>
                    <Icon size={16} color="white" />
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{feature.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
