import React, { useState, useEffect } from 'react';
import './VirtualKeyboard.css';

const KEYBOARD_LAYOUT = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const SPECIAL_KEYS = {
  space: ' ',
  backspace: '⌫',
  enter: '↵',
  shift: '⇧',
};

function VirtualKeyboard({ isVisible, onClose, onKeyPress }) {
  const [isShift, setIsShift] = useState(false);
  const [activeInput, setActiveInput] = useState(null);

  useEffect(() => {
    if (isVisible) {
      // Find the currently focused input
      const focusedElement = document.activeElement;
      if (focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'TEXTAREA')) {
        setActiveInput(focusedElement);
      }

      // Listen for focus changes
      const handleFocus = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          setActiveInput(e.target);
        }
      };

      document.addEventListener('focusin', handleFocus);
      return () => {
        document.removeEventListener('focusin', handleFocus);
      };
    }
  }, [isVisible]);

  const handleKeyPress = (key) => {
    const input = document.activeElement;
    const currentInput = activeInput || input;
    
    if (currentInput && (currentInput.tagName === 'INPUT' || currentInput.tagName === 'TEXTAREA')) {
      // Ensure the input is focused
      currentInput.focus();
      
      const start = currentInput.selectionStart || 0;
      const end = currentInput.selectionEnd || 0;
      const currentValue = currentInput.value || '';
      let newValue = '';
      let newCursorPos = start;
      let keyCode = null;
      let which = null;
      
      if (key === 'backspace') {
        if (start > 0) {
          newValue = currentValue.substring(0, start - 1) + currentValue.substring(end);
          newCursorPos = Math.max(0, start - 1);
          keyCode = 8; // Backspace key code
          which = 8;
        } else {
          return; // Nothing to delete
        }
      } else if (key === 'enter') {
        newValue = currentValue.substring(0, start) + '\n' + currentValue.substring(end);
        newCursorPos = start + 1;
        keyCode = 13; // Enter key code
        which = 13;
      } else if (key === 'space') {
        newValue = currentValue.substring(0, start) + ' ' + currentValue.substring(end);
        newCursorPos = start + 1;
        keyCode = 32; // Space key code
        which = 32;
      } else {
        const char = isShift ? key.toUpperCase() : key;
        newValue = currentValue.substring(0, start) + char + currentValue.substring(end);
        newCursorPos = start + 1;
        keyCode = char.charCodeAt(0);
        which = char.charCodeAt(0);
        if (isShift) {
          setIsShift(false);
        }
      }
      
      // Set the value using native setter
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(currentInput, newValue);
      }
      
      // Create InputEvent (more compatible with React)
      let inputEvent;
      try {
        inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          data: key === 'backspace' ? null : (key === 'space' ? ' ' : (key === 'enter' ? '\n' : (isShift ? key.toUpperCase() : key))),
          inputType: key === 'backspace' ? 'deleteContentBackward' : 'insertText'
        });
      } catch (e) {
        // Fallback to regular Event if InputEvent not supported
        inputEvent = new Event('input', { bubbles: true, cancelable: true });
      }
      
      // Ensure target is set
      Object.defineProperty(inputEvent, 'target', {
        value: currentInput,
        enumerable: true,
        writable: false
      });
      
      // Dispatch the event
      currentInput.dispatchEvent(inputEvent);
      
      // Set cursor position
      setTimeout(() => {
        currentInput.setSelectionRange(newCursorPos, newCursorPos);
        currentInput.focus();
      }, 0);
    }
    
    if (onKeyPress) {
      onKeyPress(key);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="virtual-keyboard-overlay" onClick={onClose}>
      <div className="virtual-keyboard" onClick={(e) => e.stopPropagation()}>
        <div className="keyboard-header">
          <span className="keyboard-title">Virtual Keyboard</span>
          <button className="keyboard-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="keyboard-rows">
          {KEYBOARD_LAYOUT.map((row, rowIndex) => (
            <div key={rowIndex} className="keyboard-row">
              {rowIndex === 2 && (
                <button
                  className={`keyboard-key special-key shift-key ${isShift ? 'active' : ''}`}
                  onClick={() => setIsShift(!isShift)}
                >
                  {SPECIAL_KEYS.shift}
                </button>
              )}
              {row.map((key) => (
                <button
                  key={key}
                  className="keyboard-key"
                  onClick={() => handleKeyPress(key)}
                >
                  {isShift ? key.toUpperCase() : key}
                </button>
              ))}
              {rowIndex === 2 && (
                <button
                  className="keyboard-key special-key"
                  onClick={() => handleKeyPress('backspace')}
                >
                  {SPECIAL_KEYS.backspace}
                </button>
              )}
            </div>
          ))}
          
          <div className="keyboard-row">
            <button
              className="keyboard-key special-key space-key"
              onClick={() => handleKeyPress('space')}
            >
              Space
            </button>
            <button
              className="keyboard-key special-key enter-key"
              onClick={() => handleKeyPress('enter')}
            >
              {SPECIAL_KEYS.enter} Enter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VirtualKeyboard;

