import { getPrettyJSONString, getTFResource } from "src/utils.ts";
import { AWSEC2NodeItemSpec } from "src/types.ts";
import { DEFAULT_INSTANCE_TYPES, DEFAULT_NODE_DISK_SIZE } from "constants";

export default function getAWSComputeInstanceTFJSON(
  node: AWSEC2NodeItemSpec,
  leaderNodeName: string,
): string {
  const { name, role } = node;
  const DEFAULT_EC2_AMI = "ami-0c1704bac156af62c";
  const ami = node?.ami || DEFAULT_EC2_AMI;
  const instance_type = node?.instance_type || DEFAULT_INSTANCE_TYPES.aws;
  const delete_on_termination = false;
  const volume_size = node?.volume_size || node?.disk_size || node?.size ||
    node?.disk_size_gb || DEFAULT_NODE_DISK_SIZE; //GiB
  const volume_type = "gp3"; // general purpose SSD
  const subnet_id = `\${aws_subnet.cndi_aws_subnet[0].id}`;
  const vpc_security_group_ids = [
    "${aws_security_group.cndi_aws_security_group.id}",
  ];
  const root_block_device = [
    {
      volume_size,
      volume_type,
      delete_on_termination,
    },
  ];
  const leaderAWSInstance = `aws_instance.cndi_aws_instance_${leaderNodeName}`;
  const leader_user_data =
    '${templatefile("leader_bootstrap_cndi.sh.tftpl",{ "bootstrap_token": "${local.bootstrap_token}", "git_repo": "${var.git_repo}", "git_password": "${var.git_password}", "git_username": "${var.git_username}", "sealed_secrets_private_key": "${var.sealed_secrets_private_key}", "sealed_secrets_public_key": "${var.sealed_secrets_public_key}", "argocd_admin_password": "${var.argocd_admin_password}" })}';
  const controller_user_data =
    '${templatefile("controller_bootstrap_cndi.sh.tftpl",{"bootstrap_token": "${local.bootstrap_token}", "leader_node_ip": "${local.leader_node_ip}"})}';
  const user_data = role === "leader" ? leader_user_data : controller_user_data;
  const depends_on = role !== "leader" ? [leaderAWSInstance] : [];

  const resource = getTFResource(
    "aws_instance",
    {
      ami,
      instance_type,
      tags: {
        Name: name,
        CNDIProject: "${local.cndi_project_name}",
        CNDINodeRole: role,
      },
      root_block_device,
      subnet_id,
      vpc_security_group_ids,
      user_data,
      depends_on,
    },
    `cndi_aws_instance_${node.name}`,
  ).resource;

  return getPrettyJSONString({
    resource,
  });
}
