"""Full Curriculum Enrichment Script for Winners Creek LMS.
Populates authentic, high-quality, comprehensive 12-section lessons across all
core Soft Skills courses:
- SS-PCBE (Professional Communication & Business English)
- SS-PSPS (Public Speaking & Presentation Skills)
- SS-LTC (Leadership & Team Collaboration)
- SS-ISCR (Interview Skills & Career Readiness)
- SS-GDWC (Group Discussion & Workplace Communication)
- SS-CTPS (Critical Thinking, Problem Solving & Decision Making)
- SS-PDCB (Personality Development & Confidence Building)

Every lesson is strictly authored with all 12 required sections:
1. Introduction
2. Learning Objectives
3. Core Concepts
4. Key Points
5. Real-Life Examples
6. Professional Scenarios
7. Do's and Don'ts
8. Case Study
9. Practical Activities
10. Knowledge Check
11. Summary
12. Further Learning
"""
import asyncio
import os
import asyncpg

CURRICULUM_DATA = {
    "SS-PCBE": {
        "modules": [
            {
                "title": "Executive Writing & High-Impact Correspondence",
                "slug": "pcbe-mod1-executive-writing",
                "order_index": 1,
                "description": "Master structured business writing, executive brevity, and bottom-line-up-front correspondence.",
                "lessons": [
                    {
                        "title": "The Minto Pyramid Principle & Executive Brevity",
                        "slug": "minto-pyramid-executive-brevity",
                        "order_index": 1,
                        "duration": 18,
                        "content": """# The Minto Pyramid Principle & Executive Brevity

## 1. Introduction
Executives, engineering managers, and enterprise clients process hundreds of messages daily. Writing bottom-up, where conclusions are buried after four paragraphs of contextual backstory, guarantees ignored emails and misaligned decisions. The Minto Pyramid Principle inverts this structure to maximize cognitive throughput and immediate clarity.

## 2. Learning Objectives
- Master the BLUF (Bottom Line Up Front) communication architecture.
- Structure complex updates using Situation, Complication, Question, Answer (SCQA).
- Eliminate passive phrasing and non-committal filler that dilute executive credibility.
- Draft decision-ready proposals in under 150 words.

## 3. Core Concepts
- **Top-Down Structuring**: Deliver the core recommendation, decision, or request within the first two sentences.
- **Mutually Exclusive, Collectively Exhaustive (MECE)**: Group supporting rationales into discrete, non-overlapping pillars.
- **SCQA Story Arc**: 
  - *Situation*: Establish the agreed-upon baseline reality.
  - *Complication*: Detail what changed or what friction emerged.
  - *Question*: Frame the core dilemma that must be answered.
  - *Answer*: Propose the concrete, validated solution.

## 4. Key Points
1. **Self-Contained Subject Lines**: Format subjects with tags: `[DECISION REQUIRED by 4PM] Q3 Database Migration Budget`.
2. **Single-Screen Rule**: An executive email must be legible on a standard smartphone screen without requiring vertical scroll.
3. **Structured Bolding**: Bold solely key operational dates, owners, and primary numerical outcomes.
4. **Actionable Closings**: End with an unequivocal call to action including named owner and exact deadline.

## 5. Real-Life Examples
When an engineering team faced AWS spend overruns, the junior lead sent a 600-word chronology of server configurations. The VP skipped it. The staff engineer sent a 4-line email stating: "Recommendation: Enable 3-year Savings Plans by Friday 5 PM to reduce monthly AWS compute spend from $14,000 to $9,200 (34% savings). Cost to commit: $0 upfront. Need approval to proceed." The VP approved within 4 minutes.

## 6. Professional Scenarios
### Scenario A: Client Incident Post-Mortem Update
- *Low-Impact Email*: "Hi team, we had some database connection pool issues earlier today that affected login. The team looked into it and restarted Redis. Everything is back up now."
- *High-Impact Minto Format*: 
  "**Status Update**: Production login service was restored at 10:42 AM UTC following an 18-minute transient latency spike. 
  - **Impact**: 42 users experienced login timeouts between 10:24-10:42 AM. Zero data loss.
  - **Root Cause**: Database connection pool exhaustion caused by an unindexed reporting query.
  - **Immediate Fix**: Connection pool doubled from 50 to 100 connections; reporting query isolated to read replica.
  - **Permanent Action**: Full query indexing review scheduled for completion by Thursday 2 PM (Owner: DevOps Lead)."

## 7. Do's and Don'ts
### Do's:
- **Do** place your ask or recommendation in the very first sentence.
- **Do** use bullet points when presenting three or more supporting facts.
- **Do** proofread from the reader's perspective: "What do they need to decide?"

### Don'ts:
- **Don't** use ambiguous endings like "Thoughts?" or "FYI".
- **Don't** begin with a chronological recap of how you arrived at your conclusion.
- **Don't** bury monetary figures or delivery deadlines inside dense paragraphs.

## 8. Case Study: McKinsey & The Pyramid Principle
Created by Barbara Minto at McKinsey & Company, the Pyramid Principle revolutionized strategic management consulting. By requiring consultants to organize thinking deductively rather than inductively, client comprehension rates doubled, and board-level decision cycles were compressed from weeks into single working sessions.

## 9. Practical Activities
1. **The 100-Word Compression Exercise**: Take the longest email in your sent folder, rewrite it using BLUF in fewer than 100 words, and compare readability.
2. **Subject Line Overhaul**: Rewrite 5 upcoming project updates with explicit bracketed intent: `[INFO]`, `[DECISION]`, `[ACTION]`.

## 10. Knowledge Check
1. *Question*: What is the primary purpose of the BLUF (Bottom Line Up Front) model?
   - A) To sound formal and authoritative.
   - B) To immediately communicate the primary takeaway so stakeholders can make fast decisions without reading backstory.
   - C) To shorten the email to a single word.
   - *Correct Answer*: **B**

## 11. Summary
Executive brevity is not about omitting critical facts; it is about structuring information so the most critical decision-making data is impossible to miss. Respecting the reader's cognitive bandwidth builds enduring leadership trust.

## 12. Further Learning
- Book: *The Pyramid Principle: Logic in Writing and Thinking* by Barbara Minto.
- Reference: Harvard Business Review Guide to Better Business Writing.
"""
                    },
                    {
                        "title": "Cross-Functional & Asynchronous Technical Communication",
                        "slug": "cross-functional-async-communication",
                        "order_index": 2,
                        "duration": 15,
                        "content": """# Cross-Functional & Asynchronous Technical Communication

## 1. Introduction
In modern engineering and product ecosystems, asynchronous communication via Slack, Jira, Notion, and GitHub is the dominant medium of collaboration. Poorly framed asynchronous requests create multi-day back-and-forth ping-pong cycles. High-signal asynchronous communication accelerates velocity and preserves engineering flow state.

## 2. Learning Objectives
- Differentiate between synchronous urgency and asynchronous high-context communication.
- Compose complete, context-rich requests that eliminate unnecessary back-and-forth round trips.
- Adapt technical explanations for product managers, designers, and commercial stakeholders.
- Establish clean documentation hygiene across tickets and pull requests.

## 3. Core Concepts
- **The Zero-Ping Principle**: Provide sufficient context, reproducible steps, environment details, and clear expectations in the first message so the recipient can execute without asking clarifying questions.
- **Cognitive Translation**: Translating technical implementation details into business value, user impact, and risk trade-offs when communicating with non-technical peers.
- **Asynchronous Respect**: Recognizing that immediate replies interrupt deep cognitive focus; prioritizing thoughtful batch communication over rapid conversational fragments.

## 4. Key Points
1. Never send "Hi, do you have a minute?" without immediately stating the question or purpose.
2. Include screenshots, terminal outputs, and reproduction steps in bug tickets and blockers.
3. Clearly specify timezone considerations and expected reply windows for distributed peers.
4. When debates extend past 3 asynchronous exchanges, immediately escalate to a 10-minute synchronous call.

## 5. Real-Life Examples
An engineer encountering a 500 error on the payment webhook posted in Slack: "Payments is broken." The backend lead, in another timezone, lost 4 hours trying to replicate the bug. In contrast, an engineer who posted: "Staging webhook `/api/v1/payments/verify` returning 500 on payload with missing `transaction_ref`. Here is curl command and traceback link. Need backend eyes" had the patch deployed within 30 minutes.

## 6. Professional Scenarios
### Scenario A: Communicating Technical Debt to Product Managers
- *Ineffective*: "We need to rewrite the authentication service because the code is messy and uses old libraries."
- *Effective*: "Refactoring our session management service will eliminate the intermittent logout bugs reported by 15 enterprise customers and reduce user onboarding latency from 1.8s to 240ms."

## 7. Do's and Don'ts
### Do's:
- **Do** state your current assumption and what you plan to do if no response is received by the deadline: "I will proceed with option A unless you prefer option B by tomorrow 10 AM."
- **Do** use hyperlinks directly to documentation, pull requests, or log traces.
- **Do** celebrate peer contributions publicly in team channels.

### Don'ts:
- **Don't** write fragmented messages: "Hey" ... [wait 2 minutes] ... "Are you there?" ... [wait 5 minutes].
- **Don't** use acronyms without defining them when messaging cross-departmental teams.
- **Don't** treat asynchronous channels as real-time walkie-talkies.

## 8. Case Study: Gitlab's All-Remote Communication Handbook
Gitlab, operating as an entirely distributed organization with over 2,000 employees across 65+ countries, mandated an asynchronous-first culture. By requiring all decisions, discussions, and requirements to be documented in public company handbooks rather than private chat threads, onboarding times were halved and multi-timezone coordination friction was virtually eliminated.

## 9. Practical Activities
1. **The Context Self-Check**: Before sending your next Slack question, check: "Does this message have links, expectations, and context, or will the other person have to ask me for more details?"
2. **Draft a High-Signal PR Description**: Use standard headers: What changed, Why, Testing conducted, Risk assessment.

## 10. Knowledge Check
1. *Question*: Why is "Hi, can I ask a quick question?" considered an anti-pattern in remote workplace chat?
   - A) It is impolite.
   - B) It holds the recipient hostage and forces an unnecessary synchronous round-trip before the actual question is revealed.
   - C) It is too technical.
   - *Correct Answer*: **B**

## 11. Summary
Asynchronous excellence empowers global teams to operate with autonomy, focus, and transparency. High-context communication is the bedrock of modern distributed engineering organizations.

## 12. Further Learning
- Resource: Gitlab Asynchronous Communication Guide.
- Book: *Deep Work: Rules for Focused Success in a Distracted World* by Cal Newport.
"""
                    }
                ]
            }
        ]
    },
    "SS-PSPS": {
        "modules": [
            {
                "title": "The 3-Act Narrative Architecture for Technical Presentations",
                "slug": "psps-mod1-narrative-architecture",
                "order_index": 1,
                "description": "Structure technical presentations, architecture proposals, and stakeholder pitches with cinematic narrative arcs.",
                "lessons": [
                    {
                        "title": "Structural Storytelling: Hook, Escalation, and Strategic Payoff",
                        "slug": "structural-storytelling-3-act",
                        "order_index": 1,
                        "duration": 20,
                        "content": """# Structural Storytelling: Hook, Escalation, and Strategic Payoff

## 1. Introduction
Most technical presentations fail because they are delivered as slide-by-slide data dumps rather than compelling narratives. Audiences forget bulleted statistics within 24 hours, but they remember narrative journeys of tension and resolution. Structuring technical ideas into a classical 3-Act arc transforms listeners from skeptical observers into invested collaborators.

## 2. Learning Objectives
- Architect a 15-to-30 minute technical pitch using the classical 3-Act narrative structure.
- Craft an irresistible opening hook that seizes audience attention in the first 60 seconds.
- Escalate the central tension to demonstrate the unacceptable cost of inaction.
- Deliver a decisive payoff and actionable strategic roadmap.

## 3. Core Concepts
- **Act I — The Hook & The Status Quo**: Establish current reality, highlight an emerging systemic friction, and introduce the stakes.
- **Act II — The Escalation & The Abyss**: Deep-dive into why conventional approaches fail, demonstrate the compounding cost of inaction, and dissect the core technical bottleneck.
- **Act III — The Revelation & The Payoff**: Present your solution as the logical breakthrough, substantiate with data/metrics, and lay out the execution pathway.

## 4. Key Points
1. **The First 60 Seconds**: Never open with logistical housekeeping or resume recaps; open with a startling metric, a customer quote, or a critical architectural vulnerability.
2. **One Idea Per Slide**: Cognitive load degrades rapidly when audiences must simultaneously read complex text and listen to a presenter.
3. **The Contrast Sparkline**: Continually contrast "What is" against "What could be" to generate narrative momentum.
4. **The Clear Call to Decision**: End Act III with a binary choice: either approve the proposed path or accept the documented risks.

## 5. Real-Life Examples
Steve Jobs' 2007 iPhone keynote is the quintessential 3-Act technical presentation. Act I hooked the audience by promising three revolutionary products: an iPod, a phone, and an internet communicator. Act II escalated the pain: existing smartphones were neither smart nor easy to use, bogged down by plastic keyboards. Act III delivered the payoff: the multi-touch display that combined all three into one device.

## 6. Professional Scenarios
### Scenario: Pitching a Microservice Migration to the Executive Committee
- *Weak Opening*: "Today I will go through our backend system architecture, discuss Docker containers, and show you our current server topology."
- *3-Act Hook*: "Over the last six months, our customer checkout latency has increased by 400%, and last Friday, a single database lock cost us $68,000 in abandoned carts. Today, I'm presenting our architecture roadmap to eliminate single points of failure and cut checkout latency to under 200ms."

## 7. Do's and Don'ts
### Do's:
- **Do** spend 40% of your preparation time refining the first 2 minutes of your talk.
- **Do** anchor abstract technical benefits to concrete business outcomes (revenue, SLA, churn, compute cost).
- **Do** rehearse out loud with a timer at least 3 times before presenting.

### Don'ts:
- **Don't** read sentences verbatim from slides.
- **Don't** hide the core recommendation until the very last slide.
- **Don't** use jargon to sound intelligent; true mastery is explaining complex concepts simply.

## 8. Case Study: Pixar's Pitching Formula applied to Tech
Pixar's story framework ("Once upon a time... Every day... Until one day... Because of that... Until finally...") was adopted by technical founders pitching venture capital. Founders who framed their product within this narrative rhythm closed funding rounds 3x faster than founders who delivered feature checklists.

## 9. Practical Activities
1. **The 60-Second Hook Drill**: Record yourself delivering the first minute of your next presentation. Listen back: Did you deliver a compelling hook within the first 30 seconds?
2. **Slide Pruning**: Audit your latest slide deck; delete every slide containing more than 25 words or split it across multiple slides.

## 10. Knowledge Check
1. *Question*: What is the primary role of Act II in a 3-Act technical presentation?
   - A) To list all the names of the engineering team members.
   - B) To escalate tension by revealing the cost of inaction and the shortcomings of conventional solutions.
   - C) To show detailed source code line by line.
   - *Correct Answer*: **B**

## 11. Summary
A presentation is not a document read aloud; it is an emotional and intellectual journey. Master the 3-Act structure to captivate stakeholders, build consensus, and drive strategic action.

## 12. Further Learning
- Book: *Resonate: Present Visual Stories that Transform Audiences* by Nancy Duarte.
- Video: Watch Simon Sinek's "How Great Leaders Inspire Action" TED Talk.
"""
                    }
                ]
            },
            {
                "title": "Stage Dynamics, Vocal Mastery & Defusing Objections",
                "slug": "psps-mod2-stage-dynamics",
                "order_index": 2,
                "description": "Command executive presence through vocal modulation, physical dynamics, and master high-pressure Q&A sessions.",
                "lessons": [
                    {
                        "title": "Vocal Modulation, Pacing and Defusing Hostile Q&A",
                        "slug": "vocal-modulation-defusing-qa",
                        "order_index": 1,
                        "duration": 18,
                        "content": """# Vocal Modulation, Pacing and Defusing Hostile Q&A

## 1. Introduction
Even the most brilliantly researched presentation can be dismantled in seconds by vocal insecurity, monotone delivery, or defensive reactions during questions. Executive presence is the union of vocal resonance, intentional physical poise, and emotional composure under challenging scrutiny.

## 2. Learning Objectives
- Control breath and vocal timbre to project calm authority.
- Master strategic pauses to emphasize key conclusions and command attention.
- Defuse aggressive, skeptical, or hostile questions using the Triple-A Framework (Acknowledge, Anchor, Answer).
- Maintain composure when you do not possess immediate answers to technical inquiries.

## 3. Core Concepts
- **Vocal Resonance & Diaphragmatic Breath**: Speaking from the chest rather than the throat yields deeper pitch and prevents vocal fatigue during lengthy presentations.
- **The Power of the Silence Pause**: Pausing for two to three seconds after delivering a major insight allows the audience to digest the message and conveys profound self-possession.
- **The Triple-A Framework for Tough Questions**:
  - *Acknowledge*: Validate the counterpart's perspective without defensive confrontation.
  - *Anchor*: Reframe the question to the central strategic metric or goal.
  - *Answer*: Provide concise factual data and propose next validation steps.

## 4. Key Points
1. **Eliminate Uptalking**: Concluding declarative statements with rising vocal pitch projects self-doubt and invites skepticism.
2. **Eye Contact Trajectory**: In person, hold eye contact with one individual for an entire thought (3-5 seconds); in virtual meetings, look directly into the camera lens.
3. **Never Fake Technical Knowledge**: Saying "I don't have that precise benchmark at hand, but I will deliver that exact telemetry by 3 PM" builds far greater credibility than improvising speculative answers.
4. **Physical Grounding**: Keep feet shoulder-width apart and rest hands naturally at waist level rather than clasping or pacing erratically.

## 5. Real-Life Examples
During an enterprise software vendor evaluation, a CTO sharply questioned a lead architect: "Your architecture looks fragile and our security audit will probably reject it." A junior presenter would have argued defensively. The lead architect paused for two seconds, smiled calmly, and responded: "Security compliance is rightfully your number one priority. Let me anchor on our SOC2 Type II audit logs and zero-trust encryption layers to address that exact concern directly." The CTO nodding in satisfaction.

## 6. Professional Scenarios
### Scenario: Handling a Skeptical Stakeholder Interruption
- *Hostile Question*: "This proposed migration timeline of six weeks is completely detached from reality!"
- *Defensive Response*: "No it isn't, we did our estimates carefully and you haven't seen our breakdown."
- *Triple-A Response*: "You are highlighting the risk of schedule slippage, which has historically impacted our releases (Acknowledge). Our six-week timeline is anchored on automated parallel database shadow testing to de-risk production deployment (Anchor). Let's review the week-by-week risk mitigation checkpoints we built into the plan (Answer)."

## 7. Do's and Don'ts
### Do's:
- **Do** repeat or rephrase questions before answering to ensure the entire room heard and to give yourself three seconds to organize your reply.
- **Do** record yourself on video to identify unconscious filler words ("um", "like", "actually").
- **Do** smile warmly before responding to an adversarial objection.

### Don'ts:
- **Don't** speak faster when you feel nervous; deliberately slow your tempo by 20%.
- **Don't** take intellectual disagreements personally.
- **Don't** get cornered into a 1-on-1 debate during a broad presentation; offer to take deep dive technical edge cases offline.

## 8. Case Study: Satya Nadella's Executive Transformation
When Satya Nadella succeeded Steve Ballmer as CEO of Microsoft in 2014, he transformed the company's communication style from high-volume, confrontational rhetoric to calm, empathetic, and measured discourse. This shift in vocal pacing and psychological openness directly facilitated Microsoft's massive cultural rejuvenation and stock performance.

## 9. Practical Activities
1. **The 3-Second Pause Challenge**: In your next three video meetings, count to three in your head before answering any question directed at you. Notice how your answers become more structured.
2. **Filler Word Detox**: Have a colleague tally your "ums", "ahs", and "you knows" during a 5-minute technical walkthrough.

## 10. Knowledge Check
1. *Question*: What is the best course of action when an executive asks a technical metric you do not know?
   - A) Invent a reasonable estimate on the spot.
   - B) State honestly that you do not have the exact number, commit to an explicit follow-up time, and follow through.
   - C) Ignore the question and change slides.
   - *Correct Answer*: **B**

## 11. Summary
Executive presence is not an innate gift; it is a mechanical discipline of vocal control, physical grounding, and emotional composure. How you deliver answers under pressure defines your professional reputation.

## 12. Further Learning
- Book: *Talk Like TED: The 9 Public-Speaking Secrets of the World's Top Minds* by Carmine Gallo.
- Masterclass: Vocal Coaching for Executive Presentations.
"""
                    }
                ]
            }
        ]
    },
    "SS-LTC": {
        "modules": [
            {
                "title": "High-Performance Team Dynamics & Psychological Safety",
                "slug": "ltc-mod1-team-dynamics",
                "order_index": 1,
                "description": "Build high-trust engineering cultures, cultivate psychological safety, and practice Radical Candor.",
                "lessons": [
                    {
                        "title": "Engineering Psychological Safety: Lessons from Google Project Aristotle",
                        "slug": "engineering-psychological-safety",
                        "order_index": 1,
                        "duration": 20,
                        "content": """# Engineering Psychological Safety: Lessons from Google Project Aristotle

## 1. Introduction
What makes an engineering team exceptional? Is it hiring the smartest individual programmers, maximizing individual IQ, or assembling veteran credentials? In 2012, Google launched Project Aristotle to answer this question. After analyzing 180 teams and thousands of variables, the empirical data revealed a startling conclusion: *who* was on the team mattered far less than *how* the team members interacted. The single most predictive factor of high team performance was psychological safety.

## 2. Learning Objectives
- Understand the scientific definition and business ROI of psychological safety in engineering teams.
- Identify the four stages of psychological safety (Inclusion, Learner, Contributor, Challenger).
- Implement blameless post-mortem rituals that extract systemic value from technical failures.
- Practice active vulnerability as a team leader or senior contributor.

## 3. Core Concepts
- **Definition of Psychological Safety**: A shared belief held by members of a team that the team is safe for interpersonal risk-taking, where no one will be punished or humiliated for speaking up with ideas, questions, concerns, or mistakes.
- **Equality in Conversational Turn-Taking**: On high-performing teams, members speak in roughly equal proportion throughout team meetings rather than having one or two dominant voices monopolize discussions.
- **High Social Sensitivity**: The ability to intuit how colleagues feel based on facial expressions, body language, and tone of voice.

## 4. Key Points
1. **Psychological Safety != Low Accountability**: High psychological safety combined with high standards creates the "Learning & High Performance Zone"; psychological safety without accountability creates complacency.
2. **Blameless Culture**: Treat human error as the starting point of an investigation into systemic architectural vulnerabilities, not the end point.
3. **Admitting Uncertainty**: Senior engineers stating "I don't know the answer to this, let's explore it together" unlocks psychological freedom for junior engineers to ask clarifying questions without fear.
4. **Reward Early Warning Signals**: Celebrate team members who surface architectural risks early before they manifest as customer outages.

## 5. Real-Life Examples
At Etsy, whenever an engineer inadvertently brought down production through a deployment bug, they were not fired or disciplined. Instead, the company invited the engineer to lead the blameless post-mortem, presented them with an oversized three-legged stool trophy representing resilience, and audited why the continuous integration pipelines failed to catch the error. This culture enabled Etsy to scale deployments from once a week to over 50 times per day with zero fear.

## 6. Professional Scenarios
### Scenario: Responding to a Code Review Blunder
- *Punitive Culture*: "Who wrote this pull request? This is elementary syntax and completely broke the staging build. Pay attention next time."
- *Psychologically Safe Culture*: "We caught a regression in the staging pipeline. Let's trace why our automated test suite let this slip through and update our linting rules so nobody on the team can hit this edge case again."

## 7. Do's and Don'ts
### Do's:
- **Do** conduct blameless incident retrospectives focused on systems, monitors, and automated safeguards.
- **Do** solicit input from quiet team members: "Priya, you've been working on this subsystem, what are we missing?"
- **Do** openly share your own mistakes and what you learned from them.

### Don'ts:
- **Don't** shoot the messenger when someone reports bad news or missed deadlines.
- **Don't** tolerate subtle sarcasm or eye-rolling during technical brainstorming sessions.
- **Don't** conflate intellectual disagreement with personal disrespect.

## 8. Case Study: Google Project Aristotle
Google's People Analytics division evaluated team composition (introverts vs extroverts, background diversity, seniority) across hundreds of engineering squads. None of the traditional demographic metrics correlated with high team velocity or code quality. The five pillars that genuinely determined team success were: 1. Psychological Safety (by far the most critical), 2. Dependability, 3. Structure & Clarity, 4. Meaning of Work, and 5. Impact of Work.

## 9. Practical Activities
1. **The Post-Mortem Language Audit**: Review your team's last three incident write-ups. Remove any sentences attributing blame to specific individuals; replace them with descriptions of process gaps and tooling improvements.
2. **The "What Did We Learn" Standup Ritual**: Dedicate 5 minutes every Friday for team members to share one mistake they made that week and what systemic insight came out of it.

## 10. Knowledge Check
1. *Question*: What happens when an engineering team has high psychological safety combined with high performance standards?
   - A) The team enters the Apathy Zone.
   - B) The team enters the High-Performance & Continuous Learning Zone.
   - C) Code quality declines because nobody is held accountable.
   - *Correct Answer*: **B**

## 11. Summary
Psychological safety is the bedrock of innovation and technical excellence. Teams that eliminate fear unlock creativity, accelerate cycle time, and build antifragile systems.

## 12. Further Learning
- Book: *The Fearless Organization: Creating Psychological Safety in the Workplace* by Amy C. Edmondson.
- Research Paper: Google re:Work Guide on Understanding Team Effectiveness.
"""
                    },
                    {
                        "title": "The Situation-Behavior-Impact (SBI) Feedback Framework",
                        "slug": "sbi-feedback-framework",
                        "order_index": 2,
                        "duration": 18,
                        "content": """# The Situation-Behavior-Impact (SBI) Feedback Framework

## 1. Introduction
Delivering constructive feedback is one of the most critical yet universally dreaded responsibilities in professional leadership. When feedback is vague, accusatory, or centered on perceived personality flaws, recipients immediately enter a defensive physiological fight-or-flight state. The Situation-Behavior-Impact (SBI) framework, developed by the Center for Creative Leadership, depersonalizes feedback by grounding observations in concrete facts and measurable outcomes.

## 2. Learning Objectives
- Master the three-part SBI feedback architecture (Situation, Behavior, Impact).
- Deliver constructive criticism without triggering defensive cognitive barriers.
- Apply SBI to positive reinforcement to amplify high-performing behaviors.
- Conduct follow-up alignment dialogues with clear behavioral commitments.

## 3. Core Concepts
- **Situation**: Anchor feedback in a specific time and location: "During yesterday morning's client architecture review..."
- **Behavior**: Describe solely the observable actions, verbatim words, or measurable conduct without psychological psychoanalysis: "...you interrupted the client three times while they were detailing their security constraints..."
- **Impact**: Articulate the exact operational or interpersonal consequences: "...which caused the client to close their laptop and led them to email our VP questioning our willingness to collaborate."

## 4. Key Points
1. **Zero Mind-Reading**: Never ascribe intent ("You did that because you don't care about our deadline"); describe only observable actions.
2. **Timeliness**: Deliver feedback within 24 to 48 hours of the event while memories are fresh and before patterns solidify.
3. **Private Delivery**: Never deliver constructive criticism in public channels, group meetings, or open chat rooms.
4. **Positive SBI**: Praise that says "Great job!" is forgotten immediately. SBI Praise ("In Tuesday's sprint demo, when you visually mapped the Redis caching architecture, the stakeholders immediately approved our roadmap") reinforces exact positive patterns.

## 5. Real-Life Examples
An engineering lead was frustrated with a senior developer frequently missing commit deadlines. Instead of saying "You are disorganized and slowing the sprint down," the lead used SBI: "In sprint 42 planning on Monday (Situation), you committed to shipping the OAuth module by Wednesday 5 PM, but the pull request was submitted Friday at 6 PM without advance notice (Behavior). As an impact, the frontend team was blocked for two days and had to work over the weekend to integrate the API before release (Impact). Let's talk about what happened." The developer acknowledged the blocker and agreed to flag estimation risks 48 hours early.

## 6. Professional Scenarios
### Scenario: Addressing Inappropriate Tone in Code Reviews
- *Ineffective Feedback*: "Your comments on GitHub are rude and condescending. You need to be nicer to junior developers."
- *SBI Framework*:
  - **Situation**: "On PR #142 yesterday afternoon..."
  - **Behavior**: "...you left a comment that read: 'Did you even read the documentation before writing this garbage?'..."
  - **Impact**: "...the junior author felt humiliated, withdrew from participating in today's architecture discussion, and our team code review culture suffered."

## 7. Do's and Don'ts
### Do's:
- **Do** ask for permission before delivering constructive feedback: "Do you have 10 minutes to discuss how yesterday's client demo went?"
- **Do** allow the recipient to process and share their perspective after you deliver the impact.
- **Do** document mutually agreed-upon action steps.

### Don'ts:
- **Don't** use the "compliment sandwich" (Praise - Criticism - Praise), which confuses the recipient and undermines trust.
- **Don't** store up grievances for six months until the annual performance review.
- **Don't** use absolute generalizations like "You always" or "You never".

## 8. Case Study: Netflix's 360 Radical Candor Framework
Netflix instituted an explicit feedback culture where employees are expected to give candid feedback as a mechanism of mutual professional respect. By eliminating political passive-aggressiveness and replacing it with specific, actionable, and benevolent SBI feedback, team members resolve technical bottlenecks rapidly without managerial mediation.

## 9. Practical Activities
1. **SBI Positive Practice**: Identify one colleague who helped you this week. Write down an SBI positive feedback note and send it to them directly.
2. **The SBI Conversion**: Take a complaint you currently have about a project workflow or peer behavior and convert it into the strict 3-part SBI format.

## 10. Knowledge Check
1. *Question*: Why is describing observable behavior better than attributing intentions when giving feedback?
   - A) It makes the conversation take longer.
   - B) Observable behavior is factual and indisputable, whereas assuming intentions triggers defensiveness and arguments.
   - C) It allows you to avoid discussing the impact.
   - *Correct Answer*: **B**

## 11. Summary
Feedback is the breakfast of champions. Grounding your observations in the Situation-Behavior-Impact framework ensures your guidance is heard, respected, and transformed into positive behavioral change.

## 12. Further Learning
- Book: *Radical Candor: Be a Kick-Ass Boss Without Losing Your Humanity* by Kim Scott.
- Resource: Center for Creative Leadership SBI Guide.
"""
                    }
                ]
            }
        ]
    },
    "SS-ISCR": {
        "modules": [
            {
                "title": "Technical & Behavioral Interview Mastery",
                "slug": "iscr-mod1-interview-mastery",
                "order_index": 1,
                "description": "Master structured behavioral interviewing, technical storytelling, and the STAR+Impact framework.",
                "lessons": [
                    {
                        "title": "The Advanced STAR+Impact Narrative Framework",
                        "slug": "star-plus-impact-framework",
                        "order_index": 1,
                        "duration": 22,
                        "content": """# The Advanced STAR+Impact Narrative Framework

## 1. Introduction
Interviewers at premier technology enterprises (Google, Amazon, Microsoft, top-tier startups) evaluate candidates using behavioral interviewing. When asked "Tell me about a time you resolved a major production incident," most candidates meander through unstructured stories that fail to highlight their personal contribution. The STAR+Impact framework provides a structured methodology to showcase technical mastery, leadership initiative, and quantifiable business value.

## 2. Learning Objectives
- Structure behavioral interview answers using Situation, Task, Action, Result, and Business Impact.
- Quantify engineering accomplishments with concrete metrics (latency, cost, throughput, uptime).
- Articulate the distinction between individual contributions and team achievements.
- Prepare a modular "Story Bank" that maps to 10 common behavioral competency questions.

## 3. Core Concepts
- **Situation (15% of time)**: Briefly establish the context, company scale, and the technical challenge.
- **Task (10% of time)**: Define your explicit responsibility and the constraints (timeline, budget, technical debt).
- **Action (60% of time)**: Deep-dive into *your* specific decisions, architectural trade-offs, and leadership actions. Use "I" rather than ambiguous "we".
- **Result & Impact (15% of time)**: Share the concrete outcome, backed by numerical metrics and long-term organizational learnings.

## 4. Key Points
1. **The "We vs. I" Balance**: Acknowledge team collaboration, but clearly delineate your unique personal engineering contribution.
2. **Quantifiable Metrics**: Never say "We improved performance"; say "We decreased p99 API response times from 1,200ms to 180ms under 50,000 concurrent requests."
3. **The 2-Minute Rule**: An ideal STAR response takes between 90 and 120 seconds. Beyond 2 minutes, interviewers lose cognitive engagement.
4. **Addressing Failure Positively**: When asked about a project failure, spend 20% on the mistake and 80% on the root-cause analysis, systemic safeguards created, and personal growth.

## 5. Real-Life Examples
When asked about handling technical disagreements, a candidate delivered this STAR+Impact answer:
- *Situation*: "At my previous company, our monolith was struggling under a 300% traffic surge during Black Friday."
- *Task*: "I was tasked with leading the team to decouple our checkout processing engine without halting ongoing feature velocity."
- *Action*: "While a colleague advocated for a full GraphQL rewrite that would have taken 4 months, I proposed an incremental strangler-fig pattern using Kafka event streaming. I built a working proof-of-concept in 3 days, benchmarked latency under load, and held a consensus review that convinced the team."
- *Result & Impact*: "We deployed the decoupled service 3 weeks ahead of Black Friday. The platform handled 12 million transactions with 99.99% uptime and zero dropped orders, saving an estimated $2.4M in potential lost revenue."

## 6. Professional Scenarios
### Scenario: Answering "Tell Me About a Time You Disagreed with Leadership"
- *Weak Response*: "My manager wanted to use MySQL, but I like Postgres better, so I told him MySQL was outdated and we argued about it."
- *STAR+Impact Response*: "When our architecture team proposed an in-memory session store on a single server, I had concerns about multi-region failover. I prepared a risk matrix comparing Redis Cluster with the proposed design, ran a simulated node crash test, and presented the data during our architecture review. The VP approved the Redis Cluster approach, which later prevented an outage when our US-East region experienced an AWS outage."

## 7. Do's and Don'ts
### Do's:
- **Do** build a matrix of 5 cornerstone stories from your career covering: conflict, failure, technical innovation, leadership, and tight deadlines.
- **Do** state technical trade-offs openly: "We chose DynamoDB over Postgres to achieve single-digit millisecond latency at the cost of complex relational queries."
- **Do** pause and reflect for 5 seconds after an interviewer asks a question rather than blurting out an unformed story.

### Don'ts:
- **Don't** badmouth former employers, managers, or peers.
- **Don't** speak exclusively in generalities ("I usually work hard and solve problems").
- **Don't** fabricate metrics or take credit for projects where your contribution was marginal.

## 8. Case Study: Amazon's Leadership Principles Bar Raiser Process
Amazon utilizes trained "Bar Raisers"—independent interviewers with veto power over hiring decisions—to evaluate candidates against Amazon's 16 Leadership Principles using strict STAR behavioral probing. Candidates who deliver high-signal STAR answers with verifiable metrics and "Customer Obsession" receive offers at a 400% higher rate than those offering vague conceptual answers.

## 9. Practical Activities
1. **Build Your STAR Story Matrix**: Create a table with 5 rows (stories) and columns: Situation, Task, Action, Result, Metrics, Key Learnings.
2. **Audio-Record a 2-Minute STAR Answer**: Record yourself answering: "Describe a project where everything went wrong." Check if you finished within 2 minutes.

## 10. Knowledge Check
1. *Question*: What percentage of time in a STAR answer should be allocated to your specific personal actions?
   - A) 10%
   - B) 30%
   - C) Approximately 60%
   - *Correct Answer*: **C**

## 11. Summary
Interviews are not improvisational tests; they are structured presentations of your professional track record. Mastering the STAR+Impact methodology ensures your engineering experience shines with clarity and authority.

## 12. Further Learning
- Book: *Cracking the Tech Career* by Gayle Laakmann McDowell.
- Resource: The Amazon Bar Raiser Interview Guide.
"""
                    }
                ]
            }
        ]
    },
    "SS-GDWC": {
        "modules": [
            {
                "title": "Group Discussion Strategies & Workplace Communication",
                "slug": "gdwc-mod1-gd-strategies",
                "order_index": 1,
                "description": "Master structured intervention tactics, time stewardship, and the PESTLE analytical framework.",
                "lessons": [
                    {
                        "title": "Tactical Interventions, Consensus Building and The PESTLE Framework",
                        "slug": "tactical-interventions-pestle-gd",
                        "order_index": 1,
                        "duration": 20,
                        "content": """# Tactical Interventions, Consensus Building and The PESTLE Framework

## 1. Introduction
Whether in campus placement group discussions, corporate strategy sessions, or agile sprint debates, participants often confuse aggressive volume with leadership influence. Dominating airtime without advancing the collective dialogue generates negative evaluations. True leadership in group discussions consists of structured analytical frameworks, tactical intervention timing, and consensus facilitation.

## 2. Learning Objectives
- Apply the PESTLE framework (Political, Economic, Social, Technological, Legal, Environmental) to structure any discussion topic in seconds.
- Execute professional entry tactics to steer chaotic conversations without rude interruptions.
- Mediate polarized conflicts between competing viewpoints.
- Summarize multi-threaded debates into coherent actionable conclusions.

## 3. Core Concepts
- **The PESTLE Analytical Matrix**: A comprehensive multi-dimensional lens to evaluate any socio-technical topic:
  - *Political*: Government policies, geopolitics, regulation.
  - *Economic*: Market dynamics, cost-benefit trade-offs, fiscal impact.
  - *Social*: Cultural norms, demographics, user behaviors.
  - *Technological*: Infrastructure, automation, AI, cybersecurity.
  - *Legal*: IP rights, data privacy laws (GDPR, CCPA), compliance.
  - *Environmental*: Sustainability, carbon footprint, resource conservation.
- **The Facilitator Advantage**: Evaluators look for the participant who elevates the entire group's performance, not just their own voice.

## 4. Key Points
1. **The First Speaker vs. The First Structured Speaker**: Initiating the discussion is advantageous only if you establish a structured framework; rambling without direction penalizes you.
2. **The "Yes, and..." Collaborative Build**: Acknowledge your peer's point before introducing your new dimension ("Building on Rahul's point regarding cloud hosting costs, we must also examine the legal compliance aspects under GDPR").
3. **Bringing Quiet Participants into the Circle**: Directing airtime to silent colleagues demonstrates genuine leadership maturity.
4. **The Timely Summary**: Providing an objective, balanced summary during the final two minutes firmly cements leadership status.

## 5. Real-Life Examples
In a placement group discussion on "Is AI a Threat to Software Engineering Jobs?", several candidates engaged in shouting matches about ChatGPT. One candidate waited for a brief pause, spoke in a measured tone: "Our colleagues have raised valid points regarding code generation tools. If we look at this through the technological and economic lenses of PESTLE, we observe that while boilerplate coding is being automated, system architecture, security auditing, and requirement scoping demand higher human judgment than ever before." The entire room quieted, followed his structure, and he received the top evaluation score.

## 6. Professional Scenarios
### Scenario: Intervening in a Heated Architecture Debate
- *Aggressive Intervention*: "Stop talking, you guys are completely wrong and wasting everyone's time."
- *Facilitative Intervention*: "We have two compelling architectural proposals on the table: Priya's focus on microservice scalability and Arjun's focus on short-term delivery velocity. Let's compare both against our Q3 budget and SLA constraints to determine the right compromise."

## 7. Do's and Don'ts
### Do's:
- **Do** maintain relaxed open body language and make eye contact with everyone in the circle, not just the evaluators.
- **Do** introduce data points, statistics, and historical case studies.
- **Do** thank participants who disagree with you for highlighting critical risks.

### Don'ts:
- **Don't** address the panel or evaluators directly during the discussion; interact exclusively with your peers.
- **Don't** interrupt someone mid-sentence; wait for a natural breath or vocal dip.
- **Don't** become emotionally attached to an argument if data proves otherwise.

## 8. Case Study: United Nations Diplomatic Interventions
Diplomatic negotiations at the UN Security Council do not permit emotional outbursts. Delegates utilize formal procedural language ("The delegate from France aligns with the economic principles stated by Germany, and wishes to draw attention to article 4...") to defuse hostility while advancing complex multilateral agreements.

## 9. Practical Activities
1. **The 30-Second PESTLE Drill**: Take three random news headlines and write down one PESTLE dimension for each in under 30 seconds.
2. **Mock GD Facilitation**: Participate in a 10-minute group discussion where your sole goal is to synthesize peer points and bring in quiet participants.

## 10. Knowledge Check
1. *Question*: In a competitive Group Discussion, which role is consistently scored highest by corporate evaluators?
   - A) The loudest speaker who speaks the most minutes.
   - B) The collaborative facilitator who introduces structured frameworks and builds consensus.
   - C) The participant who stays completely quiet until the very end.
   - *Correct Answer*: **B**

## 11. Summary
Group discussions are not speech competitions; they are simulations of executive boardroom dynamics. Master structural frameworks and facilitative leadership to stand out in any collaborative setting.

## 12. Further Learning
- Book: *Crucial Conversations: Tools for Talking When Stakes Are High*.
- Guide: Management Consulting Case Interview Frameworks.
"""
                    }
                ]
            }
        ]
    },
    "SS-CTPS": {
        "modules": [
            {
                "title": "First-Principles Thinking & Strategic Decision Making",
                "slug": "ctps-mod1-first-principles",
                "order_index": 1,
                "description": "Master root-cause analysis, the 5-Whys diagnostic technique, and the DACI decision framework.",
                "lessons": [
                    {
                        "title": "First-Principles Reasoning, 5-Whys and the DACI Framework",
                        "slug": "first-principles-5-whys-daci",
                        "order_index": 1,
                        "duration": 22,
                        "content": """# First-Principles Reasoning, 5-Whys and the DACI Framework

## 1. Introduction
Most organizations make decisions by analogy—copying what competitors do with minor incremental modifications. When complex systems fail or breakthrough solutions are required, thinking by analogy fails. First-principles thinking breaks problems down to their most fundamental, indisputable truths and reasons upward. Combined with the 5-Whys root cause analysis and the DACI decision governance model, engineers can solve systemic failures permanently.

## 2. Learning Objectives
- Differentiate between reasoning by analogy and reasoning from first principles.
- Conduct a rigorous 5-Whys root cause analysis that distinguishes symptoms from underlying systemic causes.
- Implement the DACI framework (Driver, Approver, Contributor, Informed) to eliminate organizational decision paralysis.
- Detect and counteract confirmation bias and sunk cost fallacy in technical designs.

## 3. Core Concepts
- **First-Principles Thinking**: Deconstructing a problem to its physical, mathematical, or logical axioms, questioning all assumptions, and reassembling a novel solution from the ground up.
- **The 5-Whys Diagnostic Method**: An iterative interrogative technique developed by Sakichi Toyoda to explore the cause-and-effect relationships underlying a particular problem.
- **The DACI Decision Matrix**:
  - *Driver (D)*: The single person responsible for gathering facts, organizing stakeholders, and driving the decision to closure.
  - *Approver (A)*: The single executive with veto and final sign-off authority.
  - *Contributors (C)*: Domain experts who provide technical data and alternate perspectives.
  - *Informed (I)*: Stakeholders who are notified once the decision is ratified.

## 4. Key Points
1. **Distinguish Root Causes from Symptoms**: A fever is a symptom; a bacterial infection is the root cause. A server crash is a symptom; an uncapped thread pool is the root cause.
2. **The Sunk Cost Fallacy**: Past expenditure of time or money is irrelevant to future decisions; evaluate projects solely on prospective ROI from this point forward.
3. **Single Approver Rule**: If more than one person is marked as the "Approver" in DACI, accountability is diluted and decision velocity stalls.
4. **Reversible vs. Irreversible Decisions (Type 1 vs. Type 2)**: Reversible decisions should be made rapidly by small teams; irreversible decisions demand rigorous first-principles analysis.

## 5. Real-Life Examples
When SpaceX sought to build orbital rockets, aerospace suppliers quoted $65 million per rocket. Rather than accepting the conventional market price (reasoning by analogy), Elon Musk applied first principles: What are rockets made of? Aerospace-grade aluminum, titanium, copper, and carbon fiber. What is the raw commodity cost of those materials on the London Metal Exchange? Approximately 2% of the rocket's sale price. By bringing manufacturing and software in-house, SpaceX reduced launch costs by over 80%.

## 6. Professional Scenarios
### Scenario: 5-Whys Applied to a Production Outage
- *Problem*: The customer checkout service crashed on Friday at 8 PM.
- *Why 1*: Why did it crash? Because the database ran out of disk space.
- *Why 2*: Why did it run out of disk space? Because uncompressed debug log files filled the partition.
- *Why 3*: Why were uncompressed debug logs filling the partition? Because an engineer turned on verbose logging to diagnose an OAuth bug and forgot to turn it off.
- *Why 4*: Why did they forget to turn it off? Because there was no automated log rotation or TTL policy configured.
- *Why 5 (Root Cause)*: Why was there no log rotation policy? Because our deployment template lacked infrastructure-as-code linting to enforce logging standards.
- *Systemic Fix*: Add automated CI linting for log rotation policies rather than punishing the engineer.

## 7. Do's and Don'ts
### Do's:
- **Do** explicitly designate a single Driver and single Approver before initiating complex architecture debates.
- **Do** question historical assumptions: "Why must this report run synchronously?"
- **Do** celebrate when an experiment disproves your initial hypothesis; you have eliminated a flawed path.

### Don'ts:
- **Don't** stop at the 2nd or 3rd "Why"; surface causes are almost always human error, while true root causes are systemic policy or tooling gaps.
- **Don't** confuse consensus with decision-making; a Driver must make the tough call even if some Contributors disagree.
- **Don't** hold onto a failing legacy system because "we spent two years writing it."

## 8. Case Study: Toyota's Andon Cord & The 5-Whys
Toyota transformed global manufacturing by placing an "Andon Cord" above every workstation on the assembly line. Any worker, from intern to master mechanic, could pull the cord to halt the entire assembly line upon spotting a defect. Rather than firing the worker, engineers applied the 5-Whys immediately to identify the tooling flaw. This first-principles quality loop made Toyota the most reliable automotive manufacturer in history.

## 9. Practical Activities
1. **The 5-Whys Incident Drill**: Take the most recent software bug or personal project setback you experienced and write out all 5 levels of "Why".
2. **Draft a DACI Matrix**: Create a 1-page DACI document for your team's next major technology choice (e.g., choosing a state management library or cloud hosting provider).

## 10. Knowledge Check
1. *Question*: In the DACI decision framework, how many individuals should hold the role of "Approver"?
   - A) As many as possible to ensure everyone agrees.
   - B) Exactly one, to ensure clear accountability.
   - C) Zero, because decisions should be made by algorithm.
   - *Correct Answer*: **B**

## 11. Summary
Critical thinking is the discipline of seeing past surface noise to foundational truths. Armed with first-principles reasoning and structured decision models, engineers can solve complex problems with clarity and speed.

## 12. Further Learning
- Book: *Thinking in Systems: A Primer* by Donella H. Meadows.
- Resource: Atlassian Team Playbook on DACI Decision Making.
"""
                    }
                ]
            }
        ]
    },
    "SS-PDCB": {
        "modules": [
            {
                "title": "Personality Development & Professional Gravitas",
                "slug": "pdcb-mod1-personality-gravitas",
                "order_index": 1,
                "description": "Deconstruct imposter syndrome, apply the Johari Window, and cultivate executive gravitas.",
                "lessons": [
                    {
                        "title": "The Johari Window, Imposter Syndrome and Executive Gravitas",
                        "slug": "johari-window-imposter-gravitas",
                        "order_index": 1,
                        "duration": 20,
                        "content": """# The Johari Window, Imposter Syndrome and Executive Gravitas

## 1. Introduction
Technical competence alone does not guarantee a fulfilling or impactful career. Many brilliant engineers struggle with debilitating feelings of fraudulence (Imposter Phenomenon), blind spots in self-awareness, or an inability to project calm authority during high-stakes corporate interactions. Cultivating personality maturity, emotional intelligence (EQ), and authentic professional gravitas is what elevates an individual contributor into a recognized organizational leader.

## 2. Learning Objectives
- Apply the Johari Window model to expand self-awareness and uncover professional blind spots.
- Deconstruct Imposter Phenomenon using empirical evidence logs and cognitive reframing.
- Cultivate authentic executive gravitas through composure, concise speech, and emotional stability.
- Establish healthy assertiveness boundaries without hostility or passive aggression.

## 3. Core Concepts
- **The Johari Window**: A cognitive model created by Joseph Luft and Harrington Ingham comprising four quadrants:
  - *Arena (Open)*: Known to self and known to others (transparent competence).
  - *Blind Spot*: Unknown to self, but visible to peers and managers.
  - *Façade (Hidden)*: Known to self, but concealed from others (fears, insecurities).
  - *Unknown*: Latent capabilities and potential unknown to both self and peers.
- **The Imposter Phenomenon Trap**: The irrational psychological conviction that one's achievements are the product of luck or deceit rather than earned competence.
- **Executive Gravitas**: The intersection of three qualities: Emotional Composure under pressure, Decisiveness in ambiguity, and Integrity in communication.

## 4. Key Points
1. **Feedback Expands the Arena**: Soliciting candid peer feedback shrinks your Blind Spot and dramatically enhances professional effectiveness.
2. **Keep a "Brag Sheet" / Evidence Portfolio**: Maintain an objective log of shipped features, resolved bugs, client praises, and architectural contributions to counter irrational imposter feelings.
3. **Slow Down Speech Velocity**: Fast speaking is perceived as nervous energy; slowing down your cadence by 15% immediately signals authority and confidence.
4. **Assertiveness vs. Aggressiveness**: Assertiveness is advocating for your needs while respecting others; aggressiveness is advocating for your needs while violating others.

## 5. Real-Life Examples
A junior developer was promoted to tech lead and immediately felt overwhelmed: "Everyone will realize I don't know distributed systems as well as my peers." During a major outage, instead of panicking or hiding behind terminal commands, she applied executive gravitas: she acknowledged the severity calmly, established a dedicated war room channel, assigned clear roles, and communicated status to executive stakeholders every 30 minutes. Her calm poise stabilized the entire team, and the incident was resolved without customer impact.

## 6. Professional Scenarios
### Scenario: Responding to a Demanding Client Scope Request
- *Passive*: "Uh, okay, I guess we will try to work all weekend to build those extra five endpoints."
- *Aggressive*: "You are out of your mind. We never agreed to this and you're ruining our schedule."
- *Assertive & Gravitas*: "I understand these five endpoints are valuable for your upcoming marketing launch. Our current sprint allocation is committed to database resilience. We can either substitute these endpoints for the reporting module, or schedule them for Sprint 45 starting next week. Which trade-off aligns best with your priorities?"

## 7. Do's and Don'ts
### Do's:
- **Do** proactively ask trusted mentors: "What is one blind spot in my communication that I can improve?"
- **Do** ground your confidence in your capacity to learn rather than an unrealistic expectation of knowing everything.
- **Do** maintain upright, relaxed posture in meetings.

### Don'ts:
- **Don't** apologize unnecessarily for having a question ("I'm sorry to bother you, but..."). State questions directly: "Could you clarify the database assumption?"
- **Don't** dismiss your achievements as "just luck" or "anyone could have done it."
- **Don't** lose emotional control during heated technical architecture disagreements.

## 8. Case Study: Satya Nadella's Growth Mindset Mandate
Upon becoming CEO, Nadella shifted Microsoft's corporate archetype from "Know-it-alls" to "Learn-it-alls" (derived from Carol Dweck's Growth Mindset research). By publicly destigmatizing the admission of knowledge gaps and rewarding continuous curiosity, employees felt empowered to experiment without fear of imposter exposure, fueling massive cloud and AI innovations.

## 9. Practical Activities
1. **The Brag Sheet Creation**: Open a document and record 5 major technical accomplishments from the past 12 months with metrics and impact. Re-read whenever imposter feelings emerge.
2. **The Filler-Free Meeting Challenge**: In your next meeting, replace every filler apology ("Sorry to interrupt", "Just a quick thought") with direct declarative sentences.

## 10. Knowledge Check
1. *Question*: What is the primary mechanism to shrink the "Blind Spot" quadrant in the Johari Window?
   - A) Reading more technical documentation.
   - B) Proactively seeking candid, constructive feedback from colleagues and mentors.
   - C) Hiding your mistakes from the team.
   - *Correct Answer*: **B**

## 11. Summary
True confidence is not the absence of doubt; it is the mastery of self-awareness and the courage to act despite uncertainty. Developing authentic gravitas empowers you to inspire trust and lead with calm authority.

## 12. Further Learning
- Book: *The Secret Thoughts of Successful Women (and Men): Why Capable People Suffer from Impostor Syndrome* by Valerie Young.
- Book: *Executive Presence: The Missing Link Between Merit and Success* by Sylvia Ann Hewlett.
"""
                    }
                ]
            }
        ]
    }
}


