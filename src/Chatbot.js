import React, { useState, useEffect, useRef } from 'react';
import { AWS, LEX_BOT_NAME, LEX_BOT_ALIAS, LEX_BOT_LOCALE } from './aws-config';
import pako from 'pako';

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
      botAliasId: LEX_BOT_ALIAS,
      botId: LEX_BOT_NAME,
      localeId: LEX_BOT_LOCALE,
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
          playAudioBeforeSending(audioBlob);
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

  const compressAndB64Encode = (src) => {
    let result = pako.gzip(JSON.stringify(src));
    return btoa(String.fromCharCode(...new Uint8Array(result)));
  };

  const playAudioBeforeSending = (audioBlob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audioElement = document.createElement('audio');
    audioElement.src = audioUrl;
    audioElement.play();
    audioElement.onended = () => {
      handleVoiceMessage(audioBlob);
    };
  };

  const handleVoiceMessage = (audioBlob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const mediaType = audioBlob.type;
      const audioData = reader.result;
      let contentType = mediaType;
      let acceptFormat = 'audio/pcm';

      if (mediaType.startsWith('audio/wav')) {
        contentType = 'audio/x-l16; sample-rate=16000; channel-count=1';
      } else if (mediaType.startsWith('audio/ogg')) {
        contentType = 'audio/x-cbr-opus-with-preamble; bit-rate=32000;';
      } else {
        console.warn('unknown media type in lex client');
      }

      const sessionState = {
        sessionAttributes: sessionAttributes.current
      };

      const params = {
        botAliasId: LEX_BOT_ALIAS,
        botId: LEX_BOT_NAME,
        localeId: LEX_BOT_LOCALE,
        sessionId: AWS.config.credentials.identityId,
        responseContentType: acceptFormat,
        requestContentType: contentType,
        inputStream: audioBlob, // Send as Blob
        sessionState: compressAndB64Encode(sessionState),
      };

      lexRuntimeV2.recognizeUtterance(params, (err, data) => {
        if (err) {
          console.error(err);
        } else {
          handleLexResponse(data);
        }
      });
    };
    reader.readAsArrayBuffer(audioBlob);
  };

  const handleLexResponse = (data) => {
    console.log('Lex response:', data);

    if (data.messages && Array.isArray(data.messages)) {
      const botMessages = data.messages.map((message) => ({
        text: message.content,
        sender: 'bot',
      }));
      setMessages(prevMessages => [...prevMessages, ...botMessages]);
    } else {
      console.error('No messages in response:', data);
    }

    if (data.audioStream) {
      const audioBlob = new Blob([data.audioStream], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioElement = document.getElementById('audioPlayer');
      audioElement.src = audioUrl;
      audioElement.play();
    } else {
      console.error('No audioStream in response:', data);
    }
  };

  useEffect(() => {
    const handleContinueConversation = () => {
      startRecording();
    };

    const audioElement = document.querySelector('audio');
    if (audioElement) {
      audioElement.onended = handleContinueConversation;
    }
  }, [messages]);

  return (
    <div className="chatbot">
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div key={index} className={`messages ${msg.sender}`}>
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
      <audio id="audioPlayer" controls style={{ display: 'none' }}></audio>
    </div>
  );
};

export default Chatbot;
