/* eslint-disable @typescript-eslint/no-unused-vars */
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { createFrontendPipelineUser } from './src/iam/frontendPipelineUser';
import { createBucketPolicyDocument } from './src/s3/bucketPolicy';
import { getARN } from './src/utils/getARN';
import { requestRewriterLambda } from './src/lambda@edge/requestRewriter';
import { getExistingCertificate } from './src/acm/getCertificate';
import { createBackend } from './src/backend/backend';
// Import the program's configuration settings.
const config = new pulumi.Config();
const path = config.get('path') || './www';
const indexDocument = config.get('indexDocument') || 'index.html';
const errorDocument = config.get('errorDocument') || 'error.html';
const domain = config.require('domain');
const subdomain = config.require('subdomain');
const domainName = `${subdomain}.${domain}`;

// Create an S3 bucket and configure it as a website.
const bucket = new aws.s3.Bucket('bucket', {
  bucket: 'dev.jss.computer', // prepended to pulumi's auto-generated name
});

// Configure ownership controls for the new S3 bucket
const ownershipControls = new aws.s3.BucketOwnershipControls(
  'ownership-controls',
  {
    bucket: bucket.bucket,
    rule: {
      objectOwnership: 'ObjectWriter',
    },
  }
);

// Configure public ACL block on the new S3 bucket
const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
  'public-access-block',
  {
    bucket: bucket.bucket,
    blockPublicAcls: true, // block all direct access with these settings
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  }
);

// Get existing Certificate from ACM
const certificate = getExistingCertificate(domain);

const OAC = new aws.cloudfront.OriginAccessControl('example', {
  description: 'OAC for CDN to access bucket',
  originAccessControlOriginType: 's3',
  signingBehavior: 'always',
  signingProtocol: 'sigv4',
});

// Create a CloudFront CDN to distribute and cache the website.
const cdn = new aws.cloudfront.Distribution('cdn', {
  enabled: true,
  origins: [
    {
      originId: bucket.arn,
      domainName: bucket.bucketDomainName,
      originAccessControlId: OAC.id,
    },
  ],
  defaultCacheBehavior: {
    targetOriginId: bucket.arn,
    viewerProtocolPolicy: 'redirect-to-https',
    allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
    cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
    defaultTtl: 600,
    maxTtl: 600,
    minTtl: 600,
    forwardedValues: {
      queryString: true,
      cookies: {
        forward: 'all',
      },
    },
    // Include a Lambda to rewrite origin requests including a '+' to using '%2B' since S3 interprets '+' incorrectly
    lambdaFunctionAssociations: [
      {
        eventType: 'origin-request',
        lambdaArn: requestRewriterLambda.qualifiedArn,
      },
    ],
  },
  priceClass: 'PriceClass_100',
  defaultRootObject: 'index.html',
  customErrorResponses: [
    {
      errorCode: 404,
      responseCode: 404,
      responsePagePath: `/${errorDocument}`,
    },
  ],
  restrictions: {
    geoRestriction: {
      restrictionType: 'none',
    },
  },
  aliases: [domainName],
  viewerCertificate: {
    cloudfrontDefaultCertificate: false,
    acmCertificateArn: getARN(certificate),
    sslSupportMethod: 'sni-only', // avoiding extra charges
  },
});

// Create CI-CD User

const pipelineUser = createFrontendPipelineUser(bucket, cdn);

const bucketPolicyDocument = createBucketPolicyDocument({
  bucket,
  distribution: cdn,
  pipelineUser,
});

const attachedBucketPolicy = new aws.s3.BucketPolicy('s3bucketPolicy', {
  bucket: bucket.id,
  policy: bucketPolicyDocument.json,
});

// Create a DNS A record to point to the CDN for the subdomain.
const zone = aws.route53.getZoneOutput({ name: domain });

const record = new aws.route53.Record(domainName, {
  name: subdomain,
  zoneId: zone.zoneId,
  type: 'A',
  aliases: [
    {
      name: cdn.domainName,
      zoneId: cdn.hostedZoneId,
      evaluateTargetHealth: true,
    },
  ],
});

export const {
  loadBalancerUrl,
  repoName,
  serviceName,
  clusterName,
  containerName,
} = createBackend();

// Export the URLs and hostnames of the bucket and distribution.
export const originURL = pulumi.interpolate`http://${bucket.websiteEndpoint}`;
export const originHostname = bucket.websiteEndpoint;
export const cdnURL = pulumi.interpolate`https://${cdn.domainName}`;
export const cdnHostname = cdn.domainName;
export const domainURL = `https://${domainName}`;
