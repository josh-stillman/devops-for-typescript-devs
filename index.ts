/* eslint-disable @typescript-eslint/no-unused-vars */
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as synced_folder from '@pulumi/synced-folder';

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
  website: {
    indexDocument: indexDocument,
    errorDocument: errorDocument,
  },
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

// Use a synced folder to manage the files of the website.
const bucketFolder = new synced_folder.S3BucketFolder(
  'bucket-folder',
  {
    path: path,
    bucketName: bucket.bucket,
    acl: 'public-read',
  },
  { dependsOn: [ownershipControls, publicAccessBlock] }
);

// Get existing Certificate from ACM
const certificate = aws.acm.getCertificate({
  domain,
  mostRecent: true,
  types: ['AMAZON_ISSUED'],
});

// Create a CloudFront CDN to distribute and cache the website.
const cdn = new aws.cloudfront.Distribution('cdn', {
  enabled: true,
  origins: [
    {
      originId: bucket.arn,
      domainName: bucket.websiteEndpoint,
      customOriginConfig: {
        originProtocolPolicy: 'http-only',
        httpPort: 80,
        httpsPort: 443,
        originSslProtocols: ['TLSv1.2'],
      },
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
  },
  priceClass: 'PriceClass_100',
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
    acmCertificateArn: pulumi.output(certificate).apply(c => c.arn),
    sslSupportMethod: 'sni-only',
  },
});

const zone = aws.route53.getZoneOutput({ name: domain });

// Create a DNS A record to point to the CDN for the subdomain.
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

// Export the URLs and hostnames of the bucket and distribution.
export const originURL = pulumi.interpolate`http://${bucket.websiteEndpoint}`;
export const originHostname = bucket.websiteEndpoint;
export const cdnURL = pulumi.interpolate`https://${cdn.domainName}`;
export const cdnHostname = cdn.domainName;
export const domainURL = `https://${domainName}`;
