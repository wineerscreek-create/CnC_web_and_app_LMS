import type { RoleManual } from './types';

export const studentGuide: RoleManual = {
  role: 'STUDENT',
  roleLabel: 'Student',
  portalTitle: 'Student Learning Portal',
  description: 'Comprehensive step-by-step instructions for navigating courses, assessments, live sessions, offline study, and career preparation tools.',
  homeRoute: '/student/dashboard',
  modules: [
    {
      id: 'student-dashboard',
      title: 'Dashboard',
      pageRoute: '/student/dashboard',
      iconName: 'LayoutGrid',
      description: 'The student home view displaying daily schedules, overall completion metrics, upcoming quizzes, and quick action banners.',
      quickTips: [
        'Check the Top Announcement banner daily for institution notices.',
        'Use the "Resume Learning" button to instantly pick up your last lesson.',
        'Keep track of your current attendance streak shown in the activity card.'
      ],
      faqs: [
        {
          id: 'std-dash-overview',
          question: 'How do I interpret my dashboard summary and study metrics?',
          shortDescription: 'Understand enrolled courses, total hours spent, attendance rate, and pending evaluations.',
          purpose: 'Provide a quick snapshot of academic health and daily tasks.',
          steps: [
            'Log into your student account to land on the primary Dashboard.',
            'Review the top KPI cards: Enrolled Courses, Attendance %, Completed Quizzes, and Overall Score.',
            'Check the "Upcoming Deadlines" feed to note tests and assignments scheduled in the next 48 hours.',
            'Click on any KPI card to jump directly to its detailed breakdown page.'
          ],
          expectedResult: 'You gain immediate visibility into urgent tasks and overall progress without digging through menus.',
          noteOrWarning: {
            type: 'note',
            text: 'Metrics update automatically after every completed quiz or verified attendance session.'
          },
          relatedFeatures: ['My Learning', 'Progress', 'Live Classes']
        },
        {
          id: 'std-dash-resume',
          question: 'How do I jump back into my active course directly from the dashboard?',
          shortDescription: 'Resume your in-progress course video or reading material in one click.',
          purpose: 'Save time by directly navigating to the exact module you were previously studying.',
          steps: [
            'Locate the "Continue Learning" banner on the top-left section of the dashboard.',
            'Review the course title, current module name, and completion percentage shown on the card.',
            'Click the high-contrast "Resume Lesson" button.',
            'The system loads the course player right where you left off.'
          ],
          expectedResult: 'The course player launches at the specific timestamp or lesson section previously saved.',
          relatedFeatures: ['My Learning', 'Progress']
        },
        {
          id: 'std-dash-notifications',
          question: 'Where can I see announcements and trainer messages?',
          shortDescription: 'Access real-time alerts regarding test cancellations, new batches, or class schedule adjustments.',
          purpose: 'Ensure you never miss vital timing changes or exam announcements.',
          steps: [
            'Inspect the "Important Notice" carousel situated at the top of the dashboard.',
            'Click the left/right arrow icons to browse multiple notices.',
            'To view individual notification alerts, click the Bell icon in the top navigation bar.',
            'Click "Mark all read" once you have acknowledged your pending alerts.'
          ],
          expectedResult: 'You stay up to date with official departmental communications and batch advisories.',
          noteOrWarning: {
            type: 'tip',
            text: 'Urgent proctoring or schedule changes will also trigger a notification badge on the Bell icon.'
          },
          relatedFeatures: ['Live Classes', 'Assessments']
        }
      ]
    },
    {
      id: 'student-learning',
      title: 'My Learning',
      pageRoute: '/student/learning',
      iconName: 'BookOpen',
      description: 'Your central course curriculum, video lectures, modular notes, and syllabus progress tracker.',
      quickTips: [
        'Mark lessons as complete after finishing video modules to unlock subsequent chapters.',
        'Use the course search filter to find specific topics across multi-week curriculums.',
        'Download attached lecture notes and source code samples for offline practice.'
      ],
      faqs: [
        {
          id: 'std-learn-access',
          question: 'How do I browse my assigned courses and start learning?',
          shortDescription: 'Navigate course modules, watch video lessons, and read accompanying study materials.',
          purpose: 'Study structured curriculum modules assigned by your institution or chosen by you.',
          steps: [
            'Click "My Learning" in the left sidebar navigation.',
            'Select the active tab: "In Progress", "Completed", or "All Courses".',
            'Click on any course card to open the Course Outline view.',
            'Click on a chapter topic to load the lecture player and reading notes.',
            'Use the sidebar inside the player to jump between chapters or review attachments.'
          ],
          expectedResult: 'The course video streams with playback controls, speed toggles, and chapter checkpoints.',
          relatedFeatures: ['Progress', 'eBooks', 'Assessments']
        },
        {
          id: 'std-learn-complete-topic',
          question: 'How do I mark topics as finished and track module completion?',
          shortDescription: 'Record your study milestones so your trainer and HOD can verify curriculum compliance.',
          purpose: 'Keep accurate completion stats and unlock dependent modules or tests.',
          steps: [
            'Watch the required video lesson to completion or read the document fully.',
            'Scroll to the bottom of the content container.',
            'Click the green "Mark as Completed" button.',
            'Verify that a green checkmark appears beside the topic title in the chapter list.'
          ],
          expectedResult: 'Your course progress bar advances, and the next sequential lesson or assessment unlocks.',
          noteOrWarning: {
            type: 'note',
            text: 'Some courses require passing a checkpoint quiz before subsequent chapters become accessible.'
          },
          relatedFeatures: ['Progress', 'Assessments']
        },
        {
          id: 'std-learn-download-resources',
          question: 'How can I download slides, lecture notes, and exercise files?',
          shortDescription: 'Access supplementary files attached to courses by your trainers.',
          purpose: 'Keep reference materials handy on your local device.',
          steps: [
            'Inside the course player, look for the "Resources & Attachments" tab below the video.',
            'Browse the list of attached PDF summaries, zip code files, or reference links.',
            'Click the Download icon beside the desired asset.',
            'Save the file to your computer or mobile storage.'
          ],
          expectedResult: 'The asset downloads to your default download directory for offline revision.',
          relatedFeatures: ['eBooks', 'Offline Library']
        }
      ]
    },
    {
      id: 'student-ebooks',
      title: 'eBooks',
      pageRoute: '/student/ebooks',
      iconName: 'BookOpen',
      description: 'A curated digital library of textbooks, programming references, industry guides, and syllabus companions.',
      quickTips: [
        'Use the built-in search bar to filter books by author, publisher, or subject keyword.',
        'Take advantage of bookmarking inside the PDF reader to bookmark key exam revision chapters.',
        'Check the "Offline Available" tag if you intend to read without an active internet connection.'
      ],
      faqs: [
        {
          id: 'std-ebooks-read',
          question: 'How do I open and read an eBook in the integrated web reader?',
          shortDescription: 'Open curriculum textbooks with smooth page turning, zoom, and table of contents support.',
          purpose: 'Read digital textbooks seamlessly on desktop or tablet without third-party PDF viewers.',
          steps: [
            'Click "eBooks" on the navigation sidebar.',
            'Search for the book title or filter by category (e.g., Computer Science, Mechanical).',
            'Click the "Read Now" button on the book cover card.',
            'Use the toolbar to zoom in/out, fit to width, or jump to a specific page number.',
            'Open the Table of Contents drawer to jump directly to specific chapters.'
          ],
          expectedResult: 'The eBook renders in high definition with responsive text reflow and page navigation.',
          relatedFeatures: ['Offline Library', 'My Learning']
        },
        {
          id: 'std-ebooks-bookmark',
          question: 'How do I bookmark pages or search keywords inside an eBook?',
          shortDescription: 'Quickly find critical definitions and save reference pages for revision.',
          purpose: 'Enhance revision speed before upcoming quizzes and university semester exams.',
          steps: [
            'While reading an eBook, click the "Search" (magnifying glass) icon on the reader header.',
            'Type the keyword or concept name and press Enter to see all page matches.',
            'Click any result to jump directly to that page with highlights.',
            'Click the "Bookmark" icon on the top right to save the current page to your reading list.'
          ],
          expectedResult: 'You can instantly access saved bookmarks from the "Bookmarks" drawer anytime.',
          relatedFeatures: ['Offline Library']
        }
      ]
    },
    {
      id: 'student-chat',
      title: 'Chat with Mentor',
      pageRoute: '/student/chat',
      iconName: 'MessageSquare',
      description: 'Real-time messaging channels with your assigned batch trainer, academic mentors, and peer discussion groups.',
      quickTips: [
        'Use batch channels for collaborative questions and private direct messages for personal academic help.',
        'You can paste code snippets or attach homework screenshots for rapid debugging assistance.',
        'Respect trainer consultation hours as published in your batch syllabus.'
      ],
      faqs: [
        {
          id: 'std-chat-send',
          question: 'How do I ask my trainer a question or message my batch group?',
          shortDescription: 'Participate in classroom channels and send direct messages to faculty.',
          purpose: 'Get timely doubts resolved directly by subject experts.',
          steps: [
            'Select "Chat with Mentor" from the sidebar.',
            'Select your batch channel from the conversation list on the left.',
            'Type your query in the message box at the bottom.',
            'To format code, wrap your snippet in backticks or click the Code icon.',
            'Click the Send icon or hit Enter to post your message.'
          ],
          expectedResult: 'Your message appears in real time, and notifications are sent to the channel members.',
          noteOrWarning: {
            type: 'tip',
            text: 'Always include specific code errors or question numbers so your mentor can reply faster.'
          },
          relatedFeatures: ['Live Classes', 'My Batches']
        },
        {
          id: 'std-chat-attachment',
          question: 'How do I upload an image or error screenshot in the chat?',
          shortDescription: 'Share visual errors, assignment drafts, and screenshots with your mentor.',
          purpose: 'Enable trainers to quickly diagnose syntax or calculation errors.',
          steps: [
            'Click the Paperclip (attachment) icon beside the chat input bar.',
            'Select your PNG, JPG, or PDF file from your computer.',
            'Add an optional caption explaining what happens when you run your program.',
            'Click "Upload & Send".'
          ],
          expectedResult: 'The image preview renders in the chat thread where mentors can zoom and annotate.',
          relatedFeatures: ['Assignments', 'Practice']
        }
      ]
    },
    {
      id: 'student-games',
      title: 'Games',
      pageRoute: '/student/games',
      iconName: 'Gamepad2',
      description: 'Gamified cognitive challenges, code puzzles, memory drills, and aptitude speed trials designed to sharpen core technical skills.',
      quickTips: [
        'Compete in daily challenges to earn bonus platform XP and leaderboard ranks.',
        'Games reinforce data structures, logic gates, and verbal reasoning in a stress-free format.',
        'Track your weekly win streak on the top scoreboard.'
      ],
      faqs: [
        {
          id: 'std-games-play',
          question: 'How do I play educational games and earn leaderboard XP?',
          shortDescription: 'Engage with gamified puzzles to strengthen conceptual retention.',
          purpose: 'Gamified learning boosts algorithmic intuition and speed-solving capabilities.',
          steps: [
            'Click "Games" from the sidebar navigation.',
            'Browse game categories such as "Syntax Sprint", "Logic Labyrinth", or "Memory Matrix".',
            'Click "Play Now" on any unlocked challenge.',
            'Read the rules and time limit shown on the pre-game countdown screen.',
            'Complete rounds to score points and build combos.'
          ],
          expectedResult: 'Your round score is logged, platform XP is awarded, and your leaderboard rank refreshes.',
          relatedFeatures: ['Achievements', 'Progress']
        },
        {
          id: 'std-games-leaderboard',
          question: 'How do I view the batch and college-wide game leaderboards?',
          shortDescription: 'Compare your performance against peers in your department and campus.',
          purpose: 'Encourage friendly competition and continuous learning.',
          steps: [
            'Navigate to the Games page.',
            'Switch to the "Leaderboard" tab at the top.',
            'Select your filter: "Batch Top 10", "Department", or "All-College".',
            'Find your name highlighted with your rank, total score, and winning streak.'
          ],
          expectedResult: 'Displays live leaderboard standings updated as peers complete game trials.',
          relatedFeatures: ['Achievements']
        }
      ]
    },
    {
      id: 'student-practice',
      title: 'Practice',
      pageRoute: '/student/practice',
      iconName: 'Target',
      description: 'Self-paced practice arena featuring coding sandboxes, mock aptitude drills, MCQ banks, and interview prep questions.',
      quickTips: [
        'Practice problems do not affect your formal grade, so experiment freely.',
        'Review the detailed solution explanation after submitting each practice problem.',
        'Filter questions by difficulty: Beginner, Intermediate, or Advanced.'
      ],
      faqs: [
        {
          id: 'std-practice-code',
          question: 'How do I use the interactive online code compiler to solve practice problems?',
          shortDescription: 'Write, compile, test, and submit code in Python, Java, C++, and JavaScript directly in the browser.',
          purpose: 'Build algorithmic coding skills without needing local compiler installations.',
          steps: [
            'Click "Practice" in the navigation sidebar.',
            'Select "Coding Arena" and choose a problem (e.g., "Two Sum", "Binary Search").',
            'Read the problem statement, constraints, and sample input/output examples.',
            'Choose your preferred programming language from the top-right language dropdown.',
            'Write your solution in the code editor window.',
            'Click "Run Code" to execute against sample test cases.',
            'When sample tests pass, click "Submit Solution" to run against hidden edge cases.'
          ],
          expectedResult: 'The execution console displays stdout output, runtime duration, memory usage, and Pass/Fail verification.',
          noteOrWarning: {
            type: 'tip',
            text: 'If your code fails, inspect the "Failed Test Case" tab to see expected vs. actual output.'
          },
          relatedFeatures: ['Assessments', 'Resume Analyzer']
        },
        {
          id: 'std-practice-aptitude',
          question: 'How do I practice aptitude and quantitative reasoning MCQs?',
          shortDescription: 'Take timed practice sets on quantitative analysis, logical reasoning, and verbal ability.',
          purpose: 'Prepare thoroughly for corporate campus placement screening rounds.',
          steps: [
            'Navigate to the Practice section and click "Aptitude Drills".',
            'Select a sub-topic (e.g., Number Series, Data Interpretation, Syllogisms).',
            'Select number of questions (10, 20, or 30) and click "Start Drill".',
            'Select your answers within the allotted timer.',
            'Click "Submit Drill" to view comprehensive explanations and shortcut formulas.'
          ],
          expectedResult: 'Displays an accuracy score breakdown with step-by-step mathematical solutions.',
          relatedFeatures: ['Assessments', 'Resume Analyzer']
        }
      ]
    },
    {
      id: 'student-live-classes',
      title: 'Live Classes',
      pageRoute: '/student/live-classes',
      iconName: 'Video',
      description: 'Schedule of upcoming interactive video webinars, live trainer sessions, lecture recordings, and attendance verification.',
      quickTips: [
        'Join 5 minutes before the scheduled start time to test your audio and video.',
        'Attendance is automatically recorded during live meetings; stay for the required minimum duration.',
        'Access past session recordings from the "Past Recordings" tab within 24 hours of class completion.'
      ],
      faqs: [
        {
          id: 'std-live-join',
          question: 'How do I join an ongoing or scheduled live class session?',
          shortDescription: 'Connect to live video lectures conducted by your batch trainers.',
          purpose: 'Participate in interactive lectures, live Q&A, and real-time screen sharing.',
          steps: [
            'Click "Live Classes" from the navigation sidebar.',
            'Check the "Upcoming & Active Sessions" list.',
            'When a class is active, the status pill turns green to show "LIVE NOW".',
            'Click the prominent "Join Class" button.',
            'Allow browser microphone and camera permissions if requested.',
            'Enter the live meeting room.'
          ],
          expectedResult: 'You enter the live classroom video stream with chat, raise hand, and screen share controls.',
          noteOrWarning: {
            type: 'warning',
            text: 'Do not close or mute the tab unexpectedly; attendance tracking monitors continuous active engagement.'
          },
          relatedFeatures: ['Today\'s Classes', 'Progress', 'Chat with Mentor']
        },
        {
          id: 'std-live-recordings',
          question: 'How can I watch past class recordings if I missed a live lecture?',
          shortDescription: 'Stream archive recordings of previous lectures on demand.',
          purpose: 'Catch up on missed syllabus topics or review complex concepts before examinations.',
          steps: [
            'Navigate to the "Live Classes" page.',
            'Click the "Recorded Sessions" tab.',
            'Filter by course name, trainer, or date range.',
            'Click on any session card and press "Play Recording".',
            'Use the video player controls to adjust playback speed up to 2x.'
          ],
          expectedResult: 'The full video and shared screen recording plays with synchronized transcript timestamps.',
          relatedFeatures: ['My Learning', 'eBooks']
        }
      ]
    },
    {
      id: 'student-assessments',
      title: 'Assessments',
      pageRoute: '/student/assessments',
      iconName: 'ClipboardList',
      description: 'Proctored quizzes, midterm exams, coding challenges, evaluation results, and attempt history.',
      quickTips: [
        'Ensure a stable internet connection and webcam permissions before starting any proctored quiz.',
        'Never switch browser tabs or minimize the window during an exam; warnings are tracked strictly.',
        'Answers auto-save every few seconds; you can safely resume if temporary network drops occur.'
      ],
      faqs: [
        {
          id: 'std-assess-take',
          question: 'How do I start a scheduled assessment and pass the proctoring verification?',
          shortDescription: 'Complete webcam checks, accept examination honor codes, and begin the test.',
          purpose: 'Complete formal evaluated tests under secure institutional examination standards.',
          steps: [
            'Navigate to "Assessments" from the sidebar.',
            'Locate the assessment card under "Scheduled / Available Tests".',
            'Click "Start Assessment".',
            'When prompted by your browser, click "Allow" to grant Webcam permissions.',
            'Ensure your face is centered in the camera preview frame until the border turns green.',
            'Read the assessment rules (duration, negative marking, tab-switch penalty).',
            'Check the confirmation box: "I agree to follow the examination code of conduct."',
            'Click "Proceed to Questions".'
          ],
          expectedResult: 'The fullscreen assessment interface opens, the countdown timer starts, and question #1 loads.',
          noteOrWarning: {
            type: 'warning',
            text: 'Leaving the assessment tab triggers a 20-second grace countdown. If you fail to return, your test is auto-submitted.'
          },
          relatedFeatures: ['Progress', 'Achievements', 'Feedback']
        },
        {
          id: 'std-assess-submit',
          question: 'How do I navigate questions, save answers, and submit the final assessment?',
          shortDescription: 'Use the question palette to jump between questions, flag for review, and submit.',
          purpose: 'Ensure every answered question is securely recorded before time expires.',
          steps: [
            'Select your answer option (for MCQs) or type code/text in the editor.',
            'Notice the "Saved" indicator confirms instant cloud synchronization.',
            'Click "Next" to proceed, or click "Mark for Review" if you want to revisit it later.',
            'Check the Question Palette on the right: Green = Answered, Yellow = Marked for Review, Grey = Unvisited.',
            'When finished, click the "Submit Assessment" button on the top right.',
            'Confirm the submission prompt showing your total answered questions.'
          ],
          expectedResult: 'The submission confirms instantly. If immediate feedback is configured, your score is displayed.',
          noteOrWarning: {
            type: 'note',
            text: 'When the timer hits 00:00, the system automatically saves your current state and submits your attempt.'
          },
          relatedFeatures: ['Progress', 'Achievements']
        },
        {
          id: 'std-assess-feedback',
          question: 'How do I submit feedback after completing a quiz or examination?',
          shortDescription: 'Rate exam difficulty, clarity of questions, and report any technical issues.',
          purpose: 'Help academic faculties identify ambiguous questions or technical glitches.',
          steps: [
            'Immediately following assessment submission, the "Quiz Feedback" dialog opens.',
            'Select your 1 to 5 star rating for overall experience.',
            'Choose difficulty perception: "Too Easy", "Fair & Balanced", or "Too Hard".',
            'Type optional feedback or note specific question numbers that had typos.',
            'Click "Submit Feedback".'
          ],
          expectedResult: 'Your anonymous feedback is delivered directly to the trainer and department head analytics.',
          relatedFeatures: ['Progress']
        }
      ]
    },
    {
      id: 'student-progress',
      title: 'Progress',
      pageRoute: '/student/progress',
      iconName: 'BarChart3',
      description: 'Comprehensive academic analytics: attendance trends, subject-wise mastery curves, quiz averages, and percentile rankings.',
      quickTips: [
        'Hover over the weekly attendance chart to see specific dates you were marked Present or Absent.',
        'Identify weak subject topics highlighted in red in the "Skill Breakdown" radar.',
        'Export your academic progress summary as a PDF report for parent-teacher reviews.'
      ],
      faqs: [
        {
          id: 'std-prog-view',
          question: 'How do I review my academic growth, score trends, and topic mastery?',
          shortDescription: 'Analyze your learning curve across subjects, modules, and tests.',
          purpose: 'Pinpoint specific areas needing revision before campus placement drives.',
          steps: [
            'Click "Progress" in the navigation sidebar.',
            'Examine the "Overall Performance Index" score at the top.',
            'Scroll through the "Topic Mastery" graph: topics colored green represent strong mastery (>80%), yellow moderate (50-79%), and red needs improvement (<50%).',
            'Click on any low-scoring topic to jump directly to recommended practice questions.'
          ],
          expectedResult: 'Interactive charts provide clear diagnostic feedback on where your revision time is best invested.',
          relatedFeatures: ['Practice', 'Assessments', 'Achievements']
        },
        {
          id: 'std-prog-attendance',
          question: 'How do I track my overall and course-wise attendance percentages?',
          shortDescription: 'Ensure you meet the mandatory 75% or 85% attendance criteria set by your college.',
          purpose: 'Avoid exam debarment due to insufficient attendance.',
          steps: [
            'On the Progress page, scroll down to the "Attendance Analytics" widget.',
            'Review the gauge chart displaying your current overall attendance percentage.',
            'Examine the per-batch list to see specific attended vs. conducted sessions.',
            'If your percentage drops near the warning threshold (75%), an alert banner warns you of required classes.'
          ],
          expectedResult: 'You always know exact class counts needed to stay comfortably above attendance thresholds.',
          noteOrWarning: {
            type: 'note',
            text: 'Attendance syncs automatically every midnight based on live class logs and manual trainer roll calls.'
          },
          relatedFeatures: ['Live Classes', 'Dashboard']
        }
      ]
    },
    {
      id: 'student-achievements',
      title: 'Achievements',
      pageRoute: '/student/achievements',
      iconName: 'Award',
      description: 'Certificates of completion, course badges, honor roll listings, and verifiable digital credentials.',
      quickTips: [
        'Completed course certificates include a verifiable cryptographic QR code.',
        'Share your verified certificates directly to LinkedIn with one click.',
        'Collect special badges for 100% quiz scores, 30-day learning streaks, and speed coding.'
      ],
      faqs: [
        {
          id: 'std-achieve-cert',
          question: 'How do I view, download, and share my verified course certificates?',
          shortDescription: 'Obtain official credentials proving completion of training programs.',
          purpose: 'Enhance your resume and LinkedIn profile with validated institutional credentials.',
          steps: [
            'Click "Achievements" in the navigation sidebar.',
            'Locate the completed course under "Earned Certificates".',
            'Click the "View Certificate" button to inspect the full certificate preview.',
            'Click "Download PDF" to save a print-ready vector certificate.',
            'Click "Add to LinkedIn Profile" to auto-populate the certificate ID and issuer URL.'
          ],
          expectedResult: 'A verified credential PDF is downloaded, complete with institution seal and validation URL.',
          relatedFeatures: ['My Learning', 'Resume Analyzer']
        },
        {
          id: 'std-achieve-badges',
          question: 'How do I unlock skill badges and climb the platform honor roll?',
          shortDescription: 'Earn recognition for consistent daily practice and high quiz rankings.',
          purpose: 'Motivate continuous upskilling through gamified milestones.',
          steps: [
            'Go to the Achievements page and select the "Badges & Milestones" tab.',
            'Review unlocked badges (full color) and locked badges (grayed out with requirements).',
            'Hover over any locked badge to read the unlock criteria (e.g., "Solve 50 Dynamic Programming problems").',
            'Complete the specified actions across Practice, Learning, and Quizzes to unlock them.'
          ],
          expectedResult: 'Unlocked badges show up on your public student profile and class leaderboards.',
          relatedFeatures: ['Games', 'Practice']
        }
      ]
    },
    {
      id: 'student-payments',
      title: 'Payments',
      pageRoute: '/student/payments',
      iconName: 'CreditCard',
      description: 'Tuition invoice records, course fee receipts, payment gateway integrations, and subscription status.',
      quickTips: [
        'Always download and store the PDF receipt after completing fee transactions.',
        'All payment transactions are encrypted using 256-bit SSL via authorized gateways.',
        'Check pending fee installments and due dates in the "Outstanding Dues" summary card.'
      ],
      faqs: [
        {
          id: 'std-pay-invoice',
          question: 'How do I pay tuition fees, course materials, or certification exam fees online?',
          shortDescription: 'Complete secure payments using UPI, credit cards, debit cards, or net banking.',
          purpose: 'Pay university or training program fees without visiting the college bursar office.',
          steps: [
            'Click "Payments" in the navigation sidebar.',
            'Review any pending invoice in the "Outstanding Invoices" table.',
            'Click "Pay Now" beside the unpaid bill.',
            'Select your payment method: UPI (Google Pay, PhonePe), Credit/Debit Card, or Net Banking.',
            'Complete the OTP or UPI app confirmation.',
            'Wait for the transaction success screen before closing the window.'
          ],
          expectedResult: 'The invoice status updates immediately to "PAID" and an invoice receipt number is issued.',
          noteOrWarning: {
            type: 'warning',
            text: 'Do not click back or refresh during payment gateway processing to avoid double deduction.'
          },
          relatedFeatures: ['My Profile & Plan']
        },
        {
          id: 'std-pay-receipt',
          question: 'How do I download tax invoices and previous payment receipts?',
          shortDescription: 'Retrieve official fee receipts for scholarship verification or reimbursement.',
          purpose: 'Provide proof of payment to university accounts or sponsors.',
          steps: [
            'Navigate to the Payments page.',
            'Scroll to the "Payment History & Invoices" table.',
            'Find the completed transaction by date or transaction ID.',
            'Click the "Download PDF Receipt" icon in the Actions column.'
          ],
          expectedResult: 'A formal invoice containing GSTIN, institution registration number, and breakdown downloads.',
          relatedFeatures: ['My Profile & Plan']
        }
      ]
    },
    {
      id: 'student-offline',
      title: 'Offline Library',
      pageRoute: '/student/offline',
      iconName: 'HardDrive',
      description: 'Locally cached lecture notes, downloaded PDF chapters, offline practice sets, and sync status for low-connectivity environments.',
      quickTips: [
        'Download required chapters when connected to campus Wi-Fi before traveling.',
        'Cached items are stored securely inside your browser storage without requiring external software.',
        'Click "Sync Now" when you return online to submit offline practice answers.'
      ],
      faqs: [
        {
          id: 'std-offline-cache',
          question: 'How do I save eBooks, notes, and study guides for offline reading?',
          shortDescription: 'Store critical study material locally so you can study without internet access.',
          purpose: 'Enable continuous learning during commutes or in low-connectivity areas.',
          steps: [
            'While viewing any eBook or study guide, look for the "Make Available Offline" toggle.',
            'Toggle the switch to ON; the progress bar tracks local download storage.',
            'Navigate to "Offline Library" in the sidebar to verify the item is saved.',
            'You can now disconnect your Wi-Fi and open the item anytime.'
          ],
          expectedResult: 'The document opens instantly from local device storage without consuming cellular data.',
          noteOrWarning: {
            type: 'note',
            text: 'Clearing your browser cache or using incognito mode removes offline saved assets.'
          },
          relatedFeatures: ['eBooks', 'My Learning']
        },
        {
          id: 'std-offline-manage',
          question: 'How do I manage offline storage space and remove old files?',
          shortDescription: 'Free up local browser disk space when cached materials are no longer required.',
          purpose: 'Keep your browser storage fast and uncluttered.',
          steps: [
            'Click "Offline Library" on the sidebar.',
            'Check the "Storage Used" meter at the top (e.g., 42 MB of 500 MB used).',
            'Find the outdated course notes or completed books.',
            'Click the Trash / Delete icon beside the item.',
            'Confirm removal from offline storage.'
          ],
          expectedResult: 'The selected files are deleted from local cache and storage space is freed immediately.',
          relatedFeatures: ['eBooks']
        }
      ]
    },
    {
      id: 'student-resume-analyzer',
      title: 'Resume Analyzer',
      pageRoute: '/student/resume-analyzer',
      iconName: 'FileText',
      description: 'AI-assisted resume screening tool providing ATS score matching, formatting checks, keyword suggestions, and skill gap analysis.',
      quickTips: [
        'Upload your resume in PDF or DOCX format for optimal ATS parsing accuracy.',
        'Paste the target Job Description to see an exact keyword compatibility percentage.',
        'Follow the actionable recommendations to rephrase generic bullets into quantified impact statements.'
      ],
      faqs: [
        {
          id: 'std-resume-upload',
          question: 'How do I scan my resume for ATS compliance and keyword matching?',
          shortDescription: 'Analyze your resume against corporate Applicant Tracking Systems (ATS) algorithms.',
          purpose: 'Maximize your chances of clearing initial resume shortlisting during campus recruitment.',
          steps: [
            'Click "Resume Analyzer" in the navigation sidebar.',
            'Click the "Upload Resume" dropzone and select your updated PDF file.',
            'Optionally, paste the job role description (e.g., "Junior React Developer") into the target JD box.',
            'Click "Analyze Resume".',
            'Wait a few seconds while the AI engine parses sections, skills, and metrics.'
          ],
          expectedResult: 'A detailed score card opens showing ATS Score (out of 100), Formatting Score, and Keyword Match %.',
          noteOrWarning: {
            type: 'tip',
            text: 'Aim for an ATS score above 80 before applying to top tier recruiters.'
          },
          relatedFeatures: ['Achievements', 'Practice']
        },
        {
          id: 'std-resume-fix-issues',
          question: 'How do I interpret recommendations and fix identified resume weaknesses?',
          shortDescription: 'Implement suggestions regarding missing keywords, weak action verbs, and structure.',
          purpose: 'Transform your resume into a compelling, professional document.',
          steps: [
            'Review the "Identified Issues" section below your ATS score.',
            'Check the "Missing Core Skills" list (e.g., Docker, SQL, REST APIs).',
            'Click "Suggested Improvements" to see revised phrasing for bullet points.',
            'Edit your master resume file locally to incorporate the suggestions.',
            'Click "Re-scan Resume" to verify your updated ATS score.'
          ],
          expectedResult: 'Your score increases and the issues list turns green as key competencies are addressed.',
          relatedFeatures: ['Achievements']
        }
      ]
    },
    {
      id: 'student-profile',
      title: 'My Profile & Plan',
      pageRoute: '/student/profile',
      iconName: 'UserCheck',
      description: 'Personal student credentials, enrolled college/department details, subscription plan tier, and account settings.',
      quickTips: [
        'Keep your phone number and alternate email updated to ensure you receive password reset links.',
        'Upload a professional profile photo; it is displayed on your attendance verification records.',
        'Verify your institutional Roll Number and Department mapping for accurate degree tracking.'
      ],
      faqs: [
        {
          id: 'std-prof-update',
          question: 'How do I update my personal contact details and profile picture?',
          shortDescription: 'Maintain accurate student contact and personal details.',
          purpose: 'Ensure college notifications, placement alerts, and certificates carry correct details.',
          steps: [
            'Click "My Profile & Plan" at the bottom of the sidebar, or select it from the Profile dropdown menu.',
            'Click "Edit Profile Details".',
            'Update your mobile phone number, secondary email, or personal bio.',
            'Click the camera icon on your avatar to upload a fresh passport-style photo.',
            'Click "Save Changes".'
          ],
          expectedResult: 'Your profile updates across all LMS portals and header navigation instantly.',
          noteOrWarning: {
            type: 'note',
            text: 'Official fields like Roll Number and Department are locked; contact your college Admin to rectify official enrollment errors.'
          },
          relatedFeatures: ['Dashboard', 'Achievements']
        },
        {
          id: 'std-prof-plan',
          question: 'How do I check my current plan tier and subscription validity?',
          shortDescription: 'Review active subscription features, expiration dates, and upgrade options.',
          purpose: 'Ensure uninterrupted access to premium courses, AI mock interviews, and practice compilers.',
          steps: [
            'Navigate to "My Profile & Plan".',
            'Switch to the "Subscription & Plan" tab.',
            'Review your current active tier (e.g., Campus Pro, Enterprise Scholar).',
            'Check valid until dates and included perks (unlimited video streaming, proctored mock exams).',
            'If your access is nearing expiry, click "Renew Plan" to initiate the renewal workflow.'
          ],
          expectedResult: 'Displays full entitlement breakdown and renewal options.',
          relatedFeatures: ['Payments']
        }
      ]
    }
  ]
};
