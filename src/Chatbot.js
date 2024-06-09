import React, { useState, useEffect, useRef } from 'react';
import { AWS, LEX_BOT_NAME, LEX_BOT_ALIAS, LEX_BOT_LOCALE } from './aws-config';
import pako from 'pako';

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
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioElementRef = useRef(null);
  const sessionAttributes = useRef({});
  const silenceTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceThreshold = -50; // Decibels
  const silenceDuration = 1000; // 1 second

  const handleSendMessage = async (inputText) => {
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
    } catch (err) {
      console.error(err);
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 2048;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkSilence = () => {
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            const value = (dataArray[i] / 128) - 1;
            sum += value * value;
          }
          const volume = 20 * Math.log10(Math.sqrt(sum / bufferLength));
          if (volume < silenceThreshold) {
            if (!silenceTimeoutRef.current) {
              silenceTimeoutRef.current = setTimeout(() => {
                if (isRecording) {
                  stopRecording();
                  setButtonLabel('Processing');
                }
              }, silenceDuration);
            }
          } else {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          if (isRecording) {
            requestAnimationFrame(checkSilence);
          }
        };
        checkSilence();

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
        setTimeout(() => {
          if (isRecording) {
            stopRecording();
            setButtonLabel('Processing');
          }
        }, 5000); // Maximum recording time
      });
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
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

      const resampledBuffer = await resampleAudio(audioBuffer, 8000); // Lower sample rate to 8000 Hz
      const l16Blob = audioBufferToWav(resampledBuffer);

      handleVoiceMessage(l16Blob);
    } catch (err) {
      console.error('Error processing and sending audio:', err);
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
        sample = 8000, // Sample rate set to 8000 Hz
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

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) { // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (0.5 + sample * 32767) | 0; // scale to 16-bit signed int
        view.setInt16(pos, sample, true); // write 16-bit sample
        pos += 2;
      }
      offset++; // next source sample
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
        };
      } catch (error) {
        console.error('Error synthesizing and playing speech:', error);
      }
    } else {
      console.error('No messages in response:', data);
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
      }
    } else {
      console.error('No audioStream in response:', data);
    }
  };
  
  const synthesizeSpeech = async (text) => {
    const params = {
      OutputFormat: 'mp3',
      Text: text,
      VoiceId: 'Joanna',
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
      if (!isProcessing) {
        setButtonLabel('Speak');
      }
    };
  
    const audioElement = document.querySelector('audio');
    if (audioElement) {
      audioElement.onended = handleContinueConversation;
    }
  }, [messages]);
  
  const handleButtonClick = () => {
    if (buttonLabel === 'Speak') {
      setButtonLabel('Listening...');
      setTimeout(() => {
        if (isRecording) {
          stopRecording();
          setButtonLabel('Processing');
        }
      }, 1500); // Wait for 1.5 seconds to detect if the user is speaking
      startRecording();
    } else if (buttonLabel === 'Stop') {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      }
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage(e.target.value);
          }}
        />
        <button onClick={handleButtonClick} disabled={isProcessing}>
          {buttonLabel}
        </button>
      </div>
      <audio id="audioPlayer" ref={audioElementRef} />
    </div>
  );
  };
  
  export default Chatbot;