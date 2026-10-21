import { useState, type ImgHTMLAttributes } from "react";

export function SkeletonImage({
  className = "",
  src,
  loading = "lazy",
  onLoad,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  const isLoaded = !src || loadedSrc === src || failedSrc === src;

  return (
    <span
      className={`image-skeleton-frame${isLoaded ? " is-loaded" : ""}`}
      aria-busy={!isLoaded}
    >
      {!isLoaded && <span className="image-skeleton" aria-hidden="true" />}
      <img
        {...props}
        src={src}
        className={`${className}${className ? " " : ""}skeleton-image${isLoaded ? " is-loaded" : ""}`}
        loading={loading}
        decoding="async"
        onLoad={(event) => {
          setLoadedSrc(src ?? "");
          onLoad?.(event);
        }}
        onError={(event) => {
          setFailedSrc(src ?? "");
          onError?.(event);
        }}
      />
    </span>
  );
}
