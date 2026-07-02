import type { Actor, Slot } from "./types";
import { groupOf } from "./formations";

export const GROUP_COLORS: Record<string, string> = {
  gk: "#ffd166",
  df: "#4fc3f7",
  mf: "#caff3a",
  fw: "#ff8a65",
  ball: "#ffffff",
};

/** actor（選手/ボール）に対応する色 */
export function actorColor(actor: Actor, slots: Slot[]): string {
  if (actor === "ball") return GROUP_COLORS.ball;
  const slot = slots[actor as number];
  return GROUP_COLORS[slot ? groupOf(slot.role) : "mf"] ?? GROUP_COLORS.mf;
}
