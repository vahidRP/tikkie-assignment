import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface PersonServiceStackProps extends cdk.StackProps {
  stage: string;
}

export class PersonServiceStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly eventBus: events.EventBus;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: PersonServiceStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === 'prod';

    // ── DynamoDB ──────────────────────────────────────────────────────
    this.table = new dynamodb.Table(this, 'PersonTable', {
      tableName: `person-${stage}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: isProd,
    });

    // ── EventBridge ───────────────────────────────────────────────────
    this.eventBus = new events.EventBus(this, 'PersonEventBus', {
      eventBusName: `person-events-${stage}`,
    });

    // ── Lambda ────────────────────────────────────────────────────────
    const createPersonFn = new NodejsFunction(this, 'CreatePersonFn', {
      functionName: `create-person-${stage}`,
      runtime: Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/handlers/create-person.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: this.table.tableName,
        EVENT_BUS_NAME: this.eventBus.eventBusName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
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
        throttlingRateLimit: isProd ? 1000 : 100,
        throttlingBurstLimit: isProd ? 500 : 50,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
      },
    });

    const personResource = this.api.root.addResource('person');
    personResource.addMethod('POST', new apigateway.LambdaIntegration(createPersonFn));

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
  }
}
