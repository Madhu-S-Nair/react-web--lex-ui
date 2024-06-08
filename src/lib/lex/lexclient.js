import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { LexRuntimeV2Client, RecognizeTextCommand } from "@aws-sdk/client-lex-runtime-v2";
import "../../styles/chatbot.css";
import AWS from 'aws-sdk'

const LexChat = ({
  botName,
  botAliasId,
  localeId,
  IdentityPoolId,
  placeholder,
  backgroundColor = '#FFFFFF',
  height = 300,
  headerText = 'Chat with Lex'
}) => {
  const [data, setData] = useState('');
  const [lexUserId, setLexUserId] = useState('chatbot-demo' + Date.now());
  const [sessionAttributes, setSessionAttributes] = useState({});
  const [visible, setVisible] = useState('closed');
  const lexruntime = useRef(null);

  useEffect(() => {
    document.getElementById("inputField").focus();
    const client = new LexRuntimeV2Client({
      region: 'us-east-1',
      credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId,
      })
    });
    lexruntime.current = client;
  }, [IdentityPoolId]);

  const handleClick = () => {
    setVisible(visible === 'open' ? 'closed' : 'open');
  };

  const pushChat = async (event) => {
    event.preventDefault();
    const inputFieldText = document.getElementById('inputField');

    if (inputFieldText && inputFieldText.value && inputFieldText.value.trim().length > 0) {
      const inputField = inputFieldText.value.trim();
      inputFieldText.value = '...';
      inputFieldText.locked = true;

      const params = {
        botAliasId,
        botId: botName,
        localeId,
        sessionId: lexUserId,
        text: inputField,
        sessionState: {
          sessionAttributes,
        },
      };

      showRequest(inputField);
      try {
        const command = new RecognizeTextCommand(params);
        const data = await lexruntime.current.send(command);
        setSessionAttributes(data.sessionState.sessionAttributes);
        showResponse(data);
      } catch (err) {
        console.error(err);
        showError('Error: ' + err.message + ' (see console for details)');
      }
      inputFieldText.value = '';
      inputFieldText.locked = false;
    }
    return false;
  };

  const showRequest = (daText) => {
    const conversationDiv = document.getElementById('conversation');
    const requestPara = document.createElement("P");
    requestPara.className = 'userRequest';
    requestPara.appendChild(document.createTextNode(daText));
    conversationDiv.appendChild(requestPara);
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
  };

  const showError = (daText) => {
    const conversationDiv = document.getElementById('conversation');
    const errorPara = document.createElement("P");
    errorPara.className = 'lexError';
    errorPara.appendChild(document.createTextNode(daText));
    conversationDiv.appendChild(errorPara);
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
  };

  const showResponse = (lexResponse) => {
    const conversationDiv = document.getElementById('conversation');
    const responsePara = document.createElement("P");
    responsePara.className = 'lexResponse';
    if (lexResponse.messages && lexResponse.messages.length > 0) {
      lexResponse.messages.forEach(message => {
        if (message.content) {
          responsePara.appendChild(document.createTextNode(message.content));
          responsePara.appendChild(document.createElement('br'));
        }
      });
    }
    if (lexResponse.sessionState.dialogAction.type === 'ReadyForFulfillment') {
      responsePara.appendChild(document.createTextNode('Ready for fulfillment'));
    }
    conversationDiv.appendChild(responsePara);
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
  };

  const handleChange = (event) => {
    event.preventDefault();
    setData(event.target.value);
  };

  const inputStyle = {
    padding: '4px',
    fontSize: 24,
    width: '388px',
    height: '40px',
    borderRadius: '1px',
    border: '10px'
  };

  const conversationStyle = {
    width: '400px',
    height,
    border: 'px solid #ccc',
    backgroundColor,
    padding: '4px',
    overflow: 'scroll',
    borderBottom: 'thin ridge #bfbfbf'
  };

  const headerRectStyle = {
    backgroundColor: '#000000',
    width: '408px',
    height: '40px',
    textAlign: 'center',
    paddingTop: 12,
    paddingBottom: -12,
    color: '#FFFFFF',
    fontSize: '24px'
  };

  const chatcontainerStyle = {
    backgroundColor: '#FFFFFF',
    width: 408
  };

  const chatFormStyle = {
    margin: '1px',
    padding: '2px'
  };

  return (
    <div id="chatwrapper">
      <div id="chat-header-rect" style={headerRectStyle} onClick={handleClick}>
        {headerText}
        {(visible === 'open') ? <span className='chevron top'></span> : <span className='chevron bottom'></span>}
      </div>
      <div id="chatcontainer" className={visible} style={chatcontainerStyle}>
        <div id="conversation" style={conversationStyle}></div>
        <form id="chatform" style={chatFormStyle} onSubmit={pushChat}>
          <input
            type="text"
            id="inputField"
            size="40"
            value={data}
            placeholder={placeholder}
            onChange={handleChange}
            style={inputStyle}
          />
        </form>
      </div>
    </div>
  );
};

LexChat.propTypes = {
  botName: PropTypes.string.isRequired,
  botAliasId: PropTypes.string.isRequired,
  localeId: PropTypes.string.isRequired,
  IdentityPoolId: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  backgroundColor: PropTypes.string,
  height: PropTypes.number,
  headerText: PropTypes.string
};

export default LexChat;
