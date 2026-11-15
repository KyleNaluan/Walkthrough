import {describe, expect, it} from 'vitest';
import {theme} from './theme';

// jsdom does no layout, so these check the theme settings that make every
// control at least 42px tall on a phone (story 21, AC 21.2). The real sizes
// are measured in Chrome at 375 x 812 as a manual test.
const components = theme.components as Record<
  string,
  {defaultProps?: Record<string, unknown>; styles?: Record<string, unknown>}
>;

describe('theme tap targets (AC 21.2)', () => {
  it.each([
    'Button',
    'TextInput',
    'PasswordInput',
    'Textarea',
    'Select',
    'NativeSelect',
    'FileInput',
    'DateInput',
    'RadioGroup',
    'Radio',
  ])('makes %s size "md" (42px) by default', (name) => {
    expect(components[name]?.defaultProps?.size).toBe('md');
  });

  it('makes the password show/hide button 42px square', () => {
    expect(components.PasswordInput.styles?.visibilityToggle).toMatchObject({
      minWidth: 42,
      minHeight: 42,
    });
    expect(components.PasswordInput.defaultProps?.rightSectionWidth).toBe(42);
  });

  it('makes each Pass / Fail / N/A choice 42px tall', () => {
    expect(components.SegmentedControl.styles?.label).toMatchObject({
      minHeight: 42,
    });
  });

  it("makes a radio's label row 42px tall", () => {
    expect(components.Radio.styles?.label).toMatchObject({minHeight: 42});
  });
});
