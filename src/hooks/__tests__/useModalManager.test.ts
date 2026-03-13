import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalManager } from '../useModalManager';

describe('useModalManager', () => {
  it('starts with all modals closed', () => {
    const { result } = renderHook(() => useModalManager());
    const { state } = result.current;

    expect(state.editTest.show).toBe(false);
    expect(state.editTest.test).toBeNull();
    expect(state.editThcsTest.show).toBe(false);
    expect(state.testCreation.show).toBe(false);
    expect(state.hwDialog.show).toBe(false);
    expect(state.useAsIs.show).toBe(false);
  });

  it('opens and closes editTest modal', () => {
    const { result } = renderHook(() => useModalManager());
    const mockTest = { id: 'test-1', title: 'IELTS Reading' };

    act(() => { result.current.openEditTest(mockTest); });
    expect(result.current.state.editTest.show).toBe(true);
    expect(result.current.state.editTest.test).toEqual(mockTest);

    act(() => { result.current.closeEditTest(); });
    expect(result.current.state.editTest.show).toBe(false);
    expect(result.current.state.editTest.test).toBeNull();
  });

  it('opens and closes editThcsTest modal', () => {
    const { result } = renderHook(() => useModalManager());
    const mockTest = { id: 'thcs-1', testType: 'THCS-THPT' };

    act(() => { result.current.openEditThcsTest(mockTest); });
    expect(result.current.state.editThcsTest.show).toBe(true);
    expect(result.current.state.editThcsTest.test).toEqual(mockTest);

    act(() => { result.current.closeEditThcsTest(); });
    expect(result.current.state.editThcsTest.show).toBe(false);
    expect(result.current.state.editThcsTest.test).toBeNull();
  });

  it('opens and closes testCreation modal', () => {
    const { result } = renderHook(() => useModalManager());

    act(() => { result.current.openTestCreation(); });
    expect(result.current.state.testCreation.show).toBe(true);

    act(() => { result.current.closeTestCreation(); });
    expect(result.current.state.testCreation.show).toBe(false);
  });

  it('opens and closes hwDialog modal', () => {
    const { result } = renderHook(() => useModalManager());
    const mockTest = { id: 'hw-1', metadata: { title: 'Grade 9' } };

    act(() => { result.current.openHwDialog(mockTest); });
    expect(result.current.state.hwDialog.show).toBe(true);
    expect(result.current.state.hwDialog.test).toEqual(mockTest);

    act(() => { result.current.closeHwDialog(); });
    expect(result.current.state.hwDialog.show).toBe(false);
  });

  it('opens and closes useAsIs modal', () => {
    const { result } = renderHook(() => useModalManager());
    const mockTest = { id: 'public-1', isPublic: true };

    act(() => { result.current.openUseAsIs(mockTest); });
    expect(result.current.state.useAsIs.show).toBe(true);
    expect(result.current.state.useAsIs.test).toEqual(mockTest);

    act(() => { result.current.closeUseAsIs(); });
    expect(result.current.state.useAsIs.show).toBe(false);
  });

  it('allows multiple modals to be independent', () => {
    const { result } = renderHook(() => useModalManager());

    act(() => { result.current.openEditTest({ id: '1' }); });
    act(() => { result.current.openTestCreation(); });

    // Both should be open
    expect(result.current.state.editTest.show).toBe(true);
    expect(result.current.state.testCreation.show).toBe(true);

    // Closing one doesn't affect the other
    act(() => { result.current.closeEditTest(); });
    expect(result.current.state.editTest.show).toBe(false);
    expect(result.current.state.testCreation.show).toBe(true);
  });
});
