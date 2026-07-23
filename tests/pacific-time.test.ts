import { describe, expect, it } from "vitest";
import { startOfPacificDay } from "@/lib/pacific-time";

// The daily quota reset uses the America/Los_Angeles identifier, which must
// resolve correctly across DST — not just in the common case. PST = UTC-8,
// PDT = UTC-7.

describe("startOfPacificDay (America/Los_Angeles, DST-correct)", () => {
  it("resolves midnight to 08:00 UTC during PST (winter)", () => {
    // Jan 15 2025, well inside standard time.
    const now = new Date("2025-01-15T20:00:00Z");
    // Pacific midnight of Jan 15 2025 == 08:00Z.
    expect(startOfPacificDay(now).toISOString()).toBe("2025-01-15T08:00:00.000Z");
  });

  it("resolves midnight to 07:00 UTC during PDT (summer)", () => {
    // Jul 15 2025, daylight time.
    const now = new Date("2025-07-15T20:00:00Z");
    expect(startOfPacificDay(now).toISOString()).toBe("2025-07-15T07:00:00.000Z");
  });

  it("crosses the spring-forward DST boundary correctly (Mar 9 2025)", () => {
    // Spring forward is 2025-03-09 02:00 PST → 03:00 PDT.
    // A moment on Mar 8 (still PST) → midnight at 08:00Z.
    const beforeDst = new Date("2025-03-08T20:00:00Z");
    expect(startOfPacificDay(beforeDst).toISOString()).toBe(
      "2025-03-08T08:00:00.000Z",
    );
    // A moment on Mar 10 (now PDT) → midnight at 07:00Z. The offset flipped from
    // -8 to -7 across the boundary; a fixed offset would have been an hour off.
    const afterDst = new Date("2025-03-10T20:00:00Z");
    expect(startOfPacificDay(afterDst).toISOString()).toBe(
      "2025-03-10T07:00:00.000Z",
    );
  });

  it("crosses the fall-back DST boundary correctly (Nov 2 2025)", () => {
    // Fall back is 2025-11-02 02:00 PDT → 01:00 PST.
    const beforeDst = new Date("2025-11-01T20:00:00Z"); // PDT
    expect(startOfPacificDay(beforeDst).toISOString()).toBe(
      "2025-11-01T07:00:00.000Z",
    );
    const afterDst = new Date("2025-11-03T20:00:00Z"); // PST
    expect(startOfPacificDay(afterDst).toISOString()).toBe(
      "2025-11-03T08:00:00.000Z",
    );
  });

  it("maps a late-evening Pacific instant back to the same Pacific day's midnight", () => {
    // 2025-07-15 23:30 PDT == 2025-07-16 06:30Z. Its Pacific day is still the
    // 15th, so midnight is 2025-07-15T07:00Z (not the 16th).
    const lateEvening = new Date("2025-07-16T06:30:00Z");
    expect(startOfPacificDay(lateEvening).toISOString()).toBe(
      "2025-07-15T07:00:00.000Z",
    );
  });
});
