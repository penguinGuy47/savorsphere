import path from 'path';
import url from 'url';
import { Construct } from 'constructs';
import {
  Stack, CfnOutput, Duration,
  aws_dynamodb as dynamodb,
  aws_logs as logs
} from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  HttpApi, HttpMethod
} from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function lambdaEntry(...segments) {
  return path.join(__dirname, '..', ...segments);
}

export class SavorSphereStack extends Stack {
  /** @param {Construct} scope */
  constructor(scope, id, props) {
    super(scope, id, props);

    // Reuse existing DynamoDB tables by name
    const Orders = dynamodb.Table.fromTableName(this, 'OrdersTbl', 'Orders');
    const OrderItems = dynamodb.Table.fromTableName(this, 'OrderItemsTbl', 'OrderItems');
    const Payments = dynamodb.Table.fromTableName(this, 'PaymentsTbl', 'Payments');
    const RestaurantSettings = dynamodb.Table.fromTableName(this, 'RestaurantSettingsTbl', 'RestaurantSettings');
    const MenuItems = dynamodb.Table.fromTableName(this, 'MenuItemsTbl', 'MenuItems');

    const api = new HttpApi(this, 'SavorHttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.OPTIONS],
        allowHeaders: ['*']
      }
    });

    const defaultFnProps = {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        sourceMap: false,
        externalModules: []
      }
    };

    const createPaymentIntentFn = new NodejsFunction(this, 'CreatePaymentIntentFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'createPaymentIntent', 'index.mjs'),
      environment: {
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? ''
      }
    });
    api.addRoutes({
      path: '/payment/intent',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreatePaymentIntentInt', createPaymentIntentFn)
    });

    const createOrderFn = new NodejsFunction(this, 'CreateOrderFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'createOrder', 'index.mjs')
    });
    Orders.grantReadWriteData(createOrderFn);
    OrderItems.grantReadWriteData(createOrderFn);
    Payments.grantReadWriteData(createOrderFn);
    RestaurantSettings.grantReadData(createOrderFn);
    api.addRoutes({
      path: '/orders',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateOrderInt', createOrderFn)
    });

    const getOrderFn = new NodejsFunction(this, 'GetOrderFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'getOrder', 'index.mjs')
    });
    Orders.grantReadData(getOrderFn);
    OrderItems.grantReadData(getOrderFn);
    api.addRoutes({
      path: '/order/{id}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrderInt', getOrderFn)
    });

    const getMenuFn = new NodejsFunction(this, 'GetMenuFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'getMenu', 'index.mjs')
    });
    MenuItems.grantReadData(getMenuFn);
    api.addRoutes({
      path: '/menu',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetMenuInt', getMenuFn)
    });

    const getSettingsFn = new NodejsFunction(this, 'GetSettingsFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'getSettings', 'index.mjs')
    });
    RestaurantSettings.grantReadData(getSettingsFn);
    api.addRoutes({
      path: '/settings',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetSettingsInt', getSettingsFn)
    });

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}