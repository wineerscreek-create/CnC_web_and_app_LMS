import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/hod/participants',
}));

const dispatch = vi.fn();
vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({ ui: { sidebarOpen: false }, auth: { user: null } }),
}));

const hod = {
  id: '1',
  name: 'Priya Kulkarni',
  role: 'HOD',
  roleLabel: 'SPOC',
  collegeName: 'ABC Engineering College',
  departmentName: 'Computer Science',
  home: '/hod/dashboard',
} as any;

describe('portal sidebar', () => {
  it('marks the current page for assistive technology', () => {
    render(<Sidebar user={hod} open onClose={() => {}} />);
    const current = screen.getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent('Participants');
  });

  it('ensures out-of-scope items are completely excluded from sidebar', () => {
    render(<Sidebar user={hod} open onClose={() => {}} />);
    // "Other Departments" and "Other Colleges" must never appear in the HOD sidebar.
    expect(screen.queryByRole('link', { name: /other departments/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Other Departments')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Colleges')).not.toBeInTheDocument();
  });

  it('shows the HOD their scope so the boundary is never a guess', () => {
    render(<Sidebar user={hod} open onClose={() => {}} />);
    expect(screen.getByText(/data isolation active/i)).toBeInTheDocument();
  });

  it('gives a student their own navigation and none of the staff routes', () => {
    render(
      <Sidebar
        user={{ ...hod, role: 'STUDENT', roleLabel: 'Participant', home: '/student/dashboard' }}
        open
        onClose={() => {}}
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /practice/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /evaluations/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /audit/i })).not.toBeInTheDocument();
  });
});
