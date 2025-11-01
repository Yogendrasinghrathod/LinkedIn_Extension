# LinkedIn DM GPT Reply Helper

A Chrome extension that uses Google Gemini AI to generate professional reply suggestions for LinkedIn messages.

## Features

- Automatically extracts the last message from LinkedIn conversations
- Generates 5 professional reply suggestions using Gemini AI
- One-click copy to clipboard
- Works directly in your browser

## Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd LinedInExtension
   ```

2. **Get a Gemini API Key**
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create a new API key
   - Copy the key

3. **Add your API Key**
   - Open `popup.js`
   - Find this line: `const geminiApiKey = 'YOUR_API_KEY_HERE';`
   - Replace `'YOUR_API_KEY_HERE'` with your actual API key
   - Save the file

4. **Load the Extension**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `LinedInExtension` folder

5. **Use the Extension**
   - Go to a LinkedIn messaging page
   - Open a conversation
   - Click the extension icon
   - View and copy suggested replies

## Important Notes

- **Never commit your API key to GitHub!** The code uses a placeholder `YOUR_API_KEY_HERE` for safety.
- Your API key is stored locally in your code - it won't be synced to GitHub.
- Keep your API key private and don't share it publicly.

## Troubleshooting

- **"No LinkedIn message found"**: Make sure you're on a LinkedIn messaging page with an open conversation.
- **"Invalid API Key"**: Verify your API key is correct and hasn't expired.
- **"Model not available"**: Check that your API key has access to Gemini models.

## License

MIT License - feel free to use and modify for your needs.

