import { useState, useEffect } from 'react';
import { Group, Text } from '@mantine/core';
import TimerDisplay from '../components/TimerDisplay';
import TimerAdjustButton from '../components/TimerAdjustButton';
import PlayerManagementPanel from './PlayerManagementPanel';
import BanListPanel from './BanListPanel';
import QuestionJumpPanel from './QuestionJumpPanel';
import { useThemeContext } from '../context/ThemeContext.jsx';
import { Button } from './modern';

const TeacherFooterBar = ({
  playerCount = 0,
  timerState = null,
  canGoPrevious = true,
  isFirstQuestion = false,
  isLastQuestion = false,
  questions = [],
  currentQuestionIndex = 0,
  players = {},
  bannedPlayers = {},
  onBackClick,
  onPreviousClick,
  onPauseResumeClick,
  onNextClick,
  onLogoutClick,
  onJumpToQuestion,
  onTimeUp,
  onKickPlayer,
  onUnbanPlayer,
  onEndSessionClick,
  onTimerAdjust,
  nextDisabled = false
}) => {
  const { template } = useThemeContext();
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const [showBanPanel, setShowBanPanel] = useState(false);
  const [showPreviousPanel, setShowPreviousPanel] = useState(false);
  const [showNextPanel, setShowNextPanel] = useState(false);
  const [playerButtonRef, setPlayerButtonRef] = useState(null);
  const [banButtonRef, setBanButtonRef] = useState(null);
  const [previousButtonRef, setPreviousButtonRef] = useState(null);
  const [nextButtonRef, setNextButtonRef] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Track window width for responsive layout
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine layout mode based on width
  const isCompact = windowWidth < 1200;
  const isVeryCompact = windowWidth < 900;

  const handlePanelToggle = (panelName) => {
    // Close all panels first
    setShowPlayerPanel(false);
    setShowBanPanel(false);
    setShowPreviousPanel(false);
    setShowNextPanel(false);
    
    // Open the requested panel
    if (panelName === 'player') setShowPlayerPanel(true);
    else if (panelName === 'ban') setShowBanPanel(true);
    else if (panelName === 'previous') setShowPreviousPanel(true);
    else if (panelName === 'next') setShowNextPanel(true);
  };

  return (
    <>
      <div style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        height: isVeryCompact ? '60px' : '70px',
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '2px solid rgba(139, 92, 246, 0.2)',
        boxShadow: '0 -4px 20px rgba(139, 92, 246, 0.1)',
        zIndex: 1200
      }}>
        <Group h="100%" px={isVeryCompact ? 'xs' : 'sm'} justify="space-between" style={{ flexWrap: 'nowrap', gap: isVeryCompact ? '0.25rem' : '0.5rem' }}>
          {/* Left section */}
          <Group spacing={isVeryCompact ? 2 : 'xs'} style={{ flexShrink: 1, minWidth: 0 }}>
            <Group spacing={0} style={{ gap: 0 }}>
              <Button
                onClick={onPreviousClick}
                disabled={isFirstQuestion || !canGoPrevious}
                variant="glass"
                size="sm"
                style={{ 
                  borderTopRightRadius: 0, 
                  borderBottomRightRadius: 0, 
                  marginRight: 0,
                  padding: isVeryCompact ? '0.25rem 0.5rem' : undefined
                }}
              >
                {isVeryCompact ? '◄' : 'Previous'}
              </Button>
              <div ref={setPreviousButtonRef}>
                <Button
                  variant="glass"
                  size="sm"
                  disabled={isFirstQuestion || !canGoPrevious}
                  onClick={() => handlePanelToggle(showPreviousPanel ? null : 'previous')}
                  style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, paddingLeft: 5, paddingRight: 5, marginLeft: 0 }}
                  aria-label="Jump to previous question"
                >
                  ▼
                </Button>
              </div>
            </Group>
            {!isVeryCompact && (
              <Button 
                variant="danger" 
                size="sm"
                onClick={onEndSessionClick}
                style={{ padding: isCompact ? '0.25rem 0.5rem' : undefined }}
              >
                {isCompact ? '⏹' : 'End Session'}
              </Button>
            )}
          </Group>

          {/* Center section - Timer and controls */}
          <Group 
            spacing={isCompact ? 'xs' : 'sm'} 
            style={{ 
              position: isVeryCompact ? 'relative' : 'absolute',
              left: isVeryCompact ? 'auto' : '50%',
              transform: isVeryCompact ? 'none' : 'translateX(-50%)',
              alignItems: 'center',
              flexShrink: isVeryCompact ? 1 : 0,
              minWidth: 0
            }}
          >
            <Button 
              onClick={onPauseResumeClick}
              variant={timerState?.isPaused ? "success" : "warning"}
              size="sm"
              style={{ 
                height: isVeryCompact ? '30px' : '34px', 
                minHeight: isVeryCompact ? '30px' : '34px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                padding: isVeryCompact ? '0.25rem 0.5rem' : undefined
              }}
            >
              {timerState?.isPaused ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: isCompact ? '0.25rem' : '0.5rem' }}>
                  <svg width={isVeryCompact ? '12' : '16'} height={isVeryCompact ? '12' : '16'} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  {!isVeryCompact && 'Resume'}
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: isCompact ? '0.25rem' : '0.5rem' }}>
                  <svg width={isVeryCompact ? '12' : '16'} height={isVeryCompact ? '12' : '16'} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                  </svg>
                  {!isVeryCompact && 'Pause'}
                </span>
              )}
            </Button>
            {timerState && timerState.totalTime > 0 && !isVeryCompact && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TimerAdjustButton
                  type="subtract"
                  onAdjust={onTimerAdjust}
                  disabled={!timerState}
                  size="sm"
                  isCompact={isCompact}
                />
                <TimerDisplay 
                  timerState={timerState}
                  onTimeUp={onTimeUp}
                  size={isCompact ? 40 : 50}
                  onClick={onTimeUp}
                />
                <TimerAdjustButton
                  type="add"
                  onAdjust={onTimerAdjust}
                  disabled={!timerState}
                  size="sm"
                  isCompact={isCompact}
                />
              </div>
            )}
            <div style={{ 
              padding: isVeryCompact ? '0.25rem 0.5rem' : '0.5rem 1rem',
              background: '#ffffff',
              borderRadius: '0.5rem',
              border: '2px solid #e2e8f0',
              height: isVeryCompact ? '30px' : '34px',
              minHeight: isVeryCompact ? '30px' : '34px',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              whiteSpace: 'nowrap'
            }}>
              <Text size={isVeryCompact ? 'xs' : 'sm'} fw={700} style={{ color: '#1e293b' }}>
                {isVeryCompact ? `Q${currentQuestionIndex + 1}/${questions.length}` : `Question ${currentQuestionIndex + 1} / ${questions.length}`}
              </Text>
            </div>
          </Group>

          {/* Right section */}
          <Group spacing={isVeryCompact ? 2 : 'xs'} style={{ flexShrink: 1, minWidth: 0 }}>
            {!isVeryCompact && (
              <div ref={setPlayerButtonRef}>
                <Button 
                  variant="glass" 
                  size="sm"
                  onClick={() => handlePanelToggle(showPlayerPanel ? null : 'player')}
                  style={{ padding: isCompact ? '0.25rem 0.5rem' : undefined }}
                >
                  {isCompact ? `👥 ${playerCount}` : `Players (${playerCount})`}
                </Button>
              </div>
            )}
            {!isVeryCompact && (
              <div ref={setBanButtonRef}>
                <Button 
                  variant="danger" 
                  size="sm"
                  onClick={() => handlePanelToggle(showBanPanel ? null : 'ban')}
                  style={{ padding: isCompact ? '0.25rem 0.5rem' : undefined }}
                >
                  {isCompact ? '🚫' : 'Ban List'}
                </Button>
              </div>
            )}
            <Group spacing={0} style={{ gap: 0 }}>
              <Button
                onClick={onNextClick}
                disabled={nextDisabled}
                variant="primary"
                size="sm"
                style={{ 
                  borderTopRightRadius: 0, 
                  borderBottomRightRadius: 0, 
                  marginRight: 0,
                  padding: isVeryCompact ? '0.25rem 0.5rem' : undefined
                }}
              >
                {isLastQuestion ? (isVeryCompact ? '✓' : 'Finish') : (isVeryCompact ? '►' : 'Next')}
              </Button>
              <div ref={setNextButtonRef}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isLastQuestion || nextDisabled}
                  onClick={() => handlePanelToggle(showNextPanel ? null : 'next')}
                  style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, paddingLeft: 5, paddingRight: 5, marginLeft: 0 }}
                  aria-label="Jump to next question"
                >
                  ▼
                </Button>
              </div>
            </Group>
          </Group>
        </Group>
      </div>

      {/* Player Management Panel */}
      <PlayerManagementPanel
        isOpen={showPlayerPanel}
        onClose={() => setShowPlayerPanel(false)}
        players={players}
        onKickPlayer={onKickPlayer}
        buttonRef={playerButtonRef}
      />

      {/* Ban List Panel */}
      <BanListPanel
        isOpen={showBanPanel}
        onClose={() => setShowBanPanel(false)}
        bannedPlayers={bannedPlayers}
        buttonRef={banButtonRef}
        onUnbanPlayer={onUnbanPlayer}
      />

      {/* Previous Question Jump Panel */}
      <QuestionJumpPanel
        isOpen={showPreviousPanel}
        onClose={() => setShowPreviousPanel(false)}
        questions={questions}
        currentQuestionIndex={currentQuestionIndex}
        onJumpToQuestion={onJumpToQuestion}
        buttonRef={previousButtonRef}
        type="previous"
      />

      {/* Next Question Jump Panel */}
      <QuestionJumpPanel
        isOpen={showNextPanel}
        onClose={() => setShowNextPanel(false)}
        questions={questions}
        currentQuestionIndex={currentQuestionIndex}
        onJumpToQuestion={onJumpToQuestion}
        buttonRef={nextButtonRef}
        type="next"
      />
    </>
  );
};

export default TeacherFooterBar;
