import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function PrivacyPolicy() {
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
              <h1 className="text-3xl font-display font-bold text-gray-900">Privacy Policy</h1>
              <p className="text-gray-600">Last updated: December 2024</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none text-gray-900">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">1. Introduction and Data Controller Information</h2>
              <p>
                OddRoyal ("we," "us," "our") is committed to protecting your privacy and personal information. This Privacy Policy 
                explains how we collect, use, share, and protect your personal data when you use our sports betting platform, 
                mobile applications, and related services. We process your personal data in accordance with applicable data 
                protection laws and regulations.
              </p>
              <p>
                As a data controller, we are responsible for ensuring that your personal information is processed lawfully, 
                fairly, and transparently. This policy applies to all users of our services and covers all aspects of our 
                data processing activities.
              </p>
              
              <h3 className="text-lg font-medium text-gray-900">Key Principles</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>We process personal data lawfully, fairly, and transparently</li>
                <li>Data is collected for specified, explicit, and legitimate purposes</li>
                <li>We collect only data that is adequate, relevant, and necessary</li>
                <li>Personal information is kept accurate and up to date</li>
                <li>Data is retained only as long as necessary for the specified purposes</li>
                <li>We implement appropriate security measures to protect your data</li>
                <li>We respect your rights regarding your personal information</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">2. Information We Collect</h2>
              <p>
                We collect various types of personal information to provide our sports betting services effectively, 
                ensure regulatory compliance, and maintain platform security. The information we collect includes:
              </p>

              <h3 className="text-lg font-medium text-gray-900">Personal Identification Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Full legal name and any aliases</li>
                <li>Date of birth and age verification</li>
                <li>Gender and nationality</li>
                <li>Government-issued identification numbers</li>
                <li>Residential and postal addresses</li>
                <li>Email addresses and phone numbers</li>
                <li>Photographs and identity documents</li>
                <li>Biometric data for enhanced verification (where legally permitted)</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Financial Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Payment method details (credit/debit cards, e-wallets, bank accounts)</li>
                <li>Transaction history and betting records</li>
                <li>Deposit and withdrawal patterns</li>
                <li>Source of funds documentation</li>
                <li>Tax identification numbers (where required)</li>
                <li>Employment and income information</li>
                <li>Banking relationships and references</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Technical and Usage Data</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>IP addresses and geolocation information</li>
                <li>Device identifiers and characteristics</li>
                <li>Browser type, version, and language settings</li>
                <li>Operating system and mobile device information</li>
                <li>Website and app usage patterns and preferences</li>
                <li>Session duration and frequency of use</li>
                <li>Clickstream data and navigation paths</li>
                <li>Search queries and bet placement patterns</li>
                <li>Performance metrics and error reports</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Communication and Interaction Data</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Customer service interactions and correspondence</li>
                <li>Live chat conversations and support tickets</li>
                <li>Phone call recordings (with consent)</li>
                <li>Email communications and responses</li>
                <li>Survey responses and feedback</li>
                <li>Social media interactions (where applicable)</li>
                <li>Marketing preferences and opt-in/opt-out choices</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Behavioral and Analytical Data</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Betting history and preferences</li>
                <li>Risk assessment and profiling information</li>
                <li>Responsible gambling indicators and patterns</li>
                <li>Fraud detection and prevention data</li>
                <li>Account activity monitoring results</li>
                <li>Promotional and bonus engagement metrics</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">3. Legal Basis for Processing</h2>
              <p>
                We process your personal information based on various legal grounds, depending on the purpose of processing:
              </p>

              <h3 className="text-lg font-medium text-gray-900">Contractual Necessity</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Account registration and management</li>
                <li>Processing bets and managing your account balance</li>
                <li>Facilitating deposits and withdrawals</li>
                <li>Providing customer support services</li>
                <li>Delivering requested services and features</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Legal Obligations</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Age verification and identity confirmation</li>
                <li>Anti-money laundering (AML) compliance</li>
                <li>Know Your Customer (KYC) requirements</li>
                <li>Tax reporting and financial record keeping</li>
                <li>Regulatory reporting to gaming authorities</li>
                <li>Compliance with sanctions and restricted lists</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Legitimate Interests</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Fraud prevention and platform security</li>
                <li>Risk management and assessment</li>
                <li>Business analytics and service improvement</li>
                <li>Network and information security</li>
                <li>Detecting and preventing problem gambling</li>
                <li>Marketing to existing customers (where permitted)</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Consent</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Marketing communications to new prospects</li>
                <li>Non-essential cookies and tracking</li>
                <li>Promotional offers and personalized content</li>
                <li>Social media integration and sharing</li>
                <li>Optional services and features</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">4. How We Use Your Information</h2>
              <p>
                We use your personal information for legitimate business purposes related to providing our services, 
                ensuring regulatory compliance, and maintaining a safe, secure platform.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Service Provision and Account Management</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Processing account registration and ongoing management</li>
                <li>Verifying your identity and eligibility to use our services</li>
                <li>Managing deposits, withdrawals, and financial transactions</li>
                <li>Processing bets and calculating winnings</li>
                <li>Providing customer support and technical assistance</li>
                <li>Delivering account notifications and service updates</li>
                <li>Facilitating responsible gambling tools and limits</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Security and Compliance</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Preventing fraud, money laundering, and other criminal activities</li>
                <li>Conducting risk assessments and ongoing monitoring</li>
                <li>Ensuring platform security and protecting against cyber threats</li>
                <li>Complying with legal and regulatory requirements</li>
                <li>Investigating suspicious activities and policy violations</li>
                <li>Maintaining audit trails and transaction records</li>
                <li>Reporting to regulatory authorities as required</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Service Improvement and Analytics</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Analyzing usage patterns to improve our services</li>
                <li>Conducting market research and customer surveys</li>
                <li>Developing new features and functionalities</li>
                <li>Optimizing website and mobile app performance</li>
                <li>Personalizing your experience and content</li>
                <li>Testing new technologies and services</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Marketing and Communications</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Sending promotional offers and bonuses (with consent)</li>
                <li>Providing information about new products and services</li>
                <li>Delivering personalized marketing content</li>
                <li>Managing loyalty programs and rewards</li>
                <li>Conducting promotional campaigns and competitions</li>
                <li>Analyzing marketing effectiveness and ROI</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">5. Information Sharing and Disclosure</h2>
              <p>
                We do not sell, rent, or lease your personal information to third parties for their marketing purposes. 
                We may share your information only in specific circumstances and with appropriate safeguards in place.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Service Providers and Business Partners</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Payment processors and financial institutions</li>
                <li>Identity verification and KYC service providers</li>
                <li>Fraud prevention and security companies</li>
                <li>Cloud hosting and IT infrastructure providers</li>
                <li>Customer support and communication platforms</li>
                <li>Marketing and analytics service providers</li>
                <li>Professional advisors (lawyers, accountants, auditors)</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Regulatory and Legal Authorities</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Gaming regulators and licensing authorities</li>
                <li>Financial intelligence units and AML authorities</li>
                <li>Tax authorities and revenue services</li>
                <li>Law enforcement agencies and courts</li>
                <li>Data protection authorities and privacy regulators</li>
                <li>Ombudsman services and dispute resolution bodies</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Business Transactions</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Potential buyers in case of business sale or merger</li>
                <li>Investors and financial partners (with anonymized data)</li>
                <li>Insurance companies for coverage verification</li>
                <li>Audit firms for compliance and financial reviews</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Emergency Situations</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>To protect the safety and security of individuals</li>
                <li>To prevent harm or illegal activities</li>
                <li>To respond to emergency situations</li>
                <li>To protect our rights and property</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">6. Data Security and Protection</h2>
              <p>
                We implement comprehensive security measures to protect your personal information from unauthorized access, 
                disclosure, alteration, or destruction. Our security program includes technical, administrative, and 
                physical safeguards.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Technical Security Measures</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>256-bit SSL/TLS encryption for all data transmission</li>
                <li>Advanced encryption standards (AES) for data at rest</li>
                <li>Secure database architecture with access controls</li>
                <li>Multi-factor authentication for sensitive operations</li>
                <li>Regular security assessments and penetration testing</li>
                <li>Intrusion detection and prevention systems</li>
                <li>Automated backup and disaster recovery procedures</li>
                <li>Network segmentation and firewall protection</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Administrative Security Controls</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Comprehensive employee background checks</li>
                <li>Regular security awareness training for all staff</li>
                <li>Strict access controls based on role and necessity</li>
                <li>Data classification and handling procedures</li>
                <li>Incident response and breach notification protocols</li>
                <li>Regular security policy reviews and updates</li>
                <li>Third-party security assessments and due diligence</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Physical Security Measures</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Secure data centers with 24/7 monitoring</li>
                <li>Biometric access controls and security cameras</li>
                <li>Environmental controls and redundant power systems</li>
                <li>Secure disposal of physical media and equipment</li>
                <li>Restricted access to server rooms and equipment</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Ongoing Security Monitoring</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>24/7 security operations center (SOC) monitoring</li>
                <li>Real-time threat detection and response</li>
                <li>Regular vulnerability assessments and patch management</li>
                <li>Continuous security awareness training updates</li>
                <li>Annual third-party security audits and certifications</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">7. Cookies and Tracking Technologies</h2>
              <p>
                We use cookies and similar tracking technologies to enhance your experience on our platform, improve our services, 
                and provide personalized content. This section explains what cookies we use and how you can control them.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Types of Cookies We Use</h3>
              
              <h4 className="text-base font-medium text-gray-800">Essential Cookies</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Authentication and session management cookies</li>
                <li>Security and fraud prevention cookies</li>
                <li>Load balancing and performance optimization cookies</li>
                <li>Shopping cart and bet slip functionality cookies</li>
                <li>Language and regional preference cookies</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Performance and Analytics Cookies</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Website usage analytics and statistics</li>
                <li>Error tracking and performance monitoring</li>
                <li>A/B testing and optimization cookies</li>
                <li>Heat mapping and user behavior analysis</li>
                <li>Conversion tracking and attribution</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Functional Cookies</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>User preferences and settings storage</li>
                <li>Personalization and customization features</li>
                <li>Live chat and customer support functionality</li>
                <li>Remember me and auto-login features</li>
                <li>Accessibility and display preferences</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Marketing and Advertising Cookies</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Personalized advertising and content delivery</li>
                <li>Cross-device tracking and attribution</li>
                <li>Social media integration and sharing</li>
                <li>Affiliate and partner tracking</li>
                <li>Retargeting and remarketing campaigns</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Cookie Management and Controls</h3>
              <p>
                You can control cookie settings through your browser preferences or our cookie consent management tool. 
                Please note that disabling certain cookies may affect platform functionality and your user experience.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Browser-level cookie controls and settings</li>
                <li>Opt-out options for marketing and advertising cookies</li>
                <li>Third-party opt-out tools and services</li>
                <li>Mobile device advertising controls</li>
                <li>Do Not Track (DNT) signal recognition</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">8. Your Rights and Choices</h2>
              <p>
                You have important rights regarding your personal information under applicable data protection laws. 
                We are committed to helping you exercise these rights and providing you with control over your personal data.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Data Subject Rights</h3>
              
              <h4 className="text-base font-medium text-gray-800">Right of Access</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Request a copy of the personal information we hold about you</li>
                <li>Obtain information about how we process your data</li>
                <li>Receive details about data sharing and recipients</li>
                <li>Access your data processing history and purposes</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Right to Rectification</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Request correction of inaccurate or incomplete information</li>
                <li>Update your personal details and contact information</li>
                <li>Complete partial data records</li>
                <li>Verify and confirm data accuracy</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Right to Erasure ("Right to be Forgotten")</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Request deletion of your personal information in certain circumstances</li>
                <li>Withdraw consent for processing where applicable</li>
                <li>Object to processing for direct marketing purposes</li>
                <li>Request removal from marketing databases</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Right to Data Portability</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Request transfer of your data in a structured, machine-readable format</li>
                <li>Move your data to another service provider</li>
                <li>Receive data exports in standard formats</li>
                <li>Direct transfer to third parties where technically feasible</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Right to Restrict Processing</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Limit how we process your data while disputes are resolved</li>
                <li>Restrict processing during accuracy verification</li>
                <li>Object to processing while balancing legitimate interests</li>
                <li>Maintain data for legal claims while restricting other uses</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Right to Object</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Object to processing based on legitimate interests</li>
                <li>Opt out of direct marketing communications</li>
                <li>Object to profiling and automated decision-making</li>
                <li>Challenge the legal basis for processing</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">How to Exercise Your Rights</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Contact our data protection team via email or support portal</li>
                <li>Use our online privacy rights request form</li>
                <li>Submit requests through your account settings</li>
                <li>Provide identity verification as required</li>
                <li>Specify the nature and scope of your request</li>
                <li>Allow up to 30 days for response (may be extended in complex cases)</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">9. Data Retention and Deletion</h2>
              <p>
                We retain your personal information only for as long as necessary to fulfill the purposes for which it was 
                collected, comply with legal obligations, and protect our legitimate business interests.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Retention Periods by Data Type</h3>
              
              <h4 className="text-base font-medium text-gray-800">Account and Profile Information</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Retained for the duration of your account relationship</li>
                <li>Kept for 7 years after account closure for regulatory compliance</li>
                <li>Identity documents retained for audit and verification purposes</li>
                <li>Contact information updated or deleted upon request</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Financial and Transaction Data</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Transaction records retained for 7 years for tax and audit purposes</li>
                <li>Payment method information deleted after account closure</li>
                <li>Anti-money laundering data retained for 5 years minimum</li>
                <li>Suspicious activity reports retained indefinitely for law enforcement</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Communication and Support Data</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Customer service interactions retained for 3 years</li>
                <li>Marketing communications deleted upon opt-out</li>
                <li>Complaint records retained for regulatory compliance periods</li>
                <li>Call recordings deleted after 12 months unless required for investigations</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Technical and Usage Data</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Log files and analytics data retained for 2 years</li>
                <li>Security monitoring data retained for 1 year</li>
                <li>Session cookies deleted when browser is closed</li>
                <li>Persistent cookies expire according to their specified lifetime</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Automated Deletion Processes</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Regular automated purging of expired data</li>
                <li>Systematic review of retention periods and policies</li>
                <li>Secure deletion procedures for all data types</li>
                <li>Audit trails for all deletion activities</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">10. International Data Transfers</h2>
              <p>
                Your personal information may be transferred to and processed in countries other than your country of residence. 
                We ensure appropriate safeguards are in place for all international transfers to protect your privacy rights.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Transfer Mechanisms and Safeguards</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>European Commission adequacy decisions for transfers to approved countries</li>
                <li>Standard Contractual Clauses (SCCs) for transfers to third countries</li>
                <li>Binding Corporate Rules (BCRs) for intra-group transfers</li>
                <li>Certification schemes and codes of conduct</li>
                <li>Explicit consent for specific transfer purposes</li>
                <li>Derogations for contract performance and legal claims</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Countries and Regions</h3>
              <p>
                We may transfer your data to service providers and partners located in various countries, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>European Economic Area (EEA) member states</li>
                <li>United Kingdom (adequate level of protection)</li>
                <li>Countries with European Commission adequacy decisions</li>
                <li>Third countries with appropriate contractual safeguards</li>
                <li>Cloud service providers with global infrastructure</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Transfer Impact Assessments</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Regular assessment of transfer risks and local laws</li>
                <li>Monitoring of political and legal developments</li>
                <li>Implementation of supplementary measures where necessary</li>
                <li>Documentation of transfer decisions and safeguards</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">11. Automated Decision-Making and Profiling</h2>
              <p>
                We use automated systems and algorithms to make certain decisions about your account and services. 
                This section explains how automated decision-making works and your rights in relation to these processes.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Types of Automated Processing</h3>
              
              <h4 className="text-base font-medium text-gray-800">Risk Assessment and Fraud Prevention</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Automated screening against sanctions and PEP lists</li>
                <li>Real-time fraud detection during transactions</li>
                <li>Risk scoring for betting patterns and behavior</li>
                <li>Automated identity verification checks</li>
                <li>Transaction monitoring for suspicious activity</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Responsible Gambling Protection</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Automated detection of problem gambling indicators</li>
                <li>Algorithmic intervention triggers and alerts</li>
                <li>Spending pattern analysis and limit recommendations</li>
                <li>Behavioral profiling for player protection</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Personalization and Marketing</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Personalized content and offer recommendations</li>
                <li>Customer segmentation and targeting</li>
                <li>Automated marketing campaign optimization</li>
                <li>Product recommendation algorithms</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Your Rights Regarding Automated Decisions</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Right to human review of automated decisions</li>
                <li>Right to contest automated decision outcomes</li>
                <li>Right to request explanation of decision logic</li>
                <li>Right to opt-out of certain automated processing</li>
                <li>Right to provide additional information for consideration</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">12. Children's Privacy Protection</h2>
              <p>
                Our services are strictly for users aged 18 and over (or the legal gambling age in their jurisdiction). 
                We do not knowingly collect personal information from minors and have measures in place to prevent underage use.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Age Verification Measures</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Mandatory age verification during account registration</li>
                <li>Document verification and cross-referencing</li>
                <li>Ongoing monitoring for underage access attempts</li>
                <li>Collaboration with age verification service providers</li>
                <li>Regular audits of age verification processes</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Protection Measures</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Immediate account closure upon discovery of underage use</li>
                <li>Refund of deposits for underage accounts</li>
                <li>Deletion of personal information of minors</li>
                <li>Reporting to relevant authorities where required</li>
                <li>Enhanced monitoring and filtering systems</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">13. Privacy Policy Updates and Changes</h2>
              <p>
                We may update this Privacy Policy periodically to reflect changes in our practices, technology, legal requirements, 
                or business operations. We will notify you of significant changes through appropriate channels.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Types of Changes</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Updates to data processing purposes or legal bases</li>
                <li>Changes to data sharing practices or recipients</li>
                <li>Modifications to retention periods or deletion practices</li>
                <li>Updates to security measures or breach procedures</li>
                <li>Changes to contact information or data controller details</li>
                <li>New features or services that affect data processing</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Notification Methods</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Email notifications to registered users</li>
                <li>Prominent notices on our website and mobile apps</li>
                <li>In-app notifications and alerts</li>
                <li>Account dashboard messages</li>
                <li>Social media announcements for major changes</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Your Options</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Review changes and decide whether to continue using our services</li>
                <li>Contact us with questions or concerns about changes</li>
                <li>Exercise your data subject rights if you disagree with changes</li>
                <li>Close your account if you no longer accept the updated terms</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">14. Contact Information and Data Protection Officer</h2>
              <p>
                If you have questions about this Privacy Policy, how we handle your personal information, or wish to exercise 
                your data protection rights, please contact us using the information below.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Data Protection Contacts</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Data Protection Officer: privacy@oddroyal.com</li>
                <li>Privacy Rights Requests: rights@oddroyal.com</li>
                <li>General Privacy Inquiries: support@oddroyal.com</li>
                <li>Data Breach Notifications: security@oddroyal.com</li>
                <li>Cookie and Tracking Questions: cookies@oddroyal.com</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Response Times and Procedures</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Privacy rights requests: Responded to within 30 days</li>
                <li>General privacy inquiries: Responded to within 5 business days</li>
                <li>Data breach notifications: Immediate internal escalation</li>
                <li>Urgent security matters: 24/7 response available</li>
                <li>Complex requests: May require additional 60 days with notification</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Supervisory Authority Rights</h3>
              <p>
                You have the right to lodge a complaint with your local data protection supervisory authority if you believe 
                we have not handled your personal information in accordance with applicable law.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Contact details for relevant supervisory authorities available upon request</li>
                <li>Guidance on complaint procedures and required information</li>
                <li>Our commitment to cooperate with supervisory authority investigations</li>
                <li>Internal escalation procedures for regulatory inquiries</li>
              </ul>


              <p className="text-sm text-gray-600 mt-6">
                Last updated: December 2024. This Privacy Policy may be updated periodically to reflect changes 
                in our practices or legal requirements. Continued use of our services constitutes acceptance of any changes.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}