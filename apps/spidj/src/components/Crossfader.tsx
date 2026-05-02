interface Props {
  value: number; // 0..1
}

export function Crossfader({ value }: Props) {
  const v = Math.max(0, Math.min(1, value));
  const pct = v * 100;
  return (
    <div className="bg-[#1a1d22] px-4 py-2 flex items-center gap-3">
      <span className="text-xs text-white/60 uppercase tracking-widest">A</span>
      <div className="flex-1 relative h-2 bg-[#0a0a0a] rounded">
        {/* Centre tick */}
        <div className="absolute inset-y-0 left-1/2 -ml-px w-0.5 bg-white/15" />
        {/* Knob */}
        <div
          className="absolute -top-1 h-4 w-1.5 -ml-[3px] bg-[#c8302e] rounded shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-white/60 uppercase tracking-widest">B</span>
      <span className="text-xs font-mono text-white/50 w-10 text-right">
        {(v * 100).toFixed(0)}%
      </span>
    </div>
  );
}
