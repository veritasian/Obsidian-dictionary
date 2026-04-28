var obsidian = require('obsidian');

class DictionaryPlugin extends obsidian.Plugin {
  async onload() {
    console.log('Loading Dictionary Popup Plugin');

    // Add custom styles
    this.addStyle();

    // Double click timer variables
    this.lastClickTime = 0;
    this.clickCount = 0;

    // Register double click event
    this.registerDomEvent(document, 'mousedown', this.handleDoubleClick.bind(this));

    // Register command
    this.addCommand({
      id: 'lookup-word',
      name: 'Lookup selected word',
      callback: () => {
        const selection = window.getSelection().toString().trim();
        if (selection) {
          this.showDictionaryPopup(selection);
        }
      }
    });
  }

  onunload() {
    console.log('Unloading Dictionary Popup Plugin');
    this.removeExistingPopup();
  }

  addStyle() {
    const css = `
        .dictionary-popup-modal {
            position: fixed;
            z-index: 10000;
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            padding: 12px;
            min-width: 200px;
            max-width: 300px;
            font-family: var(--font-text);
        }

        .dictionary-popup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .dictionary-word {
            font-size: 1.2em;
            font-weight: bold;
            color: var(--text-accent);
            margin: 0;
        }

        .dictionary-close-btn {
            background: none;
            border: none;
            font-size: 1.2em;
            cursor: pointer;
            color: var(--text-muted);
            opacity: 0.6;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .dictionary-close-btn:hover {
            opacity: 1;
            color: var(--text-error);
        }

        .dictionary-loader {
            color: var(--text-muted);
            font-style: italic;
        }

        .dictionary-error {
            color: var(--text-error);
        }

        .dictionary-popup-content {
            line-height: 1.4;
        }

        .dictionary-pronunciation {
            color: var(--text-muted);
            font-style: italic;
            margin-bottom: 12px;
        }

        .dictionary-definition {
            margin-bottom: 8px;
        }

        .dictionary-definition strong {
            color: var(--text-accent);
        }

        .dictionary-source {
            margin-top: 12px;
            font-size: 0.9em;
            color: var(--text-faint);
        }

        .dictionary-source a {
            color: var(--text-accent);
            text-decoration: none;
        }

        .dictionary-source a:hover {
            text-decoration: underline;
        }
        `;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = css;
    document.head.appendChild(this.styleEl);
  }

  handleDoubleClick(event) {
    // Only respond to left mouse button double click
    if (event.button !== 0) return;

    const currentTime = new Date().getTime();
    const timeDiff = currentTime - this.lastClickTime;

    // Consider it a double click if within 300ms
    if (timeDiff < 300) {
      this.clickCount++;
      if (this.clickCount >= 2) {
        this.handleWordLookup(event);
        this.clickCount = 0;
      }
    } else {
      this.clickCount = 1;
    }

    this.lastClickTime = currentTime;
  }

  async handleWordLookup(event) {
    // Fix 1: Remove strict element restrictions, support all text elements
    // Exclude non-text interactive elements (buttons, inputs, modals), support all other text
    const isExcluded = event.target.closest('button, input, textarea, select, .modal, .menu');
    if (isExcluded) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && this.isValidWord(selectedText)) {
      // Handle manually selected text
      event.preventDefault();
      event.stopPropagation();
      this.showDictionaryPopup(selectedText, event);
      return;
    }

