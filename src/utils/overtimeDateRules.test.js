import { isOvertimeDateAllowed } from "./overtimeDateRules";

describe("overtime date rules", () => {
  it("allows OT entry for any future date without a cutoff", () => {
    expect(isOvertimeDateAllowed("2026-10-11")).toBe(true);
    expect(isOvertimeDateAllowed("2026-10-12")).toBe(true);
    expect(isOvertimeDateAllowed("2099-12-31")).toBe(true);
  });
});
