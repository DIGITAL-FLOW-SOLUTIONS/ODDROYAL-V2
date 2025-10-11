import React from "react";
import { motion } from "framer-motion";
import SimpleHeader from "@/components/SimpleHeader";
import Footer from "@/components/Footer";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import PageLoader from "@/components/PageLoader";

interface SimpleLayoutProps {
  children: React.ReactNode;
}

export default function SimpleLayout({ children }: SimpleLayoutProps) {
  const { isPageLoading } = usePageLoading();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {isPageLoading && <PageLoader />}
      {/* Header */}
      <SimpleHeader />
      
      {/* Main content */}
      <motion.main 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex-1 w-full"
      >
        {children}
      </motion.main>

      {/* Footer */}
      <Footer />
    </div>
  );
}