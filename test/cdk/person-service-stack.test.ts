import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { PersonServiceStack } from '../../lib/person-service-stack';
import type { Stage } from '../../lib/person-service-stack';

function createStack(stage: Stage = 'dev'): Template {
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
    it('should create a Lambda function with Node.js 24 runtime', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs24.x',
        Handler: 'index.handler',
        MemorySize: 256,
        Timeout: 10,
      });
    });

    it('should pass TABLE_NAME and EVENT_BUS_NAME as environment variables', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'create-person-dev',
        Environment: {
          Variables: {
            TABLE_NAME: Match.anyValue(),
            EVENT_BUS_NAME: Match.anyValue(),
            POWERTOOLS_SERVICE_NAME: 'person-service',
            POWERTOOLS_LOG_LEVEL: 'DEBUG',
            POWERTOOLS_LOGGER_LOG_EVENT: 'true',
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
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['dynamodb:PutItem']),
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
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'events:PutEvents',
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('SQS Dead Letter Queue', () => {
    it('should create a DLQ named with the stage', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'create-person-dlq-dev',
        MessageRetentionPeriod: 1209600,
      });
    });

    it('should attach the DLQ to the Lambda function', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::Lambda::Function', {
        DeadLetterConfig: {
          TargetArn: Match.anyValue(),
        },
      });
    });
  });

  describe('X-Ray Tracing', () => {
    it('should enable active tracing on the Lambda function', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: {
          Mode: 'Active',
        },
      });
    });

    it('should enable tracing on API Gateway', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        TracingEnabled: true,
      });
    });
  });

  describe('WAF', () => {
    it('should create a WAF WebACL with managed rule groups', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Scope: 'REGIONAL',
        DefaultAction: { Allow: {} },
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'AWSManagedRulesCommonRuleSet',
          }),
          Match.objectLike({
            Name: 'AWSManagedRulesSQLiRuleSet',
          }),
          Match.objectLike({
            Name: 'RateLimitRule',
          }),
        ]),
      });
    });

    it('should associate the WAF with the API Gateway stage', () => {
      const template = createStack();

      template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
    });
  });

  describe('CloudWatch Alarms', () => {
    it('should create a Lambda error alarm', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'create-person-errors-dev',
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
      });
    });

    it('should create a Lambda throttle alarm', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'create-person-throttles-dev',
        MetricName: 'Throttles',
        Namespace: 'AWS/Lambda',
      });
    });

    it('should create a DLQ messages alarm', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'create-person-dlq-messages-dev',
        MetricName: 'ApproximateNumberOfMessagesVisible',
        Namespace: 'AWS/SQS',
      });
    });
  });

  describe('API Key & Usage Plan', () => {
    it('should create an API key', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::ApiGateway::ApiKey', {
        Name: 'person-api-key-dev',
        Enabled: true,
      });
    });

    it('should create a usage plan with throttling and quota', () => {
      const template = createStack('prod');

      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        UsagePlanName: 'person-usage-plan-prod',
        Throttle: {
          RateLimit: 1000,
          BurstLimit: 500,
        },
        Quota: {
          Limit: 100000,
          Period: 'DAY',
        },
      });
    });

    it('should require API key on the POST method', () => {
      const template = createStack();

      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
        ApiKeyRequired: true,
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

    it('should use lower WAF rate limit for dev', () => {
      const template = createStack('dev');

      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'RateLimitRule',
            Statement: {
              RateBasedStatement: {
                Limit: 500,
                AggregateKeyType: 'IP',
              },
            },
          }),
        ]),
      });
    });

    it('should use higher WAF rate limit for prod', () => {
      const template = createStack('prod');

      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'RateLimitRule',
            Statement: {
              RateBasedStatement: {
                Limit: 2000,
                AggregateKeyType: 'IP',
              },
            },
          }),
        ]),
      });
    });

    it('should treat acc stage as production-like with RETAIN policy', () => {
      const template = createStack('acc');

      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });

    it('should use production-like throttle limits for acc stage', () => {
      const template = createStack('acc');

      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        Throttle: {
          RateLimit: 1000,
          BurstLimit: 500,
        },
        Quota: {
          Limit: 100000,
          Period: 'DAY',
        },
      });
    });

    it('should use production-like WAF rate limit for acc stage', () => {
      const template = createStack('acc');

      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'RateLimitRule',
            Statement: {
              RateBasedStatement: {
                Limit: 2000,
                AggregateKeyType: 'IP',
              },
            },
          }),
        ]),
      });
    });

    it('should not output API key ID for acc stage', () => {
      const template = createStack('acc');

      expect(() => template.hasOutput('ApiKeyId', { Value: Match.anyValue() })).toThrow();
    });
  });
});
