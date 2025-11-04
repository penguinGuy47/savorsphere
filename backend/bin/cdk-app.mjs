import * as cdk from 'aws-cdk-lib';
import { SavorSphereStack } from '../lib/savor-stack.mjs';

const app = new cdk.App();

// Use account ID from environment or fallback to your known account ID
const accountId = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID || '027354322532';

new SavorSphereStack(app, 'SavorSphereProd', {
  env: { 
    account: accountId,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-2' 
  }
});