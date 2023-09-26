import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { BACKEND_SECRETS } from './backendSecrets';
import { Role } from '@pulumi/aws/iam';
import { createBackendPipelineUser } from '../iam/pipelineUser';

const config = new pulumi.Config('api');
const containerPort = config.getNumber('containerPort') || 80;
const cpu = config.getNumber('cpu') || 512;
const memory = config.getNumber('memory') || 128;

// An ECS cluster to deploy into
const cluster = new aws.ecs.Cluster('cluster', {});

// An ALB to serve the container endpoint to the internet
const loadBalancer = new awsx.lb.ApplicationLoadBalancer('loadbalancer', {});

// An ECR repository to store our application's container image
const repo = new awsx.ecr.Repository('repo', {
  forceDelete: true,
  lifecyclePolicy: {
    rules: [
      {
        description: 'Max 1 image',
        maximumNumberOfImages: 1,
        tagStatus: 'any',
      },
    ],
  },
});

// Build and publish our application's container image from ./app to the ECR repository
const image = new awsx.ecr.Image('image', {
  repositoryUrl: repo.url,
  path: './app',
});

const secretsManger = new aws.secretsmanager.Secret('api-secrets');
const secretVersion = new aws.secretsmanager.SecretVersion('dev', {
  secretId: secretsManger.id,
  secretString: JSON.stringify(BACKEND_SECRETS),
});

const taskDefinition = new awsx.ecs.FargateTaskDefinition('api-task-def', {
  container: {
    name: 'dev-backend-container',
    image: image.imageUri,
    cpu: cpu,
    memory: memory,
    essential: true,
    portMappings: [
      {
        containerPort: containerPort,
        targetGroup: loadBalancer.defaultTargetGroup,
      },
    ],
    secrets: Object.keys(BACKEND_SECRETS).map(secretName => ({
      name: secretName,
      valueFrom: pulumi.interpolate`${secretsManger.arn}:${secretName}::`,
    })),
  },
});

const secretManagerPolicyDoc = aws.iam.getPolicyDocumentOutput({
  statements: [
    {
      effect: 'Allow',
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretsManger.arn],
    },
  ],
});

const secretManagerPolicy = new aws.iam.Policy('secretsPolicy', {
  policy: secretManagerPolicyDoc.apply(doc => doc.json),
});

const rpaSecrets = new aws.iam.RolePolicyAttachment('rpa-secrets', {
  role: taskDefinition.executionRole as pulumi.Output<Role>,
  policyArn: secretManagerPolicy.arn,
});

// Deploy an ECS Service on Fargate to host the application container
const service = new awsx.ecs.FargateService('service', {
  cluster: cluster.arn,
  assignPublicIp: true,
  taskDefinition: taskDefinition.taskDefinition.arn,
});

const user = createBackendPipelineUser(
  repo,
  taskDefinition.executionRole,
  taskDefinition.taskRole
);

// The URL at which the container's HTTP endpoint will be available
export const backendUrl = pulumi.interpolate`http://${loadBalancer.loadBalancer.dnsName}`;
