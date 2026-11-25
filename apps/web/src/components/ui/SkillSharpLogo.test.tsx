import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import {
  SkillSharpLogo,
  CNCLogo,
  WinnersCreekLogo,
  LogoVariant,
} from './SkillSharpLogo';

describe('SkillSharpLogo Component', () => {
  const variants: LogoVariant[] = [
    'full',
    'compact',
    'header',
    'navbar',
    'sidebar',
    'mobile',
    'footer',
    'auth',
    'invoice',
    'dashboard',
    'loading',
    'intro',
  ];

  variants.forEach((variant) => {
    it(`renders correctly for variant: ${variant}`, () => {
      const { container } = render(<SkillSharpLogo variant={variant} />);
      const img = screen.getByRole('img');
      expect(img).toBeDefined();

      const imageEl = container.querySelector('img');
      expect(imageEl).not.toBeNull();
      expect(imageEl?.getAttribute('src')).toBe('/images/skillsharp-logo-tight.png');
      expect(imageEl?.getAttribute('alt')).toContain('Winners Creek');
    });
  });

  it('CNCLogo and WinnersCreekLogo aliases resolve to SkillSharpLogo', () => {
    const { container: cncContainer } = render(<CNCLogo variant="header" />);
    expect(cncContainer.querySelector('img')?.getAttribute('src')).toBe('/images/skillsharp-logo-tight.png');

    const { container: wcContainer } = render(<WinnersCreekLogo variant="footer" />);
    expect(wcContainer.querySelector('img')?.getAttribute('src')).toBe('/images/skillsharp-logo-tight.png');
  });

  it('supports custom className and priority loading', () => {
    const { container } = render(
      <SkillSharpLogo variant="auth" className="custom-test-logo" priority />
    );
    const wrapper = container.querySelector('.custom-test-logo');
    expect(wrapper).not.toBeNull();

    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('eager');
  });
});
