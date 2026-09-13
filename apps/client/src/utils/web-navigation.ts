import type { UiMode } from "@/components/mode-tabs";

export type WebRoute = "home" | "daily" | "play";

export function getRouteForPathname(pathname: string): WebRoute {
  if (pathname === "/daily") return "daily";
  if (pathname === "/play") return "play";
  return "home";
}

export function getCurrentWebRoute(): WebRoute {
  if (typeof window === "undefined") return "home";
  return getRouteForPathname(window.location.pathname);
}

export function getPathForMode(mode: UiMode): string {
  return mode === "daily" ? "/daily" : "/play";
}

export function pushWebPath(pathname: string): void {
  if (typeof window === "undefined" || !window.history) return;
  if (window.location.pathname === pathname) return;
  window.history.pushState(null, "", pathname);
}

export function replaceWebPath(pathname: string): void {
  if (typeof window === "undefined" || !window.history) return;
  if (window.location.pathname === pathname) return;
  window.history.replaceState(null, "", pathname);
}
