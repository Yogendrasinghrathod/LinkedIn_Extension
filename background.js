chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchLastMessage') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        sendResponse({ lastMessage: '' });
        return;
      }
      
      // Check if we're on a LinkedIn messaging page
      const linkedInMessagingUrl = tabs[0].url && tabs[0].url.includes('linkedin.com/messaging');
      if (!linkedInMessagingUrl) {
        sendResponse({ lastMessage: '' });
        return;
      }

      // Add timeout for message sending
      const timeout = setTimeout(() => {
        sendResponse({ lastMessage: '' });
      }, 14000); // 14 second timeout (slightly less than popup timeout)

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
    return true; // Will respond asynchronously
  }
});
