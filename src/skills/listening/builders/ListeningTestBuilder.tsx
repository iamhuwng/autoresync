/**
 * Listening Test Builder
 * Create IELTS Listening tests with audio files and questions
 */

import React, { useState, useEffect } from 'react';
import { IconFileText, IconPhoto } from '@tabler/icons-react';
import { useLocation } from 'react-router-dom';
import { Card, CardBody, Button } from '../../../components/modern';
import { saveListeningTestToFirebase, AUDIO_CONTROLS_PRESETS } from '../../../services/listeningTestStorage';
import type { AudioSection as StorageAudioSection, ListeningDisplayMode, QuestionImage, AudioControlsConfig } from '../../../services/listeningTestStorage';
import { googleDriveAudioService } from '../../../services/googleDriveAudio';
import r2StorageService from '../../../services/r2Storage';
import type { ParsedQuestion } from '../../../types/document.types';
import { listeningRouter } from '../../../services/parser/listening.router';
import { useAuth } from '../../../hooks/useAuth';
import { useNavigation } from '../../../hooks/useNavigation';
import { AssessmentAuthoringHeader } from '../../../features/assessment/shared/components/AssessmentAuthoringHeader';
import { AssessmentAuthoringSection } from '../../../features/assessment/shared/components/AssessmentAuthoringSection';
import { AssessmentStatusState } from '../../../features/assessment/shared/components/AssessmentStatusState';

// Test types
type TestType = 'IELTS' | 'TOEFL' | 'Custom';
type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

interface AudioSection {
  number: number;
  name: string;
  audioUrl: string;
  streamUrl?: string; // Direct stream URL for audio player preview
  startQuestion: number;
  endQuestion: number;
  playLimit?: number; // How many times can replay (undefined = unlimited)
  waitTimeBefore?: number; // Seconds of wait time before section
  uploadProgress?: number; // Upload progress 0-100
  uploadETA?: number; // Estimated time remaining in seconds
}

interface ListeningTestMetadata {
  title: string;
  type: TestType;
  skill: 'Listening';
  duration: number;
  difficulty: Difficulty;
  description: string;
  tags: string[];
  targetBand?: string;
  sections: AudioSection[];
  totalQuestions: number;
  transcript?: string;
}

