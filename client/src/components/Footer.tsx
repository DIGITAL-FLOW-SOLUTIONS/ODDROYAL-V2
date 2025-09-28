import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Shield, FileText, Globe } from "lucide-react";
import { Link } from "wouter";
import googlePlayImage from "@assets/GooglePlay_1759034359431.png";
import appStoreImage from "@assets/Appstore-badge_1759034359434.png";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-sidebar border-t border-sidebar-border mt-auto w-full">
      <div className="max-w-none px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="font-display text-xl font-bold text-primary">
              Odd<span className="text-destructive">Royal</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Premium sports betting platform with competitive odds and secure transactions.
            </p>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-chart-4" />
              <span className="text-xs text-muted-foreground">Licensed & Regulated</span>
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/terms-and-conditions">
                  <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal w-full" data-testid="link-terms">
                    <FileText className="h-3 w-3 mr-2" />
                    Terms & Conditions
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy">
                  <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal w-full" data-testid="link-privacy">
                    <Shield className="h-3 w-3 mr-2" />
                    Privacy Policy
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/responsible-gaming">
                  <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal w-full" data-testid="link-responsible">
                    <Globe className="h-3 w-3 mr-2" />
                    Responsible Gaming
                  </Button>
                </Link>
              </li>
            </ul>
          </div>

          {/* Download Apps */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Download Our App</h4>
            <div className="space-y-3">
              <a 
                href="https://play.google.com/store" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block hover-elevate transition-transform"
                data-testid="link-google-play"
              >
                <img 
                  src={googlePlayImage} 
                  alt="Get it on Google Play" 
                  className="h-10 w-auto"
                  loading="lazy"
                />
              </a>
              <a 
                href="https://apps.apple.com/app" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block hover-elevate transition-transform"
                data-testid="link-app-store"
              >
                <img 
                  src={appStoreImage} 
                  alt="Download on the App Store" 
                  className="h-10 w-auto"
                  loading="lazy"
                />
              </a>
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            © {currentYear} OddRoyal. All rights reserved.
          </div>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>18+ Only</span>
            <span>•</span>
            <span>Gamble Responsibly</span>
            <span>•</span>
            <span>Licensed in Gibraltar</span>
          </div>
        </div>
      </div>
    </footer>
  );
}