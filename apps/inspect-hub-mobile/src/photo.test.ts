import assert from "node:assert/strict";
import test from "node:test";
import { photoFrame } from "./photo.ts";

test("portrait and landscape photos retain only the square preview", () => {
  const viewport = { width: 360, height: 360 };
  assert.deepEqual(photoFrame({ width: 3000, height: 4000 }, viewport), {
    crop: { originX: 0, originY: 500, width: 3000, height: 3000 },
    resize: { width: 1280, height: 1280 },
  });
  assert.deepEqual(photoFrame({ width: 4000, height: 3000 }, viewport), {
    crop: { originX: 500, originY: 0, width: 3000, height: 3000 },
    resize: { width: 1280, height: 1280 },
  });
});

test("responsive preview proportions are preserved without upscaling", () => {
  assert.deepEqual(
    photoFrame({ width: 4000, height: 3000 }, { width: 300, height: 400 }),
    {
      crop: { originX: 875, originY: 0, width: 2250, height: 3000 },
      resize: { width: 960, height: 1280 },
    },
  );
  assert.deepEqual(
    photoFrame({ width: 640, height: 480 }, { width: 400, height: 300 }),
    {
      crop: { originX: 0, originY: 0, width: 640, height: 480 },
      resize: { width: 640, height: 480 },
    },
  );
});

test("rounded crop stays inside the image; invalid dimensions are rejected", () => {
  const { crop } = photoFrame(
    { width: 4033, height: 3025 },
    { width: 361, height: 360 },
  );
  assert.ok(crop.originX >= 0 && crop.originY >= 0);
  assert.ok(crop.originX + crop.width <= 4033);
  assert.ok(crop.originY + crop.height <= 3025);
  for (const width of [0, -1, NaN, Infinity]) {
    assert.throws(() =>
      photoFrame({ width: 4000, height: 3000 }, { width, height: 360 }),
    );
  }
});
