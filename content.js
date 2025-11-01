// Wait for element to appear in DOM with timeout
function waitForElement(selectors, timeout = 5000) {
  return new Promise((resolve) => {
    // First, try immediate lookup
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        resolve(elements);
        return;
      }
    }

    // If not found, set up observer
    const observer = new MutationObserver((mutations, obs) => {
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          obs.disconnect();
          resolve(elements);
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout after specified time
    setTimeout(() => {
      observer.disconnect();
      resolve([]);
    }, timeout);
  });
}

function getLastMessageText() {
  // Multiple selector strategies for different LinkedIn message formats
  const messageSelectors = [
    '.msg-s-message-list__event',
    '.msg-s-event-listitem',
    '.msg-s-message-group',
    '[data-test-id="message-item"]',
    '.msg-s-message-listitem',
    '.conversation-item'
  ];

  // Try to find messages with waiting
  let messages = [];
  for (const selector of messageSelectors) {
    messages = document.querySelectorAll(selector);
    if (messages.length > 0) break;
  }

  if (!messages.length) {
    console.log('No messages found immediately, waiting for LinkedIn to load...');
    return null; // Signal that we need to wait
  }

  // Text extraction selectors
  const textSelectors = [
    '.msg-s-event-listitem__body',
    '.msg-s-event-listitem__message-bubble',
    '.msg-s-message-group__message-bubble',
    '.msg-s-message-listitem__body',
    '[data-test-id="message-text"]',
    '.message-body',
    'p[dir="ltr"]',
    '.text'
  ];

  // Find the last message element that contains text
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const textSelector of textSelectors) {
      const textElement = messages[i].querySelector(textSelector);
      if (textElement) {
        const text = textElement.innerText.trim();
        if (text && text.length > 0) {
          console.log('Extracted last message:', text.substring(0, 50) + '...');
          return text;
        }
      }
    }
    
    // Fallback: try getting text directly from message element
    const directText = messages[i].innerText.trim();
    if (directText && directText.length > 10) {
      console.log('Extracted last message (direct):', directText.substring(0, 50) + '...');
      return directText;
    }
  }
  
  return null; // Signal that messages exist but no text found
}

async function getLastMessageTextWithRetry(maxRetries = 15, delay = 600) {
  // Expanded list of message container selectors for LinkedIn
  const messageSelectors = [
    // Modern LinkedIn selectors
    '.msg-s-message-list__event',
    '.msg-s-event-listitem',
    '.msg-s-message-group',
    '.msg-s-message-listitem',
    '[data-test-id="message-item"]',
    '[data-testid="message-item"]',
    '.conversation-item',
    // Additional potential selectors
    'li[class*="message"]',
    'div[class*="message"]',
    'div[class*="Message"]',
    '.msg-s-message-listcontainer .msg-s-event-listitem',
    '[class*="event-listitem"]',
    '[class*="message-list"] li',
    '[class*="MessageGroup"]',
    // Generic fallbacks
    'main li',
    'main [role="listitem"]'
  ];

  // Wait for messages to appear
  const messages = await waitForElement(messageSelectors, maxRetries * delay);

  if (!messages.length) {
    console.log('No LinkedIn messages found after waiting.');
    // Try a more aggressive generic search
    return await tryGenericMessageSearch();
  }

  // Expanded text extraction selectors
  const textSelectors = [
    '.msg-s-event-listitem__body',
    '.msg-s-event-listitem__message-bubble',
    '.msg-s-message-group__message-bubble',
    '.msg-s-message-listitem__body',
    '[data-test-id="message-text"]',
    '[data-testid="message-text"]',
    '.message-body',
    'p[dir="ltr"]',
    'p[dir="rtl"]',
    'div[class*="message-bubble"]',
    'div[class*="message-body"]',
    'span[class*="message"]',
    '.text',
    'p'
  ];

  // Find the last message element that contains text
  for (let i = messages.length - 1; i >= 0; i--) {
    // Try all text selectors
    for (const textSelector of textSelectors) {
      const textElement = messages[i].querySelector(textSelector);
      if (textElement) {
        const text = textElement.innerText.trim();
        if (text && text.length > 10) {
          // Additional filtering to ensure it's actual message content
          if (!isLikelyUIMetadata(text)) {
            console.log('Extracted last message:', text.substring(0, 50) + '...');
            return text;
          }
        }
      }
    }
    
    // Fallback: try getting text directly from message element
    const directText = messages[i].innerText.trim();
    if (directText && directText.length > 10) {
      // Filter out UI elements and extract the actual message
      const cleanedText = extractMessageText(directText);
      if (cleanedText && cleanedText.length > 10) {
        console.log('Extracted last message (direct):', cleanedText.substring(0, 50) + '...');
        return cleanedText;
      }
    }
  }
  
  // If specific selectors failed, try generic search
  console.log('No text found with specific selectors, trying generic search...');
  return await tryGenericMessageSearch();
}

