const intBound = (s, ds) => {
  if (ds === 0) return Infinity;
  const sIsInteger = Math.floor(s) === s;
  if (ds > 0) {
    const frac = s - Math.floor(s);
    return (sIsInteger ? 0 : 1 - frac) / ds;
  }
  const frac = s - Math.floor(s);
  return (sIsInteger ? 0 : frac) / -ds;
};

export const raycastVoxel = (origin, direction, maxDist, getBlock) => {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  let tMaxX = intBound(ox, dx);
  let tMaxY = intBound(oy, dy);
  let tMaxZ = intBound(oz, dz);

  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  let normal = { x: 0, y: 0, z: 0 };
  let dist = 0;

  for (let i = 0; i < 512; i += 1) {
    const block = getBlock(x, y, z);
    if (block) {
      return { x, y, z, normal, distance: dist };
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX;
        dist = tMaxX;
        tMaxX += tDeltaX;
        normal = { x: -stepX, y: 0, z: 0 };
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ;
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
        normal = { x: 0, y: 0, z: -stepZ };
      }
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) break;
      y += stepY;
      dist = tMaxY;
      tMaxY += tDeltaY;
      normal = { x: 0, y: -stepY, z: 0 };
    } else {
      if (tMaxZ > maxDist) break;
      z += stepZ;
      dist = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = { x: 0, y: 0, z: -stepZ };
    }
  }

  return null;
};
