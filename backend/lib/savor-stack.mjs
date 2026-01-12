import path from 'path';
import url from 'url';
import { Construct } from 'constructs';
import {
  Stack, CfnOutput, Duration, RemovalPolicy,
  aws_dynamodb as dynamodb,
  aws_logs as logs,
  aws_iam as iam,
  aws_cognito as cognito,
} from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  HttpApi, HttpMethod
} from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { HttpJwtAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';

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

    // Order counters table for sequential order numbers per restaurant
    // Create it if it doesn't exist (CDK will handle this)
    const OrderCounters = new dynamodb.Table(this, 'OrderCountersTbl', {
      tableName: 'OrderCounters',
      partitionKey: { name: 'restaurantId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // =========================================================================
    // COGNITO: UserPool for admin dashboard + kitchen tablet auth
    // =========================================================================
    const userPool = new cognito.UserPool(this, 'SavorUserPool', {
      userPoolName: 'savor-sphere-users',
      selfSignUpEnabled: false, // Only admins create users
      signInAliases: { username: true, email: true },
      autoVerify: { email: true },
      // Relaxed password policy to allow 6-digit numeric PINs for kitchen users
      passwordPolicy: {
        minLength: 6,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN, // Don't delete user pool on stack delete
      // Custom attributes for multi-tenancy
      customAttributes: {
        restaurantId: new cognito.StringAttribute({ mutable: true }),
      },
    });

    // Hosted UI domain for admin login
    const userPoolDomain = userPool.addDomain('SavorUserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `savor-sphere-${this.account}`, // Must be globally unique
      },
    });

    // Admin dashboard client (Hosted UI with PKCE)
    const adminClient = userPool.addClient('AdminClient', {
      userPoolClientName: 'savor-admin-dashboard',
      generateSecret: false, // SPA - no secret
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          'http://localhost:3000/callback',
          'http://localhost:4000/callback',
          'https://admin.savorsphere.com/callback', // Update with real domain
        ],
        logoutUrls: [
          'http://localhost:3000/',
          'http://localhost:4000/',
          'https://admin.savorsphere.com/',
        ],
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    // Kitchen tablet client (simple user/password auth for PIN login)
    const kitchenClient = userPool.addClient('KitchenClient', {
      userPoolClientName: 'savor-kitchen-tablet',
      generateSecret: false,
      authFlows: {
        userPassword: true, // Allow USER_PASSWORD_AUTH for PIN login
        adminUserPassword: true, // Allow admin to set passwords
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(8), // Kitchen session lasts a shift
      idTokenValidity: Duration.hours(8),
      refreshTokenValidity: Duration.days(7),
    });

    // JWT Authorizer for protected routes
    // HttpJwtAuthorizer: (id, issuerUrl, options)
    const issuerUrl = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;
    const jwtAuthorizer = new HttpJwtAuthorizer('SavorJwtAuth', issuerUrl, {
      jwtAudience: [adminClient.userPoolClientId, kitchenClient.userPoolClientId],
      identitySource: ['$request.header.Authorization'],
    });

    // =========================================================================
    // END COGNITO
    // =========================================================================

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
    OrderCounters.grantReadWriteData(createOrderFn);
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
    // Needed to enforce PIN-rotation invalidation for kitchen sessions
    RestaurantSettings.grantReadData(updateOrderFn);
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
    // Needed to enforce PIN-rotation invalidation for kitchen sessions
    RestaurantSettings.grantReadData(getOrdersFn);
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
        TABLE_NAME: Orders.tableName,
        VAPI_SHARED_SECRET: process.env.VAPI_SHARED_SECRET || ''
      },
      bundling: {
        target: 'es2022',
        format: 'esm',
        minify: true,
        sourceMap: false,
        externalModules: ['@aws-sdk/*']
      }
    });
    vapiOrderWebhook.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        resources: [Orders.tableArn],
      })
    );
    OrderItems.grantReadWriteData(vapiOrderWebhook);
    RestaurantSettings.grantReadData(vapiOrderWebhook);
    OrderCounters.grantReadWriteData(vapiOrderWebhook);
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

    // =========================================================================
    // KITCHEN PIN MANAGEMENT (JWT-protected admin routes + public session route)
    // =========================================================================

    // GET /kitchen/pin - Check if PIN is set (protected, requires admin JWT)
    const getKitchenPinFn = new NodejsFunction(this, 'GetKitchenPinFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'kitchenPin', 'getPin.mjs'),
    });
    RestaurantSettings.grantReadData(getKitchenPinFn);
    api.addRoutes({
      path: '/kitchen/pin',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetKitchenPinInt', getKitchenPinFn),
      authorizer: jwtAuthorizer,
    });

    // POST /kitchen/pin - Regenerate PIN (protected, requires admin JWT)
    const regenerateKitchenPinFn = new NodejsFunction(this, 'RegenerateKitchenPinFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'kitchenPin', 'regeneratePin.mjs'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
    });
    RestaurantSettings.grantReadWriteData(regenerateKitchenPinFn);
    // Grant Cognito admin permissions for user management
    regenerateKitchenPinFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminUserGlobalSignOut',
          'cognito-idp:AdminGetUser',
        ],
        resources: [userPool.userPoolArn],
      })
    );
    api.addRoutes({
      path: '/kitchen/pin',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegenerateKitchenPinInt', regenerateKitchenPinFn),
      authorizer: jwtAuthorizer,
    });

    // POST /kitchen/session - Exchange PIN for tokens (PUBLIC - no JWT required)
    const kitchenSessionFn = new NodejsFunction(this, 'KitchenSessionFn', {
      ...defaultFnProps,
      entry: lambdaEntry('lambdas', 'kitchenPin', 'session.mjs'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        KITCHEN_CLIENT_ID: kitchenClient.userPoolClientId,
      },
    });
    // Grant Cognito auth permissions
    kitchenSessionFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminInitiateAuth',
        ],
        resources: [userPool.userPoolArn],
      })
    );
    api.addRoutes({
      path: '/kitchen/session',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('KitchenSessionInt', kitchenSessionFn),
      // No authorizer - this is the login endpoint
    });

    // =========================================================================
    // ADD JWT PROTECTION TO ADMIN/KITCHEN ROUTES
    // =========================================================================
    // Note: GET /orders and PATCH /order/{id} are used by KitchenView
    // We'll add a second route with JWT protection for admin/kitchen use
    // The existing routes remain for backward compatibility during migration

    // Protected GET /orders (admin/kitchen)
    api.addRoutes({
      path: '/admin/orders',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrdersProtectedInt', getOrdersFn),
      authorizer: jwtAuthorizer,
    });

    // Protected PATCH /order/{id} (admin/kitchen)
    api.addRoutes({
      path: '/admin/order/{id}',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('UpdateOrderProtectedInt', updateOrderFn),
      authorizer: jwtAuthorizer,
    });

    // =========================================================================
    // OUTPUTS
    // =========================================================================
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolArn', { value: userPool.userPoolArn });
    new CfnOutput(this, 'AdminClientId', { value: adminClient.userPoolClientId });
    new CfnOutput(this, 'KitchenClientId', { value: kitchenClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { 
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com` 
    });
  }
}
