import React, { useState, useEffect, useRef } from 'react';
import { AWS, LEX_BOT_NAME, LEX_BOT_ALIAS, LEX_BOT_LOCALE } from './aws-config';
import pako from 'pako';

const lexRuntimeV2 = new AWS.LexRuntimeV2();

const b64CompressedToObject = (src) => {
  const binaryString = atob(src); // Decode base64 string
  const charArray = binaryString.split('').map(char => char.charCodeAt(0)); // Convert to byte array
  const byteArray = new Uint8Array(charArray); // Convert to Uint8Array
  const decompressedData = pako.ungzip(byteArray); // Decompress using pako
  const jsonString = new TextDecoder().decode(decompressedData); // Decode to string
  return JSON.parse(jsonString); // Parse JSON string to object
};

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
          processAndSendAudio(audioBlob);
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
    const result = pako.gzip(JSON.stringify(src));
    return btoa(String.fromCharCode(...new Uint8Array(result)));
  };

  const playAudioBeforeSending = (audioBlob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audioElement = new Audio(audioUrl);
    audioElement.play();
    audioElement.onended = () => {
      handleVoiceMessage(audioBlob);
    };
  };

  const processAndSendAudio = async (audioBlob) => {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const resampledBuffer = await resampleAudio(audioBuffer, 16000);
    const l16Blob = audioBufferToWav(resampledBuffer);

    playAudioBeforeSending(l16Blob);
  };

  const resampleAudio = (audioBuffer, targetSampleRate) => {
    return new Promise((resolve) => {
      const numChannels = audioBuffer.numberOfChannels;
      const length = audioBuffer.length * targetSampleRate / audioBuffer.sampleRate;
      const offlineContext = new OfflineAudioContext(numChannels, length, targetSampleRate);

      const bufferSource = offlineContext.createBufferSource();
      bufferSource.buffer = audioBuffer;

      bufferSource.connect(offlineContext.destination);
      bufferSource.start(0);
      offlineContext.startRendering().then(resolve);
    });
  };

  const audioBufferToWav = (audioBuffer) => {
    let numOfChan = audioBuffer.numberOfChannels,
          length = audioBuffer.length * numOfChan * 2 + 44,
          buffer = new ArrayBuffer(length),
          view = new DataView(buffer),
          channels = [],
          sample=44000,
          offset = 0,
          pos = 0;

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this demo)

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (let i = 0; i < audioBuffer.numberOfChannels; i++)
      channels.push(audioBuffer.getChannelData(i));

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) { // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (0.5 + sample * 32767) | 0; // scale to 16-bit signed int
        view.setInt16(pos, sample, true); // write 16-bit sample
        pos += 2;
      }
      offset++; // next source sample
    }

    return new Blob([buffer], { type: 'audio/x-l16' });

    function setUint16(data) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  };

  const handleVoiceMessage = (audioBlob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const audioData = reader.result;

      const sessionState = {
        sessionAttributes: sessionAttributes.current,
      };

      const params = {
        botAliasId: LEX_BOT_ALIAS,
        botId: LEX_BOT_NAME,
        localeId: LEX_BOT_LOCALE,
        sessionId: AWS.config.credentials.identityId,
        responseContentType: 'audio/pcm',
        requestContentType: 'audio/x-l16; sample-rate=16000; channel-count=1',
        inputStream: new Blob([audioData], { type: 'audio/x-l16' }), // Use processed audio blob
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

    if (data.messages) {
      let botMessages = b64CompressedToObject(data.messages);
      console.log('Bot says:', botMessages);
      botMessages = processLexMessages(botMessages);
      
      setMessages((prevMessages) => [
        ...prevMessages,
        ...botMessages.map(msg => ({ text: msg.value, sender: 'bot' }))
      ]);
    } else {
      console.error('No messages in response:', data);
    }

    if (data.audioStream) {
      const audioBlob = new Blob([data.audioStream], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioElement = document.getElementById('audioPlayer');
      audioElement.src = audioUrl;
      audioElement.play();
    } else {
      console.error('No audioStream in response:', data);
    }
  };

  const processLexMessages = (res) => {
    let finalMessages = [];
    if (res.length > 0) {
      res.forEach((mes) => {
        if (mes.contentType === 'PlainText') {
          const v1Format = { type: mes.contentType, value: mes.content, isLastMessageInGroup: "false" };
          finalMessages.push(v1Format);
        }
      });
    }
    return finalMessages;
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
      <audio id="audioPlayer" />
    </div>
  );
};

export default Chatbot;