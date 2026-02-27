import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PlayerManagementPanel from './PlayerManagementPanel';

import { MantineProvider } from '@mantine/core';

describe('PlayerManagementPanel', () => {
  it('renders without crashing', () => {
    render(
      <MantineProvider>
        <PlayerManagementPanel isOpen={true} />
      </MantineProvider>
    );
    expect(screen.getByText('Player Management')).toBeInTheDocument();
  });
});
