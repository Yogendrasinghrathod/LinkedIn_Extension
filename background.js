chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchLastMessage') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
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
      }, 16000);

      // Try to send message to content script with retries
      const trySendMessage = async (attempts = 0) => {
        try {
          // On first attempt, try to inject content script if needed
          if (attempts === 0) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ['content.js']
              });
              // Wait a bit for script to initialize
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
              // Script might already be injected, that's okay
              console.log('Content script injection result:', e.message);
            }
          }

          chrome.tabs.sendMessage(tabs[0].id, { action: 'getLastMessage' }, (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message;
              console.log(`Attempt ${attempts + 1} failed:`, errorMsg);
              
              if (attempts < 5) {
                // Retry after a delay, increasing delay with each attempt
                setTimeout(() => trySendMessage(attempts + 1), 400 + (attempts * 200));
              } else {
                clearTimeout(timeout);
                console.error('Content script error after retries:', errorMsg);
                sendResponse({ lastMessage: '' });
              }
            } else {
              clearTimeout(timeout);
              console.log('Successfully received response from content script');
              sendResponse(response || { lastMessage: '' });
            }
          });
        } catch (error) {
          console.error('Error in trySendMessage:', error);
          if (attempts < 3) {
            setTimeout(() => trySendMessage(attempts + 1), 500);
          } else {
            clearTimeout(timeout);
            sendResponse({ lastMessage: '' });
          }
        }
      };

      // Start trying to send message
      trySendMessage();
    });
    return true; // Indicates we will send a response asynchronously
  }
});
