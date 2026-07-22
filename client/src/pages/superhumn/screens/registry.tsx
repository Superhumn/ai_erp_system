import type { ComponentType } from "react";
import Home from "./Home";

export type ScreenEntry = {
  badge: string;
  title: string;
  Component: ComponentType;
};

/**
 * Canonical screens registry, in nav order. Add a screen here once it is
 * ported and it appears in the gallery automatically.
 */
export const SCREENS: ScreenEntry[] = [
  { badge: "14a", title: "Home — needs-you queue, today & live operations", Component: Home },
];
