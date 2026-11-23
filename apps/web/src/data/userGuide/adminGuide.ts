import type { RoleManual } from './types';

export const adminGuide: RoleManual = {
  role: 'ADMIN',
  roleLabel: 'Institution Admin',
  portalTitle: 'College & Institution Administration Portal',
  description: 'Campus-wide operations, department infrastructure, user lifecycle management, role-based access control, bulk imports, and fee collections.',
  homeRoute: '/admin/dashboard',
  modules: [
    {
      id: 'admin-dashboard',
      title: 'Dashboard',
      pageRoute: '/admin/dashboard',
      iconName: 'LayoutGrid',
      description: 'Campus executive dashboard: total student enrollment, active departments, faculty roster, tuition revenue collection, and system operational health.',
      quickTips: [
        'Review the campus enrollment gauge and license utilization at the top.',
        'Track daily active user (DAU) logins and concurrent assessment sessions.',
        'Check the bulk import processing queue for any failed record notifications.'
      ],
      faqs: [
        {
          id: 'adm-dash-kpi',
          question: 'How do I monitor campus-wide enrollment, faculty counts, and active licenses?',
          shortDescription: 'Get a real-time operational pulse of your college’s LMS deployment.',
          purpose: 'Provide institution administrators with centralized oversight across all branches and programs.',
          steps: [
            'Log into your Admin account to view the College Administration Dashboard.',
            'Review top KPI cards: Total Enrolled Students, Active Faculty, Registered Departments, and Fee Collection MTD.',
            'Check the "Platform Activity Feed" to monitor concurrent live tests and live class connections.',
            'Click on any widget to drill down into the corresponding management console.'
          ],
          expectedResult: 'Instant high-level operational visibility across all departments and user populations.',
          relatedFeatures: ['Departments & batches', 'Users & roles', 'Payments']
        },
        {
          id: 'adm-dash-quick-links',
          question: 'How do I quickly access critical administrative tasks from the dashboard?',
          shortDescription: 'Navigate directly to bulk user import, batch creation, or fee collection audits.',
          purpose: 'Streamline administrative workflows during peak admission and examination periods.',
          steps: [
            'Locate the "Quick Administrative Actions" section on the dashboard.',
            'Click "Import Student CSV" to launch the multi-step bulk intake wizard.',
            'Click "Add Department" to register a new academic discipline or branch.',
            'Click "Generate Campus Audit" to run an immediate institution-wide compliance check.'
          ],
          expectedResult: 'You jump straight into the target task without having to browse sidebar hierarchies.',
          relatedFeatures: ['Bulk import', 'Departments & batches']
        }
      ]
    },
    {
      id: 'admin-departments',
      title: 'Departments & batches',
      pageRoute: '/admin/departments',
      iconName: 'Building2',
      description: 'Organizational hierarchy manager: create departments, configure academic semesters, create batches, and assign department heads.',
      quickTips: [
        'Each department requires an assigned HOD to enable faculty allocation and attendance oversight.',
        'Set batch start and end dates accurately to ensure automated license expiration works properly.',
        'Archive graduating batches rather than deleting them to preserve historical academic transcripts.'
      ],
      faqs: [
        {
          id: 'adm-dept-create',
          question: 'How do I create a new department and appoint a Head of Department (HOD)?',
          shortDescription: 'Define a new academic division (e.g., Computer Science, Mechanical Engineering).',
          purpose: 'Structure your college into organized departments with strict tenant and RBAC boundaries.',
          steps: [
            'Click "Departments & batches" in the navigation sidebar.',
            'Click the "Add Department" button.',
            'Enter Department Name (e.g., "Information Technology") and Department Code (e.g., "IT").',
            'Select the appointed Head of Department from the registered faculty list (or invite a new HOD by email).',
            'Click "Create Department".'
          ],
          expectedResult: 'The department workspace is provisioned, and the assigned HOD is granted administrative scope over it.',
          noteOrWarning: {
            type: 'note',
            text: 'A user designated as HOD will automatically receive HOD Portal permissions upon their next login.'
          },
          relatedFeatures: ['Trainers & access', 'Users & roles']
        },
        {
          id: 'adm-dept-batch-create',
          question: 'How do I create and configure a new student batch inside a department?',
          shortDescription: 'Set up cohorts with semester labels, intake years, and curriculum associations.',
          purpose: 'Establish cohorts for structured classroom scheduling, attendance, and testing.',
          steps: [
            'From the Departments & Batches page, click on the target Department.',
            'Switch to the "Batches" tab and click "Create Batch".',
            'Enter Batch Name (e.g., "CSE-2026-Section-A"), Semester (e.g., "Semester 4"), and Maximum Capacity.',
            'Select Start Date and Target Completion Date.',
            'Assign the primary Trainer or leave unassigned for the HOD to allocate.',
            'Click "Save Batch".'
          ],
          expectedResult: 'The batch is created and ready for student enrollment and timetable scheduling.',
          relatedFeatures: ['Bulk import', 'Trainers & access']
        }
      ]
    },
    {
      id: 'admin-trainers',
      title: 'Trainers & access',
      pageRoute: '/admin/trainers',
      iconName: 'GraduationCap',
      description: 'Faculty access provisioning: invite trainers, manage teaching contracts, configure subject specializations, and set system privileges.',
      quickTips: [
        'Trainers can be assigned to multiple batches across different departments if authorized.',
        'Revoke access immediately when a visiting trainer or contractual faculty concludes their term.',
        'Track trainer invitation acceptance status from the "Pending Invitations" tab.'
      ],
      faqs: [
        {
          id: 'adm-trn-invite',
          question: 'How do I onboard and provision access for a new trainer or faculty member?',
          shortDescription: 'Send email invitations with auto-generated temporary credentials and role permissions.',
          purpose: 'Grant qualified instructors immediate access to the Trainer Portal.',
          steps: [
            'Click "Trainers & access" in the navigation sidebar.',
            'Click "Invite Trainer".',
            'Enter Full Name, Official Institutional Email, Employee ID, and Department.',
            'Select initial teaching specializations (e.g., "Python", "Data Structures", "Database Systems").',
            'Click "Send Invitation".'
          ],
          expectedResult: 'The faculty member receives a secure onboarding link to set their password and activate their account.',
          relatedFeatures: ['Users & roles', 'Departments & batches']
        },
        {
          id: 'adm-trn-permissions',
          question: 'How do I manage a trainer\'s permissions or deactivate their account?',
          shortDescription: 'Adjust assessment publishing rights, attendance modification access, or suspend accounts.',
          purpose: 'Maintain institutional security and faculty data governance.',
          steps: [
            'Find the trainer in the "Trainers & access" directory.',
            'Click the "Actions" menu (three dots) and select "Edit Access & Permissions".',
            'Toggle specialized permissions: "Can Author Assessments", "Can Modify Historical Attendance", "Can Export Reports".',
            'To suspend access, toggle Account Status to "Suspended" and click Save.'
          ],
          expectedResult: 'Permission changes take effect immediately; suspended trainers are logged out of active sessions.',
          relatedFeatures: ['Users & roles']
        }
      ]
    },
    {
      id: 'admin-users',
      title: 'Users & roles',
      pageRoute: '/admin/users',
      iconName: 'Users',
      description: 'Centralized directory of all campus accounts: students, trainers, HODs, and administrators with role assignment and account controls.',
      quickTips: [
        'Use quick filters to sort users by Role: Student, Trainer, HOD, or Admin.',
        'Perform one-click password resets for locked-out students directly from their user row.',
        'Export the entire campus user registry as an encrypted CSV for institutional auditing.'
      ],
      faqs: [
        {
          id: 'adm-user-search-reset',
          question: 'How do I find a user, unlock their account, or trigger a password reset?',
          shortDescription: 'Resolve student and staff login difficulties rapidly.',
          purpose: 'Ensure zero downtime for students during crucial examination windows.',
          steps: [
            'Click "Users & roles" in the navigation sidebar.',
            'Search for the user using their Roll Number, Name, or Email Address.',
            'Click on the user’s name in the table.',
            'In the user details modal, click "Reset Password" to generate a secure reset link or temporary password.',
            'If the account was locked due to excessive failed attempts, click "Unlock Account".'
          ],
          expectedResult: 'The user account is immediately unlocked and credentials are reset.',
          relatedFeatures: ['Bulk import', 'Dashboard']
        },
        {
          id: 'adm-user-change-role',
          question: 'How do I change a user\'s role or upgrade a trainer to HOD?',
          shortDescription: 'Adjust role-based access control (RBAC) assignments cleanly.',
          purpose: 'Accommodate staff promotions and departmental leadership transitions.',
          steps: [
            'Open the user row from "Users & roles".',
            'Click "Edit Role & Department".',
            'Select the new role from the Role dropdown (e.g., promote TRAINER to HOD).',
            'Assign the corresponding department if promoting to HOD.',
            'Click "Save Role Assignment".'
          ],
          expectedResult: 'The user’s navigation and portal access updates to the new role on their next page load.',
          noteOrWarning: {
            type: 'warning',
            text: 'Super Admin permissions can only be granted by existing Super Admins from the master platform portal.'
          },
          relatedFeatures: ['Trainers & access', 'Departments & batches']
        }
      ]
    },
    {
      id: 'admin-reports',
      title: 'Reports & analytics',
      pageRoute: '/admin/reports',
      iconName: 'BarChart3',
      description: 'Campus-wide business intelligence: overall academic completion, institutional attendance averages, trainer utilization, and examination metrics.',
      quickTips: [
        'Generate cross-departmental comparison charts to see which branches are leading in course completions.',
        'Export campus-wide attendance spreadsheets for state university statutory compliance.',
        'Schedule weekly automated executive summary reports sent to the College Principal.'
      ],
      faqs: [
        {
          id: 'adm-rep-campus-audit',
          question: 'How do I generate a college-wide academic performance and attendance report?',
          shortDescription: 'Consolidate statistics across all departments into a single executive package.',
          purpose: 'Provide college leadership, trustees, and inspection committees with verifiable data.',
          steps: [
            'Click "Reports & analytics" in the navigation sidebar.',
            'Select "Campus Academic Audit".',
            'Choose the Academic Year, Semester, and select "All Departments".',
            'Click "Generate Analytics".',
            'Review cross-departmental charts: Enrolled Headcount, Average Attendance, Pass %, and Placement Readiness Index.',
            'Click "Export Full Report (Excel / PDF)".'
          ],
          expectedResult: 'A comprehensive, multi-sheet workbook or presentation PDF is generated and downloaded.',
          relatedFeatures: ['Payments', 'Dashboard']
        }
      ]
    },
    {
      id: 'admin-games',
      title: 'Games',
      pageRoute: '/admin/games',
      iconName: 'Gamepad2',
      description: 'Campus gamification management: manage unlocked games, monitor participation rates, view college leaderboards, and sponsor campus tournaments.',
      quickTips: [
        'Enable or disable specific game modules during semester examination weeks to prevent student distraction.',
        'View the campus-wide leaderboard to recognize top student talent in college assemblies.',
        'Launch campus-wide coding tournaments with custom start and end windows.'
      ],
      faqs: [
        {
          id: 'adm-game-control',
          question: 'How do I configure game access rules or sponsor an inter-department tournament?',
          shortDescription: 'Manage campus-wide gamified learning schedules and tournament events.',
          purpose: 'Boost campus morale and incentivize continuous technical self-study.',
          steps: [
            'Click "Games" in the navigation sidebar.',
            'Review active game modules (Logic Puzzles, Syntax Speed, Memory Matrix).',
            'To host a campus tournament, click "Create Campus Tournament".',
            'Set tournament dates, eligible departments, and bonus XP prizes.',
            'Click "Publish Tournament".'
          ],
          expectedResult: 'A tournament banner appears on all eligible student dashboards, tracking inter-department points in real time.',
          relatedFeatures: ['Reports & analytics', 'Dashboard']
        }
      ]
    },
    {
      id: 'admin-payments',
      title: 'Payments',
      pageRoute: '/admin/payments',
      iconName: 'CreditCard',
      description: 'Campus finance portal: monitor tuition collections, review payment gateway transaction logs, manage refunds, and export tax summaries.',
      quickTips: [
        'Filter payment transactions by "Settled", "Pending", or "Failed" to reconcile bank statements.',
        'Export daily collection reports formatted with student roll numbers, transaction IDs, and timestamps.',
        'Process student fee refund requests with automated ledger reconciliation.'
      ],
      faqs: [
        {
          id: 'adm-pay-track',
          question: 'How do I audit fee collections, gateway settlements, and unpaid student balances?',
          shortDescription: 'Review financial inflow, payment gateway settlement logs, and outstanding fee aging.',
          purpose: 'Maintain transparent institutional accounting and track fee receivables.',
          steps: [
            'Click "Payments" in the navigation sidebar.',
            'Review the top finance summary: Total Collected (MTD), Pending Receivables, Gateway Fees, and Net Settlements.',
            'Browse the "Transactions" ledger to inspect individual student payments.',
            'Filter by Batch or Department to identify cohorts with high pending fee balances.'
          ],
          expectedResult: 'Full accounting transparency with real-time transaction reconciliation status.',
          relatedFeatures: ['Reports & analytics', 'Users & roles']
        },
        {
          id: 'adm-pay-export-csv',
          question: 'How do I export payment transaction sheets for the college finance office?',
          shortDescription: 'Download filtered Excel/CSV accounting files compatible with Tally and SAP.',
          purpose: 'Streamline institutional book-keeping and audit compliance.',
          steps: [
            'On the Payments page, select the required Date Range (e.g., Current Month).',
            'Filter by Status: "Settled".',
            'Click "Export Finance Ledger".',
            'Select "Tally/SAP Compatible CSV" or "Excel Workbook".'
          ],
          expectedResult: 'A formatted spreadsheet downloads containing Student Roll No, Transaction ID, Gateway Ref, Amount, and GST breakdown.',
          relatedFeatures: ['Reports & analytics']
        }
      ]
    },
    {
      id: 'admin-bulk-import',
      title: 'Bulk import',
      pageRoute: '/admin/bulk-import',
      iconName: 'Upload',
      description: 'High-speed CSV batch ingestion engine: import hundreds of students, faculty, departments, or questions with automated validation and error reports.',
      quickTips: [
        'Always download the official CSV template before preparing your upload spreadsheet.',
        'The validator catches duplicate emails, missing roll numbers, and invalid department codes before database insertion.',
        'If rows fail validation, download the error log CSV, correct the marked rows, and re-upload only the corrected rows.'
      ],
      faqs: [
        {
          id: 'adm-bulk-students',
          question: 'How do I bulk-import hundreds of students into batches using a CSV file?',
          shortDescription: 'Onboard entire incoming cohorts in minutes without manual data entry.',
          purpose: 'Save dozens of administrative hours during annual college admissions.',
          steps: [
            'Click "Bulk import" in the navigation sidebar.',
            'Select import category: "Students Intake".',
            'Click "Download CSV Template" to obtain the standardized spreadsheet header format.',
            'Populate the CSV with: `RollNumber`, `FullName`, `Email`, `DepartmentCode`, `BatchName`, and `Phone`.',
            'Drag and drop the completed file into the "Upload File" dropzone.',
            'Click "Validate Records".',
            'Review the validation summary (e.g., "120 valid records, 0 errors").',
            'Click "Commit Import".'
          ],
          expectedResult: 'All 120 student accounts are created, mapped to their batches, and welcome invitation emails are queued.',
          noteOrWarning: {
            type: 'warning',
            text: 'Ensure Roll Numbers are unique per institution; duplicate roll numbers will be rejected by the validation engine.'
          },
          relatedFeatures: ['Users & roles', 'Departments & batches']
        },
        {
          id: 'adm-bulk-troubleshoot',
          question: 'How do I resolve validation errors when an import file is rejected?',
          shortDescription: 'Diagnose and fix CSV formatting errors, syntax issues, or duplicate records.',
          purpose: 'Prevent corrupted data from entering the database while ensuring rapid resolution.',
          steps: [
            'If the validator detects errors, review the "Validation Error Summary" table.',
            'Click "Download Error Log (CSV)" to download a copy of the failed rows annotated with exact error messages (e.g., "Row 14: Invalid Email Format", "Row 22: Department Code \'MECH\' does not exist").',
            'Fix the indicated errors in your local spreadsheet.',
            'Upload the corrected file and click "Re-validate & Commit".'
          ],
          expectedResult: 'Clean data is imported with zero orphaned records or database constraints violations.',
          relatedFeatures: ['Departments & batches', 'Users & roles']
        }
      ]
    }
  ]
};
