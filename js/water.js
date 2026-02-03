import { WORLD_MAX_HEIGHT } from "./config.js";

const MAX_LEVEL = 7;

const createQueue = () => ({ items: [], head: 0 });
const enqueue = (queue, item) => {
  queue.items.push(item);
};
const dequeue = (queue) => {
  if (queue.head >= queue.items.length) return null;
  const item = queue.items[queue.head];
  queue.head += 1;
  if (queue.head > 64 && queue.head > queue.items.length / 2) {
    queue.items = queue.items.slice(queue.head);
    queue.head = 0;
  }
  return item;
};
const queueSize = (queue) => queue.items.length - queue.head;

export const createWaterSystem = ({ getBlock, setBlock, getWaterLevel, setWaterLevel, isWithinWorld }) => {
  const queue = createQueue();
  const getQueueSize = () => queueSize(queue);

  const enqueueAround = (x, y, z) => {
    enqueue(queue, { x, y, z });
    enqueue(queue, { x: x + 1, y, z });
    enqueue(queue, { x: x - 1, y, z });
    enqueue(queue, { x, y: y + 1, z });
    enqueue(queue, { x, y: y - 1, z });
    enqueue(queue, { x, y, z: z + 1 });
    enqueue(queue, { x, y, z: z - 1 });
  };

  const placeWater = (x, y, z, level) => {
    if (!isWithinWorld(x, y, z)) return;
    const type = getBlock(x, y, z);
    if (type !== 0 && type !== 8) return;
    const nextLevel = Math.max(0, Math.min(MAX_LEVEL, level));
    setBlock(x, y, z, 8, { waterLevel: nextLevel, skipWater: true });
    setWaterLevel(x, y, z, nextLevel);
    enqueueAround(x, y, z);
  };

  const removeWater = (x, y, z) => {
    if (!isWithinWorld(x, y, z)) return;
    if (getBlock(x, y, z) !== 8) return;
    setBlock(x, y, z, 0, { skipWater: true });
    setWaterLevel(x, y, z, 0, true);
    enqueueAround(x, y, z);
  };

  const updateCell = (x, y, z) => {
    if (!isWithinWorld(x, y, z)) return;
    if (getBlock(x, y, z) !== 8) return;

    let level = getWaterLevel(x, y, z);
    if (level < 0 || !Number.isFinite(level)) level = 0;

    // Flow downward whenever possible.
    if (y > 0 && getBlock(x, y - 1, z) === 0) {
      placeWater(x, y - 1, z, Math.min(level, 1));
    }

    // Horizontal spread.
    if (level < MAX_LEVEL) {
      const next = level + 1;
      if (getBlock(x + 1, y, z) === 0) placeWater(x + 1, y, z, next);
      if (getBlock(x - 1, y, z) === 0) placeWater(x - 1, y, z, next);
      if (getBlock(x, y, z + 1) === 0) placeWater(x, y, z + 1, next);
      if (getBlock(x, y, z - 1) === 0) placeWater(x, y, z - 1, next);
    }

    if (level === 0) return;

    let minLevel = 99;
    if (y < WORLD_MAX_HEIGHT - 1 && getBlock(x, y + 1, z) === 8) {
      minLevel = Math.min(minLevel, getWaterLevel(x, y + 1, z));
    }
    if (getBlock(x + 1, y, z) === 8) minLevel = Math.min(minLevel, getWaterLevel(x + 1, y, z) + 1);
    if (getBlock(x - 1, y, z) === 8) minLevel = Math.min(minLevel, getWaterLevel(x - 1, y, z) + 1);
    if (getBlock(x, y, z + 1) === 8) minLevel = Math.min(minLevel, getWaterLevel(x, y, z + 1) + 1);
    if (getBlock(x, y, z - 1) === 8) minLevel = Math.min(minLevel, getWaterLevel(x, y, z - 1) + 1);

    if (!Number.isFinite(minLevel) || minLevel > MAX_LEVEL) {
      removeWater(x, y, z);
      return;
    }

    const nextLevel = Math.max(1, Math.min(MAX_LEVEL, minLevel));
    if (nextLevel !== level) {
      setWaterLevel(x, y, z, nextLevel);
      enqueueAround(x, y, z);
    }
  };

  const update = (budgetMs = 1.25, maxSteps = 220) => {
    const start = performance.now();
    let steps = 0;
    while (queueSize(queue) && steps < maxSteps && performance.now() - start < budgetMs) {
      const item = dequeue(queue);
      if (!item) break;
      updateCell(item.x, item.y, item.z);
      steps += 1;
    }
  };

  const onBlockChanged = (x, y, z, prevType, nextType) => {
    if (prevType === 8 || nextType === 8) {
      enqueueAround(x, y, z);
    } else {
      // Block removed or placed near water.
      enqueueAround(x, y, z);
    }
  };

  return {
    enqueue: enqueueAround,
    update,
    onBlockChanged,
    getQueueSize,
  };
};
