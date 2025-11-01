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

async function getLastMessageTextWithRetry(maxRetries = 15, delay = 600) {
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
    'main [role="listitem"]'
  ];

  const messages = await waitForElement(messageSelectors, maxRetries * delay);

  if (!messages.length) {
    console.log('No LinkedIn messages found after waiting.');
    return await tryGenericMessageSearch();
  }

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

  for (let i = messages.length - 1; i >= 0; i--) {
    for (const textSelector of textSelectors) {
      const textElement = messages[i].querySelector(textSelector);
      if (textElement) {
        const text = textElement.innerText.trim();
        if (text && text.length > 10) {
          if (!isLikelyUIMetadata(text)) {
            console.log('Extracted last message:', text.substring(0, 50) + '...');
            return text;
          }
        }
      }
    }
    
    const directText = messages[i].innerText.trim();
    if (directText && directText.length > 10) {
      const cleanedText = extractMessageText(directText);
      if (cleanedText && cleanedText.length > 10) {
        console.log('Extracted last message (direct):', cleanedText.substring(0, 50) + '...');
        return cleanedText;
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

  const mainContent = document.querySelector('main') || document.body;

  const allElements = mainContent.querySelectorAll('p, div, span, li');

  const candidates = [];
  for (const el of allElements) {
    const text = el.innerText.trim();
    if (text.length > 20 && text.length < 2000) {
      const parent = el.closest('[class*="message"], [class*="event"], [class*="conversation"]');
      if (parent || el.closest('main')) {
        if (!isLikelyUIMetadata(text)) {
          candidates.push({ text, element: el });
        }
      }
    }
  }

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
    getLastMessageTextWithRetry().then(lastMessage => {
      sendResponse({ lastMessage });
    }).catch(error => {
      console.error('Error extracting message:', error);
      sendResponse({ lastMessage: '' });
    });
    return true;
  }
});

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
