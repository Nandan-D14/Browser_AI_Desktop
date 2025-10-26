import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WindowComponent from '../../components/Window';
import { AppContext } from '../../App';
import { WindowInstance } from '../../types';

const TOP_MENU_BAR_HEIGHT = 28;

describe('WindowComponent', () => {
  const mockOnUpdateWindow = vi.fn();
  const mockOnFocus = vi.fn();

  beforeEach(() => {
    mockOnUpdateWindow.mockClear();
    mockOnFocus.mockClear();
  });

  const windowInstance: WindowInstance = {
    id: 'test-window',
    appId: 'test-app',
    title: 'Test Window',
    position: { x: 100, y: 100 },
    size: { width: 400, height: 300 },
    zIndex: 1,
    isMinimized: false,
    isMaximized: false,
  };

  const appContextValue: any = { // Using any to avoid providing all context values
    theme: {
      mode: 'dark',
      accentColor: '#0000ff',
      fontFamily: 'sans-serif',
    },
  };

  it('should not allow resizing height to be less than the minimum', () => {
    const { container } = render(
      <AppContext.Provider value={appContextValue}>
        <WindowComponent
          instance={windowInstance}
          onClose={() => {}}
          onMinimize={() => {}}
          onMaximize={() => {}}
          onFocus={mockOnFocus}
          onUpdateWindow={mockOnUpdateWindow}
          isActive={true}
        >
          <div>Window Content</div>
        </WindowComponent>
      </AppContext.Provider>
    );

    const topResizeHandle = container.querySelector('div[style*="cursor: ns-resize"][style*="top: -2px"]');
    expect(topResizeHandle).not.toBeNull();
    fireEvent.mouseDown(topResizeHandle!, { clientX: 150, clientY: 100 });
    // Drag down to make the window smaller than minHeight
    fireEvent.mouseMove(document, { clientX: 150, clientY: 100 + 200 });
    fireEvent.mouseUp(document);

    expect(mockOnUpdateWindow).toHaveBeenCalled();
    const lastCall = mockOnUpdateWindow.mock.calls[mockOnUpdateWindow.mock.calls.length - 1];
    const [, updates] = lastCall;
    expect(updates.size.height).toBe(150); // It should be exactly the minHeight
    expect(updates.position.y).toBe(250); // The top edge should be adjusted accordingly
  });

  it('should not allow moving the window above the top menu bar when resizing', () => {
    const { container } = render(
      <AppContext.Provider value={appContextValue}>
        <WindowComponent
          instance={windowInstance}
          onClose={() => {}}
          onMinimize={() => {}}
          onMaximize={() => {}}
          onFocus={mockOnFocus}
          onUpdateWindow={mockOnUpdateWindow}
          isActive={true}
        >
          <div>Window Content</div>
        </WindowComponent>
      </AppContext.Provider>
    );

    const topResizeHandle = container.querySelector('div[style*="cursor: ns-resize"][style*="top: -2px"]');
    expect(topResizeHandle).not.toBeNull();
    // Start drag at the top edge of the window
    fireEvent.mouseDown(topResizeHandle!, { clientX: 150, clientY: 100 });
    // Drag way up, past the top of the screen
    fireEvent.mouseMove(document, { clientX: 150, clientY: -200 });
    fireEvent.mouseUp(document);

    expect(mockOnUpdateWindow).toHaveBeenCalled();
    const lastCall = mockOnUpdateWindow.mock.calls[mockOnUpdateWindow.mock.calls.length - 1];
    const [, updates] = lastCall;
    expect(updates.position.y).toBe(TOP_MENU_BAR_HEIGHT);
  });
});
