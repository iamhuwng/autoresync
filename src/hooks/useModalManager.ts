import { useReducer, useCallback } from 'react';

// --- Types ---

interface ModalEntry {
  show: boolean;
  test: any;
}

interface ModalState {
  editTest: ModalEntry;
  editThcsTest: ModalEntry;
  testCreation: { show: boolean };
  hwDialog: ModalEntry;
  useAsIs: ModalEntry;
}

type ModalAction =
  | { type: 'OPEN_EDIT_TEST'; payload: any }
  | { type: 'CLOSE_EDIT_TEST' }
  | { type: 'OPEN_EDIT_THCS_TEST'; payload: any }
  | { type: 'CLOSE_EDIT_THCS_TEST' }
  | { type: 'OPEN_TEST_CREATION' }
  | { type: 'CLOSE_TEST_CREATION' }
  | { type: 'OPEN_HW_DIALOG'; payload: any }
  | { type: 'CLOSE_HW_DIALOG' }
  | { type: 'OPEN_USE_AS_IS'; payload: any }
  | { type: 'CLOSE_USE_AS_IS' };

// --- Initial State ---

const initialState: ModalState = {
  editTest: { show: false, test: null },
  editThcsTest: { show: false, test: null },
  testCreation: { show: false },
  hwDialog: { show: false, test: null },
  useAsIs: { show: false, test: null },
};

// --- Reducer ---

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_EDIT_TEST':
      return { ...state, editTest: { show: true, test: action.payload } };
    case 'CLOSE_EDIT_TEST':
      return { ...state, editTest: { show: false, test: null } };
    case 'OPEN_EDIT_THCS_TEST':
      return { ...state, editThcsTest: { show: true, test: action.payload } };
    case 'CLOSE_EDIT_THCS_TEST':
      return { ...state, editThcsTest: { show: false, test: null } };
    case 'OPEN_TEST_CREATION':
      return { ...state, testCreation: { show: true } };
    case 'CLOSE_TEST_CREATION':
      return { ...state, testCreation: { show: false } };
    case 'OPEN_HW_DIALOG':
      return { ...state, hwDialog: { show: true, test: action.payload } };
    case 'CLOSE_HW_DIALOG':
      return { ...state, hwDialog: { show: false, test: null } };
    case 'OPEN_USE_AS_IS':
      return { ...state, useAsIs: { show: true, test: action.payload } };
    case 'CLOSE_USE_AS_IS':
      return { ...state, useAsIs: { show: false, test: null } };
    default:
      return state;
  }
}

// --- Hook ---

export function useModalManager() {
  const [state, dispatch] = useReducer(modalReducer, initialState);

  const openEditTest = useCallback((test: any) => dispatch({ type: 'OPEN_EDIT_TEST', payload: test }), []);
  const closeEditTest = useCallback(() => dispatch({ type: 'CLOSE_EDIT_TEST' }), []);
  const openEditThcsTest = useCallback((test: any) => dispatch({ type: 'OPEN_EDIT_THCS_TEST', payload: test }), []);
  const closeEditThcsTest = useCallback(() => dispatch({ type: 'CLOSE_EDIT_THCS_TEST' }), []);
  const openTestCreation = useCallback(() => dispatch({ type: 'OPEN_TEST_CREATION' }), []);
  const closeTestCreation = useCallback(() => dispatch({ type: 'CLOSE_TEST_CREATION' }), []);
  const openHwDialog = useCallback((test: any) => dispatch({ type: 'OPEN_HW_DIALOG', payload: test }), []);
  const closeHwDialog = useCallback(() => dispatch({ type: 'CLOSE_HW_DIALOG' }), []);
  const openUseAsIs = useCallback((test: any) => dispatch({ type: 'OPEN_USE_AS_IS', payload: test }), []);
  const closeUseAsIs = useCallback(() => dispatch({ type: 'CLOSE_USE_AS_IS' }), []);

  return {
    state,
    dispatch,
    openEditTest,
    closeEditTest,
    openEditThcsTest,
    closeEditThcsTest,
    openTestCreation,
    closeTestCreation,
    openHwDialog,
    closeHwDialog,
    openUseAsIs,
    closeUseAsIs,
  };
}
