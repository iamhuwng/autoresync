import React from 'react';
import { Button, Group, Text } from '@mantine/core';

/**
 * WordBank Component
 *
 * Displays a word bank with clickable word buttons.
 * Students can click words to select them for filling in blanks.
 *
 * @param {Array} words - Array of words to display in the word bank
 * @param {Array} usedWords - Array of words that have been used
 * @param {string} selectedWord - Currently selected word (if any)
 * @param {Function} onWordClick - Callback when a word is clicked
 * @param {boolean} disabled - Whether the word bank is disabled
 */
const WordBank = ({ words = [], usedWords = [], selectedWord = null, onWordClick, disabled = false }) => {
  const handleWordClick = (word) => {
    if (!disabled && onWordClick) {
      onWordClick(word);
    }
  };

  const isWordUsed = (word) => usedWords.includes(word);
  const isWordSelected = (word) => selectedWord === word;

  return (
    <div className="w-full">
      <Text size="sm" fw={500} mb="xs" c="dimmed">
        Word Bank - Click to select a word
      </Text>
      <Group spacing="sm">
        {words.map((word, index) => {
          const used = isWordUsed(word);
          const selected = isWordSelected(word);

          return (
            <Button
              key={index}
              variant={selected ? 'filled' : used ? 'light' : 'outline'}
              color={selected ? 'blue' : used ? 'gray' : 'indigo'}
              size="md"
              onClick={() => handleWordClick(word)}
              disabled={disabled || used}
              styles={{
                root: {
                  opacity: used ? 0.5 : 1,
                  cursor: used ? 'not-allowed' : disabled ? 'not-allowed' : 'pointer',
                },
              }}
            >
              {word}
            </Button>
          );
        })}
      </Group>
    </div>
  );
};

export default WordBank;
