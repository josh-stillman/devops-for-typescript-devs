import * as aws from '@pulumi/aws';
import { Distribution } from '@pulumi/aws/cloudfront';
import { Bucket } from '@pulumi/aws/s3';
import { getARN } from '../utils/getARN';

export const createFrontendPipelineUser = (
  bucket: Bucket,
  distribution: Distribution
) => {
  const policyJSON = aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: [
          's3:PutObject',
          's3:ListBucket',
          's3:DeleteObject',
          'cloudfront:CreateInvalidation',
        ],
        resources: [getARN(bucket), getARN(distribution)],
      },
    ],
  });

  const policy = new aws.iam.Policy('Dev-FE-Pipeline', {
    policy: policyJSON.apply(policy => policy.json),
  });

  const user = new aws.iam.User('Dev-FE-Pipeline');

  const policyAttachment = new aws.iam.PolicyAttachment('Dev-FE-Pipeline', {
    users: [user],
    policyArn: policy.arn,
  });

  return user; // needed for altering the bucket policy
};
