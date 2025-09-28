import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import banner1 from "@assets/home-banner-1_1759030914832.jpg";
import banner2 from "@assets/home-banner-2_1759030914833.jpg";
import banner3 from "@assets/home-banner-3_1759030914834.jpg";

interface Banner {
  id: number;
  image: string;
  alt: string;
  title: string;
  subtitle: string;
  cta: string;
  ctaAction: () => void;
}

const banners: Banner[] = [
  {
    id: 1,
    image: banner1,
    alt: "OddRoyal 100% First Deposit Bonus",
    title: "Welcome Bonus",
    subtitle: "Get 100% match bonus on your first deposit",
    cta: "Register Now",
    ctaAction: () => console.log("Register clicked")
  },
  {
    id: 2,
    image: banner2,
    alt: "OddRoyal Sports Live Streaming",
    title: "Live Streaming",
    subtitle: "Watch and bet on your favorite sports",
    cta: "Start Betting",
    ctaAction: () => console.log("Bet clicked")
  },
  {
    id: 3,
    image: banner3,
    alt: "OddRoyal Accumulator Bets",
    title: "Accumulator Bets",
    subtitle: "Multiple selections for higher winnings",
    cta: "Place a Bet",
    ctaAction: () => console.log("Place bet clicked")
  }
];

export default function BannerSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoaded, setIsLoaded] = useState<Record<number, boolean>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-slide functionality
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, 5000); // Change slide every 5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Reset auto-slide when user manually changes slide
  const handleSlideChange = (index: number) => {
    setCurrentSlide(index);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % banners.length);
      }, 5000);
    }
  };

  const nextSlide = () => {
    handleSlideChange((currentSlide + 1) % banners.length);
  };

  const prevSlide = () => {
    handleSlideChange(currentSlide === 0 ? banners.length - 1 : currentSlide - 1);
  };

  const handleImageLoad = (bannerId: number) => {
    setIsLoaded(prev => ({ ...prev, [bannerId]: true }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-none md:rounded-lg h-[250px] sm:h-[300px] md:h-[350px] lg:h-[400px] bg-card"
      data-testid="banner-slider"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -300 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="relative w-full h-full"
        >
          {/* Optimized Image with lazy loading and caching */}
          <img
            src={banners[currentSlide].image}
            alt={banners[currentSlide].alt}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoaded[banners[currentSlide].id] ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => handleImageLoad(banners[currentSlide].id)}
            style={{
              // Browser caching headers
              filter: 'brightness(0.8)', // Dark wash for text readability
            }}
            data-testid={`banner-image-${banners[currentSlide].id}`}
          />
          
          {/* Loading placeholder */}
          {!isLoaded[banners[currentSlide].id] && (
            <div className="absolute inset-0 bg-card animate-pulse flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Content overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          
          <div className="absolute inset-0 flex items-center justify-start p-4 sm:p-6 md:p-8">
            <div className="text-white max-w-lg md:max-w-2xl">
              <motion.h2
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-display font-bold mb-2 sm:mb-3 md:mb-4"
                data-testid={`banner-title-${banners[currentSlide].id}`}
              >
                {banners[currentSlide].title}
              </motion.h2>
              
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-sm sm:text-base md:text-lg lg:text-xl opacity-90 mb-4 sm:mb-5 md:mb-6"
                data-testid={`banner-subtitle-${banners[currentSlide].id}`}
              >
                {banners[currentSlide].subtitle}
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Button
                  size="default"
                  variant="default"
                  onClick={banners[currentSlide].ctaAction}
                  className="bg-primary hover:bg-primary/90 text-white font-semibold px-4 sm:px-6 md:px-8 text-sm sm:text-base"
                  data-testid={`banner-cta-${banners[currentSlide].id}`}
                >
                  {banners[currentSlide].cta}
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      <Button
        variant="ghost"
        size="icon"
        onClick={prevSlide}
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white border-0 h-8 w-8 sm:h-10 sm:w-10"
        data-testid="button-banner-prev"
      >
        <ChevronLeft className="h-4 w-4 sm:h-6 sm:w-6" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={nextSlide}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white border-0 h-8 w-8 sm:h-10 sm:w-10"
        data-testid="button-banner-next"
      >
        <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6" />
      </Button>

      {/* Pagination dots */}
      <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-1 sm:gap-2">
        {banners.map((_, index) => (
          <button
            key={index}
            onClick={() => handleSlideChange(index)}
            className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${
              index === currentSlide 
                ? 'bg-white shadow-lg scale-110' 
                : 'bg-white/50 hover:bg-white/70'
            }`}
            data-testid={`banner-dot-${index}`}
          />
        ))}
      </div>

      {/* Preload next images for better performance */}
      <div className="hidden">
        {banners.map((banner, index) => (
          index !== currentSlide && (
            <img
              key={banner.id}
              src={banner.image}
              alt=""
              loading="lazy"
              onLoad={() => handleImageLoad(banner.id)}
            />
          )
        ))}
      </div>
    </motion.div>
  );
}