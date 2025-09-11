import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Shield, HelpCircle, FileText, Phone, Mail, Globe } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-sidebar border-t border-sidebar-border mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="font-display text-xl font-bold text-primary">
              PRIME<span className="text-destructive">STAKE</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Premium sports betting platform with competitive odds and secure transactions.
            </p>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-chart-4" />
              <span className="text-xs text-muted-foreground">Licensed & Regulated</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Quick Links</h4>
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-sports-footer">
                Sports Betting
              </Button>
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-live-footer">
                Live Betting
              </Button>
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-promotions-footer">
                Promotions
              </Button>
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-results-footer">
                Results
              </Button>
            </div>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Support</h4>
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-help">
                <HelpCircle className="h-3 w-3 mr-2" />
                Help Center
              </Button>
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-contact">
                <Phone className="h-3 w-3 mr-2" />
                Contact Us
              </Button>
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-live-chat">
                <Mail className="h-3 w-3 mr-2" />
                Live Chat
              </Button>
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Legal</h4>
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-terms">
                <FileText className="h-3 w-3 mr-2" />
                Terms & Conditions
              </Button>
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-privacy">
                <Shield className="h-3 w-3 mr-2" />
                Privacy Policy
              </Button>
              <Button variant="ghost" size="sm" className="justify-start p-0 h-auto font-normal" data-testid="link-responsible">
                <Globe className="h-3 w-3 mr-2" />
                Responsible Gaming
              </Button>
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            © {currentYear} PRIMESTAKE. All rights reserved.
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