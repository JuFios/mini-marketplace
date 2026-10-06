import type { Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import '../src/app/index.css';

// Components that render links need a router, but stories never navigate anywhere.
const preview: Preview = {
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="p-6">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

export default preview;