async def seed():
    dsn = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/cnc")
    conn = await asyncpg.connect(dsn)
    
    print("=" * 80)
    print("ENRICHING ALL 7 SOFT SKILLS COURSES WITH 12-SECTION CURRICULUM")
    print("=" * 80)
    
    for code, data in CURRICULUM_DATA.items():
        course = await conn.fetchrow("SELECT id, title FROM courses WHERE code = $1", code)
        if not course:
            print(f"Course {code} not found in database! Skipping.")
            continue
            
        print(f"\nPopulating course: [{code}] {course['title']}")
        course_id = course["id"]
        
        for mod_data in data["modules"]:
            # Insert or update module
            mod_row = await conn.fetchrow(
                """
                INSERT INTO modules (course_id, title, slug, order_index, description)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (course_id, slug) DO UPDATE 
                SET title = EXCLUDED.title, description = EXCLUDED.description, order_index = EXCLUDED.order_index
                RETURNING id
                """,
                course_id,
                mod_data["title"],
                mod_data["slug"],
                mod_data["order_index"],
                mod_data["description"]
            )
            mod_id = mod_row["id"]
            print(f"  Module: {mod_data['title']} (id={mod_id})")
            
            for les_data in mod_data["lessons"]:
                les_row = await conn.fetchrow(
                    """
                    INSERT INTO lessons (module_id, title, slug, order_index, content_type, duration_minutes, content)
                    VALUES ($1, $2, $3, $4, 'text', $5, $6)
                    ON CONFLICT (module_id, slug) DO UPDATE 
                    SET title = EXCLUDED.title, content = EXCLUDED.content, duration_minutes = EXCLUDED.duration_minutes
                    RETURNING id
                    """,
                    mod_id,
                    les_data["title"],
                    les_data["slug"],
                    les_data["order_index"],
                    les_data["duration"],
                    les_data["content"]
                )
                print(f"    [12-SEC LESSON] {les_data['title']} (id={les_row['id']})")
                
    print("\n" + "=" * 80)
    print("CURRICULUM ENRICHMENT COMPLETE")
    print("=" * 80)
    await conn.close()

if __name__ == "__main__":
    asyncio.run(seed())
