import type { Preview } from '@storybook/react-vite';
import preview from '../preview.js';

export default {
  ...preview,
  parameters: {
    ...preview.parameters,
    options: { storySort: { order: ['Review'], method: 'alphabetical' } },
  },
} satisfies Preview;
