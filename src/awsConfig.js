const awsConfig = {
  region: 'your-region', // e.g., 'us-east-1'
  identityPoolId: 'your-cognito-identity-pool-id', // e.g., 'us-east-1:xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx'
  botV2Id: 'your-lex-bot-id', // e.g., 'ABCD1234'
  botV2AliasId: 'your-lex-bot-alias-id', // e.g., 'TSTALIASID'
  botV2LocaleId: 'your-lex-bot-locale-id', // e.g., 'en_US'
};

export default awsConfig;