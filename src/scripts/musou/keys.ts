// Клавиши боя по физическому коду. Русская раскладка не меняет KeyW, поле ввода не перехватывается.
import { clampMove } from "./input";

const NAMED: Record<string, string> = {
  w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD",
  q: "KeyQ", e: "KeyE", r: "KeyR", f: "KeyF",
  j: "KeyJ", k: "KeyK", g: "KeyG", p: "KeyP",
  " ": "Space", spacebar: "Space",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
};

export function eventCode(e: { code?: string; key?: string }): string {
  const code = e.code || "";
  if (code.startsWith("Key") || code.startsWith("Arrow") || code === "Space") return code;
  return NAMED[(e.key || "").toLowerCase()] || "";
}

export function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return !!el.isContentEditable;
}

export function moveAxes(down: ReadonlySet<string>, stickX: number, stickY: number) {
  const rawX = (down.has("KeyA") || down.has("ArrowLeft") ? -1 : 0) + (down.has("KeyD") || down.has("ArrowRight") ? 1 : 0) + stickX;
  const rawY = (down.has("KeyW") || down.has("ArrowUp") ? -1 : 0) + (down.has("KeyS") || down.has("ArrowDown") ? 1 : 0) + stickY;
  return clampMove(rawX, rawY);
}

export function skillOfCode(code: string): number {
  if (code === "KeyQ") return 1;
  if (code === "KeyE") return 2;
  if (code === "KeyR") return 3;
  if (code === "KeyF") return 4;
  return 0;
}
