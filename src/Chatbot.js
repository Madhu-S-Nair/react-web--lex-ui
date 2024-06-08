// src/Chatbot.js
import React, { useState } from 'react';
import { Interactions } from '@aws-amplify/interactions';
import AWS from 'aws-sdk';

const polly = new AWS.Polly({ region: 'your-region' });

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const handleSend = async (text) => {
    const response = await Interactions.send("YourBotName", text);
    setMessages([...messages, { type: 'user', content: text }, { type: 'bot', content: response.message }]);
    speak(response.message);
  };

  const speak = (text) => {
    const params = {
      OutputFormat: 'mp3',
      Text: text,
      VoiceId: 'Joanna'
    };
    polly.synthesizeSpeech(params, (err, data) => {
      if (err) console.log(err, err.stack);
      else {
        const uInt8Array = new Uint8Array(data.AudioStream);
        const arrayBuffer = uInt8Array.buffer;
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play();
      }
    });
  };

  const handleAudioInput = () => {
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.start();

    recognition.onresult = (event) => {
      const speechResult = event.results[0][0].transcript;
      handleSend(speechResult);
    };

    recognition.onerror = (event) => {
      console.error(event.error);
    };
  };

  return (
    <div>
      <div>
        {messages.map((msg, idx) => (
          <div key={idx} className={msg.type}>{msg.content}</div>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => handleSend(input)}>Send</button>
      <button onClick={handleAudioInput}>Send Audio</button>
    </div>
  );
};

export default Chatbot;
