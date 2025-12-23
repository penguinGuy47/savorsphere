import path from 'path';
import url from 'url';
import { Construct } from 'constructs';
import {
  Stack, CfnOutput, Duration,
  aws_dynamodb as dynamodb,
  aws_logs as logs,
  aws_iam as iam
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
    
    // OTP Codes table - create if it doesn't exist, or reference existing
    const OTPCodes = dynamodb.Table.fromTableName(this, 'OTPCodesTbl', 'OTPCodes');

    // Streets by ZIP table for address lookup (phonetic matching)
    const StreetsByZip = dynamodb.Table.fromTableName(this, 'StreetsByZipTbl', 'StreetsByZip');

    const api = new HttpApi(this, 'SavorHttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PATCH, HttpMethod.PUT, HttpMethod.OPTIONS],
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

    const updateOrderFn = new NodejsFunction(this, 'UpdateOrderFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'updateOrder', 'index.mjs')
    });
    Orders.grantReadWriteData(updateOrderFn);
    api.addRoutes({
      path: '/order/{id}',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('UpdateOrderInt', updateOrderFn)
    });

    const getOrdersFn = new NodejsFunction(this, 'GetOrdersFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'getOrders', 'index.mjs')
    });
    Orders.grantReadData(getOrdersFn);
    OrderItems.grantReadData(getOrdersFn);
    // GET /orders for listing orders (admin), POST /orders for creating orders (customer)
    api.addRoutes({
      path: '/orders',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrdersInt', getOrdersFn)
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

    const createMenuItemFn = new NodejsFunction(this, 'CreateMenuItemFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'createMenuItem', 'index.mjs')
    });
    MenuItems.grantReadWriteData(createMenuItemFn);
    api.addRoutes({
      path: '/menu',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateMenuItemInt', createMenuItemFn)
    });

    const updateMenuItemFn = new NodejsFunction(this, 'UpdateMenuItemFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'updateMenuItem', 'index.mjs')
    });
    MenuItems.grantReadWriteData(updateMenuItemFn);
    api.addRoutes({
      path: '/menu/{menuItemId}',
      methods: [HttpMethod.PUT, HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('UpdateMenuItemInt', updateMenuItemFn)
    });

    const deleteMenuItemFn = new NodejsFunction(this, 'DeleteMenuItemFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'deleteMenuItem', 'index.mjs')
    });
    MenuItems.grantReadWriteData(deleteMenuItemFn);
    api.addRoutes({
      path: '/menu/{menuItemId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteMenuItemInt', deleteMenuItemFn)
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

    const updateSettingsFn = new NodejsFunction(this, 'UpdateSettingsFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'updateSettings', 'index.mjs')
    });
    RestaurantSettings.grantReadWriteData(updateSettingsFn);
    api.addRoutes({
      path: '/settings',
      methods: [HttpMethod.PUT, HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('UpdateSettingsInt', updateSettingsFn)
    });

    // Send OTP Lambda
    const sendOTPFn = new NodejsFunction(this, 'SendOTPFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'sendOTP', 'index.mjs')
    });
    OTPCodes.grantReadWriteData(sendOTPFn);
    sendOTPFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sns:Publish'],
        resources: ['*']
      })
    );
    api.addRoutes({
      path: '/otp/send',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SendOTPInt', sendOTPFn)
    });

    // Verify OTP Lambda
    const verifyOTPFn = new NodejsFunction(this, 'VerifyOTPFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'verifyOTP', 'index.mjs')
    });
    OTPCodes.grantReadWriteData(verifyOTPFn);
    api.addRoutes({
      path: '/otp/verify',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('VerifyOTPInt', verifyOTPFn)
    });

    // Vapi → Lambda webhook that receives every phone order
    const vapiOrderWebhook = new NodejsFunction(this, 'VapiOrderWebhook', {
      functionName: 'vapiOrderWebhook',
      entry: lambdaEntry('lambdas', 'vapiOrderWebhook', 'vapiOrderWebhook.mjs'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        TABLE_NAME: Orders.tableName
      },
      bundling: {
        target: 'es2022',
        format: 'esm',
        minify: true,
        sourceMap: false,
        externalModules: ['@aws-sdk/*']
      }
    });
    Orders.grantWriteData(vapiOrderWebhook);
    OrderItems.grantReadWriteData(vapiOrderWebhook);
    RestaurantSettings.grantReadData(vapiOrderWebhook);
    api.addRoutes({
      path: '/vapi/webhook',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('VapiOrderWebhookInt', vapiOrderWebhook)
    });

    // Address Lookup Lambda (phonetic/fuzzy matching for voice orders)
    const lookupAddressFn = new NodejsFunction(this, 'LookupAddressFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'lookupAddress', 'index.mjs'),
      environment: {
        STREETS_TABLE: StreetsByZip.tableName,
        // Fallback for Vapi calls that do not include assistant/call metadata
        // Override at deploy time by setting DEFAULT_RESTAURANT_ID in your environment.
        DEFAULT_RESTAURANT_ID: process.env.DEFAULT_RESTAURANT_ID || 'rest-001',
      }
    });
    StreetsByZip.grantReadData(lookupAddressFn);
    api.addRoutes({
      path: '/address/lookup',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('LookupAddressInt', lookupAddressFn)
    });

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}