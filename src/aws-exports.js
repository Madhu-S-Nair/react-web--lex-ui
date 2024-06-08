const awsconfig = {
    Auth: {
      region: 'your-region',
      userPoolId: 'your-user-pool-id',
      userPoolWebClientId: 'your-web-client-id',
    },
    Interactions: {
      bots: {
        "YourBotName": {
          "name": "YourBotName",
          "alias": "$LATEST",
          "region": 'your-region',
        }
      }
    }
  };
  
  export default awsconfig;