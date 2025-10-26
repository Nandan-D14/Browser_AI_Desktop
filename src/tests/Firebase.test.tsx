import { describe, it, expect, vi } from 'vitest';
import { initializeFirebase } from '../../services/firebase';

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

describe('Firebase', () => {
  it('should not throw an error when initialized multiple times', () => {
    expect(() => {
      initializeFirebase();
      initializeFirebase();
    }).not.toThrow();
  });
});
