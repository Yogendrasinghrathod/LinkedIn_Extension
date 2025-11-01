chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchLastMessage') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        sendResponse({ lastMessage: '' });
        return;
      }
      
      const linkedInMessagingUrl = tabs[0].url && tabs[0].url.includes('linkedin.com/messaging');
      if (!linkedInMessagingUrl) {
        sendResponse({ lastMessage: '' });
        return;
      }

      const timeout = setTimeout(() => {
        sendResponse({ lastMessage: '' });
      }, 14000);

      chrome.tabs.sendMessage(tabs[0].id, { action: 'getLastMessage' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.error('Content script error:', chrome.runtime.lastError.message);
          sendResponse({ lastMessage: '' });
        } else {
          sendResponse(response || { lastMessage: '' });
        }
      });
    });
    return true;
  }
});
