'use client';

import { usePathname } from 'next/navigation';
import { PortalPage, RouteGuard } from '@/components/auth/route-guard';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // If the student is taking an active assessment (/student/assessments/[quizId]), remove all LMS elements (PortalShell)
  const isAssessmentTaking = Boolean(pathname?.match(/^\/student\/assessments\/[^/]+$/));

  if (isAssessmentTaking) {
    return <RouteGuard allow="STUDENT">{children}</RouteGuard>;
  }

  return (
    <PortalPage allow="STUDENT" searchPlaceholder="Search courses, practice, assessments…">
      {children}
    </PortalPage>
  );
}
