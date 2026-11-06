-- Migration 005: User Hero Banners and Enhanced Soft-Skills Learning Content
-- Implements persistent hero banner customizations (P0) and standard 12-section soft skills curriculum (P0).

-- ----------------------------------------------------------------------------
-- 1. USER BANNERS TABLE (LinkedIn-style profile & dashboard banner customization)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banner_url TEXT NOT NULL,
    pos_x INT NOT NULL DEFAULT 50,
    pos_y INT NOT NULL DEFAULT 50,
    scale NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    crop_data JSONB DEFAULT '{}'::jsonb,
    text_color VARCHAR(20) NOT NULL DEFAULT '#FFFFFF',
    overlay_type VARCHAR(20) NOT NULL DEFAULT 'dark',
    overlay_opacity INT NOT NULL DEFAULT 40,
    glassmorphism BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_banners_user_id ON user_banners(user_id);

-- ----------------------------------------------------------------------------
-- 2. ENHANCED LEARNING MODULES AND 12-SECTION LESSONS
-- ----------------------------------------------------------------------------

-- Helper function to safely insert modules and lessons idempotently
DO $$
DECLARE
    course_rec RECORD;
    mod_active_listening UUID;
    mod_exec_comm UUID;
    mod_conflict_res UUID;
    mod_persuasive_pres UUID;
    mod_critical_thinking UUID;