const ListeningTestBuilder: React.FC = () => {
  const { navigateTo } = useNavigation('teacher');
  const location = useLocation();
  const { user } = useAuth();

  // Check if metadata was passed from CreateTestPage
  const passedMetadata = location.state?.metadata;

  // Form state - initialize with passed metadata if available
  const [metadata, setMetadata] = useState<ListeningTestMetadata>(() => {
    // Start with only 1 section by default - teachers can add more as needed
    const defaultSections = [
      { number: 1, name: 'Section 1', audioUrl: '', startQuestion: 1, endQuestion: 10, waitTimeBefore: 0 },
    ];

    if (passedMetadata) {
      // Use metadata from CreateTestPage
      return {
        title: passedMetadata.title || '',
        type: (passedMetadata.type as TestType) || 'IELTS',
        skill: 'Listening',
        duration: passedMetadata.duration || 30,
        difficulty: (passedMetadata.difficulty as Difficulty) || 'Intermediate',
        description: passedMetadata.description || '',
        tags: passedMetadata.tags || [],
        targetBand: passedMetadata.targetBand || '',
        sections: defaultSections,
        totalQuestions: 10,
        transcript: '',
      };
    }

    // Default metadata if not passed
    return {
      title: '',
      type: 'IELTS',
      skill: 'Listening',
      duration: 30,
      difficulty: 'Intermediate',
      description: '',
      tags: [],
      sections: defaultSections,
      totalQuestions: 10,
      transcript: '',
    };
  });

  // Step flow: mode-select → audio → questions → review (metadata collected in Review step)
  const [currentStep, setCurrentStep] = useState<'mode-select' | 'audio' | 'questions-text' | 'questions-images' | 'questions' | 'review'>('mode-select');



  // Display mode: 'text' for IELTS-like full-width, 'image' for two-column with question images
  const [displayMode, setDisplayMode] = useState<ListeningDisplayMode>('text');
  const [questionImages, setQuestionImages] = useState<QuestionImage[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingSection, setUploadingSection] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // AI Question Parsing state
  const [questionText, setQuestionText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [parsingStage, setParsingStage] = useState('');
  const [bulkAnswerKey, setBulkAnswerKey] = useState('');
  const [isPublic, setIsPublic] = useState(false); // Default to private

  // Audio Controls Configuration (teacher-configurable)
  const [audioControls, setAudioControls] = useState<AudioControlsConfig>(
    AUDIO_CONTROLS_PRESETS.IELTS_STANDARD
  );
  const [allowReplay, setAllowReplay] = useState(false);
  const [maxReplays, setMaxReplays] = useState(1);

  // R2 Storage is always ready (no authentication needed)
  useEffect(() => {
    // R2 doesn't need OAuth - always "authenticated"
    setIsAuthenticated(true);
    console.log('✅ R2 Storage ready (no authentication needed)');
  }, []);


  // R2 doesn't need sign-in - this is kept for UI compatibility but does nothing
  const handleGoogleSignIn = async () => {
    // R2 doesn't require authentication
    setIsAuthenticated(true);
    console.log('✅ R2 Storage ready - no sign-in needed');
  };

  // Format ETA for display
  const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Handle audio file upload (Step 2 - only after authenticated)
  const handleAudioUpload = async (sectionNumber: number, file: File) => {
    if (!isAuthenticated) {
      setErrors({ ...errors, [`section${sectionNumber}`]: 'Please sign in to Google first.' });
      return;
    }

    // PRD-0018 Task 8.2: Audio format validation
    const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];
    const ALLOWED_MIMETYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg'];
    const MAX_SIZE_WARNING_MB = 50;

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    const mimeType = file.type;

    // Check extension
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      setErrors({
        ...errors,
        [`section${sectionNumber}`]: `Unsupported audio format: ${fileExtension}. Please use MP3, WAV, M4A, AAC, or OGG.`
      });
      return;
    }

    // Check MIME type (more lenient - some browsers report differently)
    if (mimeType && !ALLOWED_MIMETYPES.some(allowed => mimeType.includes(allowed.split('/')[1]))) {
      console.warn(`⚠️ Unexpected MIME type: ${mimeType} for ${fileName}. Proceeding based on extension.`);
    }

    // Warn about large files
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_SIZE_WARNING_MB) {
      const proceed = window.confirm(
        `This file is ${fileSizeMB.toFixed(1)}MB which may take a while to upload. Continue?`
      );
      if (!proceed) return;
    }

    setUploadingSection(sectionNumber);
    const startTime = Date.now();

    // Reset progress
    updateSection(sectionNumber, 'uploadProgress', 0);
    updateSection(sectionNumber, 'uploadETA', 0);

    try {
      console.log(`📤 Uploading audio for Section ${sectionNumber} to R2...`);

      const result = await r2StorageService.uploadAudioReplacement(
        file,
        metadata.sections.find((section) => section.number === sectionNumber)?.audioUrl,
        'listening-audio',
        (percent: number, bytesUploaded: number, totalBytes: number) => {
          // Update progress
          updateSection(sectionNumber, 'uploadProgress', percent);

          // Calculate ETA
          const elapsed = (Date.now() - startTime) / 1000; // seconds
          if (elapsed > 0 && bytesUploaded > 0) {
            const bytesPerSecond = bytesUploaded / elapsed;
            const remainingBytes = totalBytes - bytesUploaded;
            const eta = Math.ceil(remainingBytes / bytesPerSecond);
            updateSection(sectionNumber, 'uploadETA', eta);
          }
        }
      );

      // Update section with the URL and stream URL for preview
      updateSection(sectionNumber, 'audioUrl', result.url);
      updateSection(sectionNumber, 'streamUrl', result.streamUrl);
      updateSection(sectionNumber, 'uploadProgress', 100);
      updateSection(sectionNumber, 'uploadETA', 0);

      console.log(`✅ Section ${sectionNumber} audio uploaded successfully`);
    } catch (error) {
      console.error('Upload error:', error);
      const newErrors = { ...errors };
      newErrors[`section${sectionNumber}`] = 'Failed to upload audio file. Please try again.';
      setErrors(newErrors);
      updateSection(sectionNumber, 'uploadProgress', 0);
      updateSection(sectionNumber, 'uploadETA', 0);
      // If token expired, reset auth state
      if (String(error).includes('token') || String(error).includes('auth')) {
        setIsAuthenticated(false);
      }
    } finally {
      setUploadingSection(null);
    }
  };

  // Update section data - uses functional update to avoid stale closure issues
  const updateSection = (sectionNumber: number, field: keyof AudioSection, value: any) => {
    console.log(`📝 updateSection called: Section ${sectionNumber}, ${field} = ${typeof value === 'string' ? value.substring(0, 50) + '...' : value}`);
    setMetadata(prev => {
      const updated = {
        ...prev,
        sections: prev.sections.map(s =>
          s.number === sectionNumber ? { ...s, [field]: value } : s
        ),
      };
      console.log(`📊 State updated - Section ${sectionNumber} ${field}:`, updated.sections.find(s => s.number === sectionNumber)?.[field]);
      return updated;
    });
  };

  // Add a new section
  const addSection = () => {
    setMetadata(prev => {
      const lastSection = prev.sections[prev.sections.length - 1];
      const newSectionNumber = lastSection ? lastSection.number + 1 : 1;
      const newStartQuestion = lastSection ? lastSection.endQuestion + 1 : 1;
      const newEndQuestion = newStartQuestion + 9; // 10 questions per section

      const newSection: AudioSection = {
        number: newSectionNumber,
        name: `Section ${newSectionNumber}`,
        audioUrl: '',
        startQuestion: newStartQuestion,
        endQuestion: newEndQuestion,
        waitTimeBefore: 30, // Default wait time for additional sections
      };

      return {
        ...prev,
        sections: [...prev.sections, newSection],
        totalQuestions: newEndQuestion,
      };
    });
  };

  // Remove a section by number
  const removeSection = (sectionNumber: number) => {
    setMetadata(prev => {
      if (prev.sections.length <= 1) {
        // Don't allow removing the last section
        return prev;
      }

      const filteredSections = prev.sections.filter(s => s.number !== sectionNumber);

      // Renumber remaining sections and recalculate question ranges
      let questionCounter = 1;
      const renumberedSections = filteredSections.map((section, index) => {
        const startQuestion = questionCounter;
        const endQuestion = questionCounter + 9; // 10 questions per section
        questionCounter = endQuestion + 1;

        return {
          ...section,
          number: index + 1,
          name: `Section ${index + 1}`,
          startQuestion,
          endQuestion,
        };
      });

      const lastSection = renumberedSections[renumberedSections.length - 1];

      return {
        ...prev,
        sections: renumberedSections,
        totalQuestions: lastSection ? lastSection.endQuestion : 10,
      };
    });
  };

  // Validate audio section URLs
  const validateAudioUrls = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    // Debug: Log current state
    console.log('🔍 Validating audio URLs...');
    console.log('📋 Current metadata.sections:', metadata.sections.map(s => ({ number: s.number, audioUrl: s.audioUrl })));

    for (const section of metadata.sections) {
      console.log(`🔎 Checking Section ${section.number}: audioUrl = "${section.audioUrl}"`);
      if (!section.audioUrl.trim()) {
        newErrors[`section${section.number}`] = `Section ${section.number} audio URL is required`;
        console.log(`❌ Section ${section.number} failed: empty audioUrl`);
        continue;
      }
      // Validate URL - R2 URLs are always valid if they're proper URLs
      // Google Drive URLs need special validation
      const isR2Url = section.audioUrl.includes('r2.dev') || section.audioUrl.includes('cloudflare');
      const isDirectUrl = section.audioUrl.startsWith('https://') && !section.audioUrl.includes('drive.google.com');

      if (isR2Url || isDirectUrl) {
        // R2 and other direct URLs are valid as-is
        console.log(`✅ Section ${section.number}: Valid direct URL`);
        continue;
      }

      // Validate Google Drive URL
      try {
        const validation = await googleDriveAudioService.validateAudioLink(section.audioUrl);
        if (!validation.valid) {
          newErrors[`section${section.number}`] = validation.error || 'Invalid audio URL';
        }
      } catch (err) {
        newErrors[`section${section.number}`] = 'Failed to validate audio URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle next step
  const handleNext = async () => {
    if (currentStep === 'mode-select') {
      setCurrentStep('audio');
    } else if (currentStep === 'audio') {
      const valid = await validateAudioUrls();
      if (valid) {
        // Route based on display mode
        if (displayMode === 'text') {
          setCurrentStep('questions-text');
        } else {
          setCurrentStep('questions-images');
        }
      }
    } else if (currentStep === 'questions-text') {
      setCurrentStep('questions');
    } else if (currentStep === 'questions-images') {
      // Sync questions count for Image Mode
      if (questions.length < metadata.totalQuestions) {
        const currentCount = questions.length;
        const needed = metadata.totalQuestions - currentCount;
        const newQuestions = Array.from({ length: needed }).map((_, i) => ({
          id: `q-${Date.now()}-${currentCount + i + 1}`,
          number: currentCount + i + 1,
          questionNumber: currentCount + i + 1,
          question: '', // Empty for Image Mode
          type: 'short-answer', // Default to fill-in-the-blank
          answer: '',
          answerSource: 'manual' as const,
          confidence: 1,
          passageId: 'listening',
          points: 1,
        }));
        setQuestions([...questions, ...newQuestions] as any);
      }
      setCurrentStep('questions');
    } else if (currentStep === 'questions') {
      setCurrentStep('review');
    }
  };

  // Handle back
  const handleBack = () => {
    if (currentStep === 'mode-select') {
      // Go back to CreateTestPage (sessions) instead of Reading builder
      navigateTo('SESSIONS', {}, { reason: 'listening_builder_back' });
    }
    else if (currentStep === 'audio') {
      setCurrentStep('mode-select');
    }
    else if (currentStep === 'questions-text') setCurrentStep('audio');
    else if (currentStep === 'questions-images') setCurrentStep('audio');
    else if (currentStep === 'questions') {
      if (displayMode === 'text') {
        setCurrentStep('questions-text');
      } else {
        setCurrentStep('questions-images');
      }
    }
    else if (currentStep === 'review') setCurrentStep('questions');
  };

  // Parse question text using Parser Router
  const handleParseQuestions = async () => {
    if (!questionText.trim()) {
      setErrors({ ...errors, parsing: 'Please enter question text first' });
      return;
    }

    setIsParsing(true);
    setParsingProgress(0);
    setParsingStage('Starting question parsing...');

    try {
      // Use Parser Router - automatically selects best parser for Listening
      const result = await listeningRouter.parseListening(
        questionText,
        metadata.type as 'IELTS' | 'TOEFL' | 'Cambridge' | 'Custom' | 'unknown',
        (stage: string, progress: number) => {
          setParsingProgress(progress);
          setParsingStage(stage);
        }
      );

      if (result.success) {
        // Map questions with required fields
        const parsedQuestions: ParsedQuestion[] = result.data.questions.map(q => ({
          id: q.id,
          number: q.number,
          questionNumber: q.questionNumber,
          questionText: q.questionText || q.question || '',
          question: q.question || q.questionText || '',
          type: q.type as ParsedQuestion['type'],
          options: q.options,
          answer: q.answer || '',
          context: q.context,
          answerSource: 'ai-suggestion' as const,
          confidence: result.data.parseConfidence,
        }));

        setQuestions(parsedQuestions);
        setCurrentStep('questions');
        console.log(`✅ Parser Router: ${parsedQuestions.length} questions via ${result.data.parserUsed}`);
        console.log('📊 Parse confidence:', result.data.parseConfidence);
      } else {
        setErrors({ ...errors, parsing: `Parsing failed: ${result.error}` });
      }
    } catch (error) {
      console.error('Parsing error:', error);
      setErrors({ ...errors, parsing: 'Failed to parse questions. Please try again.' });
    } finally {
      setIsParsing(false);
    }
  };

  // Save test to Firebase
  const handleSaveTest = async () => {
    setIsSaving(true);
    try {
      // Convert local AudioSection to storage format
      const storageSections: StorageAudioSection[] = metadata.sections.map(s => ({
        number: s.number,
        name: s.name,
        audioUrl: s.audioUrl,
        streamUrl: s.streamUrl,
        startQuestion: s.startQuestion,
        endQuestion: s.endQuestion,
        playLimit: s.playLimit,
        waitTimeBefore: s.waitTimeBefore,
      }));

      const result = await saveListeningTestToFirebase(
        {
          title: metadata.title,
          type: metadata.type,
          skill: 'Listening',
          duration: metadata.duration,
          difficulty: metadata.difficulty,
          description: metadata.description,
          tags: metadata.tags,
          targetBand: metadata.targetBand,
        },
        storageSections,
        questions,
        user?.uid || 'admin-teacher',
        metadata.transcript,
        displayMode,
        questionImages.length > 0 ? questionImages : undefined,
        user?.uid || 'admin-teacher', // ownerId
        isPublic, // isPublic
        audioControls, // audioControlsConfig
        allowReplay, // allowReplay
        maxReplays // maxReplays
      );

      if (result.success && result.testId) {
        console.log('✅ Listening test saved:', result.testId);
        alert(`Listening test saved successfully! Test ID: ${result.testId}`);
        navigateTo('SESSIONS', {}, { reason: 'listening_test_created', replace: true });
      } else {
        console.error('❌ Save failed:', result.error);
        setErrors({ save: result.error || 'Failed to save test' });
      }
    } catch (error) {
      console.error('❌ Failed to save test:', error);
      setErrors({ save: 'Failed to save test. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Add question
  const addQuestion = () => {
    const newQuestion: ParsedQuestion = {
      id: `q-${Date.now()}-${questions.length + 1}`,
      number: questions.length + 1,
      questionNumber: questions.length + 1,
      questionText: '',
      question: '',
      type: 'short-answer',
      answer: '',
      answerSource: 'manual' as any,
      confidence: 1,
      passageId: 'listening',
      points: 1,
    };
    setQuestions([...questions, newQuestion]);
  };

  // Update question
  const updateQuestion = (index: number, field: keyof ParsedQuestion, value: any) => {
    setQuestions(questions.map((q, idx) =>
      idx === index ? { ...q, [field]: value } : q
    ));
  };

  // Delete question
  const deleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, idx) => idx !== index));
  };

  // Bulk parse answers for Image Mode
  // Bulk parse answers for Image Mode (AI-Powered)
  const handleBulkParseAnswers = async () => {
    if (!bulkAnswerKey.trim()) return;

    setIsParsing(true);
    setParsingStage('AI is analyzing your answer key...');

    try {
      // Use the newly added answer key parser
      const parsedAnswers = await listeningRouter.parseAnswerKey(bulkAnswerKey);

      const newQuestions = [...questions];
      let updatedCount = 0;

      // Apply parsed answers to questions
      // We prioritize matching by number (e.g. "1. Answer")
      Object.entries(parsedAnswers).forEach(([key, value]) => {
        const questionNum = parseInt(key);
        const answerText = Array.isArray(value) ? value.join(' / ') : value; // Use / as separator for variations

        const qIndex = newQuestions.findIndex(q => q.number === questionNum);
        if (qIndex !== -1) {
          newQuestions[qIndex] = { ...newQuestions[qIndex], answer: answerText };
          updatedCount++;
        }
      });

      // Fallback: If AI returns very few matches (maybe it didn't detect numbering), 
      // but provided a sequential list, or if the user just pasted a raw list without numbers
      if (updatedCount === 0) {
        // Simple line-split fallback if AI fails to map
        const lines = bulkAnswerKey.split(/\r?\n/).filter(line => line.trim());
        lines.forEach((line, idx) => {
          if (idx < newQuestions.length) {
            const cleanLine = line.replace(/^\d+[\.\)]\s*/, '').trim();
            newQuestions[idx] = { ...newQuestions[idx], answer: cleanLine };
            updatedCount++;
          }
        });
      }

      setQuestions(newQuestions);
      console.log(`✅ Bulk update complete: ${updatedCount} answers set`);

    } catch (error) {
      console.error("AI Parse failed:", error);
      alert("AI parsing failed. Please check your internet connection or try simpler formatting.");
    } finally {
      setIsParsing(false);
      setParsingStage('');
    }
  };

  // Add image to a section
  const handleAddImage = (section: AudioSection, imageUrl: string) => {
    setQuestionImages(prev => {
      // Get existing images for this section to calculate range
      const sectionImages = prev
        .filter(img => img.sectionNumber === section.number)
        .sort((a, b) => (a.questionRange?.start || 0) - (b.questionRange?.start || 0));

      const lastImage = sectionImages[sectionImages.length - 1];

      // Calculate start question (after the last image's end, or start of section)
      const startQuestion = lastImage
        ? (lastImage.questionRange?.end || section.startQuestion) + 1
        : section.startQuestion;

      // If start exceeds end, just set it to end (user can fix it)
      const validStart = Math.min(startQuestion, section.endQuestion);

      return [...prev, {
        sectionNumber: section.number,
        imageUrl,
        questionRange: {
          start: validStart,
          end: section.endQuestion
        }
      }];
    });
  };

  // Global paste handler for image mode
  useEffect(() => {
    if (currentStep !== 'questions-images') return;

    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Don't intercept if pasting into an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // We need to know which section to paste into. 
      // Since we can't easily track hover state without more state, 
      // we'll default to the LAST audio section or the one with focus?
      // Better strategy: If there is only one section, paste there. 
      // If multiple, maybe we can't support global paste easily without a "selected" section concept.
      // However, the user asked for "Paste" button to work. 
      // We'll stick to fixing the button mostly, but if we can support global paste:

      // Attempt to find image in clipboard
      const items = e.clipboardData?.items;
      if (!items) return;

      let file: File | null = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          file = items[i].getAsFile();
          break;
        }
      }

      if (file) {
        e.preventDefault();
        // If we have a file, and there's only one section with valid audio, use it
        const validSections = metadata.sections.filter(s => s.audioUrl);
        if (validSections.length === 1) {
          const reader = new FileReader();
          reader.onload = (event) => {
            handleAddImage(validSections[0], event.target?.result as string);
          };
          reader.readAsDataURL(file);
          // Show feedback
          // alert('Image pasted to ' + validSections[0].name); 
        } else {
          // If multiple sections, we can't guess. 
          // Maybe show a modal? 
          // For now, let's just log or notify.
          console.log('Multiple sections found, use the Paste button on specific section.');
          alert('Please use the "Paste" button on the specific section you want to add this image to, as there are multiple sections.');
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [currentStep, metadata.sections]);

  return (
    <main
      style={{
        background: '#f8fafc',
        boxSizing: 'border-box',
        minHeight: '100vh',
        padding: '1rem',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>
            🎧 Create Listening Test
          </h1>
          <p style={{ color: '#64748b', fontSize: '1.125rem' }}>
            Build IELTS Listening tests with audio files and questions
          </p>
        </div>

        {/* Progress Steps */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '3rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { key: 'mode-select', label: 'Mode', icon: '🎛️' },
            { key: 'audio', label: 'Audio', icon: '🎵' },
            { key: displayMode === 'text' ? 'questions-text' : 'questions-images', label: displayMode === 'text' ? 'AI Parse' : 'Images', icon: displayMode === 'text' ? '🤖' : '🖼️' },
            { key: 'questions', label: 'Questions', icon: '📝' },
            { key: 'review', label: 'Review', icon: '✓' },
          ].map((step) => (
            <div
              key={step.key}
              style={{
                padding: '0.5rem 1rem',
                background: currentStep === step.key
                  ? '#2563eb'
                  : '#ffffff',
                color: currentStep === step.key ? 'white' : '#64748b',
                borderRadius: '0.5rem',
                border: currentStep === step.key ? '1px solid #1d4ed8' : '1px solid #dbe4ee',
                fontWeight: 600,
                fontSize: '0.875rem',
                opacity: currentStep === step.key ? 1 : 0.6,
              }}
            >
              {step.icon} {step.label}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card
          hover={false}
          style={{
            background: '#ffffff',
            border: '1px solid #dbe4ee',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }}
        >
          <CardBody style={{ padding: '1.5rem' }}>
            {/* STEP 0: Mode Selection */}
            {currentStep === 'mode-select' && (
              <div>
                <div style={{ marginBottom: '2rem' }}>
                  <AssessmentAuthoringHeader
                    title="Choose Display Mode"
                    description="Select how your listening test questions will be displayed to students"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Display mode options"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
                    gap: '1.5rem',
                  }}
                >
                  {/* Text Mode Option */}
                  <button
                    type="button"
                    aria-pressed={displayMode === 'text'}
                    aria-label="IELTS Text Format"
                    onClick={() => setDisplayMode('text')}
                    style={{
                      appearance: 'none',
                      width: '100%',
                      padding: '2rem',
                      background: displayMode === 'text' ? '#2563eb' : '#ffffff',
                      border: displayMode === 'text' ? '1px solid #1d4ed8' : '1px solid #dbe4ee',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease',
                      textAlign: 'center',
                      boxShadow: displayMode === 'text' ? '0 14px 32px rgba(37, 99, 235, 0.18)' : '0 8px 18px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    <IconFileText
                      aria-hidden="true"
                      stroke={1.8}
                      style={{
                        display: 'block',
                        width: '3rem',
                        height: '3rem',
                        margin: '0 auto 1rem',
                      }}
                    />
                    <span style={{
                      display: 'block',
                      fontSize: '1.25rem',
                      fontWeight: '700',
                      color: displayMode === 'text' ? 'white' : '#1e293b',
                      marginBottom: '0.5rem'
                    }}>
                      IELTS Text Format
                    </span>
                    <span style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      color: displayMode === 'text' ? 'rgba(255,255,255,0.9)' : '#64748b',
                      marginBottom: '1rem'
                    }}>
                      Full-width authentic IELTS display with text questions
                    </span>
                    <span style={{
                      display: 'block',
                      textAlign: 'left',
                      fontSize: '0.8125rem',
                      color: displayMode === 'text' ? 'rgba(255,255,255,0.85)' : '#64748b',
                      lineHeight: 1.8,
                      paddingLeft: '1.25rem',
                    }}>
                      <span style={{ display: 'block' }}>- Paste question text for AI parsing</span>
                      <span style={{ display: 'block' }}>- Task instructions with word limits</span>
                      <span style={{ display: 'block' }}>- Options boxes for matching questions</span>
                      <span style={{ display: 'block' }}>- Context display for completion types</span>
                    </span>
                    {displayMode === 'text' && (
                      <span style={{ display: 'block', marginTop: '1rem', fontSize: '1.25rem' }}>✓ Selected</span>
                    )}
                  </button>

                  {/* Image Mode Option */}
                  <button
                    type="button"
                    aria-pressed={displayMode === 'image'}
                    aria-label="Image Mode"
                    onClick={() => setDisplayMode('image')}
                    style={{
                      appearance: 'none',
                      width: '100%',
                      padding: '2rem',
                      background: displayMode === 'image' ? '#4f46e5' : '#ffffff',
                      border: displayMode === 'image' ? '1px solid #4338ca' : '1px solid #dbe4ee',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease',
                      textAlign: 'center',
                      boxShadow: displayMode === 'image' ? '0 14px 32px rgba(79, 70, 229, 0.18)' : '0 8px 18px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    <IconPhoto
                      aria-hidden="true"
                      stroke={1.8}
                      style={{
                        display: 'block',
                        width: '3rem',
                        height: '3rem',
                        margin: '0 auto 1rem',
                      }}
                    />
                    <span style={{
                      display: 'block',
                      fontSize: '1.25rem',
                      fontWeight: '700',
                      color: displayMode === 'image' ? 'white' : '#1e293b',
                      marginBottom: '0.5rem'
                    }}>
                      Image Mode
                    </span>
                    <span style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      color: displayMode === 'image' ? 'rgba(255,255,255,0.9)' : '#64748b',
                      marginBottom: '1rem'
                    }}>
                      Two-column layout with question images
                    </span>
                    <span style={{
                      display: 'block',
                      textAlign: 'left',
                      fontSize: '0.8125rem',
                      color: displayMode === 'image' ? 'rgba(255,255,255,0.85)' : '#64748b',
                      lineHeight: 1.8,
                      paddingLeft: '1.25rem',
                    }}>
                      <span style={{ display: 'block' }}>- Upload question page images/PDFs</span>
                      <span style={{ display: 'block' }}>- Left: Zoomable question images</span>
                      <span style={{ display: 'block' }}>- Right: Numbered answer inputs</span>
                      <span style={{ display: 'block' }}>- Works with any question format</span>
                    </span>
                    {displayMode === 'image' && (
                      <span style={{ display: 'block', marginTop: '1rem', fontSize: '1.25rem' }}>✓ Selected</span>
                    )}
                  </button>
                </div>

              </div>
            )}


            {/* STEP 2: Audio Sections */}
            {currentStep === 'audio' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                      Audio Configuration
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                      {metadata.sections.length} section{metadata.sections.length !== 1 ? 's' : ''} • {metadata.totalQuestions} questions total
                    </p>
                  </div>
                </div>

                {/* R2 Storage Ready - No authentication needed */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(34, 197, 94, 0.1) 100%)',
                  padding: '1rem 1.25rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>✅</span>
                  <div>
                    <p style={{ color: '#10b981', fontWeight: '600', margin: 0, fontSize: '0.9375rem' }}>
                      Ready to Upload
                    </p>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                      Click "Upload Audio" below to select your MP3/WAV file. Files are stored on Cloudflare R2.
                    </p>
                  </div>
                </div>

                {errors.auth && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    color: '#dc2626',
                    fontSize: '0.875rem'
                  }}>
                    ❌ {errors.auth}
                  </div>
                )}

                {/* Instructions */}
                <div style={{
                  background: 'rgba(59, 130, 246, 0.05)',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1.5rem',
                  border: '1px solid rgba(59, 130, 246, 0.2)'
                }}>
                  <p style={{ color: '#3b82f6', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.9375rem' }}>
                    💡 How to Upload:
                  </p>
                  <ol style={{ paddingLeft: '1.25rem', margin: 0, color: '#64748b', fontSize: '0.875rem', lineHeight: 1.8 }}>
                    <li>Click <strong>"Upload Audio File"</strong> for each section below</li>
                    <li>Select your <strong>MP3, WAV, or M4A</strong> file</li>
                    <li>Wait for upload to complete (progress bar shown)</li>
                    <li>Audio will auto-preview when ready</li>
                  </ol>
                </div>


                <div style={{ display: 'grid', gap: '1.5rem' }}>
                  {metadata.sections.map((section) => (
                    <div
                      key={section.number}
                      style={{
                        padding: '1.5rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                          Section {section.number}: Questions {section.startQuestion}-{section.endQuestion}
                        </h3>
                        {metadata.sections.length > 1 && (
                          <button
                            onClick={() => removeSection(section.number)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '0.5rem',
                              padding: '0.5rem 0.75rem',
                              color: '#dc2626',
                              fontSize: '0.875rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            }}
                          >
                            🗑️ Remove
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gap: '1rem' }}>
                        {/* Audio URL or Upload */}
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                            Audio File *
                          </label>

                          {/* Upload Button - Only enabled after Google Sign In */}
                          <div style={{ marginBottom: '0.75rem' }}>
                            <input
                              type="file"
                              accept="audio/*,.mp3,.wav,.m4a,.ogg"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAudioUpload(section.number, file);
                                // Reset input to allow re-selecting same file
                                e.target.value = '';
                              }}
                              style={{ display: 'none' }}
                              id={`audio-upload-${section.number}`}
                              disabled={uploadingSection !== null}
                            />
                            <label htmlFor={`audio-upload-${section.number}`}>
                              <Button
                                variant="primary"
                                disabled={uploadingSection !== null}
                                style={{
                                  cursor: uploadingSection !== null ? 'not-allowed' : 'pointer',
                                  opacity: uploadingSection !== null ? 0.6 : 1,
                                  background: uploadingSection === section.number
                                    ? '#94a3b8'
                                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  border: 'none',
                                  pointerEvents: 'none'
                                }}
                                onClick={(e: React.MouseEvent) => {
                                  e.preventDefault();
                                  if (uploadingSection === null) {
                                    document.getElementById(`audio-upload-${section.number}`)?.click();
                                  }
                                }}
                              >
                                {uploadingSection === section.number ? (
                                  <>⏳ Uploading...</>
                                ) : (
                                  <>📤 Upload Audio File</>
                                )}
                              </Button>
                            </label>


                            {/* Upload Progress Bar */}
                            {uploadingSection === section.number && section.uploadProgress !== undefined && section.uploadProgress > 0 && section.uploadProgress < 100 && (
                              <div style={{ marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#10b981' }}>
                                    📤 Uploading... {section.uploadProgress}%
                                  </span>
                                  {section.uploadETA !== undefined && section.uploadETA > 0 && (
                                    <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                      ⏱️ {formatETA(section.uploadETA)} remaining
                                    </span>
                                  )}
                                </div>
                                <div style={{
                                  width: '100%',
                                  height: '10px',
                                  background: '#e2e8f0',
                                  borderRadius: '5px',
                                  overflow: 'hidden',
                                }}>
                                  <div style={{
                                    width: `${section.uploadProgress}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                                    borderRadius: '5px',
                                    transition: 'width 0.3s ease',
                                  }} />
                                </div>
                              </div>
                            )}

                            {/* Upload Complete Indicator */}
                            {section.uploadProgress === 100 && section.audioUrl && (
                              <div style={{
                                marginTop: '0.75rem',
                                padding: '0.5rem 0.75rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span style={{ color: '#10b981', fontSize: '1rem' }}>✅</span>
                                <span style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: 500 }}>
                                  Upload complete!
                                </span>
                              </div>
                            )}

                            {/* Audio Player Preview - Supports R2 direct URLs and Google Drive */}
                            {section.audioUrl && (
                              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f1f5f9', borderRadius: '0.5rem' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f766e' }}>
                                  🎧 Audio Preview
                                </div>
                                {(() => {
                                  const isR2Url = section.audioUrl.includes('r2.dev') || section.audioUrl.includes('cloudflare');
                                  const isDirectUrl = section.audioUrl.startsWith('https://') && !section.audioUrl.includes('drive.google.com');

                                  // For R2 and direct URLs, use HTML5 audio player
                                  if (isR2Url || isDirectUrl) {
                                    return (
                                      <audio
                                        controls
                                        src={section.streamUrl || section.audioUrl}
                                        style={{ width: '100%', borderRadius: '8px' }}
                                      >
                                        Your browser does not support audio playback.
                                      </audio>
                                    );
                                  }

                                  // For Google Drive URLs, use iframe embed
                                  const fileIdMatch = section.audioUrl.match(/\/d\/([^/]+)/);
                                  const fileId = fileIdMatch ? fileIdMatch[1] : null;
                                  if (!fileId) return <p style={{ color: '#ef4444' }}>Invalid Google Drive URL</p>;
                                  return (
                                    <iframe
                                      src={`https://drive.google.com/file/d/${fileId}/preview`}
                                      width="100%"
                                      height="80"
                                      allow="autoplay"
                                      style={{ border: 'none', borderRadius: '8px' }}
                                    />
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {errors[`section${section.number}`] && (
                            <span style={{ color: '#ef4444', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                              {errors[`section${section.number}`]}
                            </span>
                          )}
                        </div>

                        {/* Wait Time */}
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                            Wait Time Before Section (seconds)
                          </label>
                          <input
                            type="number"
                            value={section.waitTimeBefore || 0}
                            onChange={(e) => updateSection(section.number, 'waitTimeBefore', parseInt(e.target.value) || 0)}
                            min="0"
                            style={{
                              width: '200px',
                              padding: '0.75rem',
                              border: '2px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              fontSize: '1rem',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Section Button */}
                  <button
                    onClick={addSection}
                    style={{
                      width: '100%',
                      padding: '1.5rem',
                      border: '2px dashed #cbd5e1',
                      borderRadius: '0.75rem',
                      background: 'rgba(248, 250, 252, 0.5)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#64748b',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#8b5cf6';
                      e.currentTarget.style.color = '#8b5cf6';
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.color = '#64748b';
                      e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)';
                    }}
                  >
                    ➕ Add Section {metadata.sections.length + 1}
                  </button>
                </div>

                {/* Audio Settings Section */}
                <div style={{
                  marginTop: '2rem',
                  padding: '1.5rem',
                  border: '2px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  background: 'rgba(248, 250, 252, 0.5)',
                }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚙️ Audio Playback Settings
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                    Configure what audio controls students can see and use during the test.
                  </p>

                  {/* Preset Buttons */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.75rem', fontSize: '0.9375rem' }}>
                      Quick Presets
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioControls(AUDIO_CONTROLS_PRESETS.IELTS_STANDARD);
                          setAllowReplay(false);
                        }}
                        style={{
                          padding: '0.75rem 1.25rem',
                          borderRadius: '0.5rem',
                          border: '2px solid',
                          borderColor: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#3b82f6' : '#e2e8f0',
                          background: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? 'rgba(59, 130, 246, 0.1)' : 'white',
                          color: !audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#3b82f6' : '#64748b',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        📋 IELTS Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioControls(AUDIO_CONTROLS_PRESETS.PRACTICE_MODE);
                          setAllowReplay(true);
                          setMaxReplays(2);
                        }}
                        style={{
                          padding: '0.75rem 1.25rem',
                          borderRadius: '0.5rem',
                          border: '2px solid',
                          borderColor: audioControls.showPlayPause && audioControls.showSpeedControl ? '#10b981' : '#e2e8f0',
                          background: audioControls.showPlayPause && audioControls.showSpeedControl ? 'rgba(16, 185, 129, 0.1)' : 'white',
                          color: audioControls.showPlayPause && audioControls.showSpeedControl ? '#10b981' : '#64748b',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        🎓 Practice Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioControls(AUDIO_CONTROLS_PRESETS.RELAXED_MODE);
                          setAllowReplay(false);
                        }}
                        style={{
                          padding: '0.75rem 1.25rem',
                          borderRadius: '0.5rem',
                          border: '2px solid',
                          borderColor: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#8b5cf6' : '#e2e8f0',
                          background: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? 'rgba(139, 92, 246, 0.1)' : 'white',
                          color: audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay ? '#8b5cf6' : '#64748b',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        😌 Relaxed Mode
                      </button>
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                      {!audioControls.showPlayPause && !audioControls.showSpeedControl && !allowReplay
                        ? '🔒 Strict exam conditions: No pause, no replay, no speed control'
                        : audioControls.showPlayPause && audioControls.showSpeedControl
                          ? '✨ Full controls: Pause, replay, speed control enabled'
                          : '⏸️ Basic controls: Pause enabled, no speed control'}
                    </p>
                  </div>

                  {/* Individual Controls */}
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showPlayPause}
                        onChange={(e) => setAudioControls({ ...audioControls, showPlayPause: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow students to pause audio</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={allowReplay}
                        onChange={(e) => setAllowReplay(e.target.checked)}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow students to replay sections</span>
                    </label>

                    {allowReplay && (
                      <div style={{ marginLeft: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Max replays per section:</span>
                        <select
                          value={maxReplays}
                          onChange={(e) => setMaxReplays(parseInt(e.target.value))}
                          style={{
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.875rem',
                          }}
                        >
                          <option value={1}>1 time</option>
                          <option value={2}>2 times</option>
                          <option value={3}>3 times</option>
                          <option value={5}>5 times</option>
                          <option value={999}>Unlimited</option>
                        </select>
                      </div>
                    )}

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSpeedControl}
                        onChange={(e) => setAudioControls({ ...audioControls, showSpeedControl: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Show playback speed control (0.5x - 2x)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSeekControl}
                        onChange={(e) => setAudioControls({ ...audioControls, showSeekControl: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow seeking (drag progress bar)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showSkipSection}
                        onChange={(e) => setAudioControls({ ...audioControls, showSkipSection: e.target.checked })}
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Allow skipping to next section</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', opacity: 0.6 }}>
                      <input
                        type="checkbox"
                        checked={audioControls.showVolumeControl}
                        disabled
                        style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: '500' }}>Show volume control</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(always enabled for accessibility)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Questions Text & AI Parsing */}
            {currentStep === 'questions-text' && (
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>
                  🤖 AI Question Parsing
                </h2>

                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                  Paste your questions below and let AI parse them automatically, or skip to add questions manually.
                </p>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Paste Questions Text
                  </label>
                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="Paste all 40 questions here. Our AI will parse them automatically.

Example:
Questions 1-10
Complete the sentences below.
Write NO MORE THAN TWO WORDS for each answer.

1. The museum is located in the __________ part of the city.
2. Visitors must pay __________ to enter.
..."
                    rows={15}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: '2px solid #e2e8f0',
                      fontSize: '0.9375rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>

                {errors.parsing && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    color: '#dc2626',
                    fontSize: '0.875rem'
                  }}>
                    ❌ {errors.parsing}
                  </div>
                )}

                {isParsing && (
                  <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f0f9ff', borderRadius: '0.5rem' }}>
                    <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#3b82f6' }}>
                      {parsingStage}
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: '#dbeafe',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${parsingProgress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <Button variant="glass" onClick={handleBack}>
                    ← Back
                  </Button>
                  <Button variant="secondary" onClick={handleNext}>
                    Skip → Add Manually
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleParseQuestions}
                    disabled={isParsing || !questionText.trim()}
                    style={{
                      background: isParsing ? '#94a3b8' : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                      border: 'none'
                    }}
                  >
                    {isParsing ? '⏳ Parsing...' : '🤖 Parse with AI'}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3b: Question Images Upload (for image mode) */}
            {currentStep === 'questions-images' && (
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  🖼️ Upload Question Images by Section
                </h2>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                  Upload images for each section. Set the question range for each image.
                  When students click a question, the matching image will be displayed.
                </p>

                {/* Info Banner */}
                <div style={{
                  padding: '1rem',
                  background: 'rgba(59, 130, 246, 0.05)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  marginBottom: '1.5rem',
                }}>
                  <p style={{ color: '#3b82f6', fontSize: '0.875rem', margin: 0 }}>
                    💡 <strong>How it works:</strong> Each image covers a range of questions.
                    When you add multiple images, the next image's start is automatically set
                    to continue from where the previous image ends.
                  </p>
                </div>

                {/* Sections with configured audio only */}
                {metadata.sections.filter(s => s.audioUrl).length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    background: 'rgba(239, 68, 68, 0.05)',
                    borderRadius: '0.75rem',
                    color: '#dc2626',
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                    <p style={{ fontWeight: 600 }}>No audio sections configured!</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      Please go back to the Audio step and configure at least one section with audio.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '1.5rem' }}>
                    {metadata.sections.filter(s => s.audioUrl).map((section) => {
                      // Get images for this section, sorted by start question
                      const sectionImages = questionImages
                        .filter(img => img.sectionNumber === section.number)
                        .sort((a, b) => (a.questionRange?.start || 0) - (b.questionRange?.start || 0));

                      // Calculate if any image needs its end point set
                      const hasMultipleImages = sectionImages.length > 1;

                      return (
                        <div
                          key={section.number}
                          style={{
                            padding: '1.5rem',
                            border: '2px solid #e2e8f0',
                            borderRadius: '0.75rem',
                            background: 'rgba(255, 255, 255, 0.5)',
                          }}
                        >
                          {/* Section Header */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1rem',
                            paddingBottom: '0.75rem',
                            borderBottom: '1px solid #e2e8f0'
                          }}>
                            <div>
                              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0, color: '#1e293b' }}>
                                🎵 Section {section.number}: {section.name}
                              </h3>
                              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                                Questions {section.startQuestion} - {section.endQuestion} ({section.endQuestion - section.startQuestion + 1} questions)
                              </p>
                            </div>

                            {/* Add Image Button */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                type="file"
                                accept="image/*,.png,.jpg,.jpeg,.gif,.webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      const dataUrl = event.target?.result as string;
                                      handleAddImage(section, dataUrl);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                  e.target.value = '';
                                }}
                                style={{ display: 'none' }}
                                id={`section-${section.number}-upload`}
                              />

                              {/* Paste Button */}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const items = await navigator.clipboard.read();
                                    let foundImage = false;

                                    for (const item of items) {
                                      const imageType = item.types.find(type => type.startsWith('image/'));
                                      if (imageType) {
                                        foundImage = true;
                                        const blob = await item.getType(imageType);
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                          const dataUrl = event.target?.result as string;
                                          handleAddImage(section, dataUrl);
                                        };
                                        reader.readAsDataURL(blob);
                                        break; // Only paste one image at a time
                                      }
                                    }

                                    if (!foundImage) {
                                      alert('No image found in clipboard! Copy an image first.');
                                    }
                                  } catch (err) {
                                    console.error('Clipboard paste failed:', err);
                                    // Fallback for Firefox or if permission denied
                                    const textarea = document.createElement('textarea');
                                    textarea.style.position = 'fixed';
                                    textarea.style.opacity = '0';
                                    document.body.appendChild(textarea);
                                    textarea.focus();

                                    try {
                                      document.execCommand('paste');
                                      // This basic fallback usually handles text, not images well, 
                                      // so we mainly rely on the API or show instruction
                                      alert('Please allow clipboard access or use Ctrl+V on the page if prompt appears.');
                                    } catch (e) {
                                      alert('Clipboard access denied. Please use the "Add Image" button instead.');
                                    } finally {
                                      document.body.removeChild(textarea);
                                    }
                                  }
                                }}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '0.5rem',
                                  color: '#64748b',
                                  fontWeight: 600,
                                  fontSize: '0.875rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#f8fafc';
                                  e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'white';
                                  e.currentTarget.style.borderColor = '#e2e8f0';
                                }}
                              >
                                📋 Paste
                              </button>

                              <button
                                type="button"
                                onClick={() => document.getElementById(`section-${section.number}-upload`)?.click()}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                  border: 'none',
                                  borderRadius: '0.5rem',
                                  color: 'white',
                                  fontWeight: 600,
                                  fontSize: '0.875rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                }}
                              >
                                ➕ Add Image
                              </button>
                            </div>
                          </div>

                          {/* Images for this section */}
                          {sectionImages.length === 0 ? (
                            <div style={{
                              textAlign: 'center',
                              padding: '2rem',
                              background: 'rgba(248, 250, 252, 0.8)',
                              borderRadius: '0.5rem',
                              border: '2px dashed #cbd5e1',
                            }}>
                              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🖼️</div>
                              <p style={{ color: '#64748b', margin: 0, fontWeight: 500 }}>
                                No images yet
                              </p>
                              <p style={{ color: '#94a3b8', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                                Click "Add Image" to upload. The first image will cover Q{section.startQuestion}-{section.endQuestion} by default.
                              </p>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              {sectionImages.map((img, imgIdx) => {
                                // Find the global index for this image
                                const globalIdx = questionImages.findIndex(
                                  qi => qi.sectionNumber === img.sectionNumber &&
                                    qi.imageUrl === img.imageUrl
                                );

                                const isFirstImage = imgIdx === 0;
                                const isLastImage = imgIdx === sectionImages.length - 1;
                                const prevImage = imgIdx > 0 ? sectionImages[imgIdx - 1] : null;

                                // Calculate the expected start based on previous image
                                const expectedStart = prevImage
                                  ? (prevImage.questionRange?.end || section.startQuestion) + 1
                                  : section.startQuestion;

                                // Check if this image needs attention (start doesn't match expected for non-first images)
                                const needsStartAdjustment = !isFirstImage &&
                                  (img.questionRange?.start !== expectedStart);

                                // For first image when there are multiple, check if end is properly set (not at max when there are more images)
                                const needsEndSet = hasMultipleImages && !isLastImage &&
                                  (img.questionRange?.end === section.endQuestion);

                                return (
                                  <div
                                    key={`sec${section.number}-img${imgIdx}`}
                                    style={{
                                      display: 'flex',
                                      gap: '1rem',
                                      padding: '1rem',
                                      border: needsEndSet ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                      borderRadius: '0.75rem',
                                      background: needsEndSet ? 'rgba(245, 158, 11, 0.05)' : 'white',
                                      alignItems: 'flex-start',
                                    }}
                                  >
                                    {/* Image Preview */}
                                    <div style={{ flexShrink: 0 }}>
                                      <img
                                        src={img.imageUrl}
                                        alt={`Section ${section.number} - Image ${imgIdx + 1}`}
                                        style={{
                                          width: '120px',
                                          height: '90px',
                                          objectFit: 'cover',
                                          borderRadius: '0.5rem',
                                          border: '1px solid #e2e8f0',
                                        }}
                                      />
                                    </div>

                                    {/* Image Info & Controls */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {/* Header row */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <span style={{ fontWeight: 600, color: '#8b5cf6', fontSize: '0.9375rem' }}>
                                          📄 Image {imgIdx + 1} of {sectionImages.length}
                                        </span>
                                        <button
                                          onClick={() => {
                                            setQuestionImages(prev => {
                                              const updated = prev.filter((_, i) => i !== globalIdx);
                                              // If we're removing a non-last image, update the next image's start
                                              // to cascade properly
                                              return updated;
                                            });
                                          }}
                                          style={{
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: 'none',
                                            borderRadius: '0.375rem',
                                            padding: '0.375rem 0.75rem',
                                            color: '#dc2626',
                                            fontSize: '0.8125rem',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                          }}
                                        >
                                          🗑️ Remove
                                        </button>
                                      </div>

                                      {/* Warning for needing end point */}
                                      {needsEndSet && (
                                        <div style={{
                                          padding: '0.5rem 0.75rem',
                                          background: 'rgba(245, 158, 11, 0.1)',
                                          borderRadius: '0.375rem',
                                          marginBottom: '0.75rem',
                                          fontSize: '0.8125rem',
                                          color: '#b45309',
                                        }}>
                                          ⚠️ <strong>Set the end question</strong> for this image to define where the next image starts.
                                        </div>
                                      )}

                                      {/* Question Range Controls */}
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.75rem',
                                        background: 'rgba(139, 92, 246, 0.05)',
                                        borderRadius: '0.5rem',
                                      }}>
                                        <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>
                                          Questions:
                                        </span>

                                        {/* Start Question */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          {isFirstImage ? (
                                            // First image: Start is always section start (read-only)
                                            <span style={{
                                              padding: '0.5rem 0.75rem',
                                              background: '#f1f5f9',
                                              borderRadius: '0.375rem',
                                              fontWeight: 600,
                                              color: '#1e293b',
                                              fontSize: '0.9375rem',
                                              minWidth: '45px',
                                              textAlign: 'center',
                                            }}>
                                              {section.startQuestion}
                                            </span>
                                          ) : (
                                            // Subsequent images: Start is auto-calculated (read-only, shows expected)
                                            <span style={{
                                              padding: '0.5rem 0.75rem',
                                              background: needsStartAdjustment ? '#fef3c7' : '#f1f5f9',
                                              borderRadius: '0.375rem',
                                              fontWeight: 600,
                                              color: needsStartAdjustment ? '#b45309' : '#1e293b',
                                              fontSize: '0.9375rem',
                                              minWidth: '45px',
                                              textAlign: 'center',
                                            }}>
                                              {expectedStart}
                                            </span>
                                          )}
                                        </div>

                                        <span style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '1rem' }}>→</span>

                                        {/* End Question - Editable */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          <input
                                            type="number"
                                            min={isFirstImage ? section.startQuestion : expectedStart}
                                            max={section.endQuestion}
                                            value={img.questionRange?.end || section.endQuestion}
                                            onChange={(e) => {
                                              const newEnd = Math.max(
                                                isFirstImage ? section.startQuestion : expectedStart,
                                                Math.min(parseInt(e.target.value) || section.endQuestion, section.endQuestion)
                                              );

                                              setQuestionImages(prev => {
                                                // Update this image's end
                                                let updated = prev.map((item, i) =>
                                                  i === globalIdx
                                                    ? {
                                                      ...item,
                                                      questionRange: {
                                                        start: isFirstImage ? section.startQuestion : expectedStart,
                                                        end: newEnd
                                                      }
                                                    }
                                                    : item
                                                );

                                                // Also update subsequent images' start values in this section
                                                const sectionImgIndices = updated
                                                  .map((img, idx) => ({ img, idx }))
                                                  .filter(item => item.img.sectionNumber === section.number)
                                                  .sort((a, b) => (a.img.questionRange?.start || 0) - (b.img.questionRange?.start || 0));

                                                // Find position of current image in section
                                                const currentPosInSection = sectionImgIndices.findIndex(item => item.idx === globalIdx);

                                                // Update all images after this one
                                                for (let i = currentPosInSection + 1; i < sectionImgIndices.length; i++) {
                                                  const prevImg = sectionImgIndices[i - 1].img;
                                                  const currentIdx = sectionImgIndices[i].idx;
                                                  const newStart = (prevImg.questionRange?.end || section.startQuestion) + 1;

                                                  updated = updated.map((item, idx) =>
                                                    idx === currentIdx
                                                      ? {
                                                        ...item,
                                                        questionRange: {
                                                          start: newStart,
                                                          end: Math.max(newStart, item.questionRange?.end || section.endQuestion)
                                                        }
                                                      }
                                                      : item
                                                  );
                                                }

                                                return updated;
                                              });
                                            }}
                                            style={{
                                              width: '65px',
                                              padding: '0.5rem',
                                              border: needsEndSet ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                              borderRadius: '0.375rem',
                                              fontSize: '0.9375rem',
                                              textAlign: 'center',
                                              fontWeight: 600,
                                              background: needsEndSet ? '#fffbeb' : 'white',
                                            }}
                                          />
                                        </div>

                                        {/* Question count badge */}
                                        <span style={{
                                          marginLeft: 'auto',
                                          padding: '0.25rem 0.5rem',
                                          background: '#8b5cf6',
                                          color: 'white',
                                          borderRadius: '9999px',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                        }}>
                                          {((img.questionRange?.end || section.endQuestion) - (isFirstImage ? section.startQuestion : expectedStart) + 1)} Qs
                                        </span>
                                      </div>

                                      {/* Help text */}
                                      <p style={{
                                        fontSize: '0.75rem',
                                        color: '#94a3b8',
                                        margin: '0.5rem 0 0 0',
                                      }}>
                                        {isLastImage && hasMultipleImages
                                          ? `This is the last image. It will cover Q${expectedStart}-${img.questionRange?.end || section.endQuestion}.`
                                          : !hasMultipleImages
                                            ? `This image covers all questions in this section (${section.startQuestion}-${section.endQuestion}).`
                                            : `Set the end question. The next image will start at Q${(img.questionRange?.end || section.endQuestion) + 1}.`
                                        }
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Coverage Summary for this section */}
                          {sectionImages.length > 0 && (
                            <div style={{
                              marginTop: '1rem',
                              padding: '0.75rem',
                              background: 'rgba(139, 92, 246, 0.05)',
                              borderRadius: '0.5rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}>
                              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                📊 Coverage: {sectionImages.map((img, idx) => {
                                  const prevImg = idx > 0 ? sectionImages[idx - 1] : null;
                                  const start = idx === 0
                                    ? section.startQuestion
                                    : (prevImg?.questionRange?.end || section.startQuestion) + 1;
                                  return `Q${start}-${img.questionRange?.end || '?'}`;
                                }).join(', ')}
                              </span>
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                background: '#10b981',
                                color: 'white',
                                borderRadius: '9999px',
                                fontWeight: 600,
                              }}>
                                {sectionImages.length} image{sectionImages.length > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Summary */}
                {questionImages.length > 0 && (
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: 'rgba(16, 185, 129, 0.05)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}>
                    <p style={{ color: '#10b981', fontSize: '0.875rem', margin: 0, fontWeight: 600 }}>
                      ✅ {questionImages.length} image{questionImages.length > 1 ? 's' : ''} configured across {
                        new Set(questionImages.map(img => img.sectionNumber)).size
                      } section{new Set(questionImages.map(img => img.sectionNumber)).size > 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            )}


            {/* STEP 4: Questions or Answer Key */}
            {currentStep === 'questions' && (
              <AssessmentAuthoringSection
                title={displayMode === 'image'
                  ? `🔑 Answer Key (${questions.length} Questions)`
                  : `Questions (${questions.length}/${metadata.totalQuestions})`
                }
                action={displayMode !== 'image' ? (
                    <Button variant="primary" onClick={addQuestion}>
                      + Add Question
                    </Button>
                ) : undefined}
              >

                {displayMode === 'image' && (
                  <div style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                    <p style={{ color: '#64748b', marginBottom: '1rem', marginTop: 0 }}>
                      <strong>Since questions are on the images,</strong> you only need to provide the answer key.
                      <br />
                      You can fill answers manually below, or paste a list to auto-fill.
                    </p>

                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                      <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#475569' }}>
                        ⚡ Bulk Import (Auto-Fill)
                        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>(Paste one answer per line)</span>
                      </label>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <textarea
                          value={bulkAnswerKey}
                          onChange={(e) => setBulkAnswerKey(e.target.value)}
                          placeholder="1. Answer A&#10;2. Answer B&#10;...or just paste list"
                          rows={4}
                          style={{
                            flex: 1,
                            padding: '0.75rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '0.5rem',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem'
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <Button
                            onClick={handleBulkParseAnswers}
                            variant="secondary"
                            disabled={!bulkAnswerKey.trim() || isParsing}
                            style={{
                              background: isParsing ? '#e2e8f0' : '#e0e7ff',
                              color: isParsing ? '#94a3b8' : '#4338ca',
                              border: '1px solid #c7d2fe',
                              cursor: isParsing ? 'wait' : 'pointer'
                            }}
                          >
                            {isParsing ? '✨ Analyzing...' : '🪄 Auto-Fill Answers'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {questions.length === 0 ? (
                  <AssessmentStatusState
                    variant="empty"
                    title="No questions added yet"
                    titleLevel={3}
                    align="center"
                    message={<p>Click "Add Question" to start.</p>}
                  />
                ) : (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {questions.map((q, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          background: displayMode === 'image' ? 'white' : 'white',
                          display: 'flex',
                          alignItems: 'center', // Align center vertically
                          gap: '1rem',
                        }}
                      >
                        {/* Question Number */}
                        <div style={{
                          width: '3rem',
                          height: '3rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f1f5f9',
                          borderRadius: '0.375rem',
                          fontWeight: 700,
                          color: '#475569',
                          flexShrink: 0
                        }}>
                          Q{q.number}
                        </div>

                        {/* Editor Area */}
                        <div style={{ flex: 1 }}>
                          {displayMode === 'image' ? (
                            /* Image Mode: Only Answer */
                            <input
                              type="text"
                              value={q.answer}
                              onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
                              placeholder={`Enter answer for Question ${q.number}`}
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #cbd5e1', // Slightly darker border for connection
                                borderRadius: '0.375rem',
                                fontWeight: 500,
                                fontSize: '1rem'
                              }}
                            />
                          ) : (
                            /* Text Mode: Full Editor */
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.875rem', color: '#64748b' }}>Question Text</span>
                                <button
                                  onClick={() => deleteQuestion(idx)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                              <input
                                type="text"
                                value={q.question}
                                onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                                placeholder="Question text..."
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '0.375rem',
                                  marginBottom: '0.5rem',
                                }}
                              />
                              <input
                                type="text"
                                value={q.answer}
                                onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
                                placeholder="Answer..."
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '0.375rem',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AssessmentAuthoringSection>
            )}

            {/* STEP 4: Review */}
            {currentStep === 'review' && (
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>
                  Review & Save
                </h2>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontWeight: '600', marginBottom: '0.75rem' }}>Test Information</h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.875rem', color: '#64748b' }}>
                          Title *
                        </label>
                        <input
                          type="text"
                          value={metadata.title}
                          onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                          placeholder="e.g., IELTS Listening Practice Test 1"
                          style={{
                            width: '100%',
                            padding: '0.625rem',
                            border: '2px solid #e2e8f0',
                            borderRadius: '0.5rem',
                            fontSize: '1rem',
                          }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.875rem', color: '#64748b' }}>
                            Duration (minutes)
                          </label>
                          <input
                            type="number"
                            value={metadata.duration}
                            onChange={(e) => setMetadata({ ...metadata, duration: parseInt(e.target.value) || 0 })}
                            min="1"
                            style={{
                              width: '100%',
                              padding: '0.625rem',
                              border: '2px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              fontSize: '1rem',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', fontSize: '0.875rem', color: '#64748b' }}>
                            Description (optional)
                          </label>
                          <input
                            type="text"
                            value={metadata.description}
                            onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                            placeholder="Brief description..."
                            style={{
                              width: '100%',
                              padding: '0.625rem',
                              border: '2px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              fontSize: '1rem',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <p style={{ marginTop: '0.75rem' }}><strong>Type:</strong> {metadata.type} &bull; <strong>Questions:</strong> {questions.length}</p>

                    <div style={{ marginTop: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={(e) => setIsPublic(e.target.checked)}
                          style={{ width: '1.25rem', height: '1.25rem' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>Make Publicly Available</span>
                          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            If checked, this test will appear in the Public Library for other teachers.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Audio Sections</h3>
                    {metadata.sections.map(s => (
                      <p key={s.number}>
                        <strong>Section {s.number}:</strong> {s.audioUrl ? '✅ Configured' : '❌ Missing'}
                      </p>
                    ))}
                  </div>

                  {errors.save && (
                    <div style={{
                      padding: '1rem',
                      background: '#fef2f2',
                      border: '1px solid #ef4444',
                      borderRadius: '0.5rem',
                      color: '#ef4444',
                    }}>
                      {errors.save}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '2rem',
              paddingTop: '2rem',
              borderTop: '1px solid #e2e8f0',
            }}>
              {/* Show Back button for all steps (handles navigation on first step) */}
              <Button variant="glass" onClick={handleBack}>
                {currentStep === 'mode-select' ? '← Back' : '← Back'}
              </Button>



              {currentStep !== 'review' ? (
                <Button variant="primary" onClick={handleNext} style={{ marginLeft: 'auto' }}>
                  Next →
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleSaveTest}
                  disabled={isSaving}
                  style={{ marginLeft: 'auto' }}
                >
                  {isSaving ? 'Saving...' : 'Save Test'}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
};

export default ListeningTestBuilder;
