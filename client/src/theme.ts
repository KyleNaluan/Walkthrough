import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

/**
 * The Walkthrough look: an official inspection record. Civic navy for the
 * chrome, white cards on a paper-grey page, squared-off corners, Public Sans
 * for text and IBM Plex Mono for record numbers and dates.
 */
const navy: MantineColorsTuple = [
  '#edf2f8',
  '#d8e1ec',
  '#adc1da',
  '#7f9fc7',
  '#5a83b7',
  '#426fad',
  '#3565a9',
  '#275494',
  '#1f4a85',
  '#163a6a',
];

export const theme = createTheme({
  colors: {navy},
  primaryColor: 'navy',
  primaryShade: {light: 8, dark: 6},
  defaultRadius: 'sm',
  fontFamily: "'Public Sans Variable', system-ui, sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, monospace",
  headings: {
    fontFamily: "'Public Sans Variable', system-ui, sans-serif",
    fontWeight: '700',
  },
  // Inputs and buttons are size "md" (42px tall) so they are easy to tap.
  components: {
    Button: {defaultProps: {size: 'md'}},
    TextInput: {defaultProps: {size: 'md'}},
    PasswordInput: {defaultProps: {size: 'md'}},
    Textarea: {defaultProps: {size: 'md'}},
    Select: {defaultProps: {size: 'md'}},
    FileInput: {defaultProps: {size: 'md'}},
    DateInput: {defaultProps: {size: 'md'}},
    RadioGroup: {defaultProps: {size: 'md'}},
    // Cards stay white on the grey page.
    Paper: {defaultProps: {withBorder: true, bg: 'white'}},
    Card: {defaultProps: {withBorder: true, bg: 'white'}},
    Badge: {defaultProps: {radius: 'sm'}},
  },
});

/** Paper-grey page behind white cards. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {'--mantine-color-body': '#f3f4f1'},
  dark: {},
});
