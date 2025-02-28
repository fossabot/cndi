import { getPrettyJSONString, getTFResource } from "src/utils.ts";
import { CNDIPort } from "src/types.ts";

export default function getAWSLbListenerForPortTFJSON(port: CNDIPort): string {
  const { name, number } = port;
  const resource = getTFResource("aws_lb_listener", {
    default_action: [
      {
        target_group_arn:
          `\${aws_lb_target_group.cndi_aws_lb_target_group_for_port_${name}.arn}`,
        type: "forward",
      },
    ],
    load_balancer_arn: "${aws_lb.cndi_aws_lb.arn}",
    port: number,
    protocol: "TCP",
    tags: {
      Name: `UserPortLBListener-${name}`,
    },
  }, `cndi_aws_lb_listener_for_port_${name}`);
  return getPrettyJSONString(resource);
}
