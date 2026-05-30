export default function Loading() {
  return (
    <div className="animate-fade-in">
      {/* Spinner area */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          {/* Animated bars spinner */}
          <div className="flex items-end gap-[3px] h-6">
            <div className="w-[3px] rounded-full animate-bar-1" style={{ background: 'var(--accent)' }} />
            <div className="w-[3px] rounded-full animate-bar-2" style={{ background: 'var(--orange)' }} />
            <div className="w-[3px] rounded-full animate-bar-3" style={{ background: 'var(--accent)' }} />
            <div className="w-[3px] rounded-full animate-bar-4" style={{ background: 'var(--orange)' }} />
          </div>
          <div className="skeleton w-48 h-7" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 skeleton h-64 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    </div>
  );
}
