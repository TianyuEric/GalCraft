import type { Preview } from '@storybook/react-vite';
import '../renderer/styles/ui.css';
import './preview.css';

const preview: Preview = {
  parameters: { layout: 'fullscreen', controls: { expanded: true }, options: { storySort: { order: ['Components', 'Product', ['Studio', 'Player']], method: 'alphabetical' } } },
};

export default preview;
