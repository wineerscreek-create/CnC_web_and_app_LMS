import type { RoleManual } from './types';

export const superAdminGuide: RoleManual = {
  role: 'SUPER_ADMIN',
  roleLabel: 'Super Administrator',
  portalTitle: 'Global Platform Governance & Master Administration Portal',
  description: 'Multi-tenant institution orchestration, corporate client accounts, master course curriculum, platform revenue, staff RBAC, and system telemetry.',
  homeRoute: '/super-admin',
  modules: [
    {
      id: 'super-admin-dashboard',
      title: 'Dashboard',
      pageRoute: '/super-admin',
      iconName: 'LayoutGrid',
      description: 'Master platform overview: total onboarded colleges, corporate enterprise accounts, active global learner count, MRR revenue metrics, and server cluster health.',
      quickTips: [
        'Check the Global Active Users (GAU) graph to monitor traffic spikes during nationwide exams.',
        'Review the Tenant Onboarding funnel to track new colleges in the deployment pipeline.',
        'Inspect the Platform Health badge for database latency and WebSocket connection health.'
      ],
      faqs: [
        {
          id: 'sup-dash-metrics',
          question: 'How do I interpret global platform KPIs across all institutional tenants?',
          shortDescription: 'Monitor total colleges, corporate accounts, aggregate learners, and system uptime.',
          purpose: 'Provide platform owners and executive leadership with complete multi-tenant visibility.',
          steps: [
            'Log into your Super Admin account to access the Master Dashboard.',
            'Review top KPI cards: Total Onboarded Institutions, Active Corporate Clients, Total Registered Students, and Monthly Recurring Revenue (MRR).',
            'Examine the "Global Tenant Activity" live feed showing concurrent proctored exam sessions and video classes.',
            'Click on any metric card to navigate into the respective platform management module.'
          ],
          expectedResult: 'Real-time visibility into platform scale, tenant health, and infrastructure load.',
          relatedFeatures: ['Colleges & Campuses', 'Corporate Clients', 'AI & Telemetry']
        },
        {
          id: 'sup-dash-quick-provision',
          question: 'How do I provision a new college or enterprise tenant directly from the dashboard?',
          shortDescription: 'Quickly initiate new multi-tenant onboarding workflows.',
          purpose: 'Accelerate client deployment without navigating through nested menus.',
          steps: [
            'Locate the "Global Provisioning" shortcut bar on the top-right of the dashboard.',
            'Click "Onboard New College" or "Add Corporate Client".',
            'Enter organization name, primary domain, and initial administrator email.',
            'Click "Create Tenant Workspace".'
          ],
          expectedResult: 'The tenant schema/isolation boundary is provisioned and onboarding credentials are sent.',
          relatedFeatures: ['Colleges & Campuses', 'Corporate Clients']
        }
      ]
    },
    {
      id: 'super-admin-colleges',
      title: 'Colleges & Campuses',
      pageRoute: '/super-admin/colleges',
      iconName: 'Building2',
      description: 'Institutional tenant management: onboard colleges, configure custom subdomains, manage license seat allocations, and enforce tenant isolation.',
      quickTips: [
        'Each college runs in an isolated tenant context with dedicated database partitions.',
        'Configure seat limits to ensure institutions do not exceed contractual student caps.',
        'Upload custom college logos and brand colors for white-labeled student portal experiences.'
      ],
      faqs: [
        {
          id: 'sup-col-onboard',
          question: 'How do I onboard a new college or university campus onto the LMS platform?',
          shortDescription: 'Set up an institutional tenant with dedicated branding, admin credentials, and seat quotas.',
          purpose: 'Provide universities with a secure, customized learning management environment.',
          steps: [
            'Click "Colleges & Campuses" in the navigation sidebar.',
            'Click the "Onboard College" button.',
            'Enter College Legal Name, Campus Code, Subdomain Prefix (e.g., `mit`), and Physical Address.',
            'Enter Primary College Admin details: Full Name, Official Email, and Phone.',
            'Set Account Limits: Maximum Enrolled Students and Licensed Faculty Seats.',
            'Upload College Crest / Logo and select primary brand color.',
            'Click "Provision College Tenant".'
          ],
          expectedResult: 'The institutional tenant is instantiated, routing rules are generated, and the college admin receives activation instructions.',
          noteOrWarning: {
            type: 'note',
            text: 'Subdomain prefixes must be globally unique across the entire LMS multi-tenant network.'
          },
          relatedFeatures: ['People', 'Staff Management', 'Payments & Revenue']
        },
        {
          id: 'sup-col-manage-quota',
          question: 'How do I adjust license quotas or suspend access for a delinquent institution?',
          shortDescription: 'Modify student seat caps or temporarily suspend access upon contract expiration.',
          purpose: 'Enforce commercial service level agreements and license contract renewals.',
          steps: [
            'Find the college in the "Colleges & Campuses" directory.',
            'Click "Manage Subscription & Quotas".',
            'Update the student enrollment ceiling (e.g., increase from 2,000 to 5,000 seats).',
            'To suspend an account for non-payment, toggle Tenant Status to "Suspended" and enter a suspension reason.',
            'Click "Save Changes".'
          ],
          expectedResult: 'Quotas are adjusted immediately in the license governor; suspended tenants see an administrative billing notice upon login.',
          relatedFeatures: ['Payments & Revenue', 'Dashboard']
        }
      ]
    },
    {
      id: 'super-admin-corporates',
      title: 'Corporate Clients',
      pageRoute: '/super-admin/corporates',
      iconName: 'Briefcase',
      description: 'Enterprise B2B client management: provision corporate training portals, configure employee upskilling tracks, and manage enterprise contracts.',
      quickTips: [
        'Corporate clients can have dedicated training tracks tailored to specific tech stacks.',
        'Assign corporate HR managers with restricted viewing dashboards to monitor employee progress.',
        'Track contractual corporate training hours delivered vs. billed.'
      ],
      faqs: [
        {
          id: 'sup-corp-create',
          question: 'How do I set up a corporate client account for enterprise workforce upskilling?',
          shortDescription: 'Create corporate tenant environments with specialized employee cohort structures.',
          purpose: 'Deliver bespoke corporate training programs to enterprise clients.',
          steps: [
            'Click "Corporate Clients" in the navigation sidebar.',
            'Click "Add Corporate Client".',
            'Enter Company Name, Industry Sector, Primary Contact Person, and Corporate Email.',
            'Select assigned Enterprise Course Curriculum tracks.',
            'Configure contract terms: Number of Employee Seats, Contract Start Date, and Renewal Date.',
            'Click "Deploy Corporate Portal".'
          ],
          expectedResult: 'A corporate workspace is deployed with enterprise single sign-on (SSO) and cohort tracking ready.',
          relatedFeatures: ['Program', 'People', 'Payments & Revenue']
        }
      ]
    },
    {
      id: 'super-admin-users',
      title: 'People',
      pageRoute: '/super-admin/users',
      iconName: 'Users',
      description: 'Global identity and account management: search across all tenant databases, inspect user profiles, execute global password resets, and manage account locks.',
      quickTips: [
        'Use the Global User Search to quickly locate any student or trainer regardless of which college they belong to.',
        'Review global login audit logs to spot suspicious multi-location login attempts.',
        'Impersonate institution administrators securely for tier-3 platform troubleshooting.'
      ],
      faqs: [
        {
          id: 'sup-people-search',
          question: 'How do I search for a user across all institutions and diagnose account issues?',
          shortDescription: 'Locate user records platform-wide by email, roll number, or phone number.',
          purpose: 'Provide global technical support and resolve cross-tenant identity disputes.',
          steps: [
            'Click "People" in the navigation sidebar.',
            'Enter the search query (email, roll number, or user ID) in the global search bar.',
            'Review the result card showing the user’s assigned Tenant (College/Corporate), Role, and Status.',
            'Click "Inspect Account" to view auth audit logs, registered devices, and active JWT sessions.',
            'Click "Revoke All Sessions" or "Send Password Reset" if account compromise is suspected.'
          ],
          expectedResult: 'Full identity diagnostic state is accessible with immediate remediation actions.',
          noteOrWarning: {
            type: 'warning',
            text: 'All Super Admin account modifications and impersonations are logged in the immutable security audit ledger.'
          },
          relatedFeatures: ['Staff Management', 'AI & Telemetry']
        }
      ]
    },
    {
      id: 'super-admin-staff-management',
      title: 'Staff Management',
      pageRoute: '/super-admin/staff-management',
      iconName: 'ShieldCheck',
      description: 'Platform internal operations team governance: Super Admin access delegation, support engineer permissions, and role-based privilege controls.',
      quickTips: [
        'Enforce Two-Factor Authentication (2FA) for all platform internal staff members.',
        'Follow the principle of least privilege: assign "Support Tier-1" roles for helpdesk staff rather than full Super Admin.',
        'Audit staff access logs weekly for compliance with SOC2 / ISO 27001 policies.'
      ],
      faqs: [
        {
          id: 'sup-staff-add',
          question: 'How do I add a new internal staff member and configure their access permissions?',
          shortDescription: 'Provision accounts for internal platform administrators, content creators, and support engineers.',
          purpose: 'Delegate administrative responsibilities securely across your operational team.',
          steps: [
            'Click "Staff Management" in the navigation sidebar.',
            'Click "Add Staff Member".',
            'Enter Staff Full Name, Official Organization Email, and Department (e.g., Engineering, Tier-2 Support, Content).',
            'Select Role Level: "Super Admin", "Operations Lead", or "Support Specialist".',
            'Check granular permissions: "Can Edit Global Curriculum", "Can Access Telemetry", "Can Modify Billing".',
            'Click "Create Staff Profile & Send Invite".'
          ],
          expectedResult: 'Staff profile is created with 2FA enforcement and strict permission scopes.',
          relatedFeatures: ['People', 'AI & Telemetry']
        }
      ]
    },
    {
      id: 'super-admin-courses',
      title: 'Program',
      pageRoute: '/super-admin/courses',
      iconName: 'BookOpen',
      description: 'Master curriculum management: author standard university syllabi, manage global course modules, upload master lecture videos, and publish standardized question banks.',
      quickTips: [
        'Colleges can inherit master courses or customize their own departmental variants.',
        'Upload high-bitrate video lessons; the transcoder automatically generates multi-resolution streaming formats.',
        'Organize courses into structured learning tracks (e.g., Full-Stack Web Development, Data Science, VLSI).'
      ],
      faqs: [
        {
          id: 'sup-course-create-master',
          question: 'How do I author a master course curriculum and publish it to the global catalog?',
          shortDescription: 'Build standardized multi-module courses available for adoption by all colleges.',
          purpose: 'Maintain high educational quality and standardized learning materials across all client institutions.',
          steps: [
            'Click "Program" in the navigation sidebar.',
            'Click "Create Master Course".',
            'Enter Course Title, Subject Code, Description, and Difficulty Level.',
            'Structure Curriculum: Add Modules, Chapters, Video Lectures, and Reading PDF attachments.',
            'Attach checkpoint quizzes to chapters from the Master Question Bank.',
            'Set Availability: "Global Catalog" or "Restricted to Specific Tenants".',
            'Click "Publish Master Course".'
          ],
          expectedResult: 'The course is published and becomes available for college admins to assign to their batches.',
          relatedFeatures: ['Resources', 'Colleges & Campuses']
        }
      ]
    },
    {
      id: 'super-admin-ebooks',
      title: 'Resources',
      pageRoute: '/super-admin/ebooks',
      iconName: 'BookOpen',
      description: 'Global digital repository: manage platform digital textbooks, manage publisher licenses, upload syllabus companions, and monitor reading analytics.',
      quickTips: [
        'Ensure uploaded PDFs are OCR-indexed for optimal keyword searching in the student eBook reader.',
        'Set DRM copy and download permissions based on publisher copyright agreements.',
        'Monitor the most frequently read books across institutions to guide future curriculum licensing.'
      ],
      faqs: [
        {
          id: 'sup-res-upload-ebook',
          question: 'How do I upload and license a new digital textbook or reference book?',
          shortDescription: 'Add books to the global digital library with publisher attribution and metadata.',
          purpose: 'Provide students and trainers with rich, legal digital learning resources.',
          steps: [
            'Click "Resources" in the navigation sidebar.',
            'Click "Upload Digital Resource".',
            'Enter Title, Author, Publisher, ISBN, and Subject Category.',
            'Upload the PDF manuscript file.',
            'Configure DRM: "Allow Offline Download" (Yes/No) and "Allow Printing" (Yes/No).',
            'Click "Process & Index eBook".'
          ],
          expectedResult: 'The PDF is optimized, thumbnail covers are generated, and the book is added to the global student and trainer library.',
          relatedFeatures: ['Program', 'Colleges & Campuses']
        }
      ]
    },
    {
      id: 'super-admin-feedback',
      title: 'Feedback & Testimonials',
      pageRoute: '/super-admin/feedback',
      iconName: 'MessageSquare',
      description: 'Platform-wide feedback moderation: review student quiz feedback ratings, process trainer bug reports, and approve public college testimonials.',
      quickTips: [
        'Filter feedback by "Quiz Evaluations" to monitor examination satisfaction across all campuses.',
        'Identify systemic issues: if multiple institutions report the same proctoring bug, escalate to engineering.',
        'Publish approved positive reviews to the platform landing page testimonial showcase.'
      ],
      faqs: [
        {
          id: 'sup-fb-moderate',
          question: 'How do I review student assessment feedback and trainer bug reports across colleges?',
          shortDescription: 'Monitor user sentiment, evaluate reported questions, and route technical bugs.',
          purpose: 'Drive continuous platform improvement and maintain high academic satisfaction.',
          steps: [
            'Click "Feedback & Testimonials" in the navigation sidebar.',
            'Select the "Assessment Feedback" tab to view quiz ratings and reported issues.',
            'Filter by College or Subject domain.',
            'Click on any reported question bug to view student comments and trainer responses.',
            'To resolve, click "Mark Resolved" or "Escalate to Curriculum Team".'
          ],
          expectedResult: 'Feedback is triaged, categorized, and resolved with full audit tracking.',
          relatedFeatures: ['Program', 'AI & Telemetry']
        }
      ]
    },
    {
      id: 'super-admin-payments',
      title: 'Payments & Revenue',
      pageRoute: '/super-admin/payments',
      iconName: 'CreditCard',
      description: 'Global financial console: platform billing, multi-tenant subscription invoicing, merchant gateway settlements, and recurring revenue analytics.',
      quickTips: [
        'Track Monthly Recurring Revenue (MRR) and Annual Contract Value (ACV) growth curves.',
        'Review payment gateway payout batches to reconcile master institutional bank accounts.',
        'Issue tax-compliant GST invoices to colleges and enterprise corporate clients.'
      ],
      faqs: [
        {
          id: 'sup-rev-invoice',
          question: 'How do I generate and dispatch annual enterprise subscription invoices to a college?',
          shortDescription: 'Create custom institutional contracts and generate formal tax invoices.',
          purpose: 'Manage platform SaaS billing and institutional licensing collections.',
          steps: [
            'Click "Payments & Revenue" in the navigation sidebar.',
            'Click "Generate Enterprise Invoice".',
            'Select the target College or Corporate Client.',
            'Specify billing items: Student Seat Tier, Dedicated Cloud Storage, and Support SLA.',
            'Set Payment Due Date and Tax (GST) rate.',
            'Click "Generate & Email Invoice".'
          ],
          expectedResult: 'An official tax invoice is emailed to the client’s billing contact with automated bank transfer and payment gateway links.',
          relatedFeatures: ['Colleges & Campuses', 'Corporate Clients']
        }
      ]
    },
    {
      id: 'super-admin-games',
      title: 'Games Management',
      pageRoute: '/super-admin/games',
      iconName: 'Gamepad2',
      description: 'Global gamification engine: author new logic games, configure XP point economies, set global challenge schedules, and inspect algorithmic telemetry.',
      quickTips: [
        'Balance XP multipliers so coding drills reward higher XP than quick memory puzzles.',
        'Schedule nationwide inter-college coding championships from the tournament manager.',
        'Inspect game completion drop-off rates to calibrate difficulty curves.'
      ],
      faqs: [
        {
          id: 'sup-game-publish',
          question: 'How do I configure global game challenge pools or author a new puzzle type?',
          shortDescription: 'Update problem databases and maintain balanced cognitive difficulty levels.',
          purpose: 'Keep gamified learning engaging, fresh, and academically rigorous.',
          steps: [
            'Click "Games Management" in the navigation sidebar.',
            'Select the game module to configure (e.g., "Syntax Sprint").',
            'Click "Manage Problem Pool".',
            'Add new question puzzles or import coding challenges via JSON.',
            'Adjust time limits, scoring multipliers, and hint penalties.',
            'Click "Publish Pool Update".'
          ],
          expectedResult: 'New challenge pools are immediately distributed across all client portals without app redeployment.',
          relatedFeatures: ['Program', 'AI & Telemetry']
        }
      ]
    },
    {
      id: 'super-admin-meetings',
      title: 'Trainer Meetings',
      pageRoute: '/super-admin/meetings',
      iconName: 'Video',
      description: 'Global video conferencing infrastructure: monitor live virtual classroom concurrency, manage WebRTC server clusters, and inspect call quality diagnostics.',
      quickTips: [
        'Monitor active concurrent video sessions during peak morning lecture hours.',
        'Inspect packet loss and jitter metrics to diagnose regional internet service provider bottlenecks.',
        'Manage cloud recording storage retention policies to optimize AWS/GCP storage costs.'
      ],
      faqs: [
        {
          id: 'sup-meet-concurrency',
          question: 'How do I monitor live classroom video traffic and WebRTC server loads?',
          shortDescription: 'Track active meeting rooms, total connected participants, and media server health.',
          purpose: 'Ensure flawless audio/video quality during peak nationwide lecture hours.',
          steps: [
            'Click "Trainer Meetings" in the navigation sidebar.',
            'Review the live summary: Active Meetings, Connected Participants, and Media Server CPU/RAM Load.',
            'Examine the meeting room table sorted by duration or participant count.',
            'If a server shows high CPU usage (>80%), click "Trigger Auto-Scaling" to spin up additional media nodes.'
          ],
          expectedResult: 'Traffic is balanced smoothly across clusters with zero video interruptions.',
          relatedFeatures: ['AI & Telemetry', 'Colleges & Campuses']
        }
      ]
    },
    {
      id: 'super-admin-system',
      title: 'AI & Telemetry',
      pageRoute: '/super-admin/system',
      iconName: 'Server',
      description: 'Master platform infrastructure: database query latency, AI proctoring model inference times, WebSocket connections, security logs, and error telemetry.',
      quickTips: [
        'Review the 99th percentile (p99) API latency to ensure responsive user experiences.',
        'Check AI proctoring facial inference queue latency during large-scale examination drives.',
        'Inspect security audit logs for rate-limiting triggers or unauthorized API access attempts.'
      ],
      faqs: [
        {
          id: 'sup-sys-telemetry',
          question: 'How do I inspect database connection pools, cache hit ratios, and API health?',
          shortDescription: 'Monitor backend application performance, database latency, and Redis cache health.',
          purpose: 'Maintain high availability and identify performance bottlenecks proactively.',
          steps: [
            'Click "AI & Telemetry" in the navigation sidebar.',
            'Inspect top operational cards: API Error Rate (%), Average Response Time (ms), Database Pool Utilization, and Redis Hit Ratio.',
            'Review the "Live Error Log" stream for unhandled exceptions or 5xx HTTP responses.',
            'Click "Export Telemetry Snapshot" to generate a diagnostic package for the site reliability engineering (SRE) team.'
          ],
          expectedResult: 'Comprehensive engineering telemetry is visible for maintaining 99.99% platform availability.',
          relatedFeatures: ['Trainer Meetings', 'Colleges & Campuses']
        },
        {
          id: 'sup-sys-proctoring-telemetry',
          question: 'How do I evaluate AI face-detection proctoring pipeline throughput and accuracy?',
          shortDescription: 'Analyze computer vision proctoring model latency and camera snapshot ingestion queues.',
          purpose: 'Guarantee zero lag in exam proctoring during university-wide assessment hours.',
          steps: [
            'On "AI & Telemetry", switch to the "Proctoring & Vision Pipeline" tab.',
            'Review metrics: Snapshots Ingested/min, Inference Latency (avg ms), and False Positive rate.',
            'Verify that camera snapshot storage buckets have ample headroom.',
            'Adjust camera sampling frequency if network congestion is detected in specific regions.'
          ],
          expectedResult: 'Proctoring pipeline runs efficiently, balancing examination integrity with network bandwidth economy.',
          relatedFeatures: ['Colleges & Campuses', 'Feedback & Testimonials']
        }
      ]
    }
  ]
};
