const geminiApiKey = 'YOUR_API_KEY_HERE';

const loadingEl = document.getElementById('loading');
const lastMessageEl = document.getElementById('lastMessage');
const suggestionsContainer = document.getElementById('suggestions');

async function fetchLastLinkedInMessage() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout: Message extraction took too long'));
    }, 15000);

    chrome.runtime.sendMessage({ action: 'fetchLastMessage' }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response?.lastMessage || '');
      }
    });
  });
}

async function listAvailableModels(apiVersion = 'v1beta') {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${geminiApiKey}`;
    const response = await fetch(listUrl);
    if (response.ok) {
      const data = await response.json();
      return data.models || [];
    }
  } catch (error) {
  }
  return [];
}

async function fetchGeminiReplies(lastMessage) {
  const prompt = `You received this LinkedIn message:\n"${lastMessage}"\n\nProvide 5 polite and professional reply suggestions for this message. Format each suggestion on a new line.`;

  let availableModels = [];
  try {
    availableModels = await listAvailableModels('v1beta');
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
      return await tryGeminiModel(model, prompt, apiVersion);
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

async function tryGeminiModel(model, prompt, apiVersion = 'v1beta') {
  try {
    const apiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${geminiApiKey}`;
    
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

    let replies = geminiText
      .split(/\n+|•|[-*]\s+/)
      .map(s => s.trim())
      .filter(line => line.length > 10 && !line.match(/^(suggestion|reply|option)\s*\d*:?$/i));
    
    if (replies.length < 3) {
      replies = geminiText
        .match(/[^\.!\?]+[\.!\?]+/g)
        ?.map(s => s.trim())
        .filter(s => s.length > 10) || [];
    }
    
    if (replies.length === 0) {
      replies = [geminiText.trim()];
    }

    return replies.slice(0, 5).filter(r => r.length > 5);
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
    lastMessageEl.textContent = 'Reading message from LinkedIn...';
    const lastMessage = await fetchLastLinkedInMessage();
    loadingEl.style.display = 'none';
    
    if (!lastMessage) {
      lastMessageEl.textContent = 'No LinkedIn message found. Make sure you\'re on a LinkedIn messaging page with messages visible.';
      suggestionsContainer.textContent = 'Try opening a conversation and clicking the extension again.';
      return;
    }
    
    lastMessageEl.textContent = `Last message: "${lastMessage.substring(0, 100)}${lastMessage.length > 100 ? '...' : ''}"`;
    suggestionsContainer.textContent = 'Loading Gemini suggestions...';

    const replies = await fetchGeminiReplies(lastMessage);
    suggestionsContainer.innerHTML = '';
    replies.forEach(reply => {
      const btn = document.createElement('button');
      btn.textContent = reply;
      btn.classList.add('reply-btn');
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(reply)
          .then(() => alert('Reply copied to clipboard:\n' + reply))
          .catch(() => alert('Failed to copy reply'));
      });
      suggestionsContainer.appendChild(btn);
    });
  } catch (e) {
    loadingEl.style.display = 'none';
    const errorMessage = e.message || 'Unknown error';
    
    if (errorMessage.includes('Timeout')) {
      lastMessageEl.textContent = 'Message extraction timed out.';
      suggestionsContainer.textContent = 'LinkedIn may still be loading. Please wait a few seconds and try again, or refresh the LinkedIn page.';
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
    } else if (errorMessage.includes('API_')) {
      lastMessageEl.textContent = 'Gemini API Error.';
      suggestionsContainer.innerHTML = `
        <p style="color: #d32f2f; margin-bottom: 10px;">${errorMessage.replace(/^API_[^:]+:\s*/, '')}</p>
        <p style="font-size: 12px;">Please check your API key and try again.</p>
      `;
    } else {
      lastMessageEl.textContent = 'Error occurred.';
      suggestionsContainer.textContent = errorMessage;
    }
  }
}

loadReplies();

