// Chrome extension background script
// This handles the extension's background processes

chrome.runtime.onInstalled.addListener(() => {
  console.log("Call-it-Done extension installed!");
});

// Set up message listeners for communication between popup and background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveTranscription") {
    chrome.storage.local.set({ transcription: message.text });
    sendResponse({ status: "Transcription saved" });
  }
  return true;
});