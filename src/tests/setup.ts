import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('../services/firebase', () => ({
  initializeFirebase: vi.fn(),
  auth: {
    onAuthStateChanged: vi.fn(),
  },
}));
