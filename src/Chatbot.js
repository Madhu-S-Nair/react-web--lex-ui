import React, { useState, useEffect, useRef } from 'react';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

AWS.config.update({
  region: 'your-region',
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'your-identity-pool-id',
  }),
});

const lexRuntimeV2 = new AWS.LexRuntimeV2();

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const sessionAttributes = useRef({});

  const handleSendMessage = async (inputText) => {
    if (inputText.trim() === '') return;

    const newMessage = { text: inputText, sender: 'user' };
    setMessages([...messages, newMessage]);

    const params = {
      botAliasId: 'your-bot-alias-id',
      botId: 'your-bot-id',
      localeId: 'your-bot-locale-id',
      sessionId: AWS.config.credentials.identityId,
      text: inputText,
      sessionState: {
        sessionAttributes: sessionAttributes.current,
      },
    };

    lexRuntimeV2.recognizeText(params, (err, data) => {
      if (err) {
        console.error(err);
      } else if (data) {
        sessionAttributes.current = data.sessionState.sessionAttributes;
        const botMessages = data.messages.map(msg => ({
          text: msg.content,
          sender: 'bot',
        }));
        setMessages([...messages, ...botMessages]);
      }
    });
  };

  const startRecording = () => {
    setIsRecording(true);
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = event => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          handleVoiceMessage(audioBlob);
          audioChunksRef.current = [];
        };

        mediaRecorder.start();
      });
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleVoiceMessage = (audioBlob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const audioData = new Uint8Array(reader.result);
      const params = {
        botAliasId: 'your-bot-alias-id',
        botId: 'your-bot-id',
        localeId: 'your-bot-locale-id',
        sessionId: AWS.config.credentials.identityId,
        inputStream: audioData,
        contentType: 'audio/wav',
        sessionState: {
          sessionAttributes: sessionAttributes.current,
        },
      };

      lexRuntimeV2.recognizeUtterance(params, (err, data) => {
        if (err) {
          console.error(err);
        } else if (data) {
          sessionAttributes.current = data.sessionState.sessionAttributes;
          const userMessage = {
            text: data.inputTranscript,
            sender: 'user',
          };
          const botMessages = data.messages.map(msg => ({
            text: msg.content,
            sender: 'bot',
          }));
          setMessages([...messages, userMessage, ...botMessages]);

          // Play bot response audio
          const audioBlob = new Blob([data.audioStream], { type: 'audio/mpeg' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.play();
        }
      });
    };
    reader.readAsArrayBuffer(audioBlob);
  };

  useEffect(() => {
    const handleContinueConversation = () => {
      // Automatically start recording again after bot's response
      startRecording();
    };

    // Assuming there's a way to detect when the bot has finished speaking
    const audioElement = document.querySelector('audio');
    if (audioElement) {
      audioElement.onended = handleContinueConversation;
    }
  }, [messages]);

  return (
    <div className="chatbot">
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>
      <div className="input-area">
        <input type="text" onKeyDown={(e) => {
          if (e.key === 'Enter') handleSendMessage(e.target.value);
        }} />
        <button onClick={isRecording ? stopRecording : startRecording}>
          {isRecording ? 'Stop' : 'Mic'}
        </button>
      </div>
    </div>
  );
};

export default Chatbot;