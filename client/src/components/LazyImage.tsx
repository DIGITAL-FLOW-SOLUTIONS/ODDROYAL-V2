import { useState, useEffect, useRef } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  placeholder?: string;
}

export function LazyImage({ src, alt, className, width, height, placeholder }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver>();

  useEffect(() => {
    // Create intersection observer for lazy loading
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observerRef.current?.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before the image comes into view
      }
    );

    if (containerRef.current) {
      observerRef.current.observe(containerRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isInView && !isLoaded && !hasError) {
      // Preload image for better caching
      const img = new Image();
      
      img.onload = () => {
        setIsLoaded(true);
      };
      
      img.onerror = () => {
        setHasError(true);
      };
      
      img.src = src;
    }
  }, [isInView, src, isLoaded, hasError]);

  if (hasError) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-200 dark:bg-gray-800 ${className}`}
        style={{ width, height }}
        ref={containerRef}
      >
        <span className="text-sm text-muted-foreground">Failed to load image</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ width, height }}
    >
      {!isLoaded && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse"
          style={{ width, height }}
        >
          {placeholder ? (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          )}
        </div>
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
          style={{ 
            width, 
            height,
            objectFit: 'contain',
            imageRendering: 'auto',
          }}
          loading="lazy" // Native lazy loading as fallback
          decoding="async" // Improve performance
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}