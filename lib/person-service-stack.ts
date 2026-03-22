import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export type Stage = 'prod' | 'acc' | 'tst' | 'dev' | 'local' | (string & {});

export interface PersonServiceStackProps extends cdk.StackProps {
  stage: Stage;
}

export class PersonServiceStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly eventBus: events.EventBus;
  public readonly api: apigateway.RestApi;
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: PersonServiceStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === 'prod' || stage === 'acc';

    // ── DynamoDB ──────────────────────────────────────────────────────
    this.table = new dynamodb.Table(this, 'PersonTable', {
      tableName: `person-${stage}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: isProd ? { pointInTimeRecoveryEnabled: true } : undefined,
    });

    // ── EventBridge ───────────────────────────────────────────────────
    this.eventBus = new events.EventBus(this, 'PersonEventBus', {
      eventBusName: `person-events-${stage}`,
    });

    // ── SQS Dead Letter Queue ─────────────────────────────────────────
    this.deadLetterQueue = new sqs.Queue(this, 'CreatePersonDLQ', {
      queueName: `create-person-dlq-${stage}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ── Lambda ────────────────────────────────────────────────────────
    const createPersonLogGroup = new logs.LogGroup(this, 'CreatePersonLogGroup', {
      logGroupName: `/aws/lambda/create-person-${stage}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const createPersonFn = new NodejsFunction(this, 'CreatePersonFn', {
      functionName: `create-person-${stage}`,
      runtime: Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../src/handlers/create-person.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      deadLetterQueue: this.deadLetterQueue,
      deadLetterQueueEnabled: true,
      retryAttempts: 2,
      environment: {
        TABLE_NAME: this.table.tableName,
        EVENT_BUS_NAME: this.eventBus.eventBusName,
        POWERTOOLS_SERVICE_NAME: 'person-service',
        POWERTOOLS_LOG_LEVEL: isProd ? 'INFO' : 'DEBUG',
        POWERTOOLS_LOGGER_LOG_EVENT: isProd ? 'false' : 'true',
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: createPersonLogGroup,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    this.table.grantWriteData(createPersonFn);
    this.eventBus.grantPutEventsTo(createPersonFn);

    // ── API Gateway ───────────────────────────────────────────────────
    this.api = new apigateway.RestApi(this, 'PersonApi', {
      restApiName: `person-api-${stage}`,
      description: `Person Service API (${stage})`,
      deployOptions: {
        stageName: stage,
        tracingEnabled: true,
        throttlingRateLimit: isProd ? 1000 : 100,
        throttlingBurstLimit: isProd ? 500 : 50,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
      },
    });

    const personResource = this.api.root.addResource('person');
    personResource.addMethod('POST', new apigateway.LambdaIntegration(createPersonFn), {
      apiKeyRequired: true,
    });

    // ── API Key & Usage Plan ──────────────────────────────────────────
    const apiKey = this.api.addApiKey('PersonApiKey', {
      apiKeyName: `person-api-key-${stage}`,
      description: `API key for Person Service (${stage})`,
    });

    const usagePlan = this.api.addUsagePlan('PersonUsagePlan', {
      name: `person-usage-plan-${stage}`,
      description: `Usage plan for Person Service (${stage})`,
      throttle: {
        rateLimit: isProd ? 1000 : 100,
        burstLimit: isProd ? 500 : 50,
      },
      quota: {
        limit: isProd ? 100_000 : 10_000,
        period: apigateway.Period.DAY,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: this.api.deploymentStage });

    // ── WAF ───────────────────────────────────────────────────────────
    const webAcl = new wafv2.CfnWebACL(this, 'PersonApiWaf', {
      name: `person-api-waf-${stage}`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `person-api-waf-${stage}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `person-waf-common-${stage}`,
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `person-waf-sqli-${stage}`,
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProd ? 2000 : 500,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `person-waf-rate-limit-${stage}`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'PersonApiWafAssociation', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    // ── CloudWatch Alarms ─────────────────────────────────────────────
    new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: `create-person-errors-${stage}`,
      alarmDescription: 'Alarm when Lambda error rate exceeds threshold',
      metric: createPersonFn.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: isProd ? 5 : 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'LambdaThrottleAlarm', {
      alarmName: `create-person-throttles-${stage}`,
      alarmDescription: 'Alarm when Lambda is being throttled',
      metric: createPersonFn.metricThrottles({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'DlqMessagesAlarm', {
      alarmName: `create-person-dlq-messages-${stage}`,
      alarmDescription: 'Alarm when messages land in the dead letter queue',
      metric: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'Person API base URL',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
    });

    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
    });

    new cdk.CfnOutput(this, 'DlqUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'Dead letter queue URL for failed Lambda invocations',
    });

    if (!isProd) {
      new cdk.CfnOutput(this, 'ApiKeyId', {
        value: apiKey.keyId,
        description:
          'API key ID (retrieve value with: aws apigateway get-api-key --api-key <id> --include-values)',
      });
    }
  }
}
