/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import * as pulumi from '@pulumi/pulumi';

export const getARN = (awsThingy: any) =>
  pulumi.output(awsThingy).apply(t => t?.arn);
