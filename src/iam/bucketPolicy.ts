import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Bucket } from '@pulumi/aws/s3';
import { Distribution } from '@pulumi/aws/cloudfront';
import { User } from '@pulumi/aws/iam';
import { getARN } from '../utils/getARN';

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
            values: [getARN(distribution)],
            variable: 'AWS:SourceArn',
          },
        ],
      },
      {
        principals: [
          {
            type: 'AWS',
            identifiers: [getARN(pipelineUser)],
          },
        ],
        actions: ['s3:PutObject', 's3:ListBucket', 's3:DeleteObject'],
        resources: [bucket.arn, pulumi.interpolate`${bucket.arn}/*`],
      },
    ],
  });
