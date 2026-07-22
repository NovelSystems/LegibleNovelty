// Account Status Badges display logic (brief Task 8, Section 21).
//
// Three badges, independent and simultaneous (unlike Awards, they do not compete
// for a display slot): VE (green), LNC (blue), FotL (yellow). All held badges
// display at once. Colour pairing is deliberately blue/yellow (not red/green)
// for colourblind safety, and each badge carries its own letters so it never
// depends on colour alone.
//
// This is a pure read against three independent boolean-derived flags. It is
// intentionally NOT gated behind Certification Center / Payments & Billing
// shipping: LNC and FotL simply have no true values yet, which the all-false
// case handles.

export type BadgeKind = "VE" | "LNC" | "FotL";

export interface BadgeDescriptor {
  kind: BadgeKind;
  letters: string; // Identification independent of colour.
  color: string; // Semantic colour name.
  // Accessible name carrying FULL meaning independent of the visual tooltip.
  accessibleName: string;
  tooltip: string;
}

const DESCRIPTORS: Record<BadgeKind, Omit<BadgeDescriptor, "kind">> = {
  VE: {
    letters: "VE",
    color: "green",
    accessibleName: "Verified Educator",
    tooltip:
      "Verified Educator — this person's educator status has been verified by the platform.",
  },
  LNC: {
    letters: "LNC",
    color: "blue",
    accessibleName: "Legible Novelty Certified",
    tooltip:
      "Legible Novelty Certified — this person has completed the platform's certification.",
  },
  FotL: {
    letters: "FotL",
    color: "yellow",
    accessibleName: "Friend of the Library",
    tooltip:
      "Friend of the Library — this person is a supporting contributor to the platform.",
  },
};

export interface BadgeFlags {
  ve_status: boolean;
  lnc_status: boolean;
  fotl_status: boolean;
}

// Derive the ordered list of badges to display for an account's flags. Returns
// an empty array for the all-false case (a valid, expected state).
export function deriveBadges(flags: BadgeFlags): BadgeDescriptor[] {
  const badges: BadgeDescriptor[] = [];
  if (flags.ve_status) badges.push({ kind: "VE", ...DESCRIPTORS.VE });
  if (flags.lnc_status) badges.push({ kind: "LNC", ...DESCRIPTORS.LNC });
  if (flags.fotl_status) badges.push({ kind: "FotL", ...DESCRIPTORS.FotL });
  return badges;
}
