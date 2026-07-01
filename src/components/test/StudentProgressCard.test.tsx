import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudentProgressCard } from './StudentProgressCard';

describe('StudentProgressCard accessibility', () => {
  it('opens student details by keyboard with an accessible name', () => {
    const onClick = vi.fn();

    render(
      <StudentProgressCard
        name="Ada"
        progress={50}
        answeredCount={5}
        totalQuestions={10}
        timeElapsed={120000}
        status="working"
        onClick={onClick}
      />,
    );

    const card = screen.getByRole('button', { name: /open details for ada/i });
    expect(card.tabIndex).toBe(0);

    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
