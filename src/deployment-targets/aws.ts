import { ccolors, Input, Secret } from "deps";

import { EnvLines } from "src/types.ts";

const getAWSEnvLines = async (interactive: boolean): Promise<EnvLines> => {
  let AWS_REGION = "us-east-1";
  let AWS_ACCESS_KEY_ID = "";
  let AWS_SECRET_ACCESS_KEY = "";

  AWS_REGION = interactive
    ? ((await Input.prompt({
      message: ccolors.prompt("Enter your AWS region:"),
      default: AWS_REGION,
    })) as string)
    : AWS_REGION;

  AWS_ACCESS_KEY_ID = interactive
    ? ((await Secret.prompt({
      message: ccolors.prompt("Enter your AWS access key ID:"),
      default: AWS_ACCESS_KEY_ID,
    })) as string)
    : AWS_ACCESS_KEY_ID;

  AWS_SECRET_ACCESS_KEY = interactive
    ? ((await Secret.prompt({
      message: ccolors.prompt("Enter your AWS secret access key:"),
      default: AWS_SECRET_ACCESS_KEY,
    })) as string)
    : AWS_SECRET_ACCESS_KEY;

  return [
    { comment: "AWS" },
    { value: { AWS_REGION } },
    { value: { AWS_ACCESS_KEY_ID } },
    { value: { AWS_SECRET_ACCESS_KEY } },
  ];
};

export { getAWSEnvLines };
