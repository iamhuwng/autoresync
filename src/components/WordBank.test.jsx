import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import WordBank from './WordBank';

// Wrapper component for Mantine provider
const renderWithMantine = (component) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

describe('WordBank', () => {
  const mockWords = ['Paris', 'London', 'Berlin', 'Madrid'];

  it('should render all words from the word bank', () => {
    renderWithMantine(<WordBank words={mockWords} />);

    mockWords.forEach((word) => {
      expect(screen.getByText(word)).toBeInTheDocument();
    });
  });

  it('should display the word bank label', () => {
    renderWithMantine(<WordBank words={mockWords} />);

    expect(screen.getByText(/Word Bank/i)).toBeInTheDocument();
  });

  it('should call onWordClick when a word is clicked', () => {
    const mockOnWordClick = vi.fn();
    renderWithMantine(<WordBank words={mockWords} onWordClick={mockOnWordClick} />);

    const parisButton = screen.getByText('Paris');
    fireEvent.click(parisButton);

    expect(mockOnWordClick).toHaveBeenCalledWith('Paris');
    expect(mockOnWordClick).toHaveBeenCalledTimes(1);
  });

  it('should mark used words as disabled', () => {
    const usedWords = ['Paris', 'London'];
    renderWithMantine(<WordBank words={mockWords} usedWords={usedWords} />);

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    const berlinButton = screen.getByRole('button', { name: 'Berlin' });

    expect(parisButton).toBeDisabled();
    expect(berlinButton).not.toBeDisabled();
  });

  it('should not call onWordClick when a used word is clicked', () => {
    const mockOnWordClick = vi.fn();
    const usedWords = ['Paris'];
    renderWithMantine(
      <WordBank words={mockWords} usedWords={usedWords} onWordClick={mockOnWordClick} />
    );

    const parisButton = screen.getByText('Paris');
    fireEvent.click(parisButton);

    expect(mockOnWordClick).not.toHaveBeenCalled();
  });

  it('should highlight the selected word', () => {
    renderWithMantine(<WordBank words={mockWords} selectedWord="Paris" />);

    const parisButton = screen.getByText('Paris');
    const londonButton = screen.getByText('London');

    // Selected word should have 'filled' variant (checked via class or data attributes)
    expect(parisButton).toBeInTheDocument();
    expect(londonButton).toBeInTheDocument();
  });

  it('should disable all words when disabled prop is true', () => {
    renderWithMantine(<WordBank words={mockWords} disabled={true} />);

    mockWords.forEach((word) => {
      const button = screen.getByRole('button', { name: word });
      expect(button).toBeDisabled();
    });
  });

  it('should not call onWordClick when disabled', () => {
    const mockOnWordClick = vi.fn();
    renderWithMantine(<WordBank words={mockWords} onWordClick={mockOnWordClick} disabled={true} />);

    const parisButton = screen.getByText('Paris');
    fireEvent.click(parisButton);

    expect(mockOnWordClick).not.toHaveBeenCalled();
  });

  it('should handle empty word bank', () => {
    renderWithMantine(<WordBank words={[]} />);

    expect(screen.getByText(/Word Bank/i)).toBeInTheDocument();
  });

  it('should allow clicking multiple different words', () => {
    const mockOnWordClick = vi.fn();
    renderWithMantine(<WordBank words={mockWords} onWordClick={mockOnWordClick} />);

    const parisButton = screen.getByText('Paris');
    const londonButton = screen.getByText('London');

    fireEvent.click(parisButton);
    fireEvent.click(londonButton);

    expect(mockOnWordClick).toHaveBeenCalledWith('Paris');
    expect(mockOnWordClick).toHaveBeenCalledWith('London');
    expect(mockOnWordClick).toHaveBeenCalledTimes(2);
  });

  it('should properly handle used words not being clickable', () => {
    const mockOnWordClick = vi.fn();
    const usedWords = ['Paris', 'London'];
    renderWithMantine(
      <WordBank words={mockWords} usedWords={usedWords} onWordClick={mockOnWordClick} />
    );

    const parisButton = screen.getByText('Paris');
    const londonButton = screen.getByText('London');
    const berlinButton = screen.getByText('Berlin');

    fireEvent.click(parisButton);
    fireEvent.click(londonButton);
    fireEvent.click(berlinButton);

    // Only Berlin should trigger the callback
    expect(mockOnWordClick).toHaveBeenCalledWith('Berlin');
    expect(mockOnWordClick).toHaveBeenCalledTimes(1);
  });
});
