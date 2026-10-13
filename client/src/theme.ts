import {createTheme} from '@mantine/core';

/**
 * One theme for every page. Inputs and buttons default to size "md" (42px
 * tall) so they are easy to tap on a phone.
 */
export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  components: {
    Button: {defaultProps: {size: 'md'}},
    TextInput: {defaultProps: {size: 'md'}},
    PasswordInput: {defaultProps: {size: 'md'}},
    Textarea: {defaultProps: {size: 'md'}},
    Select: {defaultProps: {size: 'md'}},
    FileInput: {defaultProps: {size: 'md'}},
  },
});
