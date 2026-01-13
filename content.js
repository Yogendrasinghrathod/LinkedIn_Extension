function waitForElement(selectors, timeout = 5000) {
  return new Promise((resolve) => {
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        resolve(elements);
        return;
      }
    }

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

    setTimeout(() => {
      observer.disconnect();
      resolve([]);
    }, timeout);
  });
}

function getLastMessageText() {
  const messageSelectors = [
    '.msg-s-message-list__event',
    '.msg-s-event-listitem',
    '.msg-s-message-group',
    '[data-test-id="message-item"]',
    '.msg-s-message-listitem',
    '.conversation-item'
  ];

  let messages = [];
  for (const selector of messageSelectors) {
    messages = document.querySelectorAll(selector);
    if (messages.length > 0) break;
  }

  if (!messages.length) {
    console.log('No messages found immediately, waiting for LinkedIn to load...');
    return null;
  }

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
    
    const directText = messages[i].innerText.trim();
    if (directText && directText.length > 10) {
      console.log('Extracted last message (direct):', directText.substring(0, 50) + '...');
      return directText;
    }
  }
  
  return null;
}

async function getLastMessageTextWithRetry(maxRetries = 20, delay = 500) {
  console.log('Starting message extraction with retry...');
  
  const messageSelectors = [
    '.msg-s-message-list__event',
    '.msg-s-event-listitem',
    '.msg-s-message-group',
    '.msg-s-message-listitem',
    '[data-test-id="message-item"]',
    '[data-testid="message-item"]',
    '.conversation-item',
    'li[class*="message"]',
    'div[class*="message"]',
    'div[class*="Message"]',
    '.msg-s-message-listcontainer .msg-s-event-listitem',
    '[class*="event-listitem"]',
    '[class*="message-list"] li',
    '[class*="MessageGroup"]',
    'main li',
    'main [role="listitem"]',
    '[data-testid="message-bubble"]',
    '[class*="msg-s-message-list"] > *',
    '[class*="msg-s-message-listcontainer"] > *',
    'div[class*="msg-s-message-list"] li',
    'ul[class*="msg-s-message-list"] li',
    // Additional modern LinkedIn selectors
    '[class*="msg-s-message-listcontainer"] li',
    '[class*="msg-s-message-list"] [class*="event"]',
    'div[role="log"] li',
    'div[role="log"] > div',
    '[aria-label*="message"]',
    '[aria-label*="Message"]'
  ];

  const messages = await waitForElement(messageSelectors, maxRetries * delay);
  console.log(`Found ${messages.length} message elements with selectors`);

  if (!messages.length) {
    console.log('No LinkedIn messages found with specific selectors, trying generic search...');
    return await tryGenericMessageSearch();
  }

  const textSelectors = [
    '.msg-s-event-listitem__body',
    '.msg-s-event-listitem__message-bubble',
    '.msg-s-message-group__message-bubble',
    '.msg-s-message-listitem__body',
    '[data-test-id="message-text"]',
    '[data-testid="message-text"]',
    '[data-testid="message-bubble"]',
    '.message-body',
    'p[dir="ltr"]',
    'p[dir="rtl"]',
    'div[class*="message-bubble"]',
    'div[class*="message-body"]',
    'span[class*="message"]',
    'span[class*="text"]',
    'div[class*="text"]',
    'div[class*="body"]',
    'span[class*="body"]',
    '.text',
    'p',
    'div[role="textbox"]',
    // More generic selectors
    'p:not([class*="button"]):not([class*="link"])',
    'span:not([class*="button"]):not([class*="link"])',
    'div:not([class*="button"]):not([class*="link"])'
  ];

  // Try to extract text from messages, starting from the last one (most recent)
  for (let i = messages.length - 1; i >= 0; i--) {
    const messageEl = messages[i];
    
    // First try specific text selectors
    for (const textSelector of textSelectors) {
      const textElement = messageEl.querySelector(textSelector);
      if (textElement) {
        const text = textElement.innerText.trim();
        if (text && text.length > 10) {
          if (!isLikelyUIMetadata(text)) {
            const cleaned = extractMessageText(text);
            if (cleaned && cleaned.length > 10) {
              console.log('Extracted last message via selector:', cleaned.substring(0, 50) + '...');
              return cleaned;
            }
          }
        }
      }
    }
    
    // Try direct text extraction from the message element
    const directText = messageEl.innerText.trim();
    if (directText && directText.length > 10) {
      const cleanedText = extractMessageText(directText);
      if (cleanedText && cleanedText.length > 10 && !isLikelyUIMetadata(cleanedText)) {
        console.log('Extracted last message (direct):', cleanedText.substring(0, 50) + '...');
        return cleanedText;
      }
    }
    
    // Try getting text from all child elements
    const allChildren = messageEl.querySelectorAll('p, span, div');
    for (const child of Array.from(allChildren).reverse()) {
      const childText = child.innerText.trim();
      if (childText && childText.length > 15 && childText.length < 2000) {
        if (!isLikelyUIMetadata(childText)) {
          const cleaned = extractMessageText(childText);
          if (cleaned && cleaned.length > 15) {
            console.log('Extracted last message from child element:', cleaned.substring(0, 50) + '...');
            return cleaned;
          }
        }
      }
    }
  }
  
  console.log('No text found with specific selectors, trying generic search...');
  return await tryGenericMessageSearch();
}

