import React, { useState, useEffect } from 'react';
import { Modal, TextInput, Button, Text, Alert, Group, Stack, Switch, Code, Badge } from '@mantine/core';
import { IconKey, IconAlertCircle, IconCheck, IconInfoCircle } from '@tabler/icons-react';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  clearGeminiApiKey,
  isGeminiAvailable,
  getAIParsingStats
} from '../utils/parsers/aiParser';

/**
 * AI Parser Settings Component
 * Allows users to configure Gemini API key for enhanced parsing accuracy
 */
const AIParserSettings = ({ opened, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (opened) {
      // Check if API key is already configured
      const configured = isGeminiAvailable();
      setIsConfigured(configured);
      
      // Load stats
      const parsingStats = getAIParsingStats();
      setStats(parsingStats);
      
      // Load existing key if configured
      if (configured) {
        const existingKey = getGeminiApiKey();
        if (existingKey) {
          setApiKey(existingKey);
        }
      }
    }
  }, [opened]);

  const handleSave = () => {
    setError('');
    setSuccess('');

    if (!apiKey || apiKey.trim().length === 0) {
      setError('Please enter a valid API key');
      return;
    }

    try {
      setGeminiApiKey(apiKey.trim());
      setIsConfigured(true);
      setSuccess('API key saved successfully! AI parsing is now enabled.');
      
      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError('Failed to save API key. Please try again.');
    }
  };

  const handleClear = () => {
    clearGeminiApiKey();
    setApiKey('');
    setIsConfigured(false);
    setSuccess('API key removed. AI parsing is now disabled.');
  };

  const handleClose = () => {
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="AI Parser Settings"
      size="lg"
    >
      <Stack gap="md">
        {/* Info Alert */}
        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          <Text size="sm">
            Enable AI-powered parsing for better accuracy on complex quiz files. 
            Requires a free Gemini API key from Google.
          </Text>
        </Alert>

        {/* Status Badge */}
        <Group>
          <Text size="sm" fw={600}>Status:</Text>
          {isConfigured ? (
            <Badge color="green" leftSection={<IconCheck size={14} />}>
              AI Parsing Enabled
            </Badge>
          ) : (
            <Badge color="gray">
              AI Parsing Disabled
            </Badge>
          )}
        </Group>

        {/* Statistics */}
        {stats && stats.total > 0 && (
          <Alert icon={<IconInfoCircle size={16} />} color="teal" variant="light">
            <Text size="sm" fw={600} mb={4}>AI Parsing Statistics:</Text>
            <Text size="xs">
              • Total attempts: {stats.total}
            </Text>
            <Text size="xs">
              • Success rate: {stats.successRate}%
            </Text>
            <Text size="xs">
              • Average confidence: {stats.avgConfidence}%
            </Text>
          </Alert>
        )}

        {/* API Key Input */}
        <TextInput
          label="Gemini API Key"
          placeholder="Enter your Gemini API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type={showKey ? 'text' : 'password'}
          leftSection={<IconKey size={16} />}
          rightSection={
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? 'Hide' : 'Show'}
            </Button>
          }
          error={error}
        />

        {/* Success Message */}
        {success && (
          <Alert icon={<IconCheck size={16} />} color="green">
            {success}
          </Alert>
        )}

        {/* How to Get API Key */}
        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          <Text size="sm" fw={600} mb={4}>How to get a free API key:</Text>
          <Text size="xs" mb={2}>
            1. Visit <Code>https://aistudio.google.com/app/apikey</Code>
          </Text>
          <Text size="xs" mb={2}>
            2. Sign in with your Google account
          </Text>
          <Text size="xs" mb={2}>
            3. Click "Create API Key"
          </Text>
          <Text size="xs">
            4. Copy the key and paste it above
          </Text>
        </Alert>

        {/* Privacy Notice */}
        <Alert icon={<IconAlertCircle size={16} />} color="orange" variant="light">
          <Text size="sm" fw={600} mb={4}>Privacy Notice:</Text>
          <Text size="xs">
            When AI parsing is enabled, your quiz files will be sent to Google's servers for processing. 
            Google's privacy policy applies. Your API key is stored locally in your browser and never 
            sent to our servers.
          </Text>
        </Alert>

        {/* Action Buttons */}
        <Group justify="space-between" mt="md">
          <Button
            variant="subtle"
            color="red"
            onClick={handleClear}
            disabled={!isConfigured}
          >
            Remove API Key
          </Button>
          
          <Group>
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save API Key
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default AIParserSettings;
