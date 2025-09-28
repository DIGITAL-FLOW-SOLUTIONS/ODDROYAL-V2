import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function TermsAndConditions() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full px-8 py-12">
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
              <h1 className="text-3xl font-display font-bold text-gray-900">Terms & Conditions</h1>
              <p className="text-gray-600">Last updated: December 2024</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none text-gray-900">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">1. General Terms</h2>
              <p>
                By accessing or using the OddRoyal website and services, you agree to be bound by these Terms and Conditions. 
                If you do not agree with any part of these terms, you must not use our services. These terms govern your use 
                of our sports betting platform and related services.
              </p>
              <p>
                OddRoyal reserves the right to modify these terms at any time. Continued use of our services after any 
                modifications constitutes acceptance of the updated terms.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">2. Account Registration and Requirements</h2>
              <p>
                To use OddRoyal services, you must create an account by providing accurate and complete information. 
                You are responsible for maintaining the confidentiality of your account credentials and for all activities 
                that occur under your account.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>You must be at least 18 years of age to register and use our services</li>
                <li>You may only maintain one account with OddRoyal</li>
                <li>All information provided during registration must be accurate and truthful</li>
                <li>You must notify us immediately of any unauthorized use of your account</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">3. Deposits and Withdrawals</h2>
              <p>
                All financial transactions must be conducted through approved payment methods. You may only use payment 
                methods registered in your own name, and all funds must be from legitimate sources.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Minimum and maximum deposit/withdrawal limits apply as displayed on our platform</li>
                <li>Withdrawal processing times vary by payment method</li>
                <li>We reserve the right to request verification documents for withdrawals</li>
                <li>All applicable fees and charges will be clearly displayed before transaction completion</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">4. Betting Rules and Restrictions</h2>
              <p>
                All bets are subject to our betting rules and market-specific terms. We reserve the right to void bets 
                that violate our terms or are placed in error.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Bets cannot be changed or cancelled once confirmed</li>
                <li>We reserve the right to limit betting amounts and refuse bets</li>
                <li>Results are final once officially confirmed by relevant sporting authorities</li>
                <li>Suspected fraudulent or collusive betting may result in account suspension</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">5. Responsible Gaming</h2>
              <p>
                OddRoyal is committed to promoting responsible gaming practices. We provide tools and resources to help 
                you maintain control over your betting activities.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set deposit, loss, and session time limits through your account settings</li>
                <li>Self-exclusion options are available if you need a break from betting</li>
                <li>Contact our support team if you need assistance with responsible gaming tools</li>
                <li>External support resources are available for gambling-related problems</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">6. Account Suspension and Termination</h2>
              <p>
                We reserve the right to suspend or terminate accounts that violate these terms or engage in prohibited activities.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violations of these terms may result in immediate account suspension</li>
                <li>Suspected fraudulent activity will be investigated and may result in termination</li>
                <li>You may close your account at any time by contacting our support team</li>
                <li>Outstanding balances will be handled according to our withdrawal procedures</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">7. Limitation of Liability</h2>
              <p>
                OddRoyal's liability is limited to the extent permitted by law. We are not responsible for losses 
                resulting from system failures, technical issues, or circumstances beyond our control.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">8. Contact Information</h2>
              <p>
                If you have questions about these Terms and Conditions, please contact our support team through 
                the available channels on our website.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}