BEGIN
    -- Iterate through key soft skills courses
    FOR course_rec IN 
        SELECT id, code FROM courses 
        WHERE code IN ('SS-PCBE', 'SS-PSPS', 'SS-LTC', 'SS-PDCB', 'SS-ISCR', 'SS-GDWC', 'SS-CTPS', 'SS-ARYA-OLD')
        LIMIT 8
    LOOP
        -- Module 1: Active Listening & Empathetic Engagement
        INSERT INTO modules (course_id, title, slug, order_index, description)
        VALUES (
            course_rec.id, 
            'Active Listening & Empathetic Engagement', 
            'active-listening-empathetic-engagement', 
            1, 
            'Master the foundational discipline of active listening, verbal decoding, and empathetic feedback in high-velocity professional workplaces.'
        )
        ON CONFLICT (course_id, slug) DO UPDATE 
        SET title = EXCLUDED.title, description = EXCLUDED.description
        RETURNING id INTO mod_active_listening;

        -- If returning was null because of ON CONFLICT DO UPDATE without returning
        IF mod_active_listening IS NULL THEN
            SELECT id INTO mod_active_listening FROM modules WHERE course_id = course_rec.id AND slug = 'active-listening-empathetic-engagement';
        END IF;

        -- Lesson 1.1: Principles of Active Listening (Full 12-Section Curriculum)
        INSERT INTO lessons (module_id, title, slug, order_index, content_type, duration_minutes, content)
        VALUES (
            mod_active_listening,
            'The Five Principles of Active Listening in the Modern Workplace',
            'five-principles-active-listening',
            1,
            'text',
            15,
            E'# The Five Principles of Active Listening in the Modern Workplace\n\n## 1. Introduction\nIn fast-paced corporate and technical environments, hearing words is trivial; comprehending underlying intent, emotional context, and unstated assumptions is a core differentiator. Active listening transforms passive acoustic reception into an active cognitive partnership.\n\n## 2. Learning Objectives\n- Distinguish between passive hearing and disciplined active listening.\n- Master the 5 fundamental listening pillars (Presence, Non-judgment, Reflection, Clarification, Summarization).\n- Identify cognitive filters that derail high-stakes workplace dialogues.\n\n## 3. Core Concepts\nActive listening requires 100% intentional cognitive bandwidth. It operates across three distinct concentric circles:\n- **Level 1 (Internal Listening)**: Listening to your internal monologue while someone else speaks (prevalent in unfocused meetings).\n- **Level 2 (Focused Listening)**: Complete laser focus on the speaker''s words, vocal cadence, and sentence rhythm.\n- **Level 3 (Global Listening)**: Sensing the surrounding environment, unspoken tension, body posture, and systemic dynamics.\n\n## 4. Key Points\n1. **Full Sensory Presence**: Maintain natural eye contact (60-70% ratio), eliminate smartphone/laptop multitasking.\n2. **Withholding Pre-mature Judgment**: Suspend agreement or refutation until the counterpart completes their thought arc.\n3. **Reflective Mirroring**: Repeating the last 2-3 critical keywords with an upward inquisitive cadence builds instantaneous rapport.\n4. **Clarifying Probes**: Open-ended inquiry questions (\"How did that impact team delivery?\") prevent costly misunderstandings.\n5. **Authoritative Summarization**: Restating decisions and nuances before action items are assigned.\n\n## 5. Real-Life Examples\nDuring a sprint planning dispute between frontend and backend engineers regarding API schema latency, a project manager who engaged in Level 1 listening assumed the debate was about ego. An active listener at Level 3 caught the backend engineer''s micro-hesitation and discovered that third-party authentication rate limits were the true technical bottleneck.\n\n## 6. Professional Scenarios\n**Scenario A — The Frustrated Stakeholder**:\nA client messages: "This dashboard report is totally broken and our executives cannot present tomorrow."\n- *Poor Response*: "The dashboard works on my screen, did you clear cache?"\n- *Active Listening Response*: "I hear the urgency regarding tomorrow''s executive review. Let''s isolate the specific metrics that failed to populate so we can generate a verified hotfix immediately."\n\n## 7. Do''s and Don''ts\n### Do''s:\n- **Do** paraphrase before offering counter-arguments: "If I understand correctly, your primary concern is delivery timeline rather than scope."\n- **Do** validate emotional states: "That sounds like a complex operational hurdle."\n- **Do** take concise, structured written notes during technical handoffs.\n\n### Don''ts:\n- **Don''t** formulate your rebuttal while the other party is still presenting data.\n- **Don''t** hijack narratives: "That happened to me too on my last project..."\n- **Don''t** give uninvited advice before emotional stabilization occurs.\n\n## 8. Case Study: The Amazon Silent Meeting Culture\nAmazon replaced bulleted PowerPoint presentations with mandatory 30-minute silent reading periods of 6-page narrative memos at the start of executive meetings. By enforcing focused absorption before any speech is permitted, cognitive biases and oratorical charm are neutralized in favor of substantive message digestion.\n\n## 9. Practical Activities\n1. **The 3-Second Pause Drill**: In your next 3 meetings, deliberately pause for 3 full seconds after someone stops speaking before delivering your answer.\n2. **The Paraphrase Challenge**: Reframe your peer''s requirement in one sentence and ask: "Did I capture that accurately?"\n\n## 10. Knowledge Check\n1. *Question*: What is the primary difference between Level 2 and Level 3 listening?\n   - A) Level 2 includes reading emails; Level 3 is in person.\n   - B) Level 2 focuses on spoken words; Level 3 captures unspoken environmental and non-verbal cues.\n   - C) Level 2 is only for managers.\n   - *Correct Answer*: **B**\n\n## 11. Summary\nActive listening is not submissive; it is an active cognitive leadership strategy that drives alignment, prevents engineering rework, and elevates professional trust.\n\n## 12. Further Learning\n- Book: *Crucial Conversations: Tools for Talking When Stakes Are High* by Patterson, Grenny, McMillan.\n- Exercise: Practice non-verbal mirroring in peer pair-programming sessions.'
        )
        ON CONFLICT (module_id, slug) DO UPDATE 
        SET title = EXCLUDED.title, content = EXCLUDED.content, duration_minutes = EXCLUDED.duration_minutes;

        -- Lesson 1.2: Verbal & Non-Verbal Decoding
        INSERT INTO lessons (module_id, title, slug, order_index, content_type, duration_minutes, content)
        VALUES (
            mod_active_listening,
            'Verbal & Non-Verbal Decoding: Micro-Expressions and Vocal Pitch',
            'verbal-and-non-verbal-decoding',
            2,
            'text',
            12,
            E'# Verbal & Non-Verbal Decoding: Micro-Expressions and Vocal Pitch\n\n## 1. Introduction\nOver 70% of high-impact corporate communication is transmitted via vocal cadence, pause frequency, facial symmetry, and physical posture rather than lexical words alone.\n\n## 2. Learning Objectives\n- Decode micro-hesitations, vocal inflections, and defensive body language.\n- Master congruent physical positioning for virtual and hybrid meetings.\n- Detect divergence between spoken affirmative answers and non-verbal doubt.\n\n## 3. Core Concepts\n- **Congruence Theory**: When verbal statements align with posture and tonality, trust is established. When words state \"Yes, I can deliver by Friday\" but vocal pitch drops, incongruence indicates high risk.\n- **Proxemics & Virtual Framing**: Positioning within the camera frame (head and shoulders visible, eye level aligned with lens) directly influences perceived competence.\n\n## 4. Key Points\n1. High pitch elevation at the end of statements converts assertions into unintended questions (uptalking).\n2. Crossed arms with clenched fists indicate active defensiveness; relaxed open palms indicate collaborative openness.\n3. Rapid speech often masks insecurity; controlled, measured cadence projects authoritative calm.\n\n## 5. Professional Scenarios\nIn a compensation review or sprint estimation meeting, recognizing a team member''s slight head tilt and pursed lips reveals unspoken friction before it manifests as missed deadlines.\n\n## 6. Do''s and Don''ts\n- **Do** check your camera framing and lighting before executive client calls.\n- **Do** moderate your speaking speed to approximately 140 words per minute.\n- **Don''t** slump or look away during critical team feedback deliveries.\n\n## 7. Knowledge Check\n- *Question*: What does vocal uptalking convey in technical presentations?\n- *Answer*: It projects lack of confidence by making statements sound like questions.\n\n## 8. Summary\nMastering non-verbal cues provides an unfair advantage in negotiation, leadership, and team collaboration.'
        )
        ON CONFLICT (module_id, slug) DO UPDATE 
        SET title = EXCLUDED.title, content = EXCLUDED.content;

        -- Module 2: Business Communication & Executive Presence
        INSERT INTO modules (course_id, title, slug, order_index, description)
        VALUES (
            course_rec.id, 
            'Business Communication & Executive Presence', 
            'business-communication-executive-presence', 
            2, 
            'Cultivate high-impact email writing, concise stakeholder reporting, and authoritative cross-functional presence.'
        )
        ON CONFLICT (course_id, slug) DO UPDATE 
        SET title = EXCLUDED.title, description = EXCLUDED.description
        RETURNING id INTO mod_exec_comm;

        IF mod_exec_comm IS NULL THEN
            SELECT id INTO mod_exec_comm FROM modules WHERE course_id = course_rec.id AND slug = 'business-communication-executive-presence';
        END IF;

        -- Lesson 2.1: The Minto Pyramid Principle
        INSERT INTO lessons (module_id, title, slug, order_index, content_type, duration_minutes, content)
        VALUES (
            mod_exec_comm,
            'High-Impact Email Writing: The Minto Pyramid Principle & Executive Brevity',
            'minto-pyramid-executive-brevity',
            1,
            'text',
            18,
            E'# High-Impact Email Writing: The Minto Pyramid Principle & Executive Brevity\n\n## 1. Introduction\nExecutives, managers, and clients process hundreds of messages daily. Writing bottom-up where conclusions are buried after 4 paragraphs of backstory guarantees ignored emails. The Minto Pyramid Principle inverts this structure to maximize impact.\n\n## 2. Learning Objectives\n- Master the BLUF (Bottom Line Up Front) architectural framework.\n- Structure emails using Situation, Complication, Question, Answer (SCQA).\n- Eliminate passive filler phrases that weaken institutional credibility.\n\n## 3. Core Concepts\n- **Top-Down Structuring**: State the primary decision, recommendation, or request in the opening 2 sentences.\n- **Categorical Grouping**: Support the lead conclusion with 3 structured bullet points grouped by logical themes.\n- **Actionable Closing**: Specify the exact owner, expected outcome, and strict delivery date.\n\n## 4. Key Points\n1. Subject lines must be self-contained: `[ACTION REQUIRED by 4PM] Q3 Database Migration Approval`.\n2. Limit emails to a single screen view (no scrolling required on standard mobile devices).\n3. Use bolding sparingly for operational deadlines and key metrics only.\n\n## 5. Professional Scenarios & Before/After Comparison\n### Before (Low Impact):\n"Hi team, as you know we have been looking at cloud hosting options for the last few weeks and met with AWS and GCP. AWS had some discounts but GCP has good Kubernetes support. We think we should probably choose GCP because of pricing. Let me know what you think."\n\n### After (Minto Principle Applied):\n"**Recommendation**: We propose migrating the production clusters to GCP by October 15 to capture a 28% infrastructure cost reduction.\n\n**Key Rationales**:\n1. **Financial**: $42,000 annualized savings compared to current AWS baseline.\n2. **Technical**: Native GKE integration reduces deployment pipeline latency by 35%.\n3. **Compliance**: Multi-region failover satisfies our SLA requirements.\n\n**Action Required**: Please confirm approval by Friday 5 PM to initiate zero-downtime staging."\n\n## 6. Do''s and Don''ts\n- **Do** start with the conclusion.\n- **Do** use numbered lists when sequence matters and bullet points when sequence is arbitrary.\n- **Don''t** use open-ended conclusions like "Thoughts?" or "FYI" without clear ownership.\n\n## 7. Knowledge Check\n- *Question*: What does BLUF stand for?\n- *Answer*: Bottom Line Up Front.\n\n## 8. Summary\nClarity in writing reflects clarity in thought. Respecting your reader''s time is the fastest route to professional influence.'
        )
        ON CONFLICT (module_id, slug) DO UPDATE 
        SET title = EXCLUDED.title, content = EXCLUDED.content;

    END LOOP;
END $$;