    // Fix 2: Use native API to get word at click position
    const word = this.getWordAtPosition(event);
    if (word && this.isValidWord(word)) {
      event.preventDefault();
      event.stopPropagation();
      this.showDictionaryPopup(word, event);
    }
  }

  // Core Fix: Rewrite word extraction function for all formatted text
  getWordAtPosition(event) {
    try {
      // Native browser API: Get text node and position at mouse click
      const x = event.clientX;
      const y = event.clientY;
      const caret = document.caretPositionFromPoint(x, y);
      if (!caret || !caret.offsetNode) return null;

      const textNode = caret.offsetNode;
      const offset = caret.offset;
      const text = textNode.textContent;

      // Define word characters: letters, hyphens, apostrophes
      const wordChar = /[a-zA-Z'-]/;

      // Find word start to the left
      let start = offset;
      while (start > 0 && wordChar.test(text[start - 1])) {
        start--;
      }

      // Find word end to the right
      let end = offset;
      while (end < text.length && wordChar.test(text[end])) {
        end++;
      }

      // Extract the word
      const word = text.substring(start, end).trim();
      return word;
    } catch (e) {
      return null;
    }
  }

  isValidWord(word) {
    // Simple validation for valid English word
    return word && word.length > 1 && /^[a-zA-Z'-]+$/.test(word) && word.length < 30;
  }

  // Fix 3: Add event parameter to fix popup positioning
  async showDictionaryPopup(word, event = null) {
    // Remove existing popup if present
    this.removeExistingPopup();

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'dictionary-popup-modal';
    popup.innerHTML = `
          <div class="dictionary-loader">
            searching "${word}"...
          </div>
        `;

    // Position popup: mouse position if event exists, center otherwise
    if (event) {
      this.positionPopup(popup, event);
    } else {
      popup.style.left = '50%';
      popup.style.top = '50%';
      popup.style.transform = 'translate(-50%, -50%)';
    }

    document.body.appendChild(popup);

    try {
      // Fetch dictionary data
      const dictionaryData = await this.fetchDictionaryData(word);
      this.updatePopupContent(popup, word, dictionaryData);
    } catch (error) {
      console.error('Dictionary lookup failed:', error);
      popup.innerHTML = `
            <div class="dictionary-error">
              Not searching: ${error.message}
            </div>
          `;
    }
  }

  async fetchDictionaryData(word) {
    // Use free dictionary API
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

    if (!response.ok) {
      throw new Error('cannot find result');
    }

    const data = await response.json();
    return data[0]; // Return the first result
  }

  updatePopupContent(popup, word, data) {
    if (!data) {
      popup.innerHTML = `<div class="dictionary-error">cannot find result "${word}"</div>`;
      return;
    }

    let content = `
          <div class="dictionary-popup-header">
            <h3 class="dictionary-word">${word}</h3>
            <button class="dictionary-close-btn" onclick="this.closest('.dictionary-popup-modal').remove()">×</button>
          </div>
        `;

    // Phonetic transcription
    if (data.phonetic) {
      content += `<div class="dictionary-pronunciation">/${data.phonetic}/</div>`;
    }

    // Definitions
    content += `<div class="dictionary-popup-content">`;
    if (data.meanings && data.meanings.length > 0) {
      data.meanings.slice(0, 3).forEach((meaning, index) => {
        content += `<div class="dictionary-definition">`;
        content += `<strong>${meaning.partOfSpeech}</strong>: `;
        if (meaning.definitions && meaning.definitions.length > 0) {
          content += meaning.definitions[0].definition;
        }
        content += `</div>`;
      });
    }
    content += `</div>`;

    content += `
            
        `;

    popup.innerHTML = content;

    // Close popup when clicking outside
    setTimeout(() => {
      document.addEventListener('click', this.closePopupOnClickOutside.bind(this), { once: true });
    }, 100);
  }

  positionPopup(popup, event) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = event.clientX;
    let top = event.clientY + 10;

    // Append to body to get actual dimensions
    document.body.appendChild(popup);
    const rect = popup.getBoundingClientRect();
    document.body.removeChild(popup);

    // Ensure popup stays within viewport bounds
    if (left + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 10;
    }

    if (top + rect.height > viewportHeight) {
      top = event.clientY - rect.height - 10;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  removeExistingPopup() {
    const existingPopup = document.querySelector('.dictionary-popup-modal');
    if (existingPopup) {
      existingPopup.remove();
    }
  }

  closePopupOnClickOutside(event) {
    const popup = document.querySelector('.dictionary-popup-modal');
    if (popup && !popup.contains(event.target) && !event.target.closest('.dictionary-close-btn')) {
      this.removeExistingPopup();
    }
  }
}

module.exports = DictionaryPlugin;
