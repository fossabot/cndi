import {
  brightRed,
  white,
  yellow,
} from "https://deno.land/std@0.157.0/fmt/colors.ts";
import {
  AWSDeploymentTargetConfiguration,
  AWSNodeEntrySpec,
  AWSTerraformNodeResource,
  BaseNodeEntrySpec,
  DeploymentTargetConfiguration,
} from "../types.ts";
import { getPrettyJSONString } from "../utils.ts";

const getTerraformNodeResource = (
  entry: BaseNodeEntrySpec,
  deploymentTargetConfiguration: DeploymentTargetConfiguration,
  controllerName: string,
): string => {
  const { kind } = entry;

  switch (kind) {
    case "aws":
      return getAWSNodeResource(
        entry as AWSNodeEntrySpec,
        deploymentTargetConfiguration.aws as AWSDeploymentTargetConfiguration,
        controllerName,
      );

    default:
      console.log(
        white("outputs/terraform-node-resource:"),
        brightRed(`node kind: ${white(`"${kind}"`)} not yet supported`),
      );
      Deno.exit(1);
  }
};

const getAWSNodeResource = (
  entry: AWSNodeEntrySpec,
  deploymentTargetConfiguration: AWSDeploymentTargetConfiguration,
  leaderName: string,
) => {
  const DEFAULT_AMI = "ami-0c1704bac156af62c";
  const DEFAULT_INSTANCE_TYPE = "t3.medium";
  const { name, role } = entry;
  const ami = entry?.ami || deploymentTargetConfiguration?.ami || DEFAULT_AMI;
  const instance_type = entry?.instance_type ||
    deploymentTargetConfiguration?.instance_type ||
    DEFAULT_INSTANCE_TYPE;

  const delete_on_termination = false; // TODO: prove this is good
  const device_name = "/dev/sda1";
  const volume_size = 80; //GiB
  const volume_type = "gp3"; // general purpose SSD

  // TODO: expose to user in cndi-config.jsonc["nodes"]["entries"][kind==="aws"]
  const ebs_block_device = [
    {
      device_name,
      volume_size,
      volume_type,
      delete_on_termination,
    },
  ];
  const subnet_id = "${aws_subnet.subnet.id}";
  const vpc_security_group_ids = ["${aws_security_group.sg.id}"];

  const nodeResource: AWSTerraformNodeResource = {
    resource: {
      aws_instance: {
        [name]: [
          {
            ami,
            instance_type,
            tags: {
              Name: name,
              CNDINodeRole: role,
            },
            ebs_block_device,
            subnet_id,
            vpc_security_group_ids,
          },
        ],
      },
    },
  };

  if (role === "leader") {
    const user_data =
      '${templatefile("leader_bootstrap_cndi.sh.tftpl",{ "bootstrap_token": "${local.bootstrap_token}", "git_repo": "${local.git_repo}", "git_password": "${local.git_password}", "git_username": "${local.git_username}", "sealed_secrets_private_key": "${local.sealed_secrets_private_key}", "sealed_secrets_public_key": "${local.sealed_secrets_public_key}", "argo_ui_readonly_password": "${local.argo_ui_readonly_password}" })}';

    const leaderNodeResourceObj = { ...nodeResource };

    leaderNodeResourceObj.resource.aws_instance[name][0].user_data = user_data;

    const leaderNodeResourceString = getPrettyJSONString(leaderNodeResourceObj);

    return leaderNodeResourceString;
  } else {
    // if the role is non-null and also not controller, warn the user and run default
    if (role?.length && role !== "controller") {
      console.log(
        white("outputs/terraform-node-resource:"),
        yellow(`node role: ${white(`"${role}"`)} is not supported`),
      );
      console.log(yellow("defaulting node role to"), '"controller"\n');
    }

    const user_data =
      '${templatefile("controller_bootstrap_cndi.sh.tftpl",{"bootstrap_token": "${local.bootstrap_token}", "leader_node_ip": "${local.leader_node_ip}"})}';

    const controllerNodeResourceObj = { ...nodeResource };

    controllerNodeResourceObj.resource.aws_instance[name][0].depends_on = [
      `aws_instance.${leaderName}`,
    ];

    controllerNodeResourceObj.resource.aws_instance[name][0].user_data =
      user_data;

    const controllerNodeResourceString = getPrettyJSONString(
      controllerNodeResourceObj,
    );

    return controllerNodeResourceString;
  }
};

export default getTerraformNodeResource;
