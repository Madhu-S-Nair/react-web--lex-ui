// src/Chatbot.js
import React, { useState } from 'react';
import { AWS, LEX_BOT_NAME, LEX_BOT_ALIAS, LEX_BOT_LOCALE } from './aws-config';

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');

  const lexRuntime = new AWS.LexRuntimeV2();

  const handleSendMessage = async () => {
    if (inputText.trim() === '') return;

    const newMessage = { text: inputText, sender: 'user' };
    setMessages([...messages, newMessage]);

    const params = {
      botAliasId: LEX_BOT_ALIAS,
      botId: LEX_BOT_NAME,
      localeId: LEX_BOT_LOCALE,
      sessionId: AWS.config.credentials.identityId,
      text: inputText,
    };

    lexRuntime.recognizeText(params, (err, data) => {
      if (err) {
        console.error(err);
      } else if (data && data.messages) {
        const botMessages = data.messages.map(msg => ({
          text: msg.content,
          sender: 'bot',
        }));
        setMessages([...messages, newMessage, ...botMessages]);
      }
    });

    setInputText('');
  };

  return (
    <div>
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>
      <div className="input-container">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button onClick={handleSendMessage}>Send</button>
      </div>
    </div>
  );
};

export default Chatbot;
