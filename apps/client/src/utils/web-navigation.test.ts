import { describe, expect, it } from "vitest";

import { getPathForMode, getRouteForPathname } from "@/utils/web-navigation";

describe("web navigation", () => {
  it.each([
    ["/", "home"],
    ["/daily", "daily"],
    ["/play", "play"],
    ["/unknown", "home"],
  ])("maps %s to the %s route", (pathname, expected) => {
    expect(getRouteForPathname(pathname)).toBe(expected);
  });

  it("uses the daily path only for daily mode", () => {
    expect(getPathForMode("daily")).toBe("/daily");
    expect(getPathForMode("archive")).toBe("/play");
    expect(getPathForMode("random")).toBe("/play");
  });
});
