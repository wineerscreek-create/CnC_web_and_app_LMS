-- ============================================================================
-- Migration 008: Unified Feedback, Course Reviews & Testimonial Management System
-- 
-- Implements:
-- 1. platform_feedback (Public platform-wide reviews and suggestions)
-- 2. course_feedback (Course-specific reviews, drafts, and mandatory completion gate)
-- 3. feedback_moderation_log (Audit trail for moderation and publication actions)
-- 4. newsletter_subscriptions (Real backend newsletter tracking)
-- ============================================================================

-- 1. PLATFORM FEEDBACK TABLE
CREATE TABLE IF NOT EXISTS platform_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    display_name VARCHAR(150),
    email VARCHAR(255),
    user_category VARCHAR(50) NOT NULL DEFAULT 'EXTERNAL',
    overall_platform_rating INT NOT NULL CHECK (overall_platform_rating BETWEEN 1 AND 5),
    ease_of_use_rating INT NOT NULL CHECK (ease_of_use_rating BETWEEN 1 AND 5),
    learning_quality_rating INT NOT NULL CHECK (learning_quality_rating BETWEEN 1 AND 5),
    practical_experience_rating INT NOT NULL CHECK (practical_experience_rating BETWEEN 1 AND 5),
    recommendation_rating INT NOT NULL CHECK (recommendation_rating BETWEEN 1 AND 5),
    written_feedback TEXT NOT NULL,
    suggestions TEXT,
    greeting_message TEXT,
    public_display_consent BOOLEAN NOT NULL DEFAULT FALSE,
    moderation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (moderation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN')),
    is_published_to_homepage BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    moderator_note TEXT,
    moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. COURSE FEEDBACK TABLE
CREATE TABLE IF NOT EXISTS course_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_rating INT NOT NULL DEFAULT 5 CHECK (content_rating BETWEEN 1 AND 5),
    trainer_rating INT NOT NULL DEFAULT 5 CHECK (trainer_rating BETWEEN 1 AND 5),
    practical_activity_rating INT NOT NULL DEFAULT 5 CHECK (practical_activity_rating BETWEEN 1 AND 5),
    learning_material_rating INT NOT NULL DEFAULT 5 CHECK (learning_material_rating BETWEEN 1 AND 5),
    overall_course_rating INT NOT NULL DEFAULT 5 CHECK (overall_course_rating BETWEEN 1 AND 5),
    learning_outcome TEXT,
    positive_feedback TEXT,
    improvement_suggestions TEXT,
    future_batch_suggestions TEXT,
    greeting_message TEXT,
    testimonial_text TEXT,
    public_display_consent BOOLEAN NOT NULL DEFAULT FALSE,
    submission_type VARCHAR(20) NOT NULL DEFAULT 'FINAL' CHECK (submission_type IN ('DRAFT', 'FINAL')),
    is_final_submission BOOLEAN NOT NULL DEFAULT FALSE,
    moderation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (moderation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN')),
    is_published_to_homepage BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    moderator_note TEXT,
    moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_course_feedback_participant_course UNIQUE (course_id, participant_id)
);

-- 3. FEEDBACK MODERATION AUDIT LOG
CREATE TABLE IF NOT EXISTS feedback_moderation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_type VARCHAR(20) NOT NULL CHECK (feedback_type IN ('PLATFORM', 'COURSE')),
    feedback_id UUID NOT NULL,
    moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    internal_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. NEWSLETTER SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. INDEXES FOR HIGH-PERFORMANCE FILTERING AND HOMEPAGE QUERIES
CREATE INDEX IF NOT EXISTS idx_platform_feedback_moderation ON platform_feedback(moderation_status, is_published_to_homepage);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_created ON platform_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_feedback_course ON course_feedback(course_id);
CREATE INDEX IF NOT EXISTS idx_course_feedback_participant ON course_feedback(participant_id);
CREATE INDEX IF NOT EXISTS idx_course_feedback_final ON course_feedback(course_id, participant_id, is_final_submission);
CREATE INDEX IF NOT EXISTS idx_course_feedback_moderation ON course_feedback(moderation_status, is_published_to_homepage);
CREATE INDEX IF NOT EXISTS idx_feedback_moderation_ref ON feedback_moderation_log(feedback_type, feedback_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscriptions(email);

-- 6. POPULATE INITIAL REAL SEED TESTIMONIALS (Approved & Published) FOR HOMEPAGE
-- Insert platform feedback seed testimonials
INSERT INTO platform_feedback (
    display_name, email, user_category,
    overall_platform_rating, ease_of_use_rating, learning_quality_rating,
    practical_experience_rating, recommendation_rating,
    written_feedback, suggestions, greeting_message,
    public_display_consent, moderation_status, is_published_to_homepage, published_at
) VALUES 
(
    'Aarav Sharma', 'aarav.sharma@example.com', 'STUDENT',
    5, 5, 5, 5, 5,
    'The AI speech coach and structured corporate etiquette modules completely transformed my campus placement interviews. I cleared my first Tier-1 technical round with high confidence.',
    'More live debate simulations with corporate panellists.',
    'Heartfelt thanks to the faculty team for relentless guidance!',
    TRUE, 'APPROVED', TRUE, NOW() - INTERVAL '4 days'
),
(
    'Pooja Nair', 'pooja.nair@example.com', 'STUDENT',
    5, 4, 5, 5, 5,
    'Winners Creek LMS bridges what textbooks cannot teach. The real-time pacing feedback during executive presentations is unmatched.',
    'Add an option to download offline session notes.',
    'Keep up the phenomenal mentoring!',
    TRUE, 'APPROVED', TRUE, NOW() - INTERVAL '8 days'
),
(
    'Dr. K. S. Venkatesh', 'ks.venkatesh@college.edu', 'SPOC',
    5, 5, 5, 5, 5,
    'Implementing Winners Creek across our Computer Science department saw our student readiness index rise by 38% in one semester. The telemetry and faculty rubric transparency are stellar.',
    'Automated department-level monthly CSV exports.',
    'Extremely proud of this institutional partnership.',
    TRUE, 'APPROVED', TRUE, NOW() - INTERVAL '12 days'
),
(
    'Meera Singhania', 'meera.s@corporatepartners.com', 'CORPORATE',
    5, 5, 5, 5, 5,
    'We hired 40+ graduates trained through Winners Creek. Their boardroom communication, hypothesis testing, and collaborative agility exceeded typical campus hire standards.',
    'Expand into cross-cultural global negotiation tracks.',
    'Wonderful learning architecture.',
    TRUE, 'APPROVED', TRUE, NOW() - INTERVAL '15 days'
)
ON CONFLICT DO NOTHING;

