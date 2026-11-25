import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { Sidebar } from './sidebar';
import { SkillSharpLogo } from '@/components/ui/SkillSharpLogo';

vi.mock('next/navigation', () => ({
  usePathname: () => '/trainer/dashboard',
}));

describe('Global Logo Navigation & Fallback', () => {
  const roles = ['STUDENT', 'TRAINER', 'ADMIN', 'SUPER_ADMIN'] as const;

  roles.forEach((role) => {
    it(`Sidebar logo links to "/" for role ${role} while keeping Dashboard nav intact`, () => {
      render(
        <Sidebar
          user={{
            id: 'u-1',
            name: 'Test User',
            email: 'test@example.com',
            role,
            avatarColor: '#6366f1',
          } as any}
          open={true}
          onClose={() => {}}
        />
      );
      const logoLink = screen.getByRole('link', { name: /go to winners creek homepage/i });
      expect(logoLink.getAttribute('href')).toBe('/');
    });
  });

  it('SkillSharpLogo falls back to secondary asset and monogram when image fails', () => {
    const { container } = render(<SkillSharpLogo variant="loading" priority />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/images/skillsharp-logo-tight.png');

    if (img) {
      fireEvent.error(img);
      expect(img.getAttribute('src')).toBe('/images/winnerscreek.png');
      fireEvent.error(img);
    }
    expect(screen.getByText('WC · LMS')).toBeDefined();
  });
});
