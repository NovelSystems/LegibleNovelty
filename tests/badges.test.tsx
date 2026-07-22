// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountStatusBadges } from "@/app/components/AccountStatusBadges";
import { deriveBadges } from "@/lib/badges";

afterEach(cleanup);

const ALL_FALSE = { ve_status: false, lnc_status: false, fotl_status: false };
const ALL_TRUE = { ve_status: true, lnc_status: true, fotl_status: true };

describe("deriveBadges (Task 8 display logic)", () => {
  it("returns nothing when all flags are false", () => {
    expect(deriveBadges(ALL_FALSE)).toEqual([]);
  });

  it("renders all three independent badges simultaneously", () => {
    expect(deriveBadges(ALL_TRUE).map((b) => b.kind)).toEqual([
      "VE",
      "LNC",
      "FotL",
    ]);
  });

  it("renders exactly the true subset", () => {
    expect(
      deriveBadges({ ve_status: true, lnc_status: false, fotl_status: true }).map(
        (b) => b.kind,
      ),
    ).toEqual(["VE", "FotL"]);
  });
});

describe("AccountStatusBadges component (Task 8)", () => {
  it("renders no badges for the all-false case", () => {
    render(<AccountStatusBadges flags={ALL_FALSE} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("labels each badge with its full accessible name and letters", () => {
    render(<AccountStatusBadges flags={ALL_TRUE} />);
    const ve = screen.getByRole("button", { name: "Verified Educator" });
    const lnc = screen.getByRole("button", { name: "Legible Novelty Certified" });
    const fotl = screen.getByRole("button", { name: "Friend of the Library" });
    // Letters present so identification never depends on colour alone.
    expect(ve.textContent).toBe("VE");
    expect(lnc.textContent).toBe("LNC");
    expect(fotl.textContent).toBe("FotL");
    // ARIA carries meaning; no bare title attribute is used.
    expect(ve.getAttribute("title")).toBeNull();
  });

  it("opens a role=tooltip on click and wires aria-describedby", () => {
    render(<AccountStatusBadges flags={{ ...ALL_FALSE, ve_status: true }} />);
    const btn = screen.getByRole("button", { name: "Verified Educator" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip).not.toBeNull();
    expect(btn.getAttribute("aria-describedby")).toBe(tip.getAttribute("id"));
  });

  it("dismisses via Escape", () => {
    render(<AccountStatusBadges flags={{ ...ALL_FALSE, ve_status: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Verified Educator" }));
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("dismisses via click outside the combined region", () => {
    render(
      <div>
        <AccountStatusBadges flags={{ ...ALL_FALSE, ve_status: true }} />
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Verified Educator" }));
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("dismisses via focus-loss (blur)", () => {
    render(<AccountStatusBadges flags={{ ...ALL_FALSE, ve_status: true }} />);
    const btn = screen.getByRole("button", { name: "Verified Educator" });
    fireEvent.click(btn);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.blur(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("dismisses via mouse-off the combined hitbox", () => {
    render(<AccountStatusBadges flags={{ ...ALL_FALSE, ve_status: true }} />);
    const btn = screen.getByRole("button", { name: "Verified Educator" });
    fireEvent.click(btn);
    const region = btn.parentElement!; // The combined badge/tooltip container.
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.mouseLeave(region);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens after a 1-second hover delay", async () => {
    render(<AccountStatusBadges flags={{ ...ALL_FALSE, ve_status: true }} />);
    const btn = screen.getByRole("button", { name: "Verified Educator" });
    const region = btn.parentElement!;
    fireEvent.mouseEnter(region);
    // Not open immediately.
    expect(screen.queryByRole("tooltip")).toBeNull();
    // Opens once the 1s delay elapses.
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeNull(), {
      timeout: 2000,
    });
  });
});
