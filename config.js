// Configuration file for storing API endpoints and keys
// In a production environment, these would be managed securely

const config = {
  AZURE_WHISPER_ENDPOINT: "https://poorv-m6mlihsh-swedencentral.cognitiveservices.azure.com/language/speech/transcriptions",
  AZURE_WHISPER_API_KEY: "AyQ5UUf02VnZzlmlazK8qn8EVBTP5M8aXyxs1TNgD5BfupzWiVeJJQQJ99BBACfhMk5XJ3w3AAAAACOGUypE",
  NOTION_API_KEY: "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",
  NOTION_DATABASE_ID: "1e615e0725038060b489ebf459ac2b65"
};


// Export the configuration
if (typeof module !== 'undefined') {
  module.exports = config;
}