// Helper function to check if text is likely UI metadata rather than message content
function isLikelyUIMetadata(text) {
  const uiKeywords = ['Like', 'Reply', 'More', 'Share', 'Send', 'Copy', 'Edit', 'Delete', 
                      'Today', 'Yesterday', 'Just now', 'min ago', 'hour ago', 'Viewed'];
  const lowerText = text.toLowerCase();
  // If text is very short and contains UI keywords, it's probably not a message
  if (text.length < 30 && uiKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()))) {
    return true;
  }
  return false;
}

// Helper function to extract message text from mixed content
function extractMessageText(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => {
    // Filter out empty lines and UI elements
    if (line.length === 0) return false;
    if (line.length < 3) return false;
    
    // Filter out common UI labels
    const uiPatterns = [
      /^(Like|Reply|More|Share|Send|Copy|Edit|Delete)$/i,
      /^(Today|Yesterday|Just now|\d+ (min|hour|day)s? ago)$/i,
      /^(Viewed|Seen|Delivered)$/i,
      /^(\d{1,2}:\d{2} (AM|PM))$/,
      /^(You|Me):$/i
    ];
    
    if (uiPatterns.some(pattern => pattern.test(line))) return false;
    
    // Keep lines that look like actual message content
    return line.length > 5 && !line.match(/^[\d\s:]+$/);
  });
  
  if (lines.length === 0) return null;
  
  // Return the longest line or the last significant line
  let bestLine = lines[0];
  for (const line of lines) {
    if (line.length > bestLine.length && line.length > 20) {
      bestLine = line;
    }
  }
  
  // If we have multiple good lines, combine the last few
  if (lines.length > 1) {
    const significantLines = lines.filter(l => l.length > 20);
    if (significantLines.length > 0) {
      return significantLines.join(' ');
    }
  }
  
  return bestLine;
}

// Generic fallback search when specific selectors fail
async function tryGenericMessageSearch() {
  // Wait a bit more for content to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Try to find any paragraph or div with substantial text content in the main content area
  const mainContent = document.querySelector('main') || document.body;
  
  // Look for elements with substantial text that might be messages
  const allElements = mainContent.querySelectorAll('p, div, span, li');
  
  const candidates = [];
  for (const el of allElements) {
    const text = el.innerText.trim();
    // Look for substantial text blocks that could be messages
    if (text.length > 20 && text.length < 2000) {
      // Check if parent or siblings suggest this is a message area
      const parent = el.closest('[class*="message"], [class*="event"], [class*="conversation"]');
      if (parent || el.closest('main')) {
        if (!isLikelyUIMetadata(text)) {
          candidates.push({ text, element: el });
        }
      }
    }
  }
  
  // Sort by position in DOM (later elements are likely more recent messages)
  candidates.sort((a, b) => {
    const posA = Array.from(document.querySelectorAll('*')).indexOf(a.element);
    const posB = Array.from(document.querySelectorAll('*')).indexOf(b.element);
    return posB - posA;
  });
  
  if (candidates.length > 0) {
    const message = extractMessageText(candidates[0].text);
    if (message && message.length > 10) {
      console.log('Found message via generic search:', message.substring(0, 50) + '...');
      return message;
    }
  }
  
  console.log('No messages found via generic search.');
  return '';
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLastMessage') {
    // Use async function with retry mechanism
    getLastMessageTextWithRetry().then(lastMessage => {
      sendResponse({ lastMessage });
    }).catch(error => {
      console.error('Error extracting message:', error);
      sendResponse({ lastMessage: '' });
    });
    return true; // Indicates async response
  }
});

// Ensure content script is ready when page loads
(function() {
  'use strict';
  
  // Log that content script has loaded
  console.log('LinkedIn DM GPT Reply Helper content script loaded');
  
  // Wait for DOM to be ready if it's not already
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, content script ready');
    });
  } else {
    console.log('DOM already ready, content script initialized');
  }
  
  // Also listen for navigation changes in LinkedIn's SPA
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('LinkedIn navigation detected, content script ready');
    }
  }).observe(document, { subtree: true, childList: true });
})();
