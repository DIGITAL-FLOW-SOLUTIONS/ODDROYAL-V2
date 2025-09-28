import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import lineBanner1 from "@assets/line-banner-1_1759032754700.jpg";
import lineBanner2 from "@assets/line-banner-2_1759032754701.jpg";
import lineBanner3 from "@assets/line-banner-3_1759032754702.png";

interface BannerSlide {
  id: string;
  image: string;
  alt: string;
  ctaAction: () => void;
}

interface HeroBannerProps {
  slides?: BannerSlide[];
  autoSlide?: boolean;
  slideInterval?: number;
}

const defaultSlides: BannerSlide[] = [
  {
    id: "accumulator-bets",
    image: lineBanner1,
    alt: "OddRoyal Accumulator Bets - Multiply Your Win",
    ctaAction: () => console.log("Accumulator bets clicked"),
  },
  {
    id: "welcome-bonus", 
    image: lineBanner2,
    alt: "OddRoyal 100% Bonus on First Deposit",
    ctaAction: () => console.log("Welcome bonus clicked"),
  },
  {
    id: "bet-anywhere",
    image: lineBanner3,
    alt: "OddRoyal - Bet Anytime, Anywhere",
    ctaAction: () => console.log("Bet anywhere clicked"),
  },
];

export default function HeroBanner({ 
  slides = defaultSlides, 
  autoSlide = true, 
  slideInterval = 5000 
}: HeroBannerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoaded, setIsLoaded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!autoSlide || isPaused) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, slideInterval);

    return () => clearInterval(interval);
  }, [autoSlide, isPaused, slideInterval, slides.length]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const handleImageLoad = (slideId: string) => {
    setIsLoaded(prev => ({ ...prev, [slideId]: true }));
  };

  return (
    <div 
      className="relative h-[200px] sm:h-[250px] md:h-[300px] lg:h-[350px] xl:h-[400px] rounded-none md:rounded-lg overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid="hero-banner"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -300 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="relative w-full h-full cursor-pointer"
          onClick={slides[currentSlide].ctaAction}
        >
          <motion.img
            src={slides[currentSlide].image}
            alt={slides[currentSlide].alt}
            className="w-full h-full object-cover"
            style={{
              filter: isLoaded[slides[currentSlide].id] ? 'none' : 'blur(5px)',
              transition: 'filter 0.3s ease-in-out'
            }}
            loading="lazy"
            onLoad={() => handleImageLoad(slides[currentSlide].id)}
            data-testid={`slide-image-${slides[currentSlide].id}`}
          />
          
          {/* Loading indicator */}
          {!isLoaded[slides[currentSlide].id] && (
            <div className="absolute inset-0 flex items-center justify-center bg-card">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-2 sm:left-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white border-none z-20 h-8 w-8 sm:h-10 sm:w-10"
        onClick={prevSlide}
        data-testid="button-prev-slide"
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 sm:right-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white border-none z-20 h-8 w-8 sm:h-10 sm:w-10"
        onClick={nextSlide}
        data-testid="button-next-slide"
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>

      {/* Slide indicators */}
      <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1 sm:gap-2 z-20">
        {slides.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${
              currentSlide === index 
                ? "bg-white scale-110 shadow-lg" 
                : "bg-white/50 hover:bg-white/75"
            }`}
            onClick={() => goToSlide(index)}
            data-testid={`slide-indicator-${index}`}
          />
        ))}
      </div>
      
      {/* Preload next images for better performance */}
      <div className="hidden">
        {slides.map((slide, index) => (
          index !== currentSlide && (
            <img
              key={slide.id}
              src={slide.image}
              alt=""
              loading="lazy"
              onLoad={() => handleImageLoad(slide.id)}
            />
          )
        ))}
      </div>
    </div>
  );
}