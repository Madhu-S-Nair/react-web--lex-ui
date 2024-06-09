import React, { useState, useEffect, useRef } from 'react';
import pako from 'pako';
import { AWS, LEX_BOT_NAME, LEX_BOT_ALIAS, LEX_BOT_LOCALE } from './aws-config';

const lexRuntimeV2 = new AWS.LexRuntimeV2();
const polly = new AWS.Polly();

const b64CompressedToObject = (src) => {
  const binaryString = atob(src);
  const charArray = binaryString.split('').map(char => char.charCodeAt(0));
  const byteArray = new Uint8Array(charArray);
  const decompressedData = pako.ungzip(byteArray);
  const jsonString = new TextDecoder().decode(decompressedData);
  return JSON.parse(jsonString);
};

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [buttonLabel, setButtonLabel] = useState('Speak');
  const [decibelLevel, setDecibelLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [inputText, setInputText] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioElementRef = useRef(null);
  const sessionAttributes = useRef({});
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  const logButtonStateChange = (state) => {
    console.log(`Button state changed to "${state}" at ${new Date().toISOString()}`);
  };

  useEffect(() => {
    if (isRecording) {
      console.log(`Recording started at ${new Date().toISOString()}`);
      const timeout = setTimeout(() => {
        stopRecording();
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [isRecording]);

  useEffect(() => {
    if (isRecording && analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.fftSize);

      const updateDecibelLevel = () => {
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sumSquares = 0.0;
        for (const amplitude of dataArray) {
          const normalized = amplitude / 128 - 1;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const decibel = 20 * Math.log10(rms);
        setDecibelLevel(decibel);
        if (isRecording) {
          requestAnimationFrame(updateDecibelLevel);
        }
      };
      updateDecibelLevel();
    }
  }, [isRecording]);

  const handleSendMessage = async () => {
    if (inputText.trim() === '') return;

    const newMessage = { text: inputText, sender: 'user' };
    setMessages(prevMessages => [...prevMessages, newMessage]);

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

    try {
      const start = performance.now();
      const data = await lexRuntimeV2.recognizeText(params).promise();
      const end = performance.now();
      console.log(`lexRuntimeV2.recognizeText took ${end - start} ms`);

      sessionAttributes.current = data.sessionState.sessionAttributes;
      const botMessages = data.messages.map(msg => ({
        text: msg.content,
        sender: 'bot',
      }));
      setMessages(prevMessages => [...prevMessages, ...botMessages]);
      setInputText('');
    } catch (err) {
      console.error(err);
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setButtonLabel('Listening...');
    logButtonStateChange('Listening...');
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        analyser.fftSize = 2048;
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);

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
    setButtonLabel('Processing');
    logButtonStateChange('Processing');
  };

  const compressAndB64Encode = (src) => {
    const result = pako.gzip(JSON.stringify(src));
    return btoa(String.fromCharCode(...new Uint8Array(result)));
  };

  const processAndSendAudio = async (audioBlob) => {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const resampledBuffer = await resampleAudio(audioBuffer, 8000);
      const l16Blob = audioBufferToWav(resampledBuffer);

      handleVoiceMessage(l16Blob);
    } catch (err) {
      console.error('Error processing and sending audio:', err);
      setButtonLabel('Speak');
      setIsProcessing(false);
      logButtonStateChange('Speak');
    }
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
        sample = 8000,
        offset = 0,
        pos = 0;

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);

    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);

    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([buffer], { type: 'audio/lpcm' });

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
    reader.onload = async () => {
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
        requestContentType: 'audio/lpcm; sample-rate=8000; sample-size-bits=16; channel-count=1; is-big-endian=false',
        inputStream: new Blob([audioData], { type: 'audio/lpcm' }),
        sessionState: compressAndB64Encode(sessionState),
      };
  
      try {
        const start = performance.now();
        const data = await lexRuntimeV2.recognizeUtterance(params).promise();
        const end = performance.now();
        console.log(`lexRuntimeV2.recognizeUtterance took ${end - start} ms`);
        handleLexResponse(data);
      } catch (err) {
        console.error('Error recognizing utterance:', err);
        setErrorMessage('Error recognizing utterance');
        setButtonLabel('Speak');
        setIsProcessing(false);
        logButtonStateChange('Speak');
      }
    };
    reader.readAsArrayBuffer(audioBlob);
  };
  
  const handleLexResponse = async (data) => {
    console.log('Lex response:', data);
  
    if (data.messages) {
      let botMessages = b64CompressedToObject(data.messages);
      console.log('Bot says:', botMessages);
      botMessages = processLexMessages(botMessages);
  
      setMessages((prevMessages) => [
        ...prevMessages,
        ...botMessages.map((msg) => ({ text: msg.value, sender: 'bot' })),
      ]);
  
      // Use Polly to synthesize speech and play audio
      try {
        const audioUrl = await synthesizeSpeech(botMessages.map((msg) => msg.value).join(' '));
        const audioElement = new Audio(audioUrl);
        audioElementRef.current = audioElement;
        audioElement.play().catch((error) => {
          console.error('Error playing audio:', error);
        });
        audioElement.onended = () => {
          setButtonLabel('Speak');
          setIsProcessing(false);
          logButtonStateChange('Speak');
        };
      } catch (error) {
        console.error('Error synthesizing and playing speech:', error);
        setErrorMessage('Error synthesizing and playing speech');
        setButtonLabel('Speak');
        setIsProcessing(false);
        logButtonStateChange('Speak');
      }
    } else {
      console.error('No messages in response:', data);
      setErrorMessage('No messages in response');
      setButtonLabel('Speak');
      setIsProcessing(false);
      logButtonStateChange('Speak');
    }
  
    if (data.audioStream) {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioUint8Array = new Uint8Array(data.audioStream);
        const audioBuffer = await audioContext.decodeAudioData(audioUint8Array.buffer);
  
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);
      } catch (error) {
        console.error('Error handling audio stream:', error);
        setErrorMessage('Error handling audio stream');
        setButtonLabel('Speak');
        setIsProcessing(false);
        logButtonStateChange('Speak');
      }
    } else {
      console.error('No audioStream in response:', data);
      setErrorMessage('No audioStream in response');
      setButtonLabel('Speak');
      setIsProcessing(false);
      logButtonStateChange('Speak');
    }
  };
  
  const synthesizeSpeech = async (text) => {
    const params = {
      OutputFormat: 'mp3',
      Text: text,
      VoiceId: 'Joanna', // You can choose any available voice
    };
  
    try {
      const start = performance.now();
      const data = await polly.synthesizeSpeech(params).promise();
      const end = performance.now();
      console.log(`polly.synthesizeSpeech took ${end - start} ms`);
      const audioBlob = new Blob([data.AudioStream], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      return audioUrl;
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      throw error;
    }
  };
  
  const processLexMessages = (res) => {
    let finalMessages = [];
    if (res.length > 0) {
      res.forEach((mes) => {
        if (mes.contentType === 'PlainText') {
          const v1Format = { type: mes.contentType, value: mes.content, isLastMessageInGroup: 'false' };
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
  
    const audioElement = audioElementRef.current;
    if (audioElement) {
      audioElement.onended = handleContinueConversation;
    }
  }, [messages]);
  
  const handleButtonClick = () => {
    setErrorMessage('');
    if (isProcessing) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        setButtonLabel('Speak');
        setIsProcessing(false);
        logButtonStateChange('Speak');
      }
    } else if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputText(value);
    if (value.trim() !== '') {
      setButtonLabel('Send');
    } else {
      setButtonLabel('Speak');
    }
  };
  
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
        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          disabled={isRecording || isProcessing}
        />
        <button onClick={handleSendMessage} disabled={isRecording || isProcessing || inputText.trim() === ''}>
          Send
        </button>
        <button onClick={handleButtonClick} disabled={isProcessing}>
          {buttonLabel}
        </button>
  
        {errorMessage && <div className="error-message">{errorMessage}</div>}
      </div>
      <audio id="audioPlayer" ref={audioElementRef} />
      <div className="decibel-meter">
        Decibel Level: {decibelLevel.toFixed(2)} dB
      </div>
    </div>
  );
  };
  
  export default Chatbot;
  
