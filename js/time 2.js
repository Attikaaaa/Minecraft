import { DAY_LENGTH_SECONDS } from "./config.js";
import { state } from "./state.js";
import { updateDayNight } from "./scene.js";

const normalizeTime = (value) => ((value % 1) + 1) % 1;

export const setTimeOfDay = (value) => {
  state.timeOfDay = normalizeTime(value);
  updateDayNight(state.timeOfDay);
};

export const advanceTime = (dt) => {
  const delta = dt / DAY_LENGTH_SECONDS;
  state.timeOfDay = normalizeTime(state.timeOfDay + delta);
  updateDayNight(state.timeOfDay);
};

export const initTime = () => {
  state.timeOfDay = normalizeTime(state.timeOfDay ?? 0.25);
  updateDayNight(state.timeOfDay);
};
