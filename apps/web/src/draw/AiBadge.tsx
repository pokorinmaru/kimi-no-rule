// The always-visible 「AI」 mark next to the junior (指示書 第8.1節).
import { COLORS } from "./theme.ts";

export interface AiBadgeProps {
  className?: string;
}

export function AiBadge({ className }: AiBadgeProps) {
  return (
    <span
      className={className}
      data-role="ai-badge"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        border: `2px solid ${COLORS.ink}`,
        borderRadius: 8,
        background: COLORS.paper,
        color: COLORS.ink,
        font: "700 14px/1.2 system-ui, sans-serif",
        letterSpacing: "0.05em",
      }}
    >
      AI
    </span>
  );
}
