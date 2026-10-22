type Size = { width: number; height: number };

// Match the centered "cover" crop used by the camera preview.
export function photoFrame(photo: Size, viewport: Size) {
  if (
    ![photo.width, photo.height, viewport.width, viewport.height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error("Invalid photo or preview dimensions");

  const ratio = viewport.width / viewport.height;
  const width = Math.max(
    1,
    Math.min(photo.width, Math.round(photo.height * ratio)),
  );
  const height = Math.max(
    1,
    Math.min(photo.height, Math.round(photo.width / ratio)),
  );
  const scale = Math.min(1, 1280 / Math.max(width, height));
  return {
    crop: {
      originX: Math.floor((photo.width - width) / 2),
      originY: Math.floor((photo.height - height) / 2),
      width,
      height,
    },
    resize: {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    },
  };
}
