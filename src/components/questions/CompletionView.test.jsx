import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import CompletionView from './CompletionView';

// Wrapper component for Mantine provider
const renderWithMantine = (component) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

describe('CompletionView', () => {
  const mockQuestion = {
    question: 'The capital of France is _____.',
    wordBank: ['Paris', 'London', 'Berlin', 'Madrid'],
  };

  it('should render the question text with blank', () => {
    renderWithMantine(<CompletionView question={mockQuestion} />);

    expect(screen.getByText(/The capital of France is/i)).toBeInTheDocument();
    expect(screen.getByText('___')).toBeInTheDocument(); // Empty blank placeholder
  });

  it('should render the word bank', () => {
    renderWithMantine(<CompletionView question={mockQuestion} />);

    mockQuestion.wordBank.forEach((word) => {
      expect(screen.getByRole('button', { name: word })).toBeInTheDocument();
    });
  });

  it('should display instruction text', () => {
    renderWithMantine(<CompletionView question={mockQuestion} />);

    expect(screen.getByText(/Select a word from the word bank/i)).toBeInTheDocument();
  });

  it('should fill the blank when a word is clicked', () => {
    renderWithMantine(<CompletionView question={mockQuestion} />);

    // Initially should show placeholder
    expect(screen.getByText('___')).toBeInTheDocument();

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    fireEvent.click(parisButton);

    expect(screen.queryByText('___')).not.toBeInTheDocument();
    // Should have Paris text in the document (in the blank)
    const parisTexts = screen.getAllByText('Paris');
    expect(parisTexts.length).toBeGreaterThan(0);
  });

  it('should mark the selected word as used in the word bank', () => {
    renderWithMantine(<CompletionView question={mockQuestion} />);

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    fireEvent.click(parisButton);

    // The Paris button should be disabled after selection
    expect(parisButton).toBeDisabled();
  });

  it('should enable submit button when an answer is filled', () => {
    renderWithMantine(<CompletionView question={mockQuestion} onSubmit={vi.fn()} />);

    const submitButton = screen.getByRole('button', { name: /Submit Answer/i });
    expect(submitButton).toBeDisabled();

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    fireEvent.click(parisButton);

    expect(submitButton).not.toBeDisabled();
  });

  it('should call onSubmit with the selected answer', () => {
    const mockOnSubmit = vi.fn();
    renderWithMantine(<CompletionView question={mockQuestion} onSubmit={mockOnSubmit} />);

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    fireEvent.click(parisButton);

    const submitButton = screen.getByRole('button', { name: /Submit Answer/i });
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith('Paris');
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  it('should show clear button when an answer is selected', () => {
    renderWithMantine(<CompletionView question={mockQuestion} onSubmit={vi.fn()} />);

    // Clear button should not be visible initially
    expect(screen.queryByRole('button', { name: /Clear/i })).not.toBeInTheDocument();

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    fireEvent.click(parisButton);

    // Clear button should now be visible
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument();
  });

  it('should clear the answer when clear button is clicked', () => {
    renderWithMantine(<CompletionView question={mockQuestion} onSubmit={vi.fn()} />);

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    fireEvent.click(parisButton);

    expect(screen.queryByText('___')).not.toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearButton);

    // Should show placeholder again
    expect(screen.getByText('___')).toBeInTheDocument();
    // Paris button should be enabled again
    expect(parisButton).not.toBeDisabled();
  });

  it('should allow changing the answer to a different word', () => {
    renderWithMantine(<CompletionView question={mockQuestion} onSubmit={vi.fn()} />);

    const parisButton = screen.getByRole('button', { name: 'Paris' });
    fireEvent.click(parisButton);
    expect(screen.queryByText('___')).not.toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearButton);
    expect(screen.getByText('___')).toBeInTheDocument();

    const londonButton = screen.getByRole('button', { name: 'London' });
    fireEvent.click(londonButton);

    expect(screen.queryByText('___')).not.toBeInTheDocument();
    const londonTexts = screen.getAllByText('London');
    expect(londonTexts.length).toBeGreaterThan(0);
  });

  it('should disable all interactions when disabled prop is true', () => {
    renderWithMantine(<CompletionView question={mockQuestion} onSubmit={vi.fn()} disabled={true} />);

    mockQuestion.wordBank.forEach((word) => {
      const button = screen.getByRole('button', { name: word });
      expect(button).toBeDisabled();
    });

    const submitButton = screen.getByRole('button', { name: /Submit Answer/i });
    expect(submitButton).toBeDisabled();
  });

  it('should not show clear button when disabled', () => {
    const { container } = renderWithMantine(
      <CompletionView question={mockQuestion} onSubmit={vi.fn()} disabled={true} />
    );

    // Clear button should not appear when component is disabled (even without selecting a word)
    expect(screen.queryByRole('button', { name: /Clear/i })).not.toBeInTheDocument();
  });

  it('should handle questions with multiple blanks correctly', () => {
    const multiBlankQuestion = {
      question: 'The _____ of France is _____.',
      wordBank: ['capital', 'Paris', 'London', 'city'],
    };

    renderWithMantine(<CompletionView question={multiBlankQuestion} />);

    const allTexts = screen.getAllByText(/The/i, { exact: false });
    expect(allTexts.length).toBeGreaterThan(0);

    const allOfFranceTexts = screen.getAllByText(/of France is/i, { exact: false });
    expect(allOfFranceTexts.length).toBeGreaterThan(0);
  });

  it('should not call onSubmit when submit is clicked without selecting a word', () => {
    const mockOnSubmit = vi.fn();
    renderWithMantine(<CompletionView question={mockQuestion} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /Submit Answer/i });

    // Submit button should be disabled
    expect(submitButton).toBeDisabled();

    // Even if we try to click it, onSubmit should not be called
    fireEvent.click(submitButton);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should handle questions without onSubmit prop', () => {
    renderWithMantine(<CompletionView question={mockQuestion} />);

    // Should not render submit button when no onSubmit is provided
    expect(screen.queryByRole('button', { name: /Submit Answer/i })).not.toBeInTheDocument();
  });

  it('should parse blank patterns correctly', () => {
    const variousBlankQuestion = {
      question: 'Word one: _____ and word two: __________.',
      wordBank: ['test', 'example'],
    };

    renderWithMantine(<CompletionView question={variousBlankQuestion} />);

    expect(screen.getByText(/Word one:/i)).toBeInTheDocument();
    expect(screen.getByText(/and word two:/i)).toBeInTheDocument();
  });

  describe('Typed-Input CompletionView', () => {
    const mockTypedQuestion = {
      question: 'The capital of Spain is _____.',
    };

    it('should render a text input when no word bank is provided', () => {
      renderWithMantine(<CompletionView question={mockTypedQuestion} />);
      expect(screen.getByPlaceholderText('Type answer')).toBeInTheDocument();
    });

    it('should allow typing in the input field', () => {
      renderWithMantine(<CompletionView question={mockTypedQuestion} />);
      const input = screen.getByPlaceholderText('Type answer');
      fireEvent.change(input, { target: { value: 'Madrid' } });
      expect(input.value).toBe('Madrid');
    });

    it('should enable the submit button when the input is not empty', () => {
      renderWithMantine(<CompletionView question={mockTypedQuestion} onSubmit={vi.fn()} />);
      const submitButton = screen.getByRole('button', { name: /Submit Answer/i });
      const input = screen.getByPlaceholderText('Type answer');
      fireEvent.change(input, { target: { value: 'Madrid' } });

      expect(submitButton).not.toBeDisabled();
    });

    it('should call onSubmit with the typed answer', () => {
      const mockOnSubmit = vi.fn();
      renderWithMantine(<CompletionView question={mockTypedQuestion} onSubmit={mockOnSubmit} />);
      const input = screen.getByPlaceholderText('Type answer');
      fireEvent.change(input, { target: { value: 'Madrid' } });

      const submitButton = screen.getByRole('button', { name: /Submit Answer/i });
      fireEvent.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith('Madrid');
    });

    it('should clear the input when the clear button is clicked', () => {
      renderWithMantine(<CompletionView question={mockTypedQuestion} onSubmit={vi.fn()} />);
      const input = screen.getByPlaceholderText('Type answer');
      fireEvent.change(input, { target: { value: 'Madrid' } });

      const clearButton = screen.getByRole('button', { name: /Clear/i });
      fireEvent.click(clearButton);

      expect(input.value).toBe('');
    });

    it('should disable the input when the disabled prop is true', () => {
      renderWithMantine(<CompletionView question={mockTypedQuestion} disabled={true} />);
      const input = screen.getByPlaceholderText('Type answer');
      expect(input).toBeDisabled();
    });
  });
});
