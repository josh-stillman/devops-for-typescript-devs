import * as aws from '@pulumi/aws';
import { getARN } from '../utils/getARN';
import { Role } from '@pulumi/aws/iam';
import { Repository } from '@pulumi/awsx/ecr';
import { Output } from '@pulumi/pulumi';

export const createBackendPipelineUser = (
  repository: Repository,
  taskExecutionRole: Output<Role | undefined>,
  taskRole: Output<Role | undefined>
) => {
  const policyJSON = aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:BatchGetImage',
          'ecr:CompleteLayerUpload',
          'ecr:DescribeImageScanFindings',
          'ecr:DescribeImages',
          'ecr:DescribeRepositories',
          'ecr:GetDownloadUrlForLayer',
          'ecr:GetLifecyclePolicy',
          'ecr:GetLifecyclePolicyPreview',
          'ecr:GetRepositoryPolicy',
          'ecr:InitiateLayerUpload',
          'ecr:ListImages',
          'ecr:ListTagsForResource',
          'ecr:PutImage',
          'ecr:UploadLayerPart',
        ],
        resources: [repository.repository.arn],
      },
      {
        actions: [
          'ecs:DescribeServices',
          'ecs:UpdateService',
          'ecr:GetAuthorizationToken',
          'ecs:RegisterTaskDefinition',
          'ecs:ListTaskDefinitions',
          'ecs:DescribeTaskDefinition',
        ],
        resources: ['*'], // TODO: add service arn
      },
      {
        actions: ['iam:PassRole', 'sts:AssumeRole'],
        resources: [getARN(taskExecutionRole), getARN(taskRole)],
      },
    ],
  });

  const policy = new aws.iam.Policy('Dev-BE-Pipeline', {
    policy: policyJSON.json,
  });

  const user = new aws.iam.User('Dev-BE-Pipeline');

  const policyAttachment = new aws.iam.PolicyAttachment('Dev-BE-Pipeline', {
    users: [user],
    policyArn: policy.arn,
  });

  return user;
};