function isLikelyUIMetadata(text) {
  const uiKeywords = ['Like', 'Reply', 'More', 'Share', 'Send', 'Copy', 'Edit', 'Delete', 
                      'Today', 'Yesterday', 'Just now', 'min ago', 'hour ago', 'Viewed'];
  const lowerText = text.toLowerCase();
  if (text.length < 30 && uiKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()))) {
    return true;
  }
  return false;
}

function extractMessageText(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => {
    if (line.length === 0) return false;
    if (line.length < 3) return false;
    
    const uiPatterns = [
      /^(Like|Reply|More|Share|Send|Copy|Edit|Delete)$/i,
      /^(Today|Yesterday|Just now|\d+ (min|hour|day)s? ago)$/i,
      /^(Viewed|Seen|Delivered)$/i,
      /^(\d{1,2}:\d{2} (AM|PM))$/,
      /^(You|Me):$/i
    ];
    
    if (uiPatterns.some(pattern => pattern.test(line))) return false;
    
    return line.length > 5 && !line.match(/^[\d\s:]+$/);
  });
  
  if (lines.length === 0) return null;

  let bestLine = lines[0];
  for (const line of lines) {
    if (line.length > bestLine.length && line.length > 20) {
      bestLine = line;
    }
  }

  if (lines.length > 1) {
    const significantLines = lines.filter(l => l.length > 20);
    if (significantLines.length > 0) {
      return significantLines.join(' ');
    }
  }

  return bestLine;
}

async function tryGenericMessageSearch() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Starting generic message search...');
  
  // Strategy 1: Look for all text elements in the main content area
  const mainContent = document.querySelector('main') || document.body;
  const conversationArea = mainContent.querySelector('[class*="conversation"], [class*="thread"], [class*="message-list"], [role="log"]') || mainContent;

  // Try to find message containers first
  const messageContainers = conversationArea.querySelectorAll(
    'li, div[class*="message"], div[class*="event"], div[class*="bubble"], [class*="listitem"]'
  );

  console.log(`Found ${messageContainers.length} potential message containers`);

  // Collect all text candidates from message containers
  const candidates = [];
  for (const container of messageContainers) {
    // Skip if container is too small or likely UI element
    const containerText = container.innerText.trim();
    if (containerText.length < 10) continue;
    
    // Look for text elements inside the container
    const textElements = container.querySelectorAll('p, span, div');
    for (const el of textElements) {
      const text = el.innerText.trim();
      if (text.length > 15 && text.length < 2000) {
        // Check if this looks like a message (not UI metadata)
        if (!isLikelyUIMetadata(text)) {
          // Check if parent has message-related classes
          const parent = el.closest('[class*="message"], [class*="event"], [class*="bubble"], [class*="body"]');
          if (parent || container) {
            candidates.push({ 
              text, 
              element: el,
              container: container,
              depth: getElementDepth(el)
            });
          }
        }
      }
    }
    
    // Also try direct text from container if it's substantial
    if (containerText.length > 20 && containerText.length < 2000) {
      const cleaned = extractMessageText(containerText);
      if (cleaned && cleaned.length > 15 && !isLikelyUIMetadata(cleaned)) {
        candidates.push({ 
          text: cleaned, 
          element: container,
          container: container,
          depth: getElementDepth(container)
        });
      }
    }
  }

  // Strategy 2: If no candidates from containers, search all text in main area
  if (candidates.length === 0) {
    console.log('No candidates from containers, searching all text elements...');
    const allTextElements = conversationArea.querySelectorAll('p, span, div, li');
    for (const el of allTextElements) {
      const text = el.innerText.trim();
      if (text.length > 20 && text.length < 2000) {
        if (!isLikelyUIMetadata(text)) {
          // Check if it's in a conversation-like area
          const isInConversation = el.closest('[class*="message"], [class*="conversation"], [class*="thread"], main');
          if (isInConversation) {
            const cleaned = extractMessageText(text);
            if (cleaned && cleaned.length > 15) {
              candidates.push({ 
                text: cleaned, 
                element: el,
                depth: getElementDepth(el)
              });
            }
          }
        }
      }
    }
  }

  // Sort candidates: prefer deeper elements (more nested = more likely to be message content)
  // and prefer elements that appear later in DOM (more recent messages)
  candidates.sort((a, b) => {
    // First, prefer elements that are deeper in the DOM
    if (Math.abs(a.depth - b.depth) > 2) {
      return b.depth - a.depth;
    }
    // Then, prefer elements that appear later
    const allElements = Array.from(document.querySelectorAll('*'));
    const posA = allElements.indexOf(a.element);
    const posB = allElements.indexOf(b.element);
    return posB - posA;
  });

  console.log(`Found ${candidates.length} text candidates`);

  // Try the top candidates
  for (const candidate of candidates.slice(0, 10)) {
    const message = extractMessageText(candidate.text);
    if (message && message.length > 15) {
      // Additional validation: make sure it's not just UI text
      const lowerMessage = message.toLowerCase();
      const uiWords = ['write a message', 'type a message', 'send a message', 'new message', 'compose'];
      if (!uiWords.some(word => lowerMessage.includes(word))) {
        console.log('Found message via generic search:', message.substring(0, 50) + '...');
        return message;
      }
    }
  }

  console.log('No messages found via generic search.');
  return '';
}

