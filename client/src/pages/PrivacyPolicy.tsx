import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="p-2"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-display font-bold">Privacy Policy</h1>
              <p className="text-muted-foreground">Last updated: December 2024</p>
            </div>
          </div>

          <div className="prose prose-gray dark:prose-invert max-w-none">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">1. Information We Collect</h2>
              <p>
                OddRoyal collects and processes personal information to provide our sports betting services effectively 
                and securely. We are committed to protecting your privacy and handling your data responsibly.
              </p>
              <h3 className="text-lg font-medium">Personal Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Full name and date of birth</li>
                <li>Email address and phone number</li>
                <li>Residential address and country</li>
                <li>Payment method information</li>
                <li>Identity verification documents when required</li>
              </ul>
              <h3 className="text-lg font-medium">Technical Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>IP address and device information</li>
                <li>Browser type and version</li>
                <li>Website usage patterns and preferences</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
              <p>
                We use your personal information for legitimate business purposes related to providing our services 
                and ensuring a safe, secure platform.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Processing account registration and verification</li>
                <li>Managing deposits, withdrawals, and betting transactions</li>
                <li>Providing customer support and technical assistance</li>
                <li>Preventing fraud and ensuring platform security</li>
                <li>Complying with legal and regulatory requirements</li>
                <li>Sending service updates and promotional communications (with consent)</li>
                <li>Improving our services and user experience</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">3. Information Sharing and Disclosure</h2>
              <p>
                We do not sell your personal information to third parties. We may share your information only in 
                specific circumstances as outlined below.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>With payment processors to handle financial transactions</li>
                <li>With regulatory authorities when required by law</li>
                <li>With fraud prevention and security service providers</li>
                <li>With legal authorities in response to valid legal requests</li>
                <li>In case of business merger, acquisition, or sale of assets</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">4. Data Security and Protection</h2>
              <p>
                We implement robust security measures to protect your personal information from unauthorized access, 
                disclosure, alteration, or destruction.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>SSL encryption for all data transmission</li>
                <li>Secure servers with restricted access</li>
                <li>Regular security audits and vulnerability assessments</li>
                <li>Employee training on data protection practices</li>
                <li>Multi-factor authentication for sensitive operations</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">5. Cookies and Tracking Technologies</h2>
              <p>
                We use cookies and similar technologies to enhance your experience on our platform and improve our services.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Essential cookies for platform functionality</li>
                <li>Performance cookies to analyze website usage</li>
                <li>Preference cookies to remember your settings</li>
                <li>Marketing cookies for personalized advertising (with consent)</li>
              </ul>
              <p>
                You can control cookie settings through your browser preferences, though disabling certain cookies 
                may affect platform functionality.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">6. Your Rights and Choices</h2>
              <p>
                You have certain rights regarding your personal information, subject to applicable laws.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access: Request a copy of the personal information we hold about you</li>
                <li>Correction: Request correction of inaccurate or incomplete information</li>
                <li>Deletion: Request deletion of your personal information in certain circumstances</li>
                <li>Portability: Request transfer of your data in a structured format</li>
                <li>Objection: Object to certain types of data processing</li>
                <li>Withdrawal: Withdraw consent for marketing communications</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">7. Data Retention</h2>
              <p>
                We retain your personal information for as long as necessary to provide our services and comply with 
                legal obligations. Account information is typically retained for 5 years after account closure.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">8. International Data Transfers</h2>
              <p>
                Your information may be transferred to and processed in countries other than your own. We ensure 
                appropriate safeguards are in place for international transfers.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">9. Policy Updates</h2>
              <p>
                We may update this Privacy Policy periodically to reflect changes in our practices or legal requirements. 
                We will notify you of significant changes through our platform or via email.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">10. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or how we handle your personal information, 
                please contact our support team through the available channels on our website.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}