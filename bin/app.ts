#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PersonServiceStack } from '../lib/person-service-stack';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') ?? 'dev';

new PersonServiceStack(app, `PersonService-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1',
  },
});
