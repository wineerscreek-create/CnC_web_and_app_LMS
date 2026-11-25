export interface EediIndexEntry {
  name: string;
  code: string;
  pillar: string;
  databaseId: string | null;
  description: string;
}

/** Generated directly from PostgreSQL evaluation_parameters (102 records). */
export const EEDI_INDEX_REGISTRY: EediIndexEntry[] = [
  {
    "name": "Punctuality",
    "code": "BEH01",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Arrives on time for sessions and submissions"
  },
  {
    "name": "Attendance discipline",
    "code": "BEH02",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Consistent participation across the cycle"
  },
  {
    "name": "Classroom conduct",
    "code": "BEH03",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Respectful, attentive behaviour in sessions"
  },
  {
    "name": "Grooming & presentation",
    "code": "BEH04",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Appropriate personal presentation"
  },
  {
    "name": "Integrity",
    "code": "BEH05",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Honest work, no plagiarism or misrepresentation"
  },
  {
    "name": "Receptiveness to feedback",
    "code": "BEH06",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Acts on trainer feedback constructively"
  },
  {
    "name": "Peer respect",
    "code": "BEH07",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Treats peers with courtesy and inclusion"
  },
  {
    "name": "Digital etiquette",
    "code": "BEH08",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Appropriate conduct in online sessions and chats"
  },
  {
    "name": "Task ownership",
    "code": "BEH09",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Takes responsibility without prompting"
  },
  {
    "name": "Emotional regulation",
    "code": "BEH10",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Handles setbacks and criticism calmly"
  },
  {
    "name": "Consistency",
    "code": "BEH11",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Sustains effort across the programme"
  },
  {
    "name": "Deadline adherence",
    "code": "BEH12",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Meets committed dates"
  },
  {
    "name": "Initiative in class",
    "code": "BEH13",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Volunteers, asks questions, participates"
  },
  {
    "name": "Professional boundaries",
    "code": "BEH14",
    "pillar": "behaviour",
    "databaseId": null,
    "description": "Appropriate conduct with faculty and peers"
  },
  {
    "name": "Resume quality",
    "code": "CAR01",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Clear, quantified, well-structured CV"
  },
  {
    "name": "Interview readiness",
    "code": "CAR02",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Performs in mock interview conditions"
  },
  {
    "name": "HR question handling",
    "code": "CAR03",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Handles behavioural questions well"
  },
  {
    "name": "Technical interview handling",
    "code": "CAR04",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Thinks aloud under technical questioning"
  },
  {
    "name": "Group discussion performance",
    "code": "CAR05",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Effective in GD rounds"
  },
  {
    "name": "Aptitude test performance",
    "code": "CAR06",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Scores well on aptitude rounds"
  },
  {
    "name": "Industry awareness",
    "code": "CAR07",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Knows the sector and roles"
  },
  {
    "name": "Company research habit",
    "code": "CAR08",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Prepares for specific employers"
  },
  {
    "name": "Career goal clarity",
    "code": "CAR09",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Has a defined, realistic target"
  },
  {
    "name": "Professional networking",
    "code": "CAR10",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Builds and uses professional contacts"
  },
  {
    "name": "Workplace etiquette",
    "code": "CAR11",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Understands professional norms"
  },
  {
    "name": "Portfolio / projects",
    "code": "CAR12",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Has demonstrable work to show"
  },
  {
    "name": "Salary & offer literacy",
    "code": "CAR13",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Understands offers and negotiation basics"
  },
  {
    "name": "Onboarding readiness",
    "code": "CAR14",
    "pillar": "career_readiness",
    "databaseId": null,
    "description": "Ready to be productive in a first role"
  },
  {
    "name": "Verbal clarity",
    "code": "COM01",
    "pillar": "communication",
    "databaseId": null,
    "description": "Words and sentences are easy to follow"
  },
  {
    "name": "Pronunciation",
    "code": "COM02",
    "pillar": "communication",
    "databaseId": null,
    "description": "Sounds are formed clearly and correctly"
  },
  {
    "name": "Fluency",
    "code": "COM03",
    "pillar": "communication",
    "databaseId": null,
    "description": "Speech flows without excessive hesitation"
  },
  {
    "name": "Vocabulary range",
    "code": "COM04",
    "pillar": "communication",
    "databaseId": null,
    "description": "Uses precise, varied word choice"
  },
  {
    "name": "Grammar accuracy",
    "code": "COM05",
    "pillar": "communication",
    "databaseId": null,
    "description": "Spoken and written grammar is correct"
  },
  {
    "name": "Listening comprehension",
    "code": "COM06",
    "pillar": "communication",
    "databaseId": null,
    "description": "Understands and responds to what was asked"
  },
  {
    "name": "Active listening behaviour",
    "code": "COM07",
    "pillar": "communication",
    "databaseId": null,
    "description": "Signals attention, paraphrases, checks understanding"
  },
  {
    "name": "Email writing",
    "code": "COM08",
    "pillar": "communication",
    "databaseId": null,
    "description": "Structure, tone and clarity in email"
  },
  {
    "name": "Report writing",
    "code": "COM09",
    "pillar": "communication",
    "databaseId": null,
    "description": "Organised, evidence-led written work"
  },
  {
    "name": "Presentation delivery",
    "code": "COM10",
    "pillar": "communication",
    "databaseId": null,
    "description": "Pace, projection and audience contact"
  },
  {
    "name": "Visual aid usage",
    "code": "COM11",
    "pillar": "communication",
    "databaseId": null,
    "description": "Slides support rather than replace the message"
  },
  {
    "name": "Group discussion contribution",
    "code": "COM12",
    "pillar": "communication",
    "databaseId": null,
    "description": "Adds substance without dominating"
  },
  {
    "name": "Question handling",
    "code": "COM13",
    "pillar": "communication",
    "databaseId": null,
    "description": "Answers follow-ups directly and calmly"
  },
  {
    "name": "Non-verbal communication",
    "code": "COM14",
    "pillar": "communication",
    "databaseId": null,
    "description": "Posture, gesture and expression support the message"
  },
  {
    "name": "Storytelling & structure",
    "code": "COM15",
    "pillar": "communication",
    "databaseId": null,
    "description": "Frames answers with a clear arc"
  },
  {
    "name": "Concise summarising",
    "code": "COM16",
    "pillar": "communication",
    "databaseId": null,
    "description": "Compresses detail without losing meaning"
  },
  {
    "name": "Audience adaptation",
    "code": "COM17",
    "pillar": "communication",
    "databaseId": null,
    "description": "Adjusts register for the listener"
  },
  {
    "name": "Filler-word control",
    "code": "COM18",
    "pillar": "communication",
    "databaseId": null,
    "description": "Minimal um/uh/like under pressure"
  },
  {
    "name": "Self-introduction",
    "code": "CNF01",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Introduces self clearly and convincingly"
  },
  {
    "name": "Eye contact",
    "code": "CNF02",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Maintains appropriate eye contact"
  },
  {
    "name": "Voice modulation",
    "code": "CNF03",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Varies tone and emphasis purposefully"
  },
  {
    "name": "Body language",
    "code": "CNF04",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Open, steady, purposeful physical presence"
  },
  {
    "name": "Composure under pressure",
    "code": "CNF05",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Stays steady when challenged"
  },
  {
    "name": "Willingness to volunteer",
    "code": "CNF06",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Steps forward in group settings"
  },
  {
    "name": "Handling criticism",
    "code": "CNF07",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Receives critique without defensiveness"
  },
  {
    "name": "Opinion assertion",
    "code": "CNF08",
    "pillar": "confidence",
    "databaseId": null,
    "description": "States a view and supports it"
  },
  {
    "name": "Self-awareness",
    "code": "CNF09",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Accurate about own strengths and gaps"
  },
  {
    "name": "Stage presence",
    "code": "CNF10",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Commands attention when presenting"
  },
  {
    "name": "Recovery from error",
    "code": "CNF11",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Regains flow after a mistake"
  },
  {
    "name": "Decisiveness",
    "code": "CNF12",
    "pillar": "confidence",
    "databaseId": null,
    "description": "Commits to a position or choice"
  },
  {
    "name": "Resume walkthrough",
    "code": "INT01",
    "pillar": "interview",
    "databaseId": null,
    "description": "Explains past experience and projects cohesively"
  },
  {
    "name": "HR question readiness",
    "code": "INT02",
    "pillar": "interview",
    "databaseId": null,
    "description": "Answers common behavioral and HR questions with clarity"
  },
  {
    "name": "Technical articulation",
    "code": "INT03",
    "pillar": "interview",
    "databaseId": null,
    "description": "Explains technical reasoning and problem solving step-by-step"
  },
  {
    "name": "Question handling",
    "code": "INT04",
    "pillar": "interview",
    "databaseId": null,
    "description": "Handles unscripted follow-up questions calmly"
  },
  {
    "name": "Team collaboration",
    "code": "LDR01",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Works productively with others"
  },
  {
    "name": "Initiative",
    "code": "LDR02",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Starts work without being told"
  },
  {
    "name": "Delegation",
    "code": "LDR03",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Distributes work sensibly"
  },
  {
    "name": "Conflict resolution",
    "code": "LDR04",
    "pillar": "leadership",
    "databaseId": null,
    "description": "De-escalates and resolves disagreement"
  },
  {
    "name": "Motivating peers",
    "code": "LDR05",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Lifts the group's energy and focus"
  },
  {
    "name": "Decision making",
    "code": "LDR06",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Makes reasoned choices under constraint"
  },
  {
    "name": "Accountability",
    "code": "LDR07",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Owns outcomes, including failures"
  },
  {
    "name": "Mentoring others",
    "code": "LDR08",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Helps peers improve"
  },
  {
    "name": "Meeting facilitation",
    "code": "LDR09",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Runs a discussion to a useful end"
  },
  {
    "name": "Planning & organisation",
    "code": "LDR10",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Sequences work sensibly"
  },
  {
    "name": "Influence without authority",
    "code": "LDR11",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Persuades peers on merit"
  },
  {
    "name": "Role flexibility",
    "code": "LDR12",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Adapts between leading and supporting"
  },
  {
    "name": "Stakeholder awareness",
    "code": "LDR13",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Considers who is affected by a decision"
  },
  {
    "name": "Feedback to peers",
    "code": "LDR14",
    "pillar": "leadership",
    "databaseId": null,
    "description": "Gives useful, kind, specific feedback"
  },
  {
    "name": "Problem comprehension",
    "code": "PRB01",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Understands what is actually being asked"
  },
  {
    "name": "Analytical reasoning",
    "code": "PRB02",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Breaks problems into parts"
  },
  {
    "name": "Logical reasoning",
    "code": "PRB03",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Sound deduction and inference"
  },
  {
    "name": "Quantitative aptitude",
    "code": "PRB04",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Numerical and data reasoning"
  },
  {
    "name": "Creative thinking",
    "code": "PRB05",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Generates non-obvious options"
  },
  {
    "name": "Structured approach",
    "code": "PRB06",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Works to a method rather than by guesswork"
  },
  {
    "name": "Edge-case thinking",
    "code": "PRB07",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Considers what could break"
  },
  {
    "name": "Time-bound problem solving",
    "code": "PRB08",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Performs under a clock"
  },
  {
    "name": "Trade-off evaluation",
    "code": "PRB09",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Weighs competing options"
  },
  {
    "name": "Root-cause analysis",
    "code": "PRB10",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Finds causes, not just symptoms"
  },
  {
    "name": "Attention to detail",
    "code": "PRB11",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Catches errors and inconsistencies"
  },
  {
    "name": "Priority setting",
    "code": "PRB12",
    "pillar": "problem_solving",
    "databaseId": null,
    "description": "Does the most important thing first"
  },
  {
    "name": "Core subject knowledge",
    "code": "TEC01",
    "pillar": "technical",
    "databaseId": null,
    "description": "Command of the fundamentals"
  },
  {
    "name": "Programming fundamentals",
    "code": "TEC02",
    "pillar": "technical",
    "databaseId": null,
    "description": "Language and syntax competence"
  },
  {
    "name": "Data structures",
    "code": "TEC03",
    "pillar": "technical",
    "databaseId": null,
    "description": "Chooses and applies suitable structures"
  },
  {
    "name": "Algorithms",
    "code": "TEC04",
    "pillar": "technical",
    "databaseId": null,
    "description": "Designs and analyses solutions"
  },
  {
    "name": "Database concepts",
    "code": "TEC05",
    "pillar": "technical",
    "databaseId": null,
    "description": "Modelling and querying competence"
  },
  {
    "name": "Operating systems",
    "code": "TEC06",
    "pillar": "technical",
    "databaseId": null,
    "description": "Processes, memory, concurrency basics"
  },
  {
    "name": "Networking basics",
    "code": "TEC07",
    "pillar": "technical",
    "databaseId": null,
    "description": "Protocols and layering fundamentals"
  },
  {
    "name": "Debugging skill",
    "code": "TEC08",
    "pillar": "technical",
    "databaseId": null,
    "description": "Isolates and fixes defects methodically"
  },
  {
    "name": "Code quality",
    "code": "TEC09",
    "pillar": "technical",
    "databaseId": null,
    "description": "Readable, maintainable work"
  },
  {
    "name": "Tooling proficiency",
    "code": "TEC10",
    "pillar": "technical",
    "databaseId": null,
    "description": "Version control, editors, build tools"
  },
  {
    "name": "Project execution",
    "code": "TEC11",
    "pillar": "technical",
    "databaseId": null,
    "description": "Delivers a working artefact"
  },
  {
    "name": "Technical documentation",
    "code": "TEC12",
    "pillar": "technical",
    "databaseId": null,
    "description": "Explains work in writing"
  },
  {
    "name": "Technical explanation",
    "code": "TEC13",
    "pillar": "technical",
    "databaseId": null,
    "description": "Explains a concept to a listener"
  },
  {
    "name": "Continuous learning",
    "code": "TEC14",
    "pillar": "technical",
    "databaseId": null,
    "description": "Keeps skills current independently"
  }
];
