import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

interface BannerSlide {
  id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaAction: () => void;
  backgroundImage?: string;
  backgroundColor: string;
}

interface HeroBannerProps {
  slides?: BannerSlide[];
  autoSlide?: boolean;
  slideInterval?: number;
}

const defaultSlides: BannerSlide[] = [
  {
    id: "accumulator",
    title: "ACCUMULATOR BETS",
    subtitle: "MULTIPLY THE WIN",
    ctaText: "PLAY",
    ctaAction: () => console.log("Play clicked"),
    backgroundColor: "bg-gradient-to-r from-primary via-accent to-destructive",
  },
  {
    id: "live-betting", 
    title: "LIVE BETTING",
    subtitle: "BET IN REAL TIME",
    ctaText: "JOIN NOW",
    ctaAction: () => console.log("Join clicked"),
    backgroundColor: "bg-gradient-to-r from-destructive via-primary to-accent",
  },
  {
    id: "welcome-bonus",
    title: "WELCOME BONUS",
    subtitle: "UP TO $500 FREE",
    ctaText: "CLAIM NOW",
    ctaAction: () => console.log("Claim clicked"),
    backgroundColor: "bg-gradient-to-r from-accent via-destructive to-primary",
  },
];

export default function HeroBanner({ 
  slides = defaultSlides, 
  autoSlide = true, 
  slideInterval = 5000 
}: HeroBannerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

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

  return (
    <div 
      className="relative h-64 md:h-80 lg:h-96 rounded-lg overflow-hidden"
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
          className={`absolute inset-0 ${slides[currentSlide].backgroundColor} flex items-center justify-center text-white`}
        >
          {/* Background overlay for better text readability */}
          <div className="absolute inset-0 bg-black/20" />
          
          {/* Content */}
          <div className="relative z-10 text-center px-8">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-3xl md:text-4xl lg:text-5xl font-display font-bold mb-2"
              data-testid={`slide-title-${slides[currentSlide].id}`}
            >
              {slides[currentSlide].title}
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-lg md:text-xl lg:text-2xl opacity-90 mb-6"
              data-testid={`slide-subtitle-${slides[currentSlide].id}`}
            >
              {slides[currentSlide].subtitle}
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 border-white/30 hover:bg-white/20 text-white font-bold px-8 py-3"
                onClick={slides[currentSlide].ctaAction}
                data-testid={`slide-cta-${slides[currentSlide].id}`}
              >
                <Play className="mr-2 h-5 w-5" />
                {slides[currentSlide].ctaText}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white border-none z-20"
        onClick={prevSlide}
        data-testid="button-prev-slide"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white border-none z-20"
        onClick={nextSlide}
        data-testid="button-next-slide"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>

      {/* Slide indicators */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-20">
        {slides.map((_, index) => (
          <button
            key={index}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              currentSlide === index 
                ? "bg-white scale-110" 
                : "bg-white/50 hover:bg-white/75"
            }`}
            onClick={() => goToSlide(index)}
            data-testid={`slide-indicator-${index}`}
          />
        ))}
      </div>
    </div>
  );
}