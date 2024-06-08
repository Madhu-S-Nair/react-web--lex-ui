// src/components/LexClient.js
import React, { useState, useEffect } from 'react';
import AWS from 'aws-sdk';
import zlib from 'zlib';

function b64CompressedToObject(src) {
  return JSON.parse(zlib.unzipSync(Buffer.from(src, 'base64')).toString('utf-8'));
}

function b64CompressedToString(src) {
  return zlib.unzipSync(Buffer.from(src, 'base64')).toString('utf-8').replace(/"/g, '');
}

function compressAndB64Encode(src) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(src))).toString('base64');
}

const LexClient = ({ config }) => {
  const [credentials, setCredentials] = useState(null);
  const [userId, setUserId] = useState(`lex-web-ui-${Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)}`);
  const [lexRuntimeClient, setLexRuntimeClient] = useState(null);

  useEffect(() => {
    const lexRuntimeV2Client = new AWS.LexRuntimeV2({
      region: config.region,
      credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: config.identityPoolId,
      }),
    });

    setLexRuntimeClient(lexRuntimeV2Client);
  }, [config]);

  const initCredentials = (creds) => {
    setCredentials(creds);
    lexRuntimeClient.config.credentials = creds;
    setUserId(creds.identityId || userId);
  };

  const deleteSession = () => {
    const deleteSessionReq = lexRuntimeClient.deleteSession({
      botAliasId: config.botV2AliasId,
      botId: config.botV2Id,
      localeId: config.botV2LocaleId,
      sessionId: userId,
    });

    return lexRuntimeClient.config.credentials.getPromise()
      .then(creds => creds && initCredentials(creds))
      .then(() => deleteSessionReq.promise());
  };

  const startNewSession = () => {
    const putSessionReq = lexRuntimeClient.putSession({
      botAliasId: config.botV2AliasId,
      botId: config.botV2Id,
      localeId: config.botV2LocaleId,
      sessionId: userId,
      sessionState: {
        dialogAction: {
          type: 'ElicitIntent',
        },
      },
    });

    return lexRuntimeClient.config.credentials.getPromise()
      .then(creds => creds && initCredentials(creds))
      .then(() => putSessionReq.promise());
  };

  const postText = (inputText, localeId = 'en_US', sessionAttributes = {}) => {
    const postTextReq = lexRuntimeClient.recognizeText({
      botAliasId: config.botV2AliasId,
      botId: config.botV2Id,
      localeId,
      sessionId: userId,
      text: inputText,
      sessionState: {
        sessionAttributes,
      },
    });

    return lexRuntimeClient.config.credentials.getPromise()
      .then(creds => creds && initCredentials(creds))
      .then(async () => {
        const res = await postTextReq.promise();
        if (res.sessionState) {
          res.sessionAttributes = res.sessionState.sessionAttributes;
          if (res.sessionState.intent) {
            res.intentName = res.sessionState.intent.name;
            res.slots = res.sessionState.intent.slots;
            res.dialogState = res.sessionState.intent.state;
            res.slotToElicit = res.sessionState.dialogAction.slotToElicit;
          } else {
            res.intentName = res.interpretations[0].intent.name;
            res.slots = res.interpretations[0].intent.slots;
            res.dialogState = '';
            res.slotToElicit = '';
          }
          const finalMessages = [];
          if (res.messages && res.messages.length > 0) {
            res.messages.forEach((mes) => {
              if (mes.contentType === 'ImageResponseCard') {
                res.responseCardLexV2 = res.responseCardLexV2 ? res.responseCardLexV2 : [];
                const newCard = {};
                newCard.version = '1';
                newCard.contentType = 'application/vnd.amazonaws.card.generic';
                newCard.genericAttachments = [];
                newCard.genericAttachments.push(mes.imageResponseCard);
                res.responseCardLexV2.push(newCard);
              } else {
                if (mes.contentType) {
                  const v1Format = { type: mes.contentType, value: mes.content, isLastMessageInGroup: "false" };
                  finalMessages.push(v1Format);
                }
              }
            });
          }
          if (finalMessages.length > 0) {
            finalMessages[finalMessages.length - 1].isLastMessageInGroup = "true";
            const msg = `{"messages": ${JSON.stringify(finalMessages)} }`;
            res.message = msg;
          } else {
            finalMessages.push({ type: "PlainText", value: "" });
            const msg = `{"messages": ${JSON.stringify(finalMessages)} }`;
            res.message = msg;
          }
        }
        return res;
      });
  };

  const postContent = (blob, localeId = 'en_US', sessionAttributes = {}, acceptFormat = 'audio/ogg', offset = 0) => {
    const mediaType = blob.type;
    let contentType = mediaType;

    if (mediaType.startsWith('audio/wav')) {
      contentType = 'audio/x-l16; sample-rate=16000; channel-count=1';
    } else if (mediaType.startsWith('audio/ogg')) {
      contentType = `audio/x-cbr-opus-with-preamble; bit-rate=32000; frame-size-milliseconds=20; preamble-size=${offset}`;
    } else {
      console.warn('unknown media type in lex client');
    }

    const sessionState = { sessionAttributes };
    const postContentReq = lexRuntimeClient.recognizeUtterance({
      botAliasId: config.botV2AliasId,
      botId: config.botV2Id,
      localeId,
      sessionId: userId,
      responseContentType: acceptFormat,
      requestContentType: contentType,
      inputStream: blob,
      sessionState: compressAndB64Encode(sessionState),
    });

    return lexRuntimeClient.config.credentials.getPromise()
      .then(creds => creds && initCredentials(creds))
      .then(async () => {
        const res = await postContentReq.promise();
        if (res.sessionState) {
          const oState = b64CompressedToObject(res.sessionState);
          res.sessionAttributes = oState.sessionAttributes ? oState.sessionAttributes : {};
          if (oState.intent) {
            res.intentName = oState.intent.name;
            res.slots = oState.intent.slots;
            res.dialogState = oState.intent.state;
            res.slotToElicit = oState.dialogAction.slotToElicit;
          } else {
            res.intentName = oState.interpretations[0].intent.name;
            res.slots = oState.interpretations[0].intent.slots;
            res.dialogState = '';
            res.slotToElicit = '';
          }
          res.inputTranscript = res.inputTranscript && b64CompressedToString(res.inputTranscript);
          res.interpretations = res.interpretations && b64CompressedToObject(res.interpretations);
          res.sessionState = oState;
          const finalMessages = [];
          if (res.messages && res.messages.length > 0) {
            res.messages = b64CompressedToObject(res.messages);
            res.responseCardLexV2 = [];
            res.messages.forEach((mes) => {
              if (mes.contentType === 'ImageResponseCard') {
                res.responseCardLexV2 = res.responseCardLexV2 ? res.responseCardLexV2 : [];
                const newCard = {};
                newCard.version = '1';
                newCard.contentType = 'application/vnd.amazonaws.card.generic';
                newCard.genericAttachments = [];
                newCard.genericAttachments.push(mes.imageResponseCard);
                res.responseCardLexV2.push(newCard);
              } else {
                if (mes.contentType) {
                  const v1Format = { type: mes.contentType, value: mes.content };
                  finalMessages.push(v1Format);
                }
              }
            });
          }
          if (finalMessages.length > 0) {
            const msg = `{"messages": ${JSON.stringify(finalMessages)} }`;
            res.message = msg;
          }
        }
        return res;
      });
  };

  return (
    <div>
      {/* Add UI components to interact with Lex, such as buttons to start a session, send text, and send audio */}
    </div>
  );
};

export default LexClient;
