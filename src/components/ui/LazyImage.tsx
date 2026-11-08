import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/Skeleton";
import { ImageIcon } from "lucide-react";

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  fallbackIcon?: boolean;
}

export function LazyImage({
  src,
  alt = "",
  width,
  height,
  aspectRatio,
  className,
  fallbackIcon = true,
  ...props
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-(--color-container-low)",
        className
      )}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        aspectRatio,
      }}
    >
      {!isLoaded && !hasError && (
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      )}

      {hasError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-(--color-text-subtle)">
          {fallbackIcon && <ImageIcon size={28} strokeWidth={1.5} />}
          <span className="text-[11px] font-medium tracking-wide">
            Image unavailable
          </span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={width}
          height={height}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          {...props}
        />
      )}
    </div>
  );
}

