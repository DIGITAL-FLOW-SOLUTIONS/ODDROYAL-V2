import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Clock, AlertTriangle, Phone } from "lucide-react";
import { useLocation } from "wouter";

export default function ResponsibleGaming() {
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
              <h1 className="text-3xl font-display font-bold text-gray-900">Responsible Gaming</h1>
              <p className="text-gray-600">Your wellbeing is our priority</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none text-gray-900">
            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold m-0 text-gray-900">Our Commitment</h2>
              </div>
              <p>
                At OddRoyal, we are committed to providing a safe and responsible gaming environment. Sports betting 
                should be an enjoyable form of entertainment, not a source of financial or personal problems. We provide 
                tools and resources to help you maintain control over your gaming activities.
              </p>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <h2 className="text-xl font-semibold m-0 text-gray-900">Warning Signs</h2>
              </div>
              <p>
                It's important to recognize the warning signs of problem gambling. Consider whether any of these apply to you:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Spending more money on betting than you can afford to lose</li>
                <li>Chasing losses by placing larger or more frequent bets</li>
                <li>Betting interferes with work, relationships, or daily activities</li>
                <li>Feeling anxious, depressed, or guilty about your betting</li>
                <li>Lying to family or friends about your betting activities</li>
                <li>Unable to stop or reduce betting despite wanting to</li>
                <li>Borrowing money or selling possessions to fund betting</li>
                <li>Neglecting responsibilities to spend time betting</li>
              </ul>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-6 w-6 text-blue-500" />
                <h2 className="text-xl font-semibold m-0 text-gray-900">Self-Control Tools</h2>
              </div>
              <p>
                We provide several tools to help you maintain control over your betting activities:
              </p>
              
              <h3 className="text-lg font-medium text-gray-900">Deposit Limits</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set daily, weekly, or monthly deposit limits</li>
                <li>Limits can be decreased immediately or increased after a cooling-off period</li>
                <li>Once set, limits cannot be removed for 24 hours</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Loss Limits</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set maximum loss amounts for specific time periods</li>
                <li>System prevents further betting once limit is reached</li>
                <li>Limits reset automatically at the end of each period</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Session Time Limits</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set maximum session duration for betting activities</li>
                <li>Receive reminders about time spent on the platform</li>
                <li>Automatic logout when time limit is reached</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Self-Exclusion</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Temporarily or permanently exclude yourself from the platform</li>
                <li>Choose exclusion periods from 24 hours to permanently</li>
                <li>Account access is completely blocked during exclusion</li>
                <li>Contact support if you wish to lift a temporary exclusion early</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Responsible Gaming Guidelines</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Only bet with money you can afford to lose</li>
                <li>Set a budget before you start and stick to it</li>
                <li>Take regular breaks from betting</li>
                <li>Don't chase losses by increasing bet amounts</li>
                <li>Don't bet when emotional, drunk, or under the influence</li>
                <li>Keep track of time and money spent on betting</li>
                <li>Maintain a healthy balance between betting and other activities</li>
                <li>Talk to someone if you're concerned about your betting</li>
              </ul>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Phone className="h-6 w-6 text-green-500" />
                <h2 className="text-xl font-semibold m-0 text-gray-900">External Support Resources</h2>
              </div>
              <p>
                If you're struggling with gambling-related problems, professional help is available:
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 my-6">
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">GamCare</h3>
                  <p className="text-sm text-gray-600 mb-3">Free confidential support and advice</p>
                  <ul className="space-y-1 text-sm">
                    <li>Website: www.gamcare.org.uk</li>
                    <li>Helpline: 0808 8020 133</li>
                    <li>Live chat available</li>
                  </ul>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">Gamblers Anonymous</h3>
                  <p className="text-sm text-gray-600 mb-3">Peer support meetings and resources</p>
                  <ul className="space-y-1 text-sm">
                    <li>Website: www.gamblersanonymous.org.uk</li>
                    <li>Helpline: 020 7384 3040</li>
                    <li>Local meetings available</li>
                  </ul>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">GamStop</h3>
                  <p className="text-sm text-gray-600 mb-3">Self-exclusion across all UK gambling sites</p>
                  <ul className="space-y-1 text-sm">
                    <li>Website: www.gamstop.co.uk</li>
                    <li>Free self-exclusion service</li>
                    <li>Covers all licensed operators</li>
                  </ul>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">BeGambleAware</h3>
                  <p className="text-sm text-gray-600 mb-3">Information and support resources</p>
                  <ul className="space-y-1 text-sm">
                    <li>Website: www.begambleaware.org</li>
                    <li>Helpline: 0808 8020 133</li>
                    <li>Online support tools</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Underage Gaming Prevention</h2>
              <p>
                OddRoyal is strictly for users aged 18 and over. We employ various measures to prevent underage gambling:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Age verification required during registration</li>
                <li>Regular compliance checks and monitoring</li>
                <li>Collaboration with age verification services</li>
                <li>Educational resources about underage gambling risks</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Getting Help</h2>
              <p>
                If you need assistance with responsible gaming tools or have concerns about your betting, our support 
                team is available 24/7. We are trained to provide guidance and can help you access the right resources.
              </p>
              <p>
                Remember: Seeking help is a sign of strength, not weakness. Professional support is available, 
                and recovery is possible.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}