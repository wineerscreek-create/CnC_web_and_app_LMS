import type { RoleManual } from './types';

export const trainerGuide: RoleManual = {
  role: 'TRAINER',
  roleLabel: 'Trainer',
  portalTitle: 'Trainer Instruction & Management Portal',
  description: 'Step-by-step operational workflows for batch oversight, live classrooms, attendance tracking, proctored assessments, assignment grading, and student reports.',
  homeRoute: '/trainer/dashboard',
  modules: [
    {
      id: 'trainer-dashboard',
      title: 'Dashboard',
      pageRoute: '/trainer/dashboard',
      iconName: 'LayoutGrid',
      description: 'The trainer command center presenting daily class schedules, active batch summaries, pending grading queues, and rapid action shortcuts.',
      quickTips: [
        'Review the "Classes Today" timeline first thing every morning.',
        'Keep an eye on the "Pending Evaluations" counter to ensure timely feedback to students.',
        'Use quick action buttons to instantly launch attendance or initiate a quiz.'
      ],
      faqs: [
        {
          id: 'trn-dash-overview',
          question: 'How do I interpret my trainer dashboard metrics and upcoming tasks?',
          shortDescription: 'Understand active batches, assigned student totals, pending submissions, and today\'s schedule.',
          purpose: 'Provide trainers with high-level operational clarity at the start of each working day.',
          steps: [
            'Log into your Trainer account to access the primary Dashboard.',
            'Review top metric cards: Total Assigned Batches, Active Students, Classes Today, and Pending Submissions.',
            'Examine the "Classes Scheduled for Today" section to verify room links, batch names, and start times.',
            'Click on any pending queue item to jump directly to the relevant evaluation or grading screen.'
          ],
          expectedResult: 'You gain an immediate, actionable summary of your daily teaching obligations and grading workload.',
          relatedFeatures: ['Today\'s Classes', 'My Batches', 'Evaluations']
        },
        {
          id: 'trn-dash-quick-actions',
          question: 'How do I start a class or launch a quick quiz directly from the dashboard?',
          shortDescription: 'Use rapid shortcut buttons without navigating through multi-level menus.',
          purpose: 'Minimize downtime between classroom sessions.',
          steps: [
            'Locate the "Quick Actions" bar on the top-right of the dashboard.',
            'Click "Start Meeting" to launch your assigned live virtual classroom.',
            'Click "Take Attendance" to open the attendance session for your current time block.',
            'Click "Create Assessment" to launch the multi-step test creation wizard.'
          ],
          expectedResult: 'The application navigates directly into the target execution workflow with pre-filled trainer context.',
          relatedFeatures: ['Attendance', 'Today\'s Classes', 'Assessments']
        }
      ]
    },
    {
      id: 'trainer-batches',
      title: 'My Batches',
      pageRoute: '/trainer/batches',
      iconName: 'Users',
      description: 'Directory of institutional cohorts, batch schedules, syllabus progress, and enrolled student rosters assigned to you.',
      quickTips: [
        'Click on a batch card to drill down into student rosters and curriculum completion.',
        'Filter batches by "Active", "Upcoming", or "Archived" to maintain focus.',
        'Export batch roster CSVs for offline record keeping or university audits.'
      ],
      faqs: [
        {
          id: 'trn-batch-view',
          question: 'How do I view my assigned batches and student rosters?',
          shortDescription: 'Browse cohorts, examine batch strengths, and review syllabus milestones.',
          purpose: 'Manage multiple student cohorts across different departments or corporate clients.',
          steps: [
            'Click "My Batches" in the trainer navigation sidebar.',
            'Filter by department or program if teaching across multiple domains.',
            'Click on any Batch card (e.g., "CSE-2026-Batch-A").',
            'Switch between the "Students", "Curriculum Progress", and "Schedule" tabs inside the batch view.',
            'Review individual student enrollment status, roll numbers, and attendance averages.'
          ],
          expectedResult: 'A detailed batch breakdown opens displaying all enrolled learners and curriculum status.',
          relatedFeatures: ['Participants', 'Attendance', 'Course Progress']
        },
        {
          id: 'trn-batch-message',
          question: 'How do I send a batch-wide announcement or syllabus update?',
          shortDescription: 'Broadcast important notifications to all students enrolled in a specific batch.',
          purpose: 'Inform entire cohorts of test dates, project deadlines, or syllabus adjustments.',
          steps: [
            'Navigate to "My Batches" and select the desired batch.',
            'Click the "Broadcast Notice" button on the batch header.',
            'Type your announcement subject and body text.',
            'Attach relevant documents or reference links if necessary.',
            'Click "Send Broadcast".'
          ],
          expectedResult: 'All enrolled students receive an immediate in-app notification and email advisory.',
          relatedFeatures: ['Messages', 'Alerts']
        }
      ]
    },
    {
      id: 'trainer-classes',
      title: "Today's Classes",
      pageRoute: '/trainer/classes',
      iconName: 'CalendarDays',
      description: 'Your real-time daily lecture timetable, virtual classroom links, session materials, and live streaming controls.',
      quickTips: [
        'Launch class 5 minutes before scheduled start time to set up screen sharing.',
        'Use the integrated whiteboarding and code-sharing tools during lecture delivery.',
        'Recording starts automatically upon host entry if cloud recording is enabled for the batch.'
      ],
      faqs: [
        {
          id: 'trn-class-launch',
          question: 'How do I launch and host a scheduled live class?',
          shortDescription: 'Start the video meeting, admit students, and share your screen.',
          purpose: 'Conduct interactive remote or hybrid lectures with seamless audio/video transmission.',
          steps: [
            'Click "Today\'s Classes" from the navigation sidebar.',
            'Locate the current class block highlighted with a "Scheduled" or "Ready" status badge.',
            'Click "Launch Classroom".',
            'Confirm microphone and webcam devices in the pre-flight check dialog.',
            'Click "Join Meeting as Host".',
            'Use in-meeting controls: screen sharing, breakout rooms, poll creation, and mute-all.'
          ],
          expectedResult: 'The interactive classroom session activates, and joining links become live for students.',
          noteOrWarning: {
            type: 'note',
            text: 'Ensure browser hardware acceleration is enabled for smooth screen sharing at 60 FPS.'
          },
          relatedFeatures: ['Attendance', 'Live Classes', 'My Batches']
        },
        {
          id: 'trn-class-reschedule',
          question: 'How do I reschedule a lecture or notify students of a timing change?',
          shortDescription: 'Adjust class timings and alert enrolled participants.',
          purpose: 'Accommodate departmental timetable adjustments or unexpected emergencies.',
          steps: [
            'On "Today\'s Classes", find the lecture you need to adjust.',
            'Click the three-dots menu on the class card and select "Reschedule".',
            'Select the new date, start time, and duration.',
            'Enter a brief reason for rescheduling (e.g., "Campus placement mock drive in progress").',
            'Click "Update & Notify Students".'
          ],
          expectedResult: 'The timetable updates immediately and push notifications are dispatched to enrolled students.',
          relatedFeatures: ['Alerts', 'Messages']
        }
      ]
    },
    {
      id: 'trainer-attendance',
      title: 'Attendance',
      pageRoute: '/trainer/attendance',
      iconName: 'CalendarCheck',
      description: 'Session attendance registry, biometric/camera presence logs, manual roll call overrides, and batch attendance exports.',
      quickTips: [
        'Attendance records are grouped by batch and date; filter by batch for rapid access.',
        'Mark students as Present, Absent, Late, or Excused with single-click toggles.',
        'Always click "Save Attendance" after making manual edits to sync changes to student records.'
      ],
      faqs: [
        {
          id: 'trn-att-create-session',
          question: 'How do I record attendance for a completed class session?',
          shortDescription: 'Conduct manual roll call or verify automated virtual class attendance logs.',
          purpose: 'Maintain legally compliant institutional attendance records required for semester exams.',
          steps: [
            'Click "Attendance" in the navigation sidebar.',
            'Select your Batch from the batch selector dropdown.',
            'Select the class date and session slot.',
            'Click "Record / Review Attendance".',
            'The student list renders with their automated status (Present based on meeting minutes, or Unmarked).',
            'Click any student status badge (P / A / L / E) to adjust status if needed.',
            'Click the primary "Submit Attendance" button.'
          ],
          expectedResult: 'Attendance logs are locked, synced to student dashboards, and aggregated into departmental percentages.',
          noteOrWarning: {
            type: 'warning',
            text: 'Attendance sessions older than 7 days require HOD administrative approval to modify.'
          },
          relatedFeatures: ['Today\'s Classes', 'Participants', 'Reports']
        },
        {
          id: 'trn-att-export',
          question: 'How do I export the batch monthly attendance report to Excel or PDF?',
          shortDescription: 'Download formatted attendance spreadsheets showing daily marks and monthly percentages.',
          purpose: 'Provide physical attendance sheets for university inspection and internal records.',
          steps: [
            'Navigate to "Attendance" and select the desired Batch and Month.',
            'Click the "Export Report" button located at the top right of the table.',
            'Choose your format: "Excel (.xlsx)" or "PDF Document".',
            'The file compiles with student roll numbers, names, daily status marks, and overall percentage.'
          ],
          expectedResult: 'An Excel spreadsheet downloads with conditional formatting highlighting students below 75%.',
          relatedFeatures: ['Reports', 'My Batches']
        }
      ]
    },
    {
      id: 'trainer-students',
      title: 'Participants',
      pageRoute: '/trainer/students',
      iconName: 'GraduationCap',
      description: 'Detailed directory of all students across your batches with individual academic profiles, contact cards, and intervention flags.',
      quickTips: [
        'Use the "At Risk" filter to quickly identify students with falling attendance or failing grades.',
        'Click any student row to view their complete assessment history and submitted assignments.',
        'Add private trainer notes to student profiles to track behavioral or academic counseling.'
      ],
      faqs: [
        {
          id: 'trn-stud-profile',
          question: 'How do I inspect a student’s complete academic trajectory and quiz history?',
          shortDescription: 'View individual student quiz attempts, warning logs, attendance rate, and submissions.',
          purpose: 'Prepare for 1-on-1 academic counseling and identify conceptual learning roadblocks.',
          steps: [
            'Click "Participants" in the navigation sidebar.',
            'Use the search bar to find the student by Name or Roll Number.',
            'Click on the student row to open their 360-degree Academic Profile drawer.',
            'Review tabs: "Assessments", "Assignments", "Attendance History", and "Trainer Notes".',
            'Inspect specific test scores, including time taken and proctoring warnings recorded.'
          ],
          expectedResult: 'A comprehensive dossier of student performance displays without needing to cross-reference multiple sheets.',
          relatedFeatures: ['Evaluations', 'Assessments', 'My Batches']
        },
        {
          id: 'trn-stud-note',
          question: 'How do I record a confidential trainer observation note for a student?',
          shortDescription: 'Save internal counseling or behavioral notes accessible by faculty and HOD.',
          purpose: 'Document academic interventions, medical leaves, or extra coaching agreements.',
          steps: [
            'Open the student\'s Academic Profile drawer from the Participants page.',
            'Switch to the "Trainer Notes" tab.',
            'Click "Add Observation Note".',
            'Enter your note category (e.g., "Academic Counseling", "Attendance Warning") and description.',
            'Click "Save Note".'
          ],
          expectedResult: 'The note is stamped with your name and timestamp, visible to authorized trainers and HODs.',
          relatedFeatures: ['Participants', 'Alerts']
        }
      ]
    },
    {
      id: 'trainer-evaluations',
      title: 'Evaluations',
      pageRoute: '/trainer/evaluations',
      iconName: 'ClipboardCheck',
      description: 'The manual evaluation desk for grading descriptive coding answers, essay responses, and student project submissions.',
      quickTips: [
        'MCQ questions are graded automatically; this queue handles subjective and coding answers.',
        'Use built-in rubrics to maintain consistent, fair grading standards across your cohort.',
        'You can annotate student code submissions with inline comments.'
      ],
      faqs: [
        {
          id: 'trn-eval-grade-essay',
          question: 'How do I evaluate subjective essay or code submissions and assign marks?',
          shortDescription: 'Grade open-ended answers, apply rubric criteria, and provide written feedback.',
          purpose: 'Assess higher-order analytical thinking and technical depth beyond standard MCQs.',
          steps: [
            'Click "Evaluations" in the navigation sidebar.',
            'Select an assessment with pending subjective answers from the list.',
            'Click "Start Grading".',
            'Review the question prompt, sample answer rubric, and student’s written text or code.',
            'Enter the score achieved (e.g., 8 out of 10).',
            'Add constructive written feedback in the "Trainer Feedback" box.',
            'Click "Submit Grade & Next" to proceed to the next student.'
          ],
          expectedResult: 'Marks are committed to the database, recalculating the student\'s total assessment score and percentage.',
          relatedFeatures: ['Assessments', 'Assignments']
        },
        {
          id: 'trn-eval-bulk-release',
          question: 'How do I release graded evaluation results to students?',
          shortDescription: 'Publish scores and feedback once all batch submissions have been reviewed.',
          purpose: 'Ensure all students receive their scores simultaneously without early leaks.',
          steps: [
            'Navigate to "Evaluations" and select the assessment batch.',
            'Verify that "Pending Reviews" counter displays 0.',
            'Click the "Publish Evaluation Results" button at the top right.',
            'Confirm the dialog: "Publish grades to 45 students?".'
          ],
          expectedResult: 'Results are unlocked for student viewing, and automated email/in-app result notifications are sent.',
          relatedFeatures: ['Assessments', 'Reports']
        }
      ]
    },
    {
      id: 'trainer-assessments',
      title: 'Assessments',
      pageRoute: '/trainer/assessments',
      iconName: 'Target',
      description: 'End-to-end examination authoring, AI proctoring configuration, live monitoring dashboard, attempt recovery, and two-sheet Excel reporting.',
      quickTips: [
        'Configure proctoring settings (webcam enforcement, tab-switch tolerance) before publishing.',
        'Use the "Live Monitor" tab during test hours to detect offline or cheating students in real time.',
        'Export assessment results anytime: Sheet 1 contains results, and Sheet 2 contains camera snapshots.'
      ],
      faqs: [
        {
          id: 'trn-quiz-create',
          question: 'How do I create and schedule a new proctored assessment or quiz?',
          shortDescription: 'Build questions, configure duration, set negative marking, and schedule release times.',
          purpose: 'Author academic examinations and technical evaluations tailored to your course syllabus.',
          steps: [
            'Click "Assessments" from the navigation sidebar.',
            'Click the prominent "Create Assessment" button.',
            'Step 1: Enter Assessment Title, select Course/Batch, set Duration (minutes), and Passing Marks.',
            'Step 2: Add Questions manually (MCQ, Multi-select, Coding, Essay) or import via CSV/AI bank.',
            'Step 3: Configure Proctoring: Enable Webcam Snapshots, Tab-switch Limit, and Assessment Abandonment detection.',
            'Step 4: Set Schedule: Choose Start Date/Time and Expiration Date/Time.',
            'Click "Publish Assessment".'
          ],
          expectedResult: 'The assessment is scheduled, registered in the database, and visible on enrolled students\' calendars.',
          noteOrWarning: {
            type: 'note',
            text: 'You can save as "Draft" if you wish to review questions with your HOD before publishing.'
          },
          relatedFeatures: ['Evaluations', 'Reports', 'Course Progress']
        },
        {
          id: 'trn-quiz-live-monitor',
          question: 'How do I monitor active student attempts and handle tab-switch warnings live?',
          shortDescription: 'Observe real-time student statuses: IN_PROGRESS, OFFLINE, or SUBMITTED.',
          purpose: 'Maintain academic integrity and resolve student connection drops during live exams.',
          steps: [
            'From the Assessments list, click on an active ongoing assessment.',
            'Click the "Live Proctoring Monitor" tab.',
            'Review the live candidate grid showing real-time webcam previews and status indicators.',
            'If a student switches tabs or loses focus, a yellow or red warning badge flashes with the event timestamp.',
            'If a student is disconnected due to a power outage, click "Recover Attempt" to grant additional minutes or resume their test.'
          ],
          expectedResult: 'Real-time visibility into the exam room prevents malpractice and guarantees legitimate students are supported.',
          relatedFeatures: ['Evaluations', 'Alerts']
        },
        {
          id: 'trn-quiz-export-excel',
          question: 'How do I export the comprehensive 2-Sheet Excel report with camera snapshots?',
          shortDescription: 'Download the official Excel workbook containing Sheet 1 (Results) and Sheet 2 (Camera Snapshots).',
          purpose: 'Provide external accreditation bodies and college examiners with verifiable proctoring evidence.',
          steps: [
            'Navigate to "Assessments" and select the completed assessment.',
            'Open the "Results & Submissions" tab.',
            'Click the "Export to Excel" button.',
            'Open the downloaded `.xlsx` file.',
            'Examine Sheet 1 ("Results"): Contains Rank, Roll Number, Student Name, Marks, Percentage, Result, Warnings count, and Attempt ID.',
            'Examine Sheet 2 ("Camera Snapshots"): Contains Student Name, Roll Number, and embedded high-res webcam snapshots (1 to 10) captured during the test.'
          ],
          expectedResult: 'A fully formatted Excel workbook opens with properly sized images and complete scoring data.',
          relatedFeatures: ['Reports', 'Evaluations']
        },
        {
          id: 'trn-quiz-feedback-review',
          question: 'How do I inspect student feedback and ratings for a completed quiz?',
          shortDescription: 'Analyze student sentiment, perceived difficulty, and reported question bugs.',
          purpose: 'Refine question clarity and identify tricky questions that need syllabus re-teaching.',
          steps: [
            'From the Assessment details page, click the "Student Feedback" tab.',
            'Review overall metrics: Average Star Rating, Difficulty Breakdown (Easy/Fair/Hard), and total responses.',
            'Browse individual qualitative comments submitted by students.',
            'Review flagged questions to identify potential wording ambiguities.'
          ],
          expectedResult: 'Visual charts provide actionable insights to improve future examination question authoring.',
          relatedFeatures: ['Reports', 'Assessments']
        }
      ]
    },
    {
      id: 'trainer-assignments',
      title: 'Assignments',
      pageRoute: '/trainer/assignments',
      iconName: 'ClipboardList',
      description: 'Homework assignment management: file upload briefs, deadline enforcement, plagiarism indicators, and gradebooks.',
      quickTips: [
        'Set hard deadlines or allow late submissions with automated mark deductions.',
        'Upload starter code templates or assignment PDF briefs for students to download.',
        'Batch-download all student code submissions in a single ZIP file for offline checking.'
      ],
      faqs: [
        {
          id: 'trn-assign-create',
          question: 'How do I create and assign a new homework or project assignment?',
          shortDescription: 'Post assignments with file attachments, deadlines, and submission requirements.',
          purpose: 'Assign practical projects and lab homework to specific batches.',
          steps: [
            'Click "Assignments" in the navigation sidebar.',
            'Click the "Create Assignment" button.',
            'Enter Assignment Title, Target Batches, Max Score, and Due Date/Time.',
            'Write detailed assignment instructions or upload a PDF problem statement.',
            'Select accepted file types (e.g., `.zip`, `.py`, `.pdf`, `.docx`).',
            'Click "Publish Assignment".'
          ],
          expectedResult: 'The assignment appears on enrolled students\' dashboards with the submission deadline.',
          relatedFeatures: ['My Batches', 'Evaluations']
        },
        {
          id: 'trn-assign-download-zip',
          question: 'How do I bulk-download all student submissions for an assignment?',
          shortDescription: 'Download a consolidated ZIP archive containing organized student project files.',
          purpose: 'Review programming projects locally in an IDE or run automated test suites.',
          steps: [
            'Open the desired assignment from the Assignments list.',
            'Click "Submissions".',
            'Click the "Download All Submissions (ZIP)" button.',
            'The system packages each student\'s files into folders named by `[RollNumber]_[StudentName]`.',
            'Save and extract the ZIP file on your computer.'
          ],
          expectedResult: 'A clean, organized ZIP file downloads containing all submitted code files.',
          relatedFeatures: ['Evaluations']
        }
      ]
    },
    {
      id: 'trainer-ebooks',
      title: 'E-Books',
      pageRoute: '/trainer/ebooks',
      iconName: 'BookOpen',
      description: 'Faculty curriculum references, recommended reading lists, instructor manuals, and syllabus book assignments.',
      quickTips: [
        'Assign specific eBook chapters as required pre-reading before scheduled classes.',
        'Access instructor solution manuals and exercise answer keys restricted to trainer accounts.',
        'Verify that recommended books match current university syllabus editions.'
      ],
      faqs: [
        {
          id: 'trn-ebook-assign',
          question: 'How do I recommend or assign an eBook chapter to a batch?',
          shortDescription: 'Link digital textbooks directly to a batch\'s required reading list.',
          purpose: 'Guide student self-study with verified reference literature.',
          steps: [
            'Click "E-Books" in the navigation sidebar.',
            'Browse or search the library for the textbook.',
            'Click "Assign to Batch" on the book card.',
            'Select your target Batch, specify the Chapter numbers or page range, and set an optional completion date.',
            'Click "Confirm Assignment".'
          ],
          expectedResult: 'The book is pinned to the top of the students\' eBook portal with reading badges.',
          relatedFeatures: ['My Batches', 'Course Progress']
        }
      ]
    },
    {
      id: 'trainer-invitations',
      title: 'Course Invitations',
      pageRoute: '/trainer/invitations',
      iconName: 'Award',
      description: 'Administrative and corporate invitations to teach new courses, guest lecture requests, and batch contract approvals.',
      quickTips: [
        'Review syllabus requirements and hours before accepting new course teaching requests.',
        'Declining an invitation allows you to provide a scheduling conflict note back to the Admin.',
        'Accepted invitations automatically provision the course in your "My Batches" dashboard.'
      ],
      faqs: [
        {
          id: 'trn-inv-manage',
          question: 'How do I accept or decline teaching invitations for newly formed batches?',
          shortDescription: 'Review course curriculum details, schedule hours, and confirm assignments.',
          purpose: 'Authorize trainer-to-batch mappings in coordination with college administrators.',
          steps: [
            'Click "Course Invitations" from the navigation sidebar.',
            'Review incoming cards under "Pending Invitations".',
            'Inspect institution name, batch name, total student count, and requested schedule hours.',
            'Click "Accept Invitation" to confirm your availability, or "Decline" with an optional note.'
          ],
          expectedResult: 'Upon acceptance, the batch and its curriculum immediately synchronize into your trainer workspace.',
          relatedFeatures: ['My Batches', 'Today\'s Classes']
        }
      ]
    },
    {
      id: 'trainer-chat',
      title: 'Messages',
      pageRoute: '/trainer/chat',
      iconName: 'MessageSquare',
      description: 'Trainer communication center for batch discussion channels, direct student mentoring, and faculty coordination threads.',
      quickTips: [
        'Pin important discussion channels to keep active batches at the top of your inbox.',
        'Use thread replies to keep specific question discussions organized.',
        'Mute channels during personal hours; critical alerts will still arrive via official notifications.'
      ],
      faqs: [
        {
          id: 'trn-msg-channel',
          question: 'How do I manage batch channels and reply to student doubt threads?',
          shortDescription: 'Communicate with your class, share code snippets, and answer questions.',
          purpose: 'Facilitate collaborative learning and provide responsive academic support.',
          steps: [
            'Click "Messages" in the navigation sidebar.',
            'Select the active batch channel from your conversation list.',
            'Review recent questions posted by students.',
            'Click "Reply in Thread" to address a specific query without cluttering the main channel.',
            'Attach code files or diagrams as needed and click Send.'
          ],
          expectedResult: 'The response is posted in real time, notifying the asking student and watching peers.',
          relatedFeatures: ['My Batches', 'Participants']
        }
      ]
    },
    {
      id: 'trainer-games',
      title: 'Games',
      pageRoute: '/trainer/games',
      iconName: 'Gamepad2',
      description: 'Assign gamified logic drills, host live multiplayer coding quizzes, and inspect batch cognitive performance metrics.',
      quickTips: [
        'Host a live 10-minute code sprint game at the end of class to test concept retention.',
        'Review the game accuracy heatmap to identify concepts students struggled with.',
        'Award bonus participation marks to top leaderboard performers.'
      ],
      faqs: [
        {
          id: 'trn-games-host',
          question: 'How do I launch a live interactive coding game or quiz challenge for my batch?',
          shortDescription: 'Run real-time multiplayer classroom competitions with live leaderboards.',
          purpose: 'Increase classroom engagement and assess comprehension in an interactive format.',
          steps: [
            'Click "Games" in the trainer navigation sidebar.',
            'Select "Host Live Challenge" and choose a game template (e.g., "Algorithm Arena").',
            'Select your target Batch.',
            'Click "Generate Game PIN" and project the PIN on your classroom screen.',
            'As students join, click "Start Game".',
            'Watch live scores and podium ranks update on the instructor screen.'
          ],
          expectedResult: 'Engages learners in friendly competition while generating granular concept accuracy data.',
          relatedFeatures: ['My Batches', 'Today\'s Classes']
        }
      ]
    },
    {
      id: 'trainer-course-progress',
      title: 'Course Progress',
      pageRoute: '/trainer/course-progress',
      iconName: 'TrendingUp',
      description: 'Syllabus tracking dashboard: monitor chapter completion rates, hours taught vs. scheduled, and batch velocity.',
      quickTips: [
        'Mark syllabus topics as "Covered" after concluding each lecture session.',
        'Compare actual syllabus velocity against the planned university academic calendar.',
        'Share progress status with your HOD during monthly curriculum reviews.'
      ],
      faqs: [
        {
          id: 'trn-prog-track',
          question: 'How do I update syllabus completion milestones for my assigned courses?',
          shortDescription: 'Mark chapters as completed and verify cohort progression rates.',
          purpose: 'Ensure timely syllabus completion before end-semester examinations.',
          steps: [
            'Click "Course Progress" in the navigation sidebar.',
            'Select the Batch and Course.',
            'Locate the syllabus tree showing modules and individual topics.',
            'Click the checkbox beside the topic taught today.',
            'Enter the date taught and actual hours spent.',
            'Click "Update Milestone".'
          ],
          expectedResult: 'The overall batch progress percentage updates on trainer, student, and HOD dashboards.',
          relatedFeatures: ['My Batches', 'Today\'s Classes', 'Reports']
        }
      ]
    },
    {
      id: 'trainer-reports',
      title: 'Reports',
      pageRoute: '/trainer/reports',
      iconName: 'FileSpreadsheet',
      description: 'Comprehensive analytics generator: generate batch performance summaries, attendance trends, assessment averages, and student progress dossiers.',
      quickTips: [
        'Generate monthly reports before department faculty meetings.',
        'Filter reports by date range, batch, or specific assessment.',
        'Export options include PDF executive briefs and comprehensive Excel data sheets.'
      ],
      faqs: [
        {
          id: 'trn-rep-generate',
          question: 'How do I generate and export comprehensive batch performance reports?',
          shortDescription: 'Compile attendance rates, test scores, and assignment submissions into one report.',
          purpose: 'Provide institutional leadership and academic auditors with verified metrics.',
          steps: [
            'Click "Reports" in the navigation sidebar.',
            'Select report type: "Batch Academic Summary", "Attendance Audit", or "Assessment Distribution".',
            'Select the target Batch and date range.',
            'Click "Generate Report".',
            'Review the visual charts and summary tables.',
            'Click "Download as PDF" or "Export to Excel".'
          ],
          expectedResult: 'A comprehensive, publication-ready report downloads with institutional branding.',
          relatedFeatures: ['Attendance', 'Assessments', 'Evaluations']
        }
      ]
    },
    {
      id: 'trainer-alerts',
      title: 'Alerts',
      pageRoute: '/trainer/alerts',
      iconName: 'AlertTriangle',
      description: 'System alert center: monitor proctoring red flags, attendance deficit warnings, missed assignment deadlines, and system advisories.',
      quickTips: [
        'Resolve or acknowledge alerts daily to keep your notification feed manageable.',
        'Critical alerts (e.g. repeated exam tab-switching) require explicit trainer acknowledgement.',
        'Set custom threshold filters to flag students whose attendance drops below 75%.'
      ],
      faqs: [
        {
          id: 'trn-alert-resolve',
          question: 'How do I investigate and resolve student malpractice or low attendance alerts?',
          shortDescription: 'Review triggered warnings and take corrective action or counseling.',
          purpose: 'Act rapidly on academic risks before they impact student outcomes.',
          steps: [
            'Click "Alerts" in the navigation sidebar.',
            'Filter by severity: "Critical", "Warning", or "Info".',
            'Click on any alert (e.g., "Repeated Tab Switching - Assessment #14").',
            'Inspect event details: timestamp, student name, and recorded snapshot or log.',
            'Click "Acknowledge Alert" or "Schedule Counseling" to flag the student for follow-up.'
          ],
          expectedResult: 'The alert status changes to "Resolved", archiving the audit trail for institutional records.',
          relatedFeatures: ['Assessments', 'Participants', 'Attendance']
        }
      ]
    }
  ]
};
