import { canvas } from "./dom.js";
import { disablePointerLock } from "./config.js";

export const lockPointer = () => {
  if (!canvas?.requestPointerLock) return;
  if (disablePointerLock || navigator.webdriver) return;
  if (!document.body.contains(canvas)) return;
  try {
    canvas.focus();
    const result = canvas.requestPointerLock();
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch (err) {
    console.warn("Pointer lock failed.", err);
  }
};

export const unlockPointer = () => {
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
};
