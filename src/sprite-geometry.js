// Geometry is measured from a cycle once. Panel anchors use its envelope,
// while pointer input uses the alpha mask of the currently displayed frame.
window.AgentWhiskerGeometry = (() => {
  const width = 192, height = 208;
  const animations = new Map();

  async function measure(url, columns, first, count) {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = columns * width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    let left = width, top = height, right = 0, bottom = 0;
    const leftByRow = new Uint16Array(height).fill(width);
    const rightByRow = new Uint16Array(height);
    const masks = new Map(), areas = [];
    let previousRow = -1, pixels;
    for (let cell = first; cell < first + count; cell++) {
      const row = Math.floor(cell / columns);
      if (row !== previousRow) {
        ctx.clearRect(0, 0, canvas.width, height);
        ctx.drawImage(image, 0, row * height, canvas.width, height, 0, 0, canvas.width, height);
        pixels = ctx.getImageData(0, 0, canvas.width, height).data;
        previousRow = row;
      }
      const mask = new Uint8Array(width * height / 8);
      let area = 0;
      const xOffset = (cell % columns) * width;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = pixels[4 * (y * canvas.width + xOffset + x) + 3];
          if (alpha < 24) continue;
          const index = y * width + x;
          mask[index >> 3] |= 1 << (index & 7);
          area += alpha / 255;
          left = Math.min(left, x); right = Math.max(right, x + 1);
          top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
          leftByRow[y] = Math.min(leftByRow[y], x);
          rightByRow[y] = Math.max(rightByRow[y], x + 1);
        }
      }
      masks.set(cell, mask);
      if (area) areas.push(area);
    }
    if (!areas.length) return null;
    areas.sort((a, b) => a - b);
    return {left, top, width: right-left, height: bottom-top, leftByRow, rightByRow, masks,
      area: areas[Math.floor(areas.length / 2)]};
  }

  // The bundled Kitsu sheets are immutable. Avoid scanning millions of alpha
  // values on the renderer thread on the first transition to either pose.
  async function bundledGeometry(pose, count) {
    const response = await fetch(new URL(`./kitsu-${pose}-geometry.gz`, location.href));
    if (!response.ok) throw Error("Missing bundled geometry");
    const data = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    const start = data.indexOf(10) + 1;
    const stride = width * height / 8;
    if (!start || data.length !== start + stride * count) throw Error("Invalid bundled geometry");
    const shape = JSON.parse(new TextDecoder().decode(data.subarray(0, start - 1)));
    shape.masks = new Map();
    for (let i = 0; i < count; i++) shape.masks.set(i, data.subarray(start + i * stride, start + (i + 1) * stride));
    return shape;
  }

  function load(key, url, columns, first, count) {
    if (!animations.has(key)) {
      const pose = url === "./kitsu-idle.webp" ? "idle" : url === "./kitsu-typing.webp" ? "running" : null;
      const read = () => measure(url, columns, first, count);
      const pending = (pose ? bundledGeometry(pose, count).catch(read) : read()).catch(error => {
        animations.delete(key);
        throw error;
      });
      animations.set(key, pending);
    }
    return animations.get(key);
  }

  function contains(mask, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!mask || x < 0 || y < 0 || x >= width || y >= height) return false;
    const index = y * width + x;
    return Boolean(mask[index >> 3] & (1 << (index & 7)));
  }

  return {load, contains};
})();
