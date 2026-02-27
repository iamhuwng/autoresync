import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BanListPanel from './BanListPanel';

import { MantineProvider } from '@mantine/core';

describe('BanListPanel', () => {
  it('renders without crashing', () => {
    render(
      <MantineProvider>
        <BanListPanel isOpen={true} />
      </MantineProvider>
    );
    expect(screen.getByText('Ban List')).toBeInTheDocument();
  });
});
