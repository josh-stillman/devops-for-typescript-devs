import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Bucket } from '@pulumi/aws/s3';
import { Distribution } from '@pulumi/aws/cloudfront';
import { User } from '@pulumi/aws/iam';

export const createBucketPolicyJSON = ({
  bucket,
  distribution,
  pipelineUser,
}: {
  bucket: Bucket;
  distribution: Distribution;
  pipelineUser: User;
}) =>
  aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        principals: [
          {
            type: 'Service',
            identifiers: ['cloudfront.amazonaws.com'],
          },
        ],
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [bucket.arn, pulumi.interpolate`${bucket.arn}/*`],
        conditions: [
          {
            test: 'StringEquals',
            values: [pulumi.output(distribution).apply(c => c.arn)],
            variable: 'AWS:SourceArn',
          },
        ],
      },
      {
        principals: [
          {
            type: 'AWS',
            identifiers: [pulumi.output(pipelineUser).apply(u => u.arn)],
          },
        ],
        actions: ['s3:PutObject', 's3:ListBucket', 's3:DeleteObject'],
        resources: [bucket.arn, pulumi.interpolate`${bucket.arn}/*`],
      },
    ],
  });
