// Scanline flood fill for the paint-bucket tool.

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b, Math.round(alpha * 255)];
}

/**
 * Flood fill the contiguous region at (sx, sy) on `ctx` with `color`.
 * Uses a tolerance so anti-aliased edges fill cleanly, and a scanline stack
 * algorithm so large regions stay fast without deep recursion.
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  color: string,
  alpha: number,
  tolerance = 32,
): void {
  const { width, height } = ctx.canvas;
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;

  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const startIdx = (sy * width + sx) * 4;
  const target = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];
  const [fr, fg, fb, fa] = hexToRgba(color, alpha);

  // Nothing to do if the start pixel already matches the fill colour.
  if (target[0] === fr && target[1] === fg && target[2] === fb && target[3] === fa) return;

  const tol2 = tolerance * tolerance;
  const matches = (idx: number): boolean => {
    const dr = data[idx] - target[0];
    const dg = data[idx + 1] - target[1];
    const db = data[idx + 2] - target[2];
    const da = data[idx + 3] - target[3];
    return dr * dr + dg * dg + db * db + da * da <= tol2;
  };

  const setPixel = (idx: number) => {
    // Blend the fill colour over the existing pixel by its alpha.
    data[idx] = fr;
    data[idx + 1] = fg;
    data[idx + 2] = fb;
    data[idx + 3] = fa;
  };

  const stack: Array<[number, number]> = [[sx, sy]];
  const visited = new Uint8Array(width * height);

  while (stack.length) {
    const [x, yy] = stack.pop()!;
    let y = yy;
    // Move up to the top of the contiguous span.
    let idx = (y * width + x) * 4;
    while (y >= 0 && matches(idx)) {
      y--;
      idx -= width * 4;
    }
    y++;
    idx += width * 4;

    let spanLeft = false;
    let spanRight = false;
    while (y < height && matches(idx)) {
      const p = y * width + x;
      if (visited[p]) break;
      visited[p] = 1;
      setPixel(idx);

      // Check left neighbour.
      if (x > 0) {
        const leftMatch = matches(idx - 4);
        if (leftMatch && !spanLeft && !visited[p - 1]) {
          stack.push([x - 1, y]);
          spanLeft = true;
        } else if (!leftMatch) {
          spanLeft = false;
        }
      }
      // Check right neighbour.
      if (x < width - 1) {
        const rightMatch = matches(idx + 4);
        if (rightMatch && !spanRight && !visited[p + 1]) {
          stack.push([x + 1, y]);
          spanRight = true;
        } else if (!rightMatch) {
          spanRight = false;
        }
      }
      y++;
      idx += width * 4;
    }
  }

  ctx.putImageData(img, 0, 0);
}
