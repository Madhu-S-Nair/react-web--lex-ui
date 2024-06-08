import AWS from 'aws-sdk';

const REGION = 'your-aws-region'; // e.g., 'us-east-1'
const IDENTITY_POOL_ID = 'your-identity-pool-id'; // e.g., 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
const LEX_BOT_NAME = 'your-lex-bot-name'; // e.g., 'BookTrip'
const LEX_BOT_ALIAS = 'your-lex-bot-alias'; // e.g., 'BookTripAlias'
const LEX_BOT_LOCALE = 'your-lex-bot-locale'; // e.g., 'en_US'

AWS.config.update({
  region: REGION,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IDENTITY_POOL_ID,
  }),
});

export { AWS, LEX_BOT_NAME, LEX_BOT_ALIAS, LEX_BOT_LOCALE };