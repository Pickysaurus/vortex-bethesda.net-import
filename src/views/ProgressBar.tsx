import React, { useMemo } from "react";

export type ImportProgressProps = {
  done: number;          // e.g. files processed
  total: number;         // e.g. total files
  message: string;       // e.g. "Moving files to staging…"
  detail?: string;       // e.g. "Data\\MyMod.esp"
  state?: "idle" | "running" | "success" | "error";
};

export default function ImportProgressBar({
  done,
  total,
  message,
  detail,
  state = "running",
}: ImportProgressProps) {
  const pct = useMemo(() => {
    const t = Math.max(1, total);
    const clamped = Math.min(Math.max(done, 0), t);
    return Math.round((clamped / t) * 100);
  }, [done, total]);

  return (
    <div className={`iprog iprog--${state}`} role="status" aria-live="polite">
      <div className="iprog__top">
        <div className="iprog__message">{message}</div>
        <div className="iprog__pct">{pct}%</div>
      </div>

      <div
        className="iprog__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Import progress"
      >
        <div className="iprog__fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="iprog__bottom">
        <div className="iprog__detail">{detail ?? "\u00A0"}</div>
        <div className="iprog__count">
          {done}/{Math.max(0, total)}
        </div>
      </div>
    </div>
  );
}
