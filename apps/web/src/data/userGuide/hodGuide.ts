import type { RoleManual } from './types';

export const hodGuide: RoleManual = {
  role: 'HOD',
  roleLabel: 'Head of Department (HOD)',
  portalTitle: 'Department Head Administrative & Academic Workspace',
  description: 'Departmental governance, faculty workload distribution, student attendance compliance, accreditation audits, and batch performance monitoring.',
  homeRoute: '/hod/dashboard',
  modules: [
    {
      id: 'hod-dashboard',
      title: 'Dashboard',
      pageRoute: '/hod/dashboard',
      iconName: 'LayoutGrid',
      description: 'Departmental executive overview: student enrollment totals, faculty teaching loads, department attendance benchmarks, and academic alerts.',
      quickTips: [
        'Review the departmental attendance gauge to spot cohorts slipping below NBA/NAAC criteria.',
        'Inspect the faculty teaching load distribution widget to ensure balanced scheduling.',
        'Click on the critical alerts badge to view urgent examination or compliance matters.'
      ],
      faqs: [
        {
          id: 'hod-dash-kpi',
          question: 'How do I review overall departmental performance metrics and key indicators?',
          shortDescription: 'Examine student counts, active batches, faculty roster, and aggregate attendance.',
          purpose: 'Provide department leadership with continuous visibility into educational quality and compliance.',
          steps: [
            'Log into your HOD account to access the Department Workspace Dashboard.',
            'Review top KPI cards: Total Department Students, Active Batches, Faculty Members, and Overall Attendance Rate.',
            'Inspect the "Batches at Risk" table to identify specific cohorts falling behind syllabus schedules.',
            'Click on any metric card to jump into the relevant granular management section.'
          ],
          expectedResult: 'You gain immediate insight into department-wide health, attendance trends, and faculty activity.',
          relatedFeatures: ['Participants', 'Session Attendance', 'Trainers']
        },
        {
          id: 'hod-dash-alerts',
          question: 'How do I address department-wide academic alerts and student escalations?',
          shortDescription: 'Triage student grievances, proctoring red flags, and trainer absence notices.',
          purpose: 'Resolve operational issues rapidly before they impact academic calendars.',
          steps: [
            'Locate the "Department Alerts & Notices" container on the dashboard.',
            'Review alerts tagged with severity badges (Critical, Moderate, Info).',
            'Click on an alert to view involved batches, trainers, or students.',
            'Take action: click "Acknowledge", "Assign to Faculty", or "Dismiss with Note".'
          ],
          expectedResult: 'Alert is processed and logged into the department audit trail.',
          relatedFeatures: ['Trainers', 'Reports']
        }
      ]
    },
    {
      id: 'hod-participants',
      title: 'Participants',
      pageRoute: '/hod/participants',
      iconName: 'Users',
      description: 'Complete student directory across all departmental batches with academic trajectories, attendance audits, and parent contact information.',
      quickTips: [
        'Filter students by batch, semester, or academic status (Active, On Leave, Detained).',
        'Use the search bar to locate students instantly by Roll Number or University Registration ID.',
        'Export departmental student master lists for university examination board registrations.'
      ],
      faqs: [
        {
          id: 'hod-part-search',
          question: 'How do I find a student and inspect their complete departmental record?',
          shortDescription: 'Search student records, verify batch assignments, and inspect academic history.',
          purpose: 'Handle student academic advising, verification requests, and disciplinary reviews.',
          steps: [
            'Click "Participants" in the HOD navigation sidebar.',
            'Type the student’s name, roll number, or email into the search bar.',
            'Click on the student row in the results table.',
            'Review the drawer: Enrolled Courses, Attendance %, Assessment Scores, and Behavioral Notes logged by trainers.'
          ],
          expectedResult: 'Displays full academic dossier isolated strictly to your department.',
          noteOrWarning: {
            type: 'note',
            text: 'HODs have view and audit permissions across all students belonging to their assigned department.'
          },
          relatedFeatures: ['Session Attendance', 'Skill Assessment', 'Enrollment']
        },
        {
          id: 'hod-part-detention',
          question: 'How do I flag or review students subject to exam debarment due to low attendance?',
          shortDescription: 'Generate the official provisional debarment list for students below 75% attendance.',
          purpose: 'Enforce university academic guidelines fairly and transparently.',
          steps: [
            'On the Participants page, click the "Attendance Filter" dropdown and select "< 75% Attendance".',
            'Review the generated list of students with critical attendance shortages.',
            'Click "Export Debarment Warning Letters" to generate formal parent notification notices.',
            'Review trainer counseling notes to check if medical exemptions have been approved.'
          ],
          expectedResult: 'Produces a verified list of attendance-shortage students with logged justifications.',
          relatedFeatures: ['Session Attendance', 'Reports']
        }
      ]
    },
    {
      id: 'hod-attendance',
      title: 'Session Attendance',
      pageRoute: '/hod/attendance',
      iconName: 'CalendarCheck',
      description: 'Departmental attendance governance: daily session verification, cross-batch compliance monitoring, and historical attendance modifications.',
      quickTips: [
        'Verify that all scheduled classes have had attendance submitted by faculty before end of day.',
        'Review the "Unmarked Sessions" counter to follow up with trainers who missed roll call.',
        'Approve or decline retrospective attendance correction requests submitted by trainers.'
      ],
      faqs: [
        {
          id: 'hod-att-audit',
          question: 'How do I audit daily faculty attendance submissions across all department batches?',
          shortDescription: 'Monitor whether faculty members are conducting and recording attendance punctually.',
          purpose: 'Ensure complete, non-repudiable attendance records for accreditation and university inspections.',
          steps: [
            'Click "Session Attendance" in the navigation sidebar.',
            'Select the Date or Date Range and choose "All Batches" or a specific batch.',
            'Examine the session log table: Scheduled Time, Batch, Trainer, and Submission Status (Submitted, Pending, Late).',
            'Click on any session to review student-level presence marks and camera check-ins.'
          ],
          expectedResult: 'Immediate transparency into faculty punctuality and attendance compliance.',
          relatedFeatures: ['Trainers', 'Reports']
        },
        {
          id: 'hod-att-override',
          question: 'How do I approve or execute an administrative attendance correction?',
          shortDescription: 'Adjust attendance records for authorized medical leaves, sports events, or campus drives.',
          purpose: 'Apply institutional sanctioned attendance exemptions with documented audit justification.',
          steps: [
            'From the Session Attendance view, click "Pending Correction Requests".',
            'Review the request submitted by the trainer or student with attached medical certificate or event duty slip.',
            'Click "Approve Exemption" or "Reject".',
            'Enter your mandatory HOD approval remark (e.g., "Approved for Inter-University Hackathon duty").',
            'Click "Confirm & Sign".'
          ],
          expectedResult: 'The student status updates to "Excused / On Duty", recalculating their official attendance without penalizing their percentage.',
          relatedFeatures: ['Participants', 'Reports']
        }
      ]
    },
    {
      id: 'hod-trainers',
      title: 'Trainers',
      pageRoute: '/hod/trainers',
      iconName: 'GraduationCap',
      description: 'Department faculty directory: workload distribution, class hours completed, student feedback ratings, and batch allocations.',
      quickTips: [
        'Review the Faculty Workload index to prevent trainer burnout and ensure balanced hours.',
        'Check student feedback ratings per trainer to identify faculty requiring instructional development.',
        'Allocate or reassign trainers to batches to match subject expertise.'
      ],
      faqs: [
        {
          id: 'hod-trn-workload',
          question: 'How do I inspect faculty teaching hours and schedule allocations?',
          shortDescription: 'Monitor weekly class hours, active batches, and syllabus completion velocity per trainer.',
          purpose: 'Optimize faculty resource utilization and adhere to UGC/AICTE teacher-student ratio guidelines.',
          steps: [
            'Click "Trainers" in the navigation sidebar.',
            'Review the summary cards for each department faculty member.',
            'Check "Weekly Lecture Hours" (e.g., 16/20 hours allocated) and "Assigned Batches".',
            'Click on any trainer to view their detailed timetable, upcoming classes, and past student feedback ratings.'
          ],
          expectedResult: 'Clear visibility into faculty distribution and curriculum delivery performance.',
          relatedFeatures: ['Dashboard', 'Reports']
        },
        {
          id: 'hod-trn-assign-batch',
          question: 'How do I assign or reassign a trainer to a departmental batch?',
          shortDescription: 'Map faculty to batches and courses for the upcoming academic semester.',
          purpose: 'Ensure every batch has qualified instructors assigned before semester commencement.',
          steps: [
            'On the Trainers page, click "Manage Batch Allocations".',
            'Select the target Batch and Course/Subject.',
            'Choose the primary Trainer from the faculty dropdown list.',
            'Optionally, assign a Secondary / Lab Co-Trainer.',
            'Click "Save Assignment & Send Notification".'
          ],
          expectedResult: 'The batch is mapped to the trainer’s portal and schedule calendars are updated immediately.',
          relatedFeatures: ['Trainers', 'Enrollment']
        }
      ]
    },
    {
      id: 'hod-assessments',
      title: 'Skill Assessment',
      pageRoute: '/hod/assessments',
      iconName: 'BarChart3',
      description: 'Departmental examination oversight: scheduled midterms, quiz results, malpractice logs, and accreditation score distributions.',
      quickTips: [
        'Review assessment question banks to ensure alignment with university course outcomes (COs).',
        'Audit high-malpractice alerts to ensure examination fairness and integrity.',
        'Examine score distribution curves to detect unusually high or low failure rates.'
      ],
      faqs: [
        {
          id: 'hod-assess-overview',
          question: 'How do I oversee departmental examinations and review batch score distributions?',
          shortDescription: 'Track pass percentages, average scores, and examination outcome attainment.',
          purpose: 'Ensure rigorous academic standards and evaluate Course Outcome (CO) achievement.',
          steps: [
            'Click "Skill Assessment" in the navigation sidebar.',
            'Browse active and completed assessments across all department batches.',
            'Click on an assessment title to open its Department Analysis view.',
            'Review the Bell Curve distribution: Highest Score, Class Average, Lowest Score, and Pass %.',
            'Compare performance between different sections/batches taking the same paper.'
          ],
          expectedResult: 'Visual analytics reveal batch discrepancies and curriculum mastery gaps across divisions.',
          relatedFeatures: ['Participants', 'Reports']
        },
        {
          id: 'hod-assess-audit-proctoring',
          question: 'How do I audit camera snapshots and proctoring violation logs for an exam?',
          shortDescription: 'Verify integrity evidence and review flag incidents before certifying final results.',
          purpose: 'Ensure complete fairness and rule on contested student malpractice incidents.',
          steps: [
            'Open the assessment from the Skill Assessment page.',
            'Click the "Proctoring Integrity Audit" tab.',
            'Review flagged students with high warning counts (> 3 tab switches or camera dropouts).',
            'Click "View Snapshot Reel" to inspect captured webcam photos during the test attempt.',
            'If cheating is verified, select "Disqualify Attempt" or "Issue Academic Warning".'
          ],
          expectedResult: 'The student record is formally marked with the HOD’s ruling and audit timestamp.',
          relatedFeatures: ['Skill Assessment', 'Reports']
        }
      ]
    },
    {
      id: 'hod-games',
      title: 'Games & Activities',
      pageRoute: '/hod/games',
      iconName: 'Gamepad2',
      description: 'Gamified cognitive learning analytics: departmental participation rates, inter-batch competitions, and skill aptitude benchmarking.',
      quickTips: [
        'Check departmental participation in daily coding puzzles and logic drills.',
        'Organize departmental coding hackathons or game challenges to boost campus engagement.',
        'Identify top algorithmic talent for inter-collegiate coding competitions.'
      ],
      faqs: [
        {
          id: 'hod-games-metrics',
          question: 'How do I analyze gamification metrics and student aptitude scores across batches?',
          shortDescription: 'Review engagement statistics and identify high-aptitude students.',
          purpose: 'Leverage gamified data to select teams for prestigious hackathons and recruitment drives.',
          steps: [
            'Click "Games & Activities" in the navigation sidebar.',
            'Review department engagement metrics: Total Challenges Solved, Active Gamers, and Average Speed.',
            'Switch to the "Department Leaderboard" tab to see top scoring students.',
            'Filter by specific skill categories (Data Structures, Quantitative Aptitude, Logic).'
          ],
          expectedResult: 'A ranked list of department students sorted by demonstrated problem-solving speed and accuracy.',
          relatedFeatures: ['Participants', 'Reports']
        }
      ]
    },
    {
      id: 'hod-enrollment',
      title: 'Enrollment',
      pageRoute: '/hod/enrollment',
      iconName: 'ClipboardList',
      description: 'Department student intake, batch division management, lateral entry registrations, and semester migration workflows.',
      quickTips: [
        'Review new semester enrollment rosters before classes begin.',
        'Manage section transfers and lateral entry student registrations smoothly.',
        'Ensure all enrolled students have active email accounts and verified roll numbers.'
      ],
      faqs: [
        {
          id: 'hod-enroll-batch-split',
          question: 'How do I organize incoming students into balanced batch sections?',
          shortDescription: 'Divide an incoming department semester cohort into sections (A, B, C) with equal strength.',
          purpose: 'Maintain optimal classroom lab sizes and balanced faculty workloads.',
          steps: [
            'Click "Enrollment" in the navigation sidebar.',
            'Select the Academic Year and Semester intake (e.g., "2026 - 3rd Semester").',
            'Click "Batch Allocation Wizard".',
            'Choose partitioning method: "By Roll Number", "Alphabetical", or "Merit-Balanced".',
            'Preview the section rosters and click "Confirm Batch Division".'
          ],
          expectedResult: 'Batches are generated, students are enrolled, and batch channels are created automatically.',
          relatedFeatures: ['Participants', 'Trainers']
        }
      ]
    },
    {
      id: 'hod-reports',
      title: 'Reports',
      pageRoute: '/hod/reports',
      iconName: 'FileSpreadsheet',
      description: 'Accreditation reporting engine: generate NBA/NAAC compliance summaries, Course Outcome (CO) attainment, and department semester performance dossiers.',
      quickTips: [
        'Generate accreditation packets containing attendance, assessment marks, and syllabus logs.',
        'Export all tables to Excel or print-ready PDF with institutional headers.',
        'Schedule automated monthly performance summaries delivered directly to your inbox.'
      ],
      faqs: [
        {
          id: 'hod-rep-accreditation',
          question: 'How do I generate an NBA/NAAC Course Outcome (CO-PO) attainment report?',
          shortDescription: 'Calculate outcome attainment percentages based on continuous internal evaluation marks.',
          purpose: 'Provide rigorous documentation required for national accreditation reviews.',
          steps: [
            'Click "Reports" in the navigation sidebar.',
            'Select report type: "Outcome Attainment Matrix (CO-PO)" or "Comprehensive Department Audit".',
            'Select Academic Year, Semester, and Course.',
            'Click "Calculate Attainment & Generate Report".',
            'Review the calculated attainment levels (Level 1, 2, 3) against target thresholds.',
            'Click "Export Full Accreditation Dossier (PDF)".'
          ],
          expectedResult: 'A comprehensive, multi-page accreditation-compliant PDF generates with charts and calculations.',
          relatedFeatures: ['Skill Assessment', 'Session Attendance']
        },
        {
          id: 'hod-rep-semester-summary',
          question: 'How do I export the semester academic performance summary for the College Principal?',
          shortDescription: 'Download departmental executive summaries highlighting results and faculty metrics.',
          purpose: 'Present key accomplishments and student pass percentages at governing body meetings.',
          steps: [
            'Navigate to "Reports" and click "Executive Semester Summary".',
            'Select your department and target semester.',
            'Review key sections: Enrolled Strength, Pass Percentage, Faculty Workloads, and Placement Readiness Scores.',
            'Click "Download Executive PDF".'
          ],
          expectedResult: 'A polished, executive-ready document compiles ready for leadership presentation.',
          relatedFeatures: ['Dashboard', 'Participants']
        }
      ]
    }
  ]
};
