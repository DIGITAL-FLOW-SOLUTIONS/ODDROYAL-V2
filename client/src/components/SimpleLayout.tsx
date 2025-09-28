import React from "react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface SimpleLayoutProps {
  children: React.ReactNode;
}

export default function SimpleLayout({ children }: SimpleLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <Header />
      
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