function getElementDepth(element) {
  let depth = 0;
  let current = element;
  while (current && current !== document.body) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLastMessage') {
    console.log('Content script received getLastMessage request');
    console.log('Current URL:', window.location.href);
    console.log('Document ready state:', document.readyState);
    
    // Add a small delay to ensure page is fully loaded
    setTimeout(() => {
      getLastMessageTextWithRetry().then(lastMessage => {
        console.log('Message extraction result:', lastMessage ? lastMessage.substring(0, 50) + '...' : 'empty');
        if (!lastMessage || lastMessage.trim().length === 0) {
          console.warn('No message found, attempting final fallback...');
          // Final fallback: look for any substantial text in the visible area
          lastMessage = tryFinalFallback();
        }
        sendResponse({ lastMessage: lastMessage || '' });
      }).catch(error => {
        console.error('Error extracting message:', error);
        // Try final fallback even on error
        const fallback = tryFinalFallback();
        sendResponse({ lastMessage: fallback || '' });
      });
    }, 200);
    
    return true; // Indicates we will send a response asynchronously
  }
  return false;
});

function tryFinalFallback() {
  console.log('Trying final fallback extraction...');
  
  // Look for the main conversation area
  const main = document.querySelector('main');
  if (!main) {
    console.log('No main element found');
    return '';
  }
  
  // Find all visible text elements
  const allElements = main.querySelectorAll('p, span, div, li');
  const textCandidates = [];
  
  for (const el of allElements) {
    // Skip hidden elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }
    
    const text = el.innerText.trim();
    // Look for substantial text that's not UI metadata
    if (text.length > 20 && text.length < 2000) {
      if (!isLikelyUIMetadata(text)) {
        // Check if it's in a scrollable message area
        const scrollableParent = el.closest('[class*="scroll"], [class*="list"], [class*="container"]');
        if (scrollableParent || el.closest('main')) {
          const cleaned = extractMessageText(text);
          if (cleaned && cleaned.length > 15) {
            textCandidates.push({
              text: cleaned,
              element: el,
              position: el.getBoundingClientRect().top
            });
          }
        }
      }
    }
  }
  
  // Sort by position (bottom = more recent) and return the most recent substantial text
  if (textCandidates.length > 0) {
    textCandidates.sort((a, b) => b.position - a.position);
    const bestCandidate = textCandidates[0];
    console.log('Final fallback found text:', bestCandidate.text.substring(0, 50) + '...');
    return bestCandidate.text;
  }
  
  console.log('Final fallback found nothing');
  return '';
}

(function() {
  'use strict';

  console.log('LinkedIn DM GPT Reply Helper content script loaded');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, content script ready');
    });
  } else {
    console.log('DOM already ready, content script initialized');
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('LinkedIn navigation detected, content script ready');
    }
  }).observe(document, { subtree: true, childList: true });
})();
