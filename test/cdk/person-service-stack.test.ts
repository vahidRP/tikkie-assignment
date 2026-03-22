import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PersonServiceStack } from '../../lib/person-service-stack';

function createStack(stage = 'dev'): Template {
  const app = new cdk.App();
  const stack = new PersonServiceStack(app, `PersonService-${stage}`, { stage });
  return Template.fromStack(stack);
}

describe('PersonServiceStack', () => {
  describe('DynamoDB', () => {
    it('should create a DynamoDB table with id as partition key', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('should name the table using the stage', () => {
      const template = createStack('staging');

      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'person-staging',
      });
    });
  });

  describe('EventBridge', () => {
    it('should create an EventBridge event bus named with the stage', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::Events::EventBus', {
        Name: 'person-events-dev',
      });
    });
  });

  describe('Lambda', () => {
    it('should create a Lambda function with Node.js 20 runtime', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
        MemorySize: 256,
        Timeout: 10,
      });
    });

    it('should pass TABLE_NAME and EVENT_BUS_NAME as environment variables', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            TABLE_NAME: { Ref: expect.stringMatching(/PersonTable/) },
            EVENT_BUS_NAME: { Ref: expect.stringMatching(/PersonEventBus/) },
            NODE_OPTIONS: '--enable-source-maps',
          },
        },
      });
    });
  });

  describe('API Gateway', () => {
    it('should create a REST API named with the stage', () => {
      const template = createStack('prod');

      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'person-api-prod',
      });
    });

    it('should define a POST method on /person', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
      });
    });
  });

  describe('IAM permissions', () => {
    it('should grant the Lambda write access to DynamoDB', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: expect.arrayContaining([
            expect.objectContaining({
              Action: expect.arrayContaining([
                'dynamodb:PutItem',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('should grant the Lambda permission to put events on EventBridge', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: expect.arrayContaining([
            expect.objectContaining({
              Action: 'events:PutEvents',
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('Environment-specific configuration', () => {
    it('should set RETAIN removal policy for prod DynamoDB table', () => {
      const template = createStack('prod');

      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });

    it('should set DELETE removal policy for dev DynamoDB table', () => {
      const template = createStack('dev');

      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Delete',
      });
    });
  });
});
