import { describe, expect, it } from 'vitest';
import {
  cssVariables,
  darkColors,
  glyphSvg,
  lightColors,
  lockupSvg,
  markSvg,
  normaliseCategory,
  placeCategories,
} from './index';

function luminance(hex: string) {
  const c = hex
    .replace('#', '')
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const l = c.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('design tokens', () => {
  it('meets WCAG AA contrast for text and the accent in both themes', () => {
    for (const c of [lightColors, darkColors]) {
      expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.textMuted, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast(lightColors.textSubtle, lightColors.surface),
    ).toBeGreaterThanOrEqual(3);
  });
  it('emits CSS variables for both themes and reduced motion', () => {
    const css = cssVariables();
    expect(css).toContain('--c-accent: #2F5AF2;');
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('--map-route:');
    expect(css).toContain('prefers-reduced-motion');
  });
  it('builds well-formed logo SVGs', () => {
    for (const svg of [markSvg(), glyphSvg({ padding: 18 }), lockupSvg()]) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg.match(/<svg/g)).toHaveLength(1);
    }
  });
  it('normalises free-text categories to the shared set', () => {
    expect(normaliseCategory('Food & drink')).toBe('food');
    expect(normaliseCategory('Bath')).toBe('restroom');
    expect(normaliseCategory('stairs')).toBe('stairs');
    expect(normaliseCategory('Library')).toBe('service');
    expect(normaliseCategory('')).toBe('other');
    expect(normaliseCategory('mystery')).toBe('room');
    for (const k of Object.keys(placeCategories))
      expect(normaliseCategory(k)).toBe(k);
  });
});
