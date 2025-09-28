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
                By accessing or using the OddRoyal website and services, you agree to be bound by these Terms and Conditions 
                ("Terms"). If you do not agree with any part of these terms, you must not use our services. These terms govern 
                your use of our sports betting platform, mobile applications, and all related services provided by OddRoyal.
              </p>
              <p>
                OddRoyal operates under appropriate gaming licenses and regulatory oversight in applicable jurisdictions. 
                We reserve the right to modify these terms at any time without prior notice. Continued use 
                of our services after any modifications constitutes acceptance of the updated terms. It is your responsibility 
                to review these terms regularly.
              </p>
              <p>
                These Terms constitute a legally binding agreement between you and OddRoyal. By registering an account or using 
                our services, you represent that you have read, understood, and agree to be bound by these Terms and all applicable 
                laws and regulations.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">2. Eligibility and Age Requirements</h2>
              <p>
                To use OddRoyal services, you must meet strict eligibility requirements designed to protect minors and comply 
                with international gambling regulations.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>You must be at least 18 years of age (or the legal gambling age in your jurisdiction, whichever is higher)</li>
                <li>You must be legally capable of entering into binding contracts</li>
                <li>You must reside in a jurisdiction where online sports betting is legal</li>
                <li>You must not be a resident of or accessing our services from restricted territories</li>
                <li>You must not be subject to any form of bankruptcy or insolvency proceedings</li>
                <li>You must not be listed on any governmental or international sanctions lists</li>
                <li>You must provide valid government-issued identification for verification</li>
                <li>Professional athletes, coaches, and officials cannot bet on sports in which they participate</li>
              </ul>
              <p>
                We employ advanced age verification systems and reserve the right to request additional documentation 
                at any time to verify your eligibility. Failure to provide satisfactory verification may result in 
                account suspension and confiscation of funds.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">3. Account Registration and Management</h2>
              <p>
                To use OddRoyal services, you must create an account by providing accurate, complete, and current information. 
                You are fully responsible for maintaining the confidentiality of your account credentials and for all activities 
                that occur under your account.
              </p>
              
              <h3 className="text-lg font-medium text-gray-900">Account Requirements</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Each person may maintain only one account with OddRoyal</li>
                <li>Duplicate accounts will be closed, and funds may be confiscated</li>
                <li>All personal information provided must be accurate and truthful</li>
                <li>You must update your information promptly when changes occur</li>
                <li>Account sharing or transfer is strictly prohibited</li>
                <li>Use of automated betting software or bots is forbidden</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Security Responsibilities</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Create a strong, unique password for your account</li>
                <li>Enable two-factor authentication when available</li>
                <li>Log out of your account after each session</li>
                <li>Never share your login credentials with third parties</li>
                <li>Notify us immediately of any suspected unauthorized access</li>
                <li>Use only secure networks when accessing your account</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Verification Process</h3>
              <p>
                All accounts are subject to verification procedures to comply with anti-money laundering regulations 
                and responsible gambling requirements. You may be required to provide:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Government-issued photo identification (passport, driver's license)</li>
                <li>Proof of address (utility bill, bank statement)</li>
                <li>Proof of payment method ownership</li>
                <li>Source of funds documentation for large deposits</li>
                <li>Additional documentation as requested by our compliance team</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">4. Deposits and Withdrawals</h2>
              <p>
                All financial transactions must be conducted through approved payment methods. You may only use payment 
                methods registered in your own name, and all funds must be from legitimate sources. OddRoyal implements 
                strict anti-money laundering controls and monitors all financial activity.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Deposit Policies</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Minimum deposit amounts apply as displayed on our platform</li>
                <li>Maximum deposit limits are in place for responsible gambling</li>
                <li>Deposits are typically processed instantly</li>
                <li>Currency conversion fees may apply for non-account currencies</li>
                <li>Credit card deposits may be subject to additional verification</li>
                <li>Cryptocurrency deposits must meet minimum confirmation requirements</li>
                <li>We reserve the right to refuse deposits from certain sources</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Withdrawal Policies</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Withdrawals must be made to the same payment method used for deposits</li>
                <li>Minimum withdrawal amounts apply as specified on our platform</li>
                <li>Processing times vary by payment method (1-7 business days)</li>
                <li>Account verification must be completed before first withdrawal</li>
                <li>Withdrawal requests may be subject to additional security checks</li>
                <li>We reserve the right to request source of funds documentation</li>
                <li>Suspicious activity may result in withdrawal delays or rejection</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Financial Restrictions</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>All funds must be from legitimate sources</li>
                <li>Third-party deposits and withdrawals are prohibited</li>
                <li>Bonus funds are subject to specific wagering requirements</li>
                <li>Dormant account fees may apply after extended inactivity</li>
                <li>We may charge fees for excessive withdrawal requests</li>
                <li>Currency exchange rates are determined at time of transaction</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">5. Betting Rules and Market Regulations</h2>
              <p>
                All bets are subject to our comprehensive betting rules, market-specific terms, and official sporting 
                regulations. We reserve the right to void bets that violate our terms, are placed in error, or result 
                from technical malfunctions.
              </p>

              <h3 className="text-lg font-medium text-gray-900">General Betting Rules</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Bets cannot be changed or cancelled once confirmed and accepted</li>
                <li>All bets are subject to maximum payout limits</li>
                <li>We reserve the right to limit betting amounts based on risk assessment</li>
                <li>Minimum bet amounts apply as specified on our platform</li>
                <li>Bets placed on cancelled or postponed events will be void</li>
                <li>Settlement is based on official results from recognized sporting authorities</li>
                <li>Dead heat rules apply where multiple participants tie</li>
                <li>Rule changes by sporting authorities may affect bet settlement</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Prohibited Betting Activities</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Betting on events where you have inside information</li>
                <li>Coordinated betting or syndicate activities</li>
                <li>Arbitrage betting across different platforms</li>
                <li>Using automated betting systems or software</li>
                <li>Placing bets after becoming aware of relevant outcomes</li>
                <li>Betting on behalf of third parties</li>
                <li>Any form of match-fixing or corruption involvement</li>
                <li>Exploiting technical errors or obvious pricing mistakes</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Market Specific Rules</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Live betting markets may be suspended without notice</li>
                <li>Cash-out options are available at our discretion</li>
                <li>Accumulator bets are subject to specific terms and limits</li>
                <li>Each sport has unique settlement rules available in our help section</li>
                <li>Weather-affected events follow sport-specific postponement rules</li>
                <li>VAR decisions and official reviews affect final settlement</li>
                <li>Handicap betting follows standard industry practices</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">6. Bonuses and Promotional Offers</h2>
              <p>
                OddRoyal offers various bonuses and promotional offers to enhance your betting experience. All bonuses 
                are subject to specific terms and conditions that must be met before any bonus funds can be withdrawn.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Bonus Terms</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Bonuses are available to eligible customers only</li>
                <li>Each customer can claim each promotional offer only once</li>
                <li>Wagering requirements must be met within specified timeframes</li>
                <li>Bonus funds cannot be withdrawn until requirements are fulfilled</li>
                <li>Maximum bet limits apply when using bonus funds</li>
                <li>Certain bet types may not contribute to wagering requirements</li>
                <li>We reserve the right to modify or withdraw promotions at any time</li>
                <li>Bonus abuse or irregular betting patterns may void promotions</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Promotional Restrictions</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Customers must opt-in to receive promotional offers</li>
                <li>Multiple accounts cannot be used to claim additional bonuses</li>
                <li>Family members sharing payment methods may be restricted</li>
                <li>VPN usage to claim geo-restricted bonuses is prohibited</li>
                <li>Professional gamblers may be excluded from certain promotions</li>
                <li>Bonus funds expire after specified periods of inactivity</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">7. Intellectual Property and Website Usage</h2>
              <p>
                All content on the OddRoyal website, including text, graphics, logos, images, software, and data 
                compilations, is the property of OddRoyal or its licensors and is protected by international copyright 
                and trademark laws.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Permitted Use</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Personal, non-commercial use of our website and services</li>
                <li>Downloading content for personal reference (where applicable)</li>
                <li>Sharing odds and results for non-commercial purposes</li>
                <li>Using our website through standard web browsers</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Prohibited Activities</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Reproducing, distributing, or publicly displaying our content</li>
                <li>Using automated data extraction tools or scrapers</li>
                <li>Reverse engineering our software or systems</li>
                <li>Creating derivative works based on our content</li>
                <li>Removing copyright or trademark notices</li>
                <li>Using our trademarks without written permission</li>
                <li>Interfering with website security features</li>
                <li>Attempting to gain unauthorized access to our systems</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">8. Responsible Gaming and Player Protection</h2>
              <p>
                OddRoyal is committed to promoting responsible gaming practices and protecting vulnerable customers. 
                We provide comprehensive tools and resources to help you maintain control over your betting activities 
                and recognize potential gambling problems.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Self-Control Tools</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Deposit limits (daily, weekly, monthly)</li>
                <li>Loss limits with automatic enforcement</li>
                <li>Session time limits and reminders</li>
                <li>Bet size restrictions</li>
                <li>Self-exclusion options (1 month to permanent)</li>
                <li>Cool-off periods for temporary breaks</li>
                <li>Reality checks during extended sessions</li>
                <li>Account activity monitoring and alerts</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Support Resources</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>24/7 customer support for responsible gaming concerns</li>
                <li>Links to professional gambling addiction services</li>
                <li>Educational materials about responsible gambling</li>
                <li>Referrals to local support organizations</li>
                <li>Family and friend intervention options</li>
                <li>Financial counseling resource recommendations</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">9. Account Suspension and Termination</h2>
              <p>
                We reserve the right to suspend, restrict, or terminate accounts that violate these terms, engage in 
                prohibited activities, or pose risks to the integrity of our platform or other customers.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Grounds for Suspension</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violation of any terms and conditions</li>
                <li>Suspected fraudulent or criminal activity</li>
                <li>Failure to provide required verification documents</li>
                <li>Use of multiple accounts or account sharing</li>
                <li>Abusive behavior toward staff or other customers</li>
                <li>Technical exploitation or system abuse</li>
                <li>Irregular betting patterns indicating professional play</li>
                <li>Connection to match-fixing or corruption</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Termination Process</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Written notice will be provided where possible</li>
                <li>Outstanding bets will be settled according to our rules</li>
                <li>Legitimate account balances will be returned</li>
                <li>Investigation periods may delay fund returns</li>
                <li>Disputed funds may be held pending resolution</li>
                <li>Legal action may be pursued for serious violations</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Customer-Initiated Closure</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>You may close your account at any time</li>
                <li>Outstanding balances will be processed for withdrawal</li>
                <li>Pending bets must be settled before closure</li>
                <li>Closure requests are typically processed within 48 hours</li>
                <li>Reopening closed accounts requires verification</li>
                <li>Self-exclusion periods cannot be shortened without cooling-off</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">10. Privacy and Data Protection</h2>
              <p>
                OddRoyal is committed to protecting your personal information and privacy rights. We process your data 
                in accordance with our Privacy Policy and applicable data protection regulations, including GDPR.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Data Processing</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>We collect only necessary information for service provision</li>
                <li>Data is processed for legitimate business purposes only</li>
                <li>Information is shared only as described in our Privacy Policy</li>
                <li>Strict security measures protect your personal data</li>
                <li>You have rights regarding your personal information</li>
                <li>Data retention periods comply with legal requirements</li>
              </ul>

              <p>
                For detailed information about how we handle your personal data, please review our comprehensive 
                Privacy Policy, which forms an integral part of these Terms and Conditions.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">11. Dispute Resolution and Complaints</h2>
              <p>
                OddRoyal is committed to resolving customer disputes fairly and efficiently. We have established 
                comprehensive procedures to handle complaints and ensure customer satisfaction.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Internal Dispute Process</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Contact our customer support team as the first step</li>
                <li>Provide detailed information about your complaint</li>
                <li>Our support team will investigate and respond within 48 hours</li>
                <li>Escalation to management is available for unresolved issues</li>
                <li>Written responses will be provided for formal complaints</li>
                <li>Internal review process typically takes 5-10 business days</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">External Resolution</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Unresolved disputes may be referred to independent arbitration</li>
                <li>Gibraltar regulatory authority provides dispute resolution services</li>
                <li>Alternative dispute resolution services are available</li>
                <li>Legal action should be considered as a last resort</li>
                <li>Limitation periods apply to formal complaint submissions</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">12. Limitation of Liability and Disclaimers</h2>
              <p>
                OddRoyal's liability is limited to the extent permitted by law. We provide our services on an "as is" 
                basis and cannot guarantee uninterrupted or error-free operation.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Service Disclaimers</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>We do not guarantee continuous service availability</li>
                <li>Technical issues may temporarily affect platform operation</li>
                <li>Odds and information are provided for entertainment purposes</li>
                <li>We are not responsible for third-party content or services</li>
                <li>Investment decisions should not be based solely on our information</li>
                <li>Past performance does not indicate future results</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Liability Limitations</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Maximum liability is limited to your account balance</li>
                <li>We are not liable for indirect or consequential losses</li>
                <li>Force majeure events release us from performance obligations</li>
                <li>Technical failures do not create liability beyond refunds</li>
                <li>Third-party actions are outside our control and responsibility</li>
                <li>Regulatory changes may affect service availability</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">13. Legal Compliance and Regulatory Information</h2>
              <p>
                OddRoyal operates under strict regulatory oversight and complies with all applicable laws and regulations 
                in the jurisdictions where we offer services.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Licensing and Regulation</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Licensed and regulated by appropriate gaming authorities</li>
                <li>Subject to regular compliance audits and reviews</li>
                <li>Member of responsible gambling organizations</li>
                <li>Certified by independent testing laboratories</li>
                <li>Maintains appropriate insurance coverage</li>
                <li>Complies with applicable data protection regulations</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Anti-Money Laundering</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Comprehensive AML policies are in place</li>
                <li>Customer due diligence procedures are mandatory</li>
                <li>Suspicious activity is reported to relevant authorities</li>
                <li>Source of funds verification may be required</li>
                <li>Enhanced due diligence applies to high-risk customers</li>
                <li>Regular staff training on AML requirements</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Jurisdictional Restrictions</h3>
              <p>
                Our services are not available to residents of certain jurisdictions due to local laws and regulations. 
                It is your responsibility to ensure that your use of our services complies with local laws.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">14. Force Majeure and Technical Issues</h2>
              <p>
                OddRoyal shall not be liable for any failure or delay in performance due to circumstances beyond our 
                reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, 
                government actions, or technical failures.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Force Majeure Events</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Natural disasters and extreme weather events</li>
                <li>War, terrorism, and civil unrest</li>
                <li>Government actions and regulatory changes</li>
                <li>Internet and telecommunications failures</li>
                <li>Power outages and infrastructure failures</li>
                <li>Pandemics and public health emergencies</li>
                <li>Cyber attacks and security breaches</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Technical Issues</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Server maintenance may temporarily affect service</li>
                <li>Software updates may cause brief interruptions</li>
                <li>Network issues may impact betting platform access</li>
                <li>Mobile app updates may be required for continued use</li>
                <li>Browser compatibility issues may affect user experience</li>
                <li>Third-party service failures may impact our operations</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">15. Governing Law and Jurisdiction</h2>
              <p>
                These Terms and Conditions are governed by applicable law. Any disputes arising from or relating 
                to these terms or your use of our services shall be subject to the jurisdiction of competent courts 
                or alternative dispute resolution procedures as specified in our licensing jurisdiction.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Legal Framework</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Applicable gambling legislation provides the regulatory framework</li>
                <li>Consumer protection regulations apply as required</li>
                <li>Data protection regulations are implemented as applicable</li>
                <li>International anti-money laundering standards are followed</li>
                <li>Dispute resolution follows established legal procedures</li>
                <li>Enforcement actions comply with relevant court processes</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">16. Contact Information and Support</h2>
              <p>
                If you have questions about these Terms and Conditions or need assistance with any aspect of our services, 
                our customer support team is available to help you.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Customer Support</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>24/7 live chat support available on our website</li>
                <li>Email support: support@oddroyal.com</li>
                <li>Phone support: Available through customer support portal</li>
                <li>Postal address: Available upon request through customer support</li>
                <li>Responsible gambling support: help@oddroyal.com</li>
                <li>Compliance inquiries: compliance@oddroyal.com</li>
                <li>Media inquiries: media@oddroyal.com</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Response Times</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Live chat: Immediate during business hours</li>
                <li>Email support: Within 24 hours</li>
                <li>Phone support: Immediate during business hours</li>
                <li>Formal complaints: Within 48 hours</li>
                <li>Compliance matters: Within 5 business days</li>
                <li>Account verification: Within 72 hours</li>
              </ul>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-8">
                <p className="text-sm text-yellow-800 font-medium mb-2">⚠️ Important Notice</p>
                <p className="text-sm text-yellow-700">
                  This is demonstration content for development purposes only. These terms and conditions are 
                  not legally binding and should not be used for actual commercial operations without proper 
                  legal review and regulatory approval.
                </p>
              </div>
              <p className="text-sm text-gray-600 mt-6">
                Last updated: December 2024. These Terms and Conditions may be updated periodically. 
                Continued use of our services constitutes acceptance of any changes.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}