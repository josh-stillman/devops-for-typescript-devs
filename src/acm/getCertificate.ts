import * as aws from '@pulumi/aws';

export const getExistingCertificate = (domain: string) =>
  aws.acm.getCertificate({
    domain,
    mostRecent: true,
    types: ['AMAZON_ISSUED'],
  });
