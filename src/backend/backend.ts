import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { BACKEND_SECRETS } from './backendSecrets';
import { Role } from '@pulumi/aws/iam';
import { createBackendPipelineUser } from '../iam/pipelineUser';
const containerPort = apiConfig.getNumber('containerPort') || 80;
const containerName = apiConfig.get('containerName') || 'dev-backend-container';
const cpu = apiConfig.getNumber('cpu') || 512;
const memory = apiConfig.getNumber('memory') || 128;

// An ECS cluster to deploy into
const cluster = new aws.ecs.Cluster('cluster', {});

// An ALB to serve the container endpoint to the internet
const loadBalancer = new awsx.lb.ApplicationLoadBalancer('loadbalancer', {
  listener: {
    certificateArn: getARN(getExistingCertificate(domain)),
    port: 443,
    protocol: 'HTTPS',
    sslPolicy: 'ELBSecurityPolicy-2016-08',
  },
  defaultSecurityGroup: {
    args: {
      ingress: [
        {
          fromPort: 443,
          protocol: 'tcp',
          toPort: 443,
          cidrBlocks: ['0.0.0.0/0'],
        },
        {
          fromPort: 80,
          protocol: 'tcp',
          toPort: 80,
          cidrBlocks: ['0.0.0.0/0'],
        },
      ],
    },
  },
  defaultTargetGroup: {
    port: 80,
    protocol: 'HTTP',
    targetType: 'ip',
    healthCheck: {
      enabled: true,
      matcher: '200-299',
      path: '/_health',
      interval: 60 * 3,
      protocol: 'HTTP',
    },
  },
});

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

const image = aws.ecr.getImageOutput({
  repositoryName: repo.repository.name,
  mostRecent: true,
});

const secretsManger = new aws.secretsmanager.Secret('api-secrets');
const secretVersion = new aws.secretsmanager.SecretVersion('dev', {
  secretId: secretsManger.id,
  secretString: JSON.stringify(BACKEND_SECRETS),
});

const taskDefinition = new awsx.ecs.FargateTaskDefinition('api-task-def', {
  container: {
    name: containerName,
    image: pulumi.interpolate`${repo.url}:${image.imageTags[0]}`,
    cpu: cpu,
    memory: memory,
    essential: true,
    portMappings: [
      {
        hostPort: containerPort,
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
  loadBalancers: [
    {
      containerName: containerName,
      containerPort: containerPort,
      targetGroupArn: loadBalancer.defaultTargetGroup.arn,
    },
  ],
});

const user = createBackendPipelineUser(
  repo,
  taskDefinition.executionRole,
  taskDefinition.taskRole
);

// The URL at which the container's HTTP endpoint will be available
export const backendUrl = pulumi.interpolate`http://${loadBalancer.loadBalancer.dnsName}`;
