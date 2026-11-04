import type { ReactNode } from "react";

const TONE = {
  default: "text-neutral-50",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
} as const;

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <p className="text-xs text-neutral-500 font-medium mb-2">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${TONE[tone]}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl p-5">
      <h3 className="text-sm font-medium text-neutral-300">{title}</h3>
      {subtitle && (
        <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}
