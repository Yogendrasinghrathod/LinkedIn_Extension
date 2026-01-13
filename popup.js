// API Key Configuration - Load from Chrome storage
let geminiApiKey = null;

// Load API key from Chrome storage
function loadApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      geminiApiKey = result.geminiApiKey || null;
      resolve(geminiApiKey);
    });
  });
}

// Load API key on startup
loadApiKey();

const loadingEl = document.getElementById('loading');
const lastMessageEl = document.getElementById('lastMessage');
const suggestionsContainer = document.getElementById('suggestions');

async function fetchLastLinkedInMessage() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout: Message extraction took too long. The content script may not be responding.'));
    }, 15000);

    chrome.runtime.sendMessage({ action: 'fetchLastMessage' }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        console.error('Background script error:', errorMsg);
        reject(new Error(`Background script error: ${errorMsg}`));
      } else if (response && response.lastMessage !== undefined) {
        resolve(response.lastMessage || '');
      } else {
        reject(new Error('No response from background script. Make sure you are on a LinkedIn messaging page.'));
      }
    });
  });
}

async function listAvailableModels(apiVersion = 'v1beta', apiKey = null) {
  if (!apiKey) {
    await loadApiKey();
    apiKey = geminiApiKey;
  }
  const key = apiKey;
  try {
    const listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${key}`;
    const response = await fetch(listUrl);
    if (response.ok) {
      const data = await response.json();
      return data.models || [];
    }
  } catch (error) {
  }
  return [];
}

async function fetchGeminiReplies(lastMessage, apiKey = null) {
  if (!apiKey) {
    await loadApiKey();
    apiKey = geminiApiKey;
  }
  const key = apiKey;
  if (!key || key.trim() === '') {
    throw new Error('API_KEY_INVALID: API key not configured. Please open settings to configure your API key.');
  }

  const prompt = `You received this LinkedIn message:\n"${lastMessage}"\n\nProvide exactly 5 polite and professional reply suggestions for this message. Format each suggestion on a separate line, numbered 1-5. Each reply should be complete and ready to send. Do not include any explanations or additional text, just the 5 reply suggestions.`;

  let availableModels = [];
  try {
    availableModels = await listAvailableModels('v1beta', key);
  } catch (e) {
  }

  const workingModels = availableModels
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => {
      let name = m.name;
      if (name.includes('/')) name = name.split('/').pop();
      if (name.startsWith('models/')) name = name.replace('models/', '');
      return [name, 'v1beta'];
    })
    .filter(([name]) => name);

  const modelConfigs = workingModels.length > 0 ? workingModels : [
    ['gemini-pro', 'v1beta'],
    ['gemini-1.5-pro', 'v1'],
    ['gemini-1.0-pro', 'v1beta'],
  ];
  
  for (const [model, apiVersion] of modelConfigs) {
    try {
      return await tryGeminiModel(model, prompt, apiVersion, key);
    } catch (error) {
      if (error.message.includes('MODEL_NOT_FOUND') || error.message.includes('not found') || error.message.includes('not supported')) {
        continue;
      }
      if (error.message.includes('API_KEY_INVALID') || error.message.includes('401') || error.message.includes('403')) {
        throw error;
      }
    }
  }
  
  throw new Error('API_MODEL_NOT_FOUND: No working Gemini models found. Please check your API key.');
}

async function tryGeminiModel(model, prompt, apiVersion = 'v1beta', apiKey = null) {
  if (!apiKey) {
    await loadApiKey();
    apiKey = geminiApiKey;
  }
  const key = apiKey;
  try {
    const apiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${key}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 300,
        },
      })
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const responseClone = response.clone();
        const errorData = await responseClone.json();
        errorDetails = errorData.error?.message || errorData.error?.code || '';
      } catch (e) {
        errorDetails = response.statusText;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('API_KEY_INVALID: Invalid API key.');
      } else if (response.status === 429) {
        throw new Error('API_QUOTA: Rate limit exceeded.');
      } else if (response.status === 500 || response.status === 503) {
        throw new Error('API_SERVER: Service temporarily unavailable.');
      } else if (response.status === 400) {
        if (errorDetails.toLowerCase().includes('not found') || errorDetails.toLowerCase().includes('not supported')) {
          throw new Error('MODEL_NOT_FOUND: ' + errorDetails);
        }
        throw new Error('API_BAD_REQUEST: ' + errorDetails);
      } else if (response.status === 404) {
        throw new Error('MODEL_NOT_FOUND: Model not found.');
      } else {
        throw new Error(`API_ERROR_${response.status}: ${errorDetails || response.statusText}`);
      }
    }

    const data = await response.json();
    let geminiText = null;
    
    try {
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        geminiText = data.candidates[0].content.parts[0].text;
      } else if (data.candidates?.[0]?.parts?.[0]?.text) {
        geminiText = data.candidates[0].parts[0].text;
      } else if (data.candidates?.[0]?.finishReason) {
        const reason = data.candidates[0].finishReason;
        if (reason === 'SAFETY' || reason === 'RECITATION') {
          throw new Error('API_SAFETY_FILTER: Response blocked by safety filters.');
        }
      }
      
      if (!geminiText && data.candidates?.[0]) {
        const searchForText = (obj) => {
          if (typeof obj === 'string' && obj.length > 10) return obj;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const found = searchForText(item);
              if (found) return found;
            }
          } else if (obj && typeof obj === 'object') {
            if (obj.text && typeof obj.text === 'string') return obj.text;
            for (const key in obj) {
              const found = searchForText(obj[key]);
              if (found) return found;
            }
          }
          return null;
        };
        geminiText = searchForText(data.candidates[0]);
      }
    } catch (e) {
      if (e.message.includes('API_SAFETY_FILTER')) throw e;
    }
    
    if (!geminiText || geminiText.trim().length === 0) {
      throw new Error('API_RESPONSE_INVALID: Could not extract text from response.');
    }

    console.log('Raw Gemini response:', geminiText.substring(0, 200) + '...');
    
    // Try multiple parsing strategies
    let replies = [];
    
    // Strategy 1: Split by newlines, bullets, or dashes
    replies = geminiText
      .split(/\n+|•|[-*]\s+|^\d+[\.\)]\s+/m)
      .map(s => s.trim())
      .filter(line => {
        // Filter out empty lines, short lines, and header text
        if (line.length < 10) return false;
        if (line.match(/^(suggestion|reply|option|here are|here's)\s*\d*:?$/i)) return false;
        if (line.match(/^(please|thank|here|below)/i) && line.length < 30) return false;
        return true;
      });
    
    console.log('Parsed replies (strategy 1):', replies.length, replies);
    
    // Strategy 2: If we don't have enough, try splitting by sentences
    if (replies.length < 3) {
      const sentences = geminiText
        .match(/[^\.!\?]+[\.!\?]+/g)
        ?.map(s => s.trim())
        .filter(s => s.length > 15 && !s.match(/^(suggestion|reply|option)/i)) || [];
      
      if (sentences.length > replies.length) {
        replies = sentences;
        console.log('Using sentence-based parsing:', replies.length);
      }
    }
    
    // Strategy 3: If still empty, try splitting by numbered items
    if (replies.length < 2) {
      const numbered = geminiText
        .split(/\d+[\.\)]\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 10)
        .slice(1); // Skip first item (usually before first number)
      
      if (numbered.length > 0) {
        replies = numbered;
        console.log('Using numbered parsing:', replies.length);
      }
    }
    
    // Strategy 4: Last resort - use the whole text as one reply, or split by double newlines
    if (replies.length === 0) {
      const paragraphs = geminiText.split(/\n\n+/).map(s => s.trim()).filter(s => s.length > 10);
      if (paragraphs.length > 0) {
        replies = paragraphs;
      } else {
        replies = [geminiText.trim()];
      }
      console.log('Using fallback parsing:', replies.length);
    }

    // Clean up replies - remove common prefixes and ensure minimum length
    replies = replies
      .map(r => {
        // Remove common prefixes like "1. ", "Reply 1: ", etc.
        r = r.replace(/^\d+[\.\)]\s*/, '');
        r = r.replace(/^(reply|suggestion|option)\s*\d*:?\s*/i, '');
        r = r.replace(/^[-*•]\s*/, '');
        return r.trim();
      })
      .filter(r => r.length > 5)
      .slice(0, 5);

    console.log('Final replies:', replies.length, replies);
    
    if (replies.length === 0) {
      throw new Error('API_RESPONSE_INVALID: No valid replies could be extracted from response.');
    }

    return replies;
  } catch (error) {
    if (error.message.includes('MODEL_NOT_FOUND')) throw error;
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('NETWORK_ERROR: Failed to connect to Gemini API.');
    }
    if (error.message.startsWith('API_') || error.message.startsWith('NETWORK_')) throw error;
    throw new Error('UNEXPECTED_ERROR: ' + error.message);
  }
}

async function loadReplies() {
  try {
    // Load API key from storage
    await loadApiKey();
    
    // Check if API key is configured
    if (!geminiApiKey || geminiApiKey.trim() === '') {
      loadingEl.style.display = 'none';
      lastMessageEl.textContent = 'API Key Not Configured';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">Please configure your Gemini API key.</p>
        <p style="font-size: 12px; margin-bottom: 10px;">Click the settings button below to add your API key.</p>
        <button id="openSettings" style="padding: 8px 16px; background-color: #0073b1; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
          Open Settings
        </button>
      `;
      
      // Add click handler for settings button
      document.getElementById('openSettings')?.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
      return;
    }

    lastMessageEl.textContent = 'Reading message from LinkedIn...';
    console.log('Starting message extraction...');
    const lastMessage = await fetchLastLinkedInMessage();
    console.log('Message extracted:', lastMessage ? lastMessage.substring(0, 50) + '...' : 'empty');
    loadingEl.style.display = 'none';
    
    if (!lastMessage) {
      lastMessageEl.textContent = 'No LinkedIn message found. Make sure you\'re on a LinkedIn messaging page with messages visible.';
      suggestionsContainer.textContent = 'Try opening a conversation and clicking the extension again.';
      return;
    }
    
    lastMessageEl.textContent = `Last message: "${lastMessage.substring(0, 100)}${lastMessage.length > 100 ? '...' : ''}"`;
    suggestionsContainer.textContent = 'Loading Gemini suggestions...';

    // Ensure API key is loaded
    await loadApiKey();
    console.log('Fetching Gemini replies for message:', lastMessage.substring(0, 50) + '...');
    const replies = await fetchGeminiReplies(lastMessage);
    console.log('Received replies:', replies);
    
    if (!replies || replies.length === 0) {
      lastMessageEl.textContent = `Last message: "${lastMessage.substring(0, 100)}${lastMessage.length > 100 ? '...' : ''}"`;
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">No reply suggestions were generated.</p>
        <p style="font-size: 12px;">The API returned an empty response. Please try again.</p>
      `;
      return;
    }
    
    suggestionsContainer.innerHTML = '';
    replies.forEach((reply, index) => {
      if (!reply || reply.trim().length === 0) return;
      
      const btn = document.createElement('button');
      btn.textContent = reply;
      btn.classList.add('reply-btn');
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(reply)
          .then(() => alert('Reply copied to clipboard:\n' + reply))
          .catch(() => alert('Failed to copy reply'));
      });
      suggestionsContainer.appendChild(btn);
      console.log(`Added reply button ${index + 1}:`, reply.substring(0, 50) + '...');
    });
    
    if (suggestionsContainer.children.length === 0) {
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">No valid suggestions could be displayed.</p>
        <p style="font-size: 12px;">Check the console (F12) for details.</p>
      `;
    }
  } catch (e) {
    loadingEl.style.display = 'none';
    const errorMessage = e.message || 'Unknown error';
    console.error('Error in loadReplies:', e);
    
    if (errorMessage.includes('Timeout') || errorMessage.includes('took too long')) {
      lastMessageEl.textContent = 'Message extraction timed out.';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">The extension couldn't extract the message from LinkedIn.</p>
        <p style="font-size: 12px;">Try:</p>
        <ul style="font-size: 12px; margin-left: 20px;">
          <li>Make sure you're on a LinkedIn messaging page with an open conversation</li>
          <li>Wait a few seconds for the page to fully load, then try again</li>
          <li>Refresh the LinkedIn page and try again</li>
          <li>Check the browser console (F12) for errors</li>
        </ul>
      `;
    } else if (errorMessage.includes('API_KEY_INVALID')) {
      lastMessageEl.textContent = 'Invalid Gemini API Key.';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">The API key in the code appears to be invalid or expired.</p>
        <p style="font-size: 12px;">To fix this:</p>
        <ol style="font-size: 12px; margin-left: 20px;">
          <li>Get a new API key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a></li>
          <li>Update the geminiApiKey variable in popup.js</li>
          <li>Reload the extension</li>
        </ol>
      `;
    } else if (errorMessage.includes('API_QUOTA')) {
      lastMessageEl.textContent = 'Gemini API Quota Exceeded.';
      suggestionsContainer.textContent = 'You have reached your API usage limit. Please check your Google AI Studio account or try again later.';
    } else if (errorMessage.includes('API_SERVER')) {
      lastMessageEl.textContent = 'Gemini Service Unavailable.';
      suggestionsContainer.textContent = 'Google Gemini servers are temporarily down. Please try again in a few minutes.';
    } else if (errorMessage.includes('API_SAFETY_FILTER')) {
      lastMessageEl.textContent = 'Content Filtered by Gemini.';
      suggestionsContainer.textContent = 'The response was blocked by safety filters. Please try rephrasing your request.';
    } else if (errorMessage.includes('NETWORK_ERROR')) {
      lastMessageEl.textContent = 'Network Connection Error.';
      suggestionsContainer.textContent = 'Failed to connect to Gemini API. Please check your internet connection and try again.';
    } else if (errorMessage.includes('API_MODEL_NOT_FOUND')) {
      lastMessageEl.textContent = 'Gemini Model Not Available.';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">No working Gemini models found.</p>
        <p style="font-size: 12px;">Verify your API key at <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a> and ensure the Gemini API is enabled.</p>
      `;
    } else if (errorMessage.includes('Background script error') || errorMessage.includes('No response from background')) {
      lastMessageEl.textContent = 'Communication Error.';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">Could not communicate with the extension.</p>
        <p style="font-size: 12px;">Try:</p>
        <ul style="font-size: 12px; margin-left: 20px;">
          <li>Make sure you're on a LinkedIn messaging page (linkedin.com/messaging)</li>
          <li>Reload the extension in chrome://extensions/</li>
          <li>Refresh the LinkedIn page and try again</li>
        </ul>
      `;
    } else if (errorMessage.includes('API_')) {
      lastMessageEl.textContent = 'Gemini API Error.';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">${errorMessage.replace(/^API_[^:]+:\s*/, '')}</p>
        <p style="font-size: 12px;">Please check your API key and try again.</p>
      `;
    } else {
      lastMessageEl.textContent = 'Error occurred.';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">${errorMessage}</p>
        <p style="font-size: 12px;">Check the browser console (F12) for more details.</p>
      `;
    }
  }
}

// Add settings button handler
document.getElementById('settingsBtn')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

loadReplies();

