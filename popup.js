document.addEventListener("DOMContentLoaded", function() {
  console.log("Popup initialized");
  const startBtn = document.getElementById("start-recording");
  const stopBtn = document.getElementById("stop-recording");
  const statusText = document.getElementById("recording-status");
  const transcriptionText = document.getElementById("transcription");
  const googleApiKeyInput = document.getElementById("google-api-key");
  const googleSheetIdInput = document.getElementById("google-sheet-id");
  const saveSettingsBtn = document.getElementById("save-settings");

  let mediaRecorder = null;
  let audioChunks = [];
  let audioStream = null;
  
  // Configuration object for storing API keys and endpoints
  const CONFIG = {
    // For debugging - you should replace these with actual values
    // In production, these would be stored securely
    AZURE_WHISPER_API_KEY: "FKtdVwZaBwJaVj7ql5oArpikZQRXNZyXuKu1VrKw9SWW9LSXoOl5JQQJ99BDACfhMk5XJ3w3AAAAACOGqAn4",   
    AZURE_WHISPER_ENDPOINT: "https://ai-bansaltvisha431923ai933055711740.openai.azure.com/openai/deployments/whisper/audio/translations?api-version=2024-06-01",   
    AZURE_OPENAI_KEY: "FKtdVwZaBwJaVj7ql5oArpikZQRXNZyXuKu1VrKw9SWW9LSXoOl5JQQJ99BDACfhMk5XJ3w3AAAAACOGqAn4",   
    AZURE_OPENAI_ENDPOINT: "https://ai-bansaltvisha431923ai933055711740.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2023-05-15",   
    // Will be loaded from chrome.storage
    GOOGLE_API_KEY: "",
    GOOGLE_SHEET_ID: ""
  };
  
  console.log("Constants initialized");

  // Load saved settings
  function loadSettings() {
    chrome.storage.local.get(["googleApiKey", "googleSheetId"], function(result) {
      if (result.googleApiKey) {
        CONFIG.GOOGLE_API_KEY = result.googleApiKey;
        googleApiKeyInput.value = result.googleApiKey;
      }
      
      if (result.googleSheetId) {
        CONFIG.GOOGLE_SHEET_ID = result.googleSheetId;
        googleSheetIdInput.value = result.googleSheetId;
      }
      
      console.log("Settings loaded from storage");
    });
  }

  // Save settings to chrome.storage
  function saveSettings() {
    const googleApiKey = googleApiKeyInput.value.trim();
    const googleSheetId = googleSheetIdInput.value.trim();
    
    chrome.storage.local.set({
      googleApiKey: googleApiKey,
      googleSheetId: googleSheetId
    }, function() {
      console.log("Settings saved to storage");
      CONFIG.GOOGLE_API_KEY = googleApiKey;
      CONFIG.GOOGLE_SHEET_ID = googleSheetId;
      
      // Show save confirmation
      const saveConfirmation = document.getElementById("save-confirmation");
      if (saveConfirmation) {
        saveConfirmation.style.display = "inline";
        setTimeout(() => {
          saveConfirmation.style.display = "none";
        }, 3000);
      }
    });
  }

  async function startRecording() {
    console.log("Starting recording...");
    try {
      // Reset the audio chunks array
      audioChunks = [];
      
      // Request microphone access using activeTab permission
      console.log("Requesting microphone access...");
      
      // For Chrome extensions with Manifest V3, we need to specifically request
      // audio capture from the user each time through getUserMedia
      audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      console.log("Microphone access granted:", audioStream);
      
      // Create media recorder
      mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      console.log("MediaRecorder created:", mediaRecorder.state);
      
      // Add event listeners
      mediaRecorder.ondataavailable = (event) => {
        console.log("Data available:", event.data.size);
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      // Start recording with 1 second intervals
      mediaRecorder.start(1000);
      console.log("Recording started:", mediaRecorder.state);
      
      // Update UI
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusText.innerText = "Recording...";
      transcriptionText.innerText = "Recording in progress...";
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert(`Microphone access error: ${error.message}\nPlease grant permission in Chrome settings.`);
      statusText.innerText = "Error";
    }
  }

  async function stopRecording() {
    console.log("Stopping recording...");
    
    try {
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        console.warn("MediaRecorder not active");
        return;
      }
      
      // Update UI
      statusText.innerText = "Processing...";
      
      // Define what happens when recording stops BEFORE stopping the recorder
      mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped");
        console.log("Audio chunks collected:", audioChunks.length);
        
        try {
          // Stop all audio tracks
          if (audioStream) {
            audioStream.getTracks().forEach(track => {
              track.stop();
              console.log("Audio track stopped");
            });
          }
          
          if (audioChunks.length === 0) {
            console.error("No audio data collected");
            transcriptionText.innerText = "Error: No audio data collected";
            statusText.innerText = "Error";
            return;
          }
          
          // Create appropriate audio blob
          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          console.log("Audio blob created:", audioBlob.size, "bytes,", mimeType);
          
          // Create an audio element for debugging
          const audioURL = URL.createObjectURL(audioBlob);
          const audio = document.createElement("audio");
          audio.src = audioURL;
          audio.controls = true;
          document.body.appendChild(audio);
          console.log("Audio preview added");
          
          // Process the audio with Whisper API
          transcriptionText.innerText = "Sending to transcription service...";
          const transcription = await sendToWhisper(audioBlob);
          
          if (!transcription) {
            transcriptionText.innerText = "Transcription failed - no text returned.";
            statusText.innerText = "Error";
            return;
          }
          
          console.log("Transcription received:", transcription);
          transcriptionText.innerText = transcription;
          
          // Save transcription to extension storage
          chrome.runtime.sendMessage(
            { action: "saveTranscription", text: transcription },
            (response) => {
              console.log("Storage response:", response);
            }
          );
          
          // Only send to Google Sheets if we have actual transcription and API key is set
          if (transcription && transcription.length > 0 && CONFIG.GOOGLE_API_KEY && CONFIG.GOOGLE_SHEET_ID) {
            transcriptionText.innerText += "\n\nSaving to Google Sheets...";
            await saveToGoogleSheets(transcription);
            transcriptionText.innerText = transcription + "\n\nSaved to Google Sheets!";
          } else if (!CONFIG.GOOGLE_API_KEY || !CONFIG.GOOGLE_SHEET_ID) {
            transcriptionText.innerText = transcription + "\n\nGoogle API key or Sheet ID not set. Please configure in settings.";
          }
          
          // Reset UI
          statusText.innerText = "Idle";
        } catch (error) {
          console.error("Error processing recording:", error);
          transcriptionText.innerText = `Error: ${error.message}`;
          statusText.innerText = "Error";
        } finally {
          // Always make sure UI is reset
          startBtn.disabled = false;
          stopBtn.disabled = true;
          
          // Clear audio chunks
          audioChunks = [];
        }
      };
      
      // Now stop the recorder
      mediaRecorder.stop();
    } catch (error) {
      console.error("Error stopping recording:", error);
      statusText.innerText = "Error";
      transcriptionText.innerText = `Error stopping recording: ${error.message}`;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      
      // Make sure to stop any audio tracks
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
    }
  }

  async function sendToWhisper(audioBlob) {
    console.log("Sending to Whisper API...");
    
    try {
      // Create a form with the audio file
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("model", "whisper-1");  // For OpenAI's Whisper API
      
      console.log("FormData created with blob");
      
      // First try Azure Whisper endpoint
      try {
        console.log("Trying Azure Whisper endpoint:", CONFIG.AZURE_WHISPER_ENDPOINT);
        
        // Send to the API
        const response = await fetch(CONFIG.AZURE_WHISPER_ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${CONFIG.AZURE_WHISPER_API_KEY}`
          },
          body: formData
        });
        
        console.log("API Response status:", response.status);
        
        // Check for errors
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Azure Whisper API Error:", errorText);
          throw new Error(`API error ${response.status}: ${errorText}`);
        }
        
        // Parse the response
        const data = await response.json();
        console.log("API Response data:", data);
        
        // Extract the transcription text
        if (data.text) {
          // OpenAI Whisper format
          return data.text;
        } else if (data.results && data.results.length > 0) {
          // Azure Speech format
          return data.results[0].alternatives[0].transcript;
        } else {
          console.warn("Unknown API response format:", data);
          return JSON.stringify(data);
        }
      } catch (azureError) {
        // If Azure endpoint fails, fall back to a fake transcription for testing
        console.warn("Azure Whisper API failed, using fallback mock transcription", azureError);
        
        // Mock transcription for testing - this helps you test the rest of the flow 
        // without needing a working API
        return "This is a mock transcription for testing purposes. The actual whisper API call failed: " + 
               azureError.message + ". In a production environment, you would need valid API credentials.";
      }
    } catch (error) {
      console.error("Error in sendToWhisper:", error);
      throw error;
    }
  }

  async function saveToGoogleSheets(transcription) {
    // Verify API key and sheet ID are set
    if (!CONFIG.GOOGLE_API_KEY || !CONFIG.GOOGLE_SHEET_ID) {
      throw new Error("Google API key or Sheet ID not set. Please configure in settings.");
    }
    
    console.log("Saving to Google Sheets using Sheet ID:", CONFIG.GOOGLE_SHEET_ID);
    
    const now = new Date();
    const formattedDate = now.toLocaleDateString();
    const formattedTime = now.toLocaleTimeString();
    
    try {
      // Google Sheets API endpoint for appending values
      const sheetsApiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.GOOGLE_SHEET_ID}/values/Sheet1!A:C:append?valueInputOption=USER_ENTERED&key=${CONFIG.GOOGLE_API_KEY}`;
      
      // Prepare the data
      const values = [
        [formattedDate, formattedTime, transcription]
      ];
      
      const requestBody = {
        values: values
      };
      
      // Send to Google Sheets API
      const response = await fetch(sheetsApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to save to Google Sheets:", errorText);
        throw new Error(`Google Sheets API error: ${errorText}`);
      }
      
      const data = await response.json();
      console.log("Successfully saved to Google Sheets:", data);
      return true;
    } catch (error) {
      console.error("Google Sheets save error:", error);
      throw new Error(`Google Sheets API error: ${error.message}`);
    }
  }

  // Function to check microphone permissions
  async function checkMicrophonePermission() {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' });
      console.log("Microphone permission status:", result.state);
      
      if (result.state === 'granted') {
        statusText.innerText = "Ready";
      } else if (result.state === 'prompt') {
        statusText.innerText = "Needs microphone permission";
      } else if (result.state === 'denied') {
        statusText.innerText = "Microphone access denied";
        startBtn.disabled = true;
        alert("Microphone access is denied. Please enable it in your browser settings.");
      }
    } catch (error) {
      console.error("Error checking permissions:", error);
    }
  }

  // Attach event listeners
  startBtn.addEventListener("click", startRecording);
  stopBtn.addEventListener("click", stopRecording);
  
  // Add settings functionality
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", saveSettings);
  }

  // Load stored transcription when popup opens
  chrome.storage.local.get("transcription", (data) => {
    if (data.transcription) {
      transcriptionText.innerText = data.transcription;
    }
  });
  
  // Load settings on init
  loadSettings();
  
  // Check microphone permissions on load
  checkMicrophonePermission();
  
  // Log extension info
  console.log("Call-it-Done Extension loaded");
  console.log("Browser:", navigator.userAgent);
  console.log("MediaRecorder supported types:", MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'Not supported');
});