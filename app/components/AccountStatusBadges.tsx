"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { deriveBadges, type BadgeDescriptor, type BadgeFlags } from "@/lib/badges";

// Account Status Badges (brief Task 8, Section 21).
//
// Three independent, simultaneous badges (VE green / LNC blue / FotL yellow) —
// all held badges render at once, including the all-false case (renders no
// badges). Colour never carries meaning alone: each badge shows its letters,
// and each trigger's ACCESSIBLE NAME carries the full meaning ("Verified
// Educator") independent of the visual tooltip.
//
// Tooltip semantics (role="tooltip", NOT a popover/disclosure — so there is no
// close button):
//   * Opens on click, or after a 1-second hover delay.
//   * Dismissed by ALL FOUR independent paths:
//       1. click outside the combined badge/tooltip region
//       2. mouse-off the combined hitbox (the hitbox INCLUDES the tooltip)
//       3. Escape
//       4. focus-loss (e.g. Tab away)

const HOVER_OPEN_DELAY_MS = 1000;

function BadgeWithTooltip({ badge }: { badge: BadgeDescriptor }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const close = useCallback(() => {
    clearHoverTimer();
    setOpen(false);
  }, []);

  // Path 1: click outside the combined region.
  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open, close]);

  // Path 3: Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => clearHoverTimer, []);

  return (
    <span
      ref={containerRef}
      // The hitbox includes the tooltip: onMouseLeave lives on the combined
      // container, so moving the pointer from badge into tooltip does NOT close.
      onMouseEnter={() => {
        clearHoverTimer();
        hoverTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
      }}
      onMouseLeave={close /* Path 2: mouse-off the combined hitbox. */}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        // Accessible name carries full meaning independent of the tooltip.
        aria-label={badge.accessibleName}
        aria-describedby={open ? tooltipId : undefined}
        data-badge={badge.kind}
        data-color={badge.color}
        onClick={() => setOpen((v) => !v) /* Opens/toggles on click. */}
        onBlur={close /* Path 4: focus-loss. */}
        style={{ font: "inherit" }}
      >
        {badge.letters}
      </button>
      {open && (
        <span role="tooltip" id={tooltipId}>
          {badge.tooltip}
        </span>
      )}
    </span>
  );
}

export function AccountStatusBadges({ flags }: { flags: BadgeFlags }) {
  const badges = deriveBadges(flags);
  return (
    <span data-testid="account-status-badges">
      {badges.map((b) => (
        <BadgeWithTooltip key={b.kind} badge={b} />
      ))}
    </span>
  );
}

export default AccountStatusBadges;
