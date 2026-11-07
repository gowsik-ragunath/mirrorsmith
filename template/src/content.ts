import type { ComponentType } from "react";

/**
 * Register every section of the clone here, top to bottom.
 * mirrorsmith agents add one component per section in src/components/,
 * then list it below. The page renders sections in this order.
 */
export interface CloneSection {
  /** kebab-case id, e.g. "hero" */
  id: string;
  /** Human name shown in reports */
  name: string;
  Component: ComponentType;
}

export const sections: CloneSection[] = [];
