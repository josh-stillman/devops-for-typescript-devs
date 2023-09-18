import * as aws from '@pulumi/aws';
import { Distribution } from '@pulumi/aws/cloudfront';
import { Bucket } from '@pulumi/aws/s3';
import { getARN } from '../utils/getARN';
import { Role } from '@pulumi/aws/iam';
import { Repository } from '@pulumi/awsx/ecr';
import { Output } from '@pulumi/pulumi';

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

export const createBackendPipelineUser = (
  repository: Repository,
  taskExecutionRole: Output<Role | undefined>
) => {
  if (!taskExecutionRole) {
    console.error('missing task execution role for creating pipeline user');
    return;
  }

  const policyJSON = aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:GetRepositoryPolicy',
          'ecr:DescribeRepositories',
          'ecr:ListImages',
          'ecr:DescribeImages',
          'ecr:BatchGetImage',
          'ecr:GetLifecyclePolicy',
          'ecr:GetLifecyclePolicyPreview',
          'ecr:ListTagsForResource',
          'ecr:DescribeImageScanFindings',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
        ],
        resources: [repository.repository.arn],
      },
      {
        actions: [
          'ecr:GetAuthorizationToken',
          'ecs:RegisterTaskDefinition',
          'ecs:ListTaskDefinitions',
          'ecs:DescribeTaskDefinition',
        ],
        resources: ['*'],
      },
      {
        actions: ['iam:PassRole'],
        resources: [getARN(taskExecutionRole)],
      },
      {
        actions: ['sts:AssumeRole'],
        resources: [getARN(taskExecutionRole)],
      },
    ],
  });

  const policy = new aws.iam.Policy('Dev-BE-Pipeline', {
    policy: policyJSON.apply(policy => policy.json),
  });

  const user = new aws.iam.User('Dev-BE-Pipeline');

  const policyAttachment = new aws.iam.PolicyAttachment('Dev-BE-Pipeline', {
    users: [user],
    policyArn: policy.arn,
  });

  return user;
};
