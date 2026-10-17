export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" className="fill-honey-600" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <ellipse
            key={deg}
            cx="12"
            cy="5.5"
            rx="2.6"
            ry="4"
            transform={`rotate(${deg} 12 12)`}
            className="fill-honey-500/70"
          />
        ))}
      </svg>
      Pollinate
    </span>
  );
}
