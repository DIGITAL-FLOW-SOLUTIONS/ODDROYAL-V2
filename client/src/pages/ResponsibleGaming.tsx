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
                <h2 className="text-xl font-semibold m-0 text-gray-900">Our Commitment to Responsible Gaming</h2>
              </div>
              <p>
                At OddRoyal, we are committed to providing a safe and responsible gaming environment where sports betting 
                remains an enjoyable form of entertainment, not a source of financial hardship or personal problems. 
                We believe that gambling should be undertaken responsibly, within one's means, and never as a solution 
                to financial difficulties or emotional distress.
              </p>
              <p>
                Our responsible gaming program is built on four core principles: prevention, intervention, treatment, 
                and education. We work closely with industry organizations, regulatory bodies, and mental health 
                professionals to continually improve our player protection measures and support systems.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Our Responsible Gaming Standards</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Comprehensive player protection tools and controls</li>
                <li>Early intervention systems to identify at-risk behavior</li>
                <li>Collaboration with leading responsible gambling organizations</li>
                <li>Staff training on problem gambling recognition and response</li>
                <li>Regular review and improvement of our protective measures</li>
                <li>Transparent reporting on responsible gambling initiatives</li>
                <li>Support for research into gambling-related harm</li>
                <li>Age verification and underage gambling prevention</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Understanding Problem Gambling</h2>
              <p>
                Problem gambling is a behavioral addiction that can affect anyone, regardless of age, gender, 
                education, or social status. It's characterized by an inability to control gambling behavior 
                despite negative consequences to personal, professional, or financial well-being.
              </p>

              <h3 className="text-lg font-medium text-gray-900">What is Problem Gambling?</h3>
              <p>
                Problem gambling occurs when gambling behavior becomes compulsive and interferes with daily life. 
                It exists on a spectrum from mild concerns to severe addiction, and can develop gradually over time 
                or occur suddenly following life changes or stressful events.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Types of Gambling Problems</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>At-Risk Gambling:</strong> Occasional problems or concerns about gambling behavior</li>
                <li><strong>Problem Gambling:</strong> Significant negative impact on life and relationships</li>
                <li><strong>Pathological Gambling:</strong> Severe, chronic gambling disorder requiring professional treatment</li>
                <li><strong>Binge Gambling:</strong> Periods of excessive gambling followed by abstinence</li>
                <li><strong>Recreational Gambling:</strong> Controlled, enjoyable gambling within set limits</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Common Myths and Facts</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <h4 className="font-medium text-red-800 mb-2">Myth</h4>
                  <p className="text-sm text-red-700">"Problem gamblers lack willpower or self-control"</p>
                </div>
                <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <h4 className="font-medium text-green-800 mb-2">Fact</h4>
                  <p className="text-sm text-green-700">Problem gambling is a mental health condition that affects brain chemistry and decision-making</p>
                </div>
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <h4 className="font-medium text-red-800 mb-2">Myth</h4>
                  <p className="text-sm text-red-700">"You can predict gambling outcomes with systems or strategies"</p>
                </div>
                <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <h4 className="font-medium text-green-800 mb-2">Fact</h4>
                  <p className="text-sm text-green-700">All gambling outcomes are random and independent of previous results</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <h2 className="text-xl font-semibold m-0 text-gray-900">Warning Signs and Risk Factors</h2>
              </div>
              <p>
                Recognizing the warning signs of problem gambling is crucial for early intervention. If you or someone 
                you know exhibits these behaviors, it may be time to seek help or take preventive measures.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Behavioral Warning Signs</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Spending more money on betting than you can afford to lose</li>
                <li>Chasing losses by placing larger or more frequent bets</li>
                <li>Lying to family, friends, or colleagues about gambling activities</li>
                <li>Borrowing money or selling possessions to fund gambling</li>
                <li>Neglecting work, family, or social responsibilities to gamble</li>
                <li>Unable to stop or reduce gambling despite wanting to</li>
                <li>Feeling restless or irritable when trying to cut down on gambling</li>
                <li>Gambling as an escape from problems or negative emotions</li>
                <li>Preoccupation with gambling and planning the next betting session</li>
                <li>Continuing to gamble despite negative consequences</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Emotional Warning Signs</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Feeling anxious, depressed, or guilty about gambling</li>
                <li>Mood swings related to wins and losses</li>
                <li>Increased secrecy and defensiveness about gambling</li>
                <li>Loss of interest in previously enjoyed activities</li>
                <li>Feelings of hopelessness or despair</li>
                <li>Sleep disturbances or changes in appetite</li>
                <li>Increased use of alcohol or other substances</li>
                <li>Suicidal thoughts or behaviors</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Financial Warning Signs</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Unexplained financial difficulties or debt accumulation</li>
                <li>Missing money from accounts or hidden financial transactions</li>
                <li>Borrowing from multiple sources or payday loans</li>
                <li>Inability to pay bills or meet financial obligations</li>
                <li>Selling personal belongings or assets</li>
                <li>Using credit cards for cash advances</li>
                <li>Secretive about financial matters</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Risk Factors for Problem Gambling</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Mental health conditions (depression, anxiety, ADHD, bipolar disorder)</li>
                <li>Substance abuse or addiction history</li>
                <li>Family history of gambling problems or addiction</li>
                <li>Age (younger people are at higher risk)</li>
                <li>Male gender (statistically higher rates)</li>
                <li>Social isolation or loneliness</li>
                <li>Financial stress or unemployment</li>
                <li>Trauma or significant life changes</li>
                <li>Personality traits (impulsivity, competitiveness)</li>
                <li>Early gambling experiences or wins</li>
              </ul>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-6 w-6 text-blue-500" />
                <h2 className="text-xl font-semibold m-0 text-gray-900">Self-Control Tools and Player Protection</h2>
              </div>
              <p>
                We provide comprehensive tools to help you maintain control over your betting activities. These tools 
                are designed to support responsible gambling habits and prevent the development of problematic behavior.
              </p>
              
              <h3 className="text-lg font-medium text-gray-900">Spending Controls</h3>
              
              <h4 className="text-base font-medium text-gray-800">Deposit Limits</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set daily, weekly, or monthly deposit limits</li>
                <li>Limits can be decreased immediately</li>
                <li>Increases require a 24-hour cooling-off period</li>
                <li>Automatic blocking when limits are reached</li>
                <li>Email notifications when approaching limits</li>
                <li>Historical tracking of limit changes</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Loss Limits</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set maximum loss amounts for specific time periods</li>
                <li>Net loss calculation across all betting activities</li>
                <li>Automatic suspension when limits are reached</li>
                <li>Limits reset automatically at the end of each period</li>
                <li>Cannot be removed once set during the active period</li>
                <li>Detailed loss tracking and reporting</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Bet Size Limits</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Maximum single bet amount restrictions</li>
                <li>Limits on accumulator and combination bets</li>
                <li>Controls on live betting stake amounts</li>
                <li>Progressive staking controls</li>
                <li>Automatic rejection of bets exceeding limits</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Time Management Tools</h3>

              <h4 className="text-base font-medium text-gray-800">Session Time Limits</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set maximum session duration (1-6 hours)</li>
                <li>Pop-up reminders at regular intervals</li>
                <li>Automatic logout when time limit is reached</li>
                <li>Session extension requires deliberate action</li>
                <li>Daily and weekly session time tracking</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Reality Checks</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Customizable pop-up reminders (15-120 minutes)</li>
                <li>Display of session duration and spending</li>
                <li>Option to continue, take a break, or logout</li>
                <li>Net position display (wins/losses)</li>
                <li>Time of day and session frequency alerts</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Account Controls</h3>

              <h4 className="text-base font-medium text-gray-800">Self-Exclusion</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Temporary exclusion: 24 hours to 6 months</li>
                <li>Permanent self-exclusion option</li>
                <li>Complete account and website access blocking</li>
                <li>Automatic rejection of new account attempts</li>
                <li>Cooling-off period before early reinstatement</li>
                <li>Support and counseling referrals during exclusion</li>
                <li>Cross-platform exclusion coordination</li>
              </ul>

              <h4 className="text-base font-medium text-gray-800">Take a Break</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Short-term account suspension (1-30 days)</li>
                <li>Immediate activation without delay</li>
                <li>Account remains accessible for viewing only</li>
                <li>No betting or deposit functionality</li>
                <li>Automatic reactivation at end of period</li>
                <li>Option to extend break period</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Advanced Protection Features</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Algorithmic behavior monitoring and alerts</li>
                <li>Rapid play detection and intervention</li>
                <li>Loss chasing pattern identification</li>
                <li>Spending velocity monitoring</li>
                <li>Account activity pattern analysis</li>
                <li>Automated customer care interventions</li>
                <li>Risk assessment scoring system</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Responsible Gaming Guidelines and Best Practices</h2>
              <p>
                Following these guidelines can help ensure that your gambling remains a fun and entertaining activity 
                rather than a source of problems.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Financial Guidelines</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Only gamble with money you can afford to lose</li>
                <li>Set a gambling budget separate from essential expenses</li>
                <li>Never borrow money to fund gambling</li>
                <li>Don't use credit cards for gambling deposits</li>
                <li>Keep track of all gambling expenditure</li>
                <li>Don't chase losses by increasing bet amounts</li>
                <li>View gambling costs as entertainment expenses</li>
                <li>Never gamble to solve financial problems</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Time Management Guidelines</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Set time limits before you start gambling</li>
                <li>Take regular breaks during gambling sessions</li>
                <li>Don't gamble for extended periods</li>
                <li>Maintain balance between gambling and other activities</li>
                <li>Avoid gambling when tired or stressed</li>
                <li>Don't let gambling interfere with work or responsibilities</li>
                <li>Use reality checks and reminders</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Emotional Guidelines</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Don't gamble when emotional, angry, or depressed</li>
                <li>Avoid gambling under the influence of alcohol or drugs</li>
                <li>Don't use gambling to escape problems or negative feelings</li>
                <li>Accept that losses are part of gambling</li>
                <li>Don't let wins or losses affect your mood dramatically</li>
                <li>Talk to friends and family about your gambling</li>
                <li>Seek support if gambling is causing stress</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Decision-Making Guidelines</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Make gambling decisions when clear-headed and sober</li>
                <li>Understand the odds and house edge</li>
                <li>Don't believe in gambling systems or "sure things"</li>
                <li>Avoid superstitions and magical thinking</li>
                <li>Make informed bets based on knowledge, not emotions</li>
                <li>Know when to stop, whether winning or losing</li>
                <li>Never gamble to win back losses</li>
              </ul>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Phone className="h-6 w-6 text-green-500" />
                <h2 className="text-xl font-semibold m-0 text-gray-900">Professional Support and Treatment Resources</h2>
              </div>
              <p>
                If you're struggling with gambling-related problems, professional help is available. These organizations 
                provide free, confidential support and evidence-based treatment options.
              </p>

              <h3 className="text-lg font-medium text-gray-900">National Support Organizations</h3>
              
              <div className="grid md:grid-cols-2 gap-6 my-6">
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-lg mb-2 text-gray-900">GamCare</h4>
                  <p className="text-sm text-gray-600 mb-3">Free confidential support, advice and treatment</p>
                  <ul className="space-y-1 text-sm">
                    <li><strong>Website:</strong> www.gamcare.org.uk</li>
                    <li><strong>Helpline:</strong> 0808 8020 133 (24/7)</li>
                    <li><strong>Live Chat:</strong> Available on website</li>
                    <li><strong>Services:</strong> Counseling, support groups, treatment</li>
                  </ul>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-lg mb-2 text-gray-900">Gamblers Anonymous</h4>
                  <p className="text-sm text-gray-600 mb-3">Fellowship of men and women sharing experiences</p>
                  <ul className="space-y-1 text-sm">
                    <li><strong>Website:</strong> www.gamblersanonymous.org.uk</li>
                    <li><strong>Helpline:</strong> 020 7384 3040</li>
                    <li><strong>Meetings:</strong> In-person and online</li>
                    <li><strong>Services:</strong> 12-step program, peer support</li>
                  </ul>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-lg mb-2 text-gray-900">BeGambleAware</h4>
                  <p className="text-sm text-gray-600 mb-3">Independent charity promoting safer gambling</p>
                  <ul className="space-y-1 text-sm">
                    <li><strong>Website:</strong> www.begambleaware.org</li>
                    <li><strong>Helpline:</strong> 0808 8020 133</li>
                    <li><strong>Text:</strong> 81066</li>
                    <li><strong>Services:</strong> Information, self-help tools, referrals</li>
                  </ul>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-lg mb-2 text-gray-900">GamStop</h4>
                  <p className="text-sm text-gray-600 mb-3">Free self-exclusion service for UK gambling</p>
                  <ul className="space-y-1 text-sm">
                    <li><strong>Website:</strong> www.gamstop.co.uk</li>
                    <li><strong>Coverage:</strong> All UKGC licensed operators</li>
                    <li><strong>Periods:</strong> 6 months, 1 year, 5 years</li>
                    <li><strong>Services:</strong> Multi-operator exclusion</li>
                  </ul>
                </div>

                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-lg mb-2 text-gray-900">SMART Recovery</h4>
                  <p className="text-sm text-gray-600 mb-3">Self-management and recovery training</p>
                  <ul className="space-y-1 text-sm">
                    <li><strong>Website:</strong> www.smartrecovery.org.uk</li>
                    <li><strong>Approach:</strong> 4-Point Program</li>
                    <li><strong>Tools:</strong> CBT-based recovery tools</li>
                    <li><strong>Services:</strong> Meetings, online support, workbooks</li>
                  </ul>
                </div>

                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-lg mb-2 text-gray-900">Samaritans</h4>
                  <p className="text-sm text-gray-600 mb-3">Emotional support for anyone in distress</p>
                  <ul className="space-y-1 text-sm">
                    <li><strong>Website:</strong> www.samaritans.org</li>
                    <li><strong>Helpline:</strong> 116 123 (24/7, free)</li>
                    <li><strong>Email:</strong> jo@samaritans.org</li>
                    <li><strong>Services:</strong> Crisis support, emotional support</li>
                  </ul>
                </div>
              </div>

              <h3 className="text-lg font-medium text-gray-900">Specialized Treatment Options</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Cognitive Behavioral Therapy (CBT):</strong> Addresses thought patterns and behaviors</li>
                <li><strong>Counseling Services:</strong> Individual, group, and family therapy</li>
                <li><strong>Residential Treatment:</strong> Intensive inpatient programs for severe cases</li>
                <li><strong>Online Therapy:</strong> Digital counseling and support platforms</li>
                <li><strong>Medication:</strong> For co-occurring mental health conditions</li>
                <li><strong>Support Groups:</strong> Peer-led recovery communities</li>
                <li><strong>Financial Counseling:</strong> Debt management and financial planning</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">International Resources</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>USA:</strong> National Council on Problem Gambling (1-800-522-4700)</li>
                <li><strong>Canada:</strong> Problem Gambling Help Line (1-888-230-3505)</li>
                <li><strong>Australia:</strong> Gambling Help Online (1800 858 858)</li>
                <li><strong>Ireland:</strong> Problem Gambling Ireland (+353 89 241 5401)</li>
                <li><strong>New Zealand:</strong> Problem Gambling Foundation (0800 664 262)</li>
                <li><strong>Sweden:</strong> Stödlinjen (020-819 100)</li>
                <li><strong>Germany:</strong> BZgA (0800 1 37 27 00)</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Supporting Family and Friends</h2>
              <p>
                Problem gambling affects not just the individual but also their family, friends, and loved ones. 
                Support is available for those affected by someone else's gambling.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Signs Your Loved One May Have a Gambling Problem</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Unexplained absences from work, school, or family events</li>
                <li>Secretive behavior about whereabouts and activities</li>
                <li>Mood swings, especially related to financial wins or losses</li>
                <li>Borrowing money frequently or unexplained financial difficulties</li>
                <li>Lying about gambling activities or money spent</li>
                <li>Neglecting responsibilities and relationships</li>
                <li>Loss of interest in previously enjoyed activities</li>
                <li>Arguments about money and gambling</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">How to Help</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Express concern without judgment or blame</li>
                <li>Listen without trying to "fix" the problem immediately</li>
                <li>Encourage professional help and offer to accompany them</li>
                <li>Learn about problem gambling and available resources</li>
                <li>Set boundaries around money and financial access</li>
                <li>Don't enable gambling by covering debts or making excuses</li>
                <li>Take care of your own mental health and wellbeing</li>
                <li>Consider counseling for yourself and family members</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Family Support Resources</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>GamAnon:</strong> Support groups for families of problem gamblers</li>
                <li><strong>GamCare Family Support:</strong> Counseling and advice for affected families</li>
                <li><strong>National Family Support Network:</strong> Resources and peer support</li>
                <li><strong>Family Therapy Services:</strong> Professional counseling for families</li>
                <li><strong>Financial Counseling:</strong> Help with debt and financial recovery</li>
                <li><strong>Legal Advice:</strong> Understanding rights and protections</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Youth and Underage Gambling Prevention</h2>
              <p>
                Protecting young people from gambling harm is a critical priority. Early exposure to gambling 
                increases the risk of developing problems later in life.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Our Youth Protection Measures</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Strict age verification during account registration</li>
                <li>Document verification and identity cross-referencing</li>
                <li>Regular compliance checks and monitoring systems</li>
                <li>Collaboration with age verification service providers</li>
                <li>Staff training on underage gambling detection</li>
                <li>Immediate account closure upon discovery of underage use</li>
                <li>Full refund of deposits for underage accounts</li>
                <li>Reporting to relevant authorities as required</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Warning Signs in Young People</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Unexplained money or new possessions</li>
                <li>Secretive behavior about online activities</li>
                <li>Declining academic performance or attendance</li>
                <li>Loss of interest in sports, hobbies, or social activities</li>
                <li>Mood swings or behavioral changes</li>
                <li>Borrowing money from friends or family</li>
                <li>Discussion of "easy money" or "sure wins"</li>
                <li>Fascination with gambling or betting content</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Education and Prevention</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>School-based education programs about gambling risks</li>
                <li>Parent and educator resources and training</li>
                <li>Community awareness campaigns</li>
                <li>Youth-focused research and studies</li>
                <li>Collaboration with educational institutions</li>
                <li>Support for evidence-based prevention programs</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Youth Support Resources</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Young Gamers and Gamblers Education Trust (YGAM):</strong> Education and support</li>
                <li><strong>Childline:</strong> Confidential support for young people (0800 1111)</li>
                <li><strong>Beat the Odds:</strong> Youth-focused gambling education</li>
                <li><strong>Student Support Services:</strong> University and college counseling</li>
                <li><strong>Youth Mental Health Services:</strong> Specialized support for young people</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Research, Education, and Industry Initiatives</h2>
              <p>
                We support ongoing research into gambling-related harm and contribute to industry-wide initiatives 
                to promote safer gambling practices.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Research and Development</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Funding for independent gambling research</li>
                <li>Collaboration with academic institutions</li>
                <li>Data sharing for harm reduction studies</li>
                <li>Development of new protection technologies</li>
                <li>Evaluation of intervention effectiveness</li>
                <li>Publication of research findings and insights</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Industry Partnerships</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Membership in responsible gambling organizations</li>
                <li>Adherence to industry codes of practice</li>
                <li>Participation in safer gambling initiatives</li>
                <li>Collaboration on cross-operator solutions</li>
                <li>Support for regulatory development</li>
                <li>Sharing of best practices and innovations</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">Educational Initiatives</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Public awareness campaigns</li>
                <li>Educational content and resources</li>
                <li>Training programs for industry professionals</li>
                <li>Community outreach and engagement</li>
                <li>Social media education campaigns</li>
                <li>Collaboration with health organizations</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Getting Help and Support</h2>
              <p>
                If you need assistance with responsible gaming tools, have concerns about your betting, or require 
                support for gambling-related problems, help is available 24/7.
              </p>

              <h3 className="text-lg font-medium text-gray-900">Immediate Support Options</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>24/7 Customer Support:</strong> Available through live chat, email, and phone</li>
                <li><strong>Dedicated Responsible Gaming Team:</strong> Specialized support for gambling concerns</li>
                <li><strong>Self-Help Tools:</strong> Access limits and controls through your account</li>
                <li><strong>Crisis Helplines:</strong> Immediate support for those in crisis</li>
                <li><strong>Online Resources:</strong> Information, tools, and self-assessment tests</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">How to Access Help</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Contact our support team through the website or mobile app</li>
                <li>Use the responsible gaming section in your account settings</li>
                <li>Call or text the national helplines listed above</li>
                <li>Visit your local doctor or mental health professional</li>
                <li>Reach out to family, friends, or trusted individuals</li>
                <li>Use online self-help tools and resources</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900">What to Expect When Seeking Help</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Confidential and non-judgmental support</li>
                <li>Assessment of your situation and needs</li>
                <li>Information about available treatment options</li>
                <li>Referrals to appropriate services and professionals</li>
                <li>Ongoing support throughout recovery</li>
                <li>Help with practical matters like debt and finances</li>
                <li>Support for family members and loved ones</li>
              </ul>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
                <h4 className="font-semibold text-blue-900 mb-3">Remember: You Are Not Alone</h4>
                <p className="text-blue-800 mb-4">
                  Seeking help for gambling problems is a sign of strength, not weakness. Recovery is possible, 
                  and support is available. Many people have successfully overcome gambling problems and gone 
                  on to lead fulfilling lives.
                </p>
                <p className="text-blue-800">
                  <strong>If you're in crisis or having thoughts of self-harm, please contact emergency services 
                  immediately or call a crisis helpline. Your life matters, and help is available.</strong>
                </p>
              </div>


              <p className="text-sm text-gray-600 mt-6">
                Last updated: December 2024. This responsible gaming information may be updated periodically to reflect 
                new research, best practices, and resource availability.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}