import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

export interface ThumbnailProps {
  src: string | null;
  alt: string;
  className?: string;
}

/** A product picture that falls back to a plain placeholder when there is none or it fails to load. */
export function Thumbnail({ src, alt, className }: ThumbnailProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        role="img"
        aria-label={`${alt} (no image)`}
        className={cn(
          'flex items-center justify-center bg-slate-100 text-xs text-slate-400',
          className,
        )}
      >
        No image
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={cn('bg-slate-100 object-cover', className)}
    />
  );
}
