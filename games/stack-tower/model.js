'use strict';

// Pure rules in CSS pixels; independent of Canvas, input and storage.
const StackTowerRules = (() => {
  const HEIGHT = 22;
  function overlap(moving, below) {
    const left = Math.max(moving.x, below.x);
    const right = Math.min(moving.x + moving.width, below.x + below.width);
    if (right <= left) return { success: false, perfect: false };
    if (Math.abs(moving.x - below.x) <= 4) {
      return { success: true, perfect: true, x: below.x, width: below.width, cut: null };
    }
    const cut = moving.x < below.x
      ? { x: moving.x, width: left - moving.x }
      : { x: right, width: moving.x + moving.width - right };
    return { success: true, perfect: false, x: left, width: right - left, cut };
  }
  const speed = score => Math.min(125 + score * 6, 310);
  function spawn(below, score, width) {
    const fromLeft = score % 2 === 0;
    return { x: fromLeft ? 0 : width - below.width, width: below.width,
      y: below.y + HEIGHT, direction: fromLeft ? 1 : -1, level: score + 1 };
  }
  function advance(block, seconds, velocity, width) {
    const limit = width - block.width;
    if (limit <= 0) return;
    // Reflect the travelled distance, including frames that cross an edge.
    const phase = block.direction > 0 ? block.x : 2 * limit - block.x;
    const next = (phase + seconds * velocity) % (2 * limit);
    block.x = next <= limit ? next : 2 * limit - next;
    block.direction = next < limit ? 1 : -1;
  }
  return { HEIGHT, overlap, speed, spawn, advance };
})();
