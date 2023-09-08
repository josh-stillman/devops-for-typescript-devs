import * as lambda from 'aws-lambda';
import * as aws from '@pulumi/aws';

const requestRewriterHandler = (
  event: lambda.CloudFrontRequestEvent,
  context: lambda.Context,
  callback: lambda.Callback
) => {
  // Extract the request from the CloudFront event that is sent to Lambda@Edge
  const request = event.Records[0].cf.request;

  // Extract the URI from the request
  const oldUri = request.uri;

  // Match any route after the final slash without a file extension, and append .html
  if (oldUri.match(/\/[^/.]+$/)) {
    const newUri = oldUri + '.html';
    request.uri = newUri;
  }

  // Return to CloudFront
  return callback(null, request);
};

const name = 'RewriterLambdaEdge';

const role = new aws.iam.Role(`${name}-Role`, {
  assumeRolePolicy: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: aws.iam.Principals.LambdaPrincipal,
        Effect: 'Allow',
      },
      {
        Action: 'sts:AssumeRole',
        Principal: aws.iam.Principals.EdgeLambdaPrincipal,
        Effect: 'Allow',
      },
    ],
  },
});

const rolePolicyAttachment = new aws.iam.RolePolicyAttachment(
  `${name}-RolePolicyAttachment`,
  {
    role,
    policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
  }
);

// must be in us-east-1.  This is set in dev.yaml as well, but belt + suspenders
const awsUsEast1 = new aws.Provider('us-east-1', { region: 'us-east-1' });

export const requestRewriterLambda = new aws.lambda.CallbackFunction(
  `${name}-Function`,
  {
    publish: true,
    role,
    timeout: 5,
    callback: requestRewriterHandler,
  },
  { provider: awsUsEast1 }
);
