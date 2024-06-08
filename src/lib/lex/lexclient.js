import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import AWS from 'aws-sdk';
import "../../styles/chatbot.css";

const LexChat = ({
  botName,
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
    AWS.config.region = 'us-east-1';
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId,
    });
    lexruntime.current = new AWS.LexRuntime();
  }, [IdentityPoolId]);

  const handleClick = () => {
    setVisible(visible === 'open' ? 'closed' : 'open');
  };

  const pushChat = (event) => {
    event.preventDefault();
    const inputFieldText = document.getElementById('inputField');

    if (inputFieldText && inputFieldText.value && inputFieldText.value.trim().length > 0) {
      const inputField = inputFieldText.value.trim();
      inputFieldText.value = '...';
      inputFieldText.locked = true;

      const params = {
        botAlias: '$LATEST',
        botName,
        inputText: inputField,
        userId: lexUserId,
        sessionAttributes,
      };

      showRequest(inputField);
      lexruntime.current.postText(params, (err, data) => {
        if (err) {
          console.error(err, err.stack);
          showError('Error:  ' + err.message + ' (see console for details)');
        }
        if (data) {
          setSessionAttributes(data.sessionAttributes);
          showResponse(data);
        }
        inputFieldText.value = '';
        inputFieldText.locked = false;
      });
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
    if (lexResponse.message) {
      responsePara.appendChild(document.createTextNode(lexResponse.message));
      responsePara.appendChild(document.createElement('br'));
    }
    if (lexResponse.dialogState === 'ReadyForFulfillment') {
      responsePara.appendChild(document.createTextNode('Ready for fulfillment'));
    } else {
      responsePara.appendChild(document.createTextNode(''));
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
  botName: PropTypes.string,
  IdentityPoolId: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  backgroundColor: PropTypes.string,
  height: PropTypes.number,
  headerText: PropTypes.string
};

export default LexChat;
