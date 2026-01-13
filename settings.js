const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const statusMessage = document.getElementById('statusMessage');

// Load saved API key
chrome.storage.sync.get(['geminiApiKey'], (result) => {
  if (result.geminiApiKey) {
    apiKeyInput.value = result.geminiApiKey;
  }
});

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${isError ? 'status-error' : 'status-success'}`;
  statusMessage.style.display = 'block';
  
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 5000);
}

async function testApiKey(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    showStatus('Please enter an API key first', true);
    return false;
  }

  try {
    // Test with a simple API call
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(testUrl);
    
    if (response.ok) {
      const data = await response.json();
      if (data.models && data.models.length > 0) {
        return true;
      }
    } else if (response.status === 401 || response.status === 403) {
      showStatus('Invalid API key. Please check your key and try again.', true);
      return false;
    } else {
      showStatus('API test failed. Please try again later.', true);
      return false;
    }
  } catch (error) {
    showStatus('Network error. Please check your internet connection.', true);
    return false;
  }
}

saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('Please enter an API key', true);
    return;
  }

  // Test the API key before saving
  testBtn.disabled = true;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Testing...';

  const isValid = await testApiKey(apiKey);

  if (isValid) {
    // Save to Chrome storage
    chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
      if (chrome.runtime.lastError) {
        showStatus('Failed to save API key: ' + chrome.runtime.lastError.message, true);
      } else {
        showStatus('API key saved successfully!', false);
      }
    });
  } else {
    showStatus('Invalid API key. Please check and try again.', true);
  }

  testBtn.disabled = false;
  saveBtn.disabled = false;
  saveBtn.textContent = 'Save';
});

testBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('Please enter an API key first', true);
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  const isValid = await testApiKey(apiKey);

  if (isValid) {
    showStatus('API key is valid! You can save it now.', false);
  }

  testBtn.disabled = false;
  testBtn.textContent = 'Test API Key';
});
