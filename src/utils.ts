import {
  ccolors,
  deepMerge,
  exists,
  homedir,
  JSONC,
  path,
  platform,
  walk,
  YAML,
} from "deps";
import { DEFAULT_OPEN_PORTS } from "consts";

import {
  BaseNodeItemSpec,
  CNDIConfig,
  CNDIPort,
  DeploymentTarget,
  NodeRole,
  TFBlocks,
} from "src/types.ts";

import emitTelemetryEvent from "src/telemetry/telemetry.ts";

const utilsLabel = ccolors.faded("src/utils.ts:");

async function sha256Digest(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(""); // convert bytes to hex string
  return hashHex;
}

const loadYAMLorJSONC = async (
  filePath: string,
): Promise<JSONC.JsonValue | unknown> => {
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return await loadYAML(filePath);
  }
  if (filePath.endsWith(".jsonc") || filePath.endsWith(".json")) {
    return await loadJSONC(filePath);
  }
};

const removeOldBinaryIfRequired = async (
  CNDI_HOME: string,
): Promise<boolean> => {
  const isWindows = platform() === "win32";
  const pathToGarbageBinary = isWindows
    ? path.join(CNDI_HOME, "bin", "cndi-old.exe")
    : path.join(CNDI_HOME, "bin", "cndi-old");

  try {
    await Deno.remove(pathToGarbageBinary);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error(
        utilsLabel,
        ccolors.error("\nfailed to delete old"),
        ccolors.key_name("cndi"),
        ccolors.error("binary, please try again"),
      );
      console.log(ccolors.caught(error, 302));
      await emitExitEvent(302);
      Deno.exit(302);
    }
    return false;
  }
  return true;
};

// attempts to find cndi-config.yaml or cndi-config.jsonc, then returns its value and location
const loadCndiConfig = async (
  providedPath?: string,
): Promise<[CNDIConfig, string]> => {
  let pathToConfig;
  let configIsYAML = true;
  const isFile = true;
  const cwd = Deno.cwd();

  // the user provided a direct path to a cndi-config file
  if (providedPath) {
    return [(await loadYAMLorJSONC(providedPath)) as CNDIConfig, providedPath];
  }

  if (await exists(path.join(cwd, "cndi-config.yaml"), { isFile })) {
    pathToConfig = path.join(cwd, "cndi-config.yaml");
  } else if (await exists(path.join(cwd, "cndi-config.yml"), { isFile })) {
    pathToConfig = path.join(cwd, "cndi-config.yml");
  } else if (await exists(path.join(cwd, "cndi-config.jsonc"), { isFile })) {
    pathToConfig = path.join(cwd, "cndi-config.jsonc");
    configIsYAML = false;
  } else if (await exists(path.join(cwd, "cndi-config.json"), { isFile })) {
    pathToConfig = path.join(cwd, "cndi-config.json");
    configIsYAML = false;
  } else {
    console.error(
      utilsLabel,
      ccolors.error("there is no"),
      ccolors.key_name('"cndi-config.yaml"'),
      ccolors.error("file in your current directory"),
    );
    console.log(
      "if you don't have a cndi-config file try",
      ccolors.prompt("cndi init --interactive"),
    );
    await emitExitEvent(500);
    Deno.exit(500);
  }
  try {
    const config = configIsYAML
      ? await loadYAML(pathToConfig)
      : await loadJSONC(pathToConfig);
    return [config as CNDIConfig, pathToConfig];
  } catch (error) {
    console.error(
      utilsLabel,
      ccolors.error("your cndi config file at"),
      ccolors.user_input(`"${pathToConfig}"`),
      ccolors.error("is not valid"),
    );
    ccolors.caught(error, 504);
    await emitExitEvent(504);
    Deno.exit(504);
  }
};

// TODO: the following 2 functions can fail in 2 ways

// helper function to load a JSONC file
const loadJSONC = async (path: string) => {
  return JSONC.parse(await Deno.readTextFile(path));
};

// helper function to load a YAML file
const loadYAML = async (path: string) => {
  return YAML.parse(await Deno.readTextFile(path));
};

function getPrettyJSONString(object: unknown) {
  return JSON.stringify(object, null, 2);
}

async function getLeaderNodeNameFromConfig(
  config: CNDIConfig,
): Promise<string> {
  const nodesWithRoleLeader = config.infrastructure.cndi.nodes.filter(
    (node: BaseNodeItemSpec) => node.role === "leader",
  );
  if (nodesWithRoleLeader.length !== 1) {
    console.error(
      utilsLabel,
      ccolors.error("cndi-config exists"),
      ccolors.error("but it does not have exactly 1"),
      ccolors.key_name('"infrastructure.cndi.nodes"'),
      ccolors.error("entry where"),
      ccolors.key_name('"role"'),
      ccolors.error("is"),
      ccolors.key_name('"leader".'),
      ccolors.error("There must be exactly one leader node."),
    );
    await emitExitEvent(200);
    Deno.exit(200);
  }
  return nodesWithRoleLeader[0].name;
}

function getDeploymentTargetFromConfig(config: CNDIConfig): DeploymentTarget {
  const clusterKind = config.infrastructure.cndi.nodes[0].kind;
  if (clusterKind === "eks" || clusterKind === "ec2") return "aws";
  return clusterKind;
}

function getTFResource(
  resource_type: string,
  content: Record<never, never>,
  resourceName?: string,
) {
  const name = resourceName ? resourceName : `cndi_${resource_type}`;
  return {
    resource: {
      [resource_type]: {
        [name]: {
          ...content,
        },
      },
    },
  };
}
function getTFData(
  data_type: string,
  content: Record<never, never>,
  resourceName?: string,
) {
  const name = resourceName ? resourceName : `cndi_data_${data_type}`;
  return {
    data: {
      [data_type]: {
        [name]: {
          ...content,
        },
      },
    },
  };
}
interface TFResourceFileObject {
  resource: {
    [key: string]: Record<string, unknown>;
  };
}

async function patchAndStageTerraformResources(
  resourceObj: Record<string, unknown>,
) {
  const suffix = `.tf.json`;
  // resourceObj: { aws_s3_bucket: { cndi_aws_s3_bucket: { ... } } }
  for (const tfResourceType in resourceObj) {
    // aws_s3_bucket
    const resourceTypeBlock = resourceObj[tfResourceType] as Record<
      string,
      never
    >;

    for (const resourceName in resourceTypeBlock) {
      // cndi_aws_s3_bucket
      const filename = `${resourceName}${suffix}`;

      let originalContent: TFResourceFileObject = {
        resource: {},
      };

      try {
        originalContent = (await loadJSONC(
          path.join(await getStagingDir(), "cndi", "terraform", filename),
        )) as unknown as TFResourceFileObject;
      } catch {
        // there was no pre-existing resource with this name
      }

      // deno-lint-ignore no-explicit-any
      const attrs = resourceTypeBlock[resourceName] as any;
      const originalAttrs =
        originalContent?.resource?.[tfResourceType]?.[resourceName] || {};

      const newContent = {
        ...originalContent,
        resource: {
          ...originalContent.resource,
          [tfResourceType]: {
            [resourceName]: {
              ...deepMerge(originalAttrs, attrs),
            },
          },
        },
      };

      const newContentStr = getPrettyJSONString(newContent);

      await stageFile(path.join("cndi", "terraform", filename), newContentStr);
    }
  }
}

const terraformBlockTypeNames = [
  "terraform",
  "provider",
  "variable",
  "output",
  "locals",
  "resource",
  "data",
  "module",
];

async function mergeAndStageTerraformObj(
  terraformBlockName: string,
  blockContentsPatch: Record<string, unknown>,
) {
  if (!terraformBlockTypeNames.includes(terraformBlockName)) {
    console.error(
      utilsLabel,
      ccolors.error("there is no terraform block type named"),
      ccolors.user_input(`"${terraformBlockName}"`),
    );
    await emitExitEvent(203);
    Deno.exit(203);
  }

  const pathToTFBlock = path.join(
    "cndi",
    "terraform",
    `${terraformBlockName}.tf.json`,
  );

  let newBlock = {};
  try {
    const originalBlock = (await loadJSONC(
      path.join(await getStagingDir(), pathToTFBlock),
    )) as Record<string, unknown>;
    const originalBlockContents = originalBlock?.[terraformBlockName];
    newBlock = deepMerge(originalBlockContents || {}, blockContentsPatch);
  } catch {
    // there was no pre-existing block with this name
    newBlock = blockContentsPatch;
  }

  await stageFile(
    pathToTFBlock,
    getPrettyJSONString({ [terraformBlockName]: newBlock }),
  );
}

// MUST be called after all other terraform files have been staged
async function patchAndStageTerraformFilesWithConfig(config: CNDIConfig) {
  if (!config?.infrastructure?.terraform) return;
  const terraformBlocks = config.infrastructure.terraform as TFBlocks;
  const workload: Array<Promise<void>> = [];

  for (const tftype in terraformBlocks) {
    // terraform[key]: resource, data, provider, etc.\
    if (tftype === "resource") {
      const resources = config.infrastructure?.terraform?.resource;

      const blockContainsResources = resources &&
        Object.keys(resources).length &&
        typeof resources === "object";

      if (blockContainsResources) {
        workload.push(patchAndStageTerraformResources(resources));
      }
    } else {
      const t = tftype as keyof TFBlocks;
      const contentObj = config.infrastructure?.terraform?.[t];

      const blockContainsEntries = contentObj &&
        Object.keys(contentObj).length &&
        typeof contentObj === "object";

      if (blockContainsEntries) {
        workload.push(mergeAndStageTerraformObj(tftype, contentObj));
      }
    }
  }
  try {
    await Promise.all(workload);
  } catch (error) {
    console.error(
      utilsLabel,
      ccolors.error("error patching terraform files with config"),
    );
    console.log(ccolors.caught(error));
    console.log("attempting to continue anyway...");
  }
}

function getPathToTerraformBinary() {
  const DEFAULT_CNDI_HOME = path.join(homedir(), ".cndi");
  const CNDI_HOME = Deno.env.get("CNDI_HOME") || DEFAULT_CNDI_HOME;

  const fileSuffixForPlatform = getFileSuffixForPlatform();
  const pathToTerraformBinary = path.join(
    CNDI_HOME,
    "bin",
    `terraform-${fileSuffixForPlatform}`,
  );
  return pathToTerraformBinary;
}

function getPathToKubesealBinary() {
  const DEFAULT_CNDI_HOME = path.join(homedir(), ".cndi");
  const CNDI_HOME = Deno.env.get("CNDI_HOME") || DEFAULT_CNDI_HOME;
  const fileSuffixForPlatform = getFileSuffixForPlatform();
  const pathToKubesealBinary = path.join(
    CNDI_HOME,
    "bin",
    `kubeseal-${fileSuffixForPlatform}`,
  );
  return pathToKubesealBinary;
}

function resolveCNDIPorts(config: CNDIConfig): CNDIPort[] {
  const user_ports = config.infrastructure?.cndi?.open_ports ?? [];

  const ports: CNDIPort[] = [...DEFAULT_OPEN_PORTS];

  user_ports.forEach((user_port) => {
    if (user_port?.disable) {
      const indexOfPortToRemove = ports.findIndex(
        (port) =>
          user_port.number === port.number || user_port.name === port.name,
      );
      if (indexOfPortToRemove > -1) {
        ports.splice(indexOfPortToRemove, 1);
      }
      return;
    }

    const { name, number } = user_port;

    ports.push({
      name,
      number,
    });
  });
  return ports;
}

async function stageFile(relativePath: string, fileContents: string) {
  const stagingPath = path.join(await getStagingDir(), relativePath);
  await Deno.mkdir(path.dirname(stagingPath), { recursive: true });
  await Deno.writeTextFile(stagingPath, fileContents);
}

async function getStagingDir(): Promise<string> {
  const stagingDirectory = Deno.env.get("CNDI_STAGING_DIRECTORY");
  if (!stagingDirectory) {
    console.error(
      utilsLabel,
      `${ccolors.key_name(`"CNDI_STAGING_DIRECTORY"`)}`,
      ccolors.error(`is not set!`),
    );
    await emitExitEvent(202);
    Deno.exit(202);
  }
  return stagingDirectory;
}

async function persistStagedFiles(targetDirectory: string) {
  const stagingDirectory = await getStagingDir();
  for await (const entry of walk(stagingDirectory)) {
    if (entry.isFile) {
      const fileContents = await Deno.readTextFile(entry.path);
      const destinationAbsPath = entry.path.replace(
        stagingDirectory,
        targetDirectory,
      );

      await Deno.mkdir(path.dirname(destinationAbsPath), { recursive: true });
      await Deno.writeTextFile(destinationAbsPath, fileContents, {
        create: true,
      });
    }
  }
  await Deno.remove(stagingDirectory, { recursive: true });
}

async function checkInstalled(
  CNDI_HOME: string,
) {
  try {
    // if any of these files/folders don't exist, return false
    await Promise.all([
      Deno.stat(CNDI_HOME),
      Deno.stat(getPathToTerraformBinary()),
      Deno.stat(getPathToKubesealBinary()),
    ]);

    return true;
  } catch {
    return false;
  }
}

async function checkInitialized(output: string) {
  // if any of these files/folders don't exist, return false
  try {
    await Promise.all([
      Deno.stat(path.join(output, "cndi")),
      Deno.stat(path.join(output, ".gitignore")),
      Deno.stat(path.join(output, ".env")),
    ]);
    return true;
  } catch {
    return false;
  }
}

const getFileSuffixForPlatform = () => {
  const fileSuffixForPlatform = {
    linux: "linux",
    darwin: "mac",
    win32: "win.exe",
  };
  const currentPlatform = platform() as "linux" | "darwin" | "win32";
  return fileSuffixForPlatform[currentPlatform];
};

const getCndiInstallPath = (): string => {
  const DEFAULT_CNDI_HOME = path.join(homedir(), ".cndi");
  const CNDI_HOME = Deno.env.get("CNDI_HOME") || DEFAULT_CNDI_HOME;
  let suffix = "";
  if (platform() === "win32") {
    suffix = ".exe";
  }
  return path.join(CNDI_HOME, "bin", `cndi${suffix}`);
};

const getPathToOpenSSLForPlatform = () => {
  const currentPlatform = platform() as "linux" | "darwin" | "win32";

  if (currentPlatform === "win32") {
    return path.join("/", "Program Files", "Git", "usr", "bin", "openssl.exe");
  }

  return path.join("/", "usr", "bin", "openssl");
};

function base10intToHex(decimal: number): string {
  // if the int8 in hex is less than 2 characters, prepend 0
  const hex = decimal.toString(16).padStart(2, "0");
  return hex;
}

function getUserDataTemplateFileString(
  role?: NodeRole,
  doBase64Encode?: boolean,
) {
  let leaderString =
    'templatefile("microk8s-cloud-init-leader.yml.tftpl",{"bootstrap_token": "${local.bootstrap_token}", "git_repo": "${var.git_repo}", "git_password": "${var.git_password}", "git_username": "${var.git_username}", "sealed_secrets_private_key": "${base64encode(var.sealed_secrets_private_key)}", "sealed_secrets_public_key": "${base64encode(var.sealed_secrets_public_key)}", "argocd_admin_password": "${var.argocd_admin_password}"})';
  if (useSshRepoAuth()) {
    // this value contains base64 encoded values for git_repo and git_ssh_private_key
    // it's required in order to support multiline values in cloud-init
    leaderString =
      'templatefile("microk8s-cloud-init-leader.yml.tftpl",{"bootstrap_token": "${local.bootstrap_token}", "git_repo_encoded": "${base64encode(var.git_repo)}", "git_repo": "${var.git_repo}", "git_ssh_private_key": "${base64encode(var.git_ssh_private_key)}", "sealed_secrets_private_key": "${base64encode(var.sealed_secrets_private_key)}", "sealed_secrets_public_key": "${base64encode(var.sealed_secrets_public_key)}", "argocd_admin_password": "${var.argocd_admin_password}"})';
  }
  let workerString =
    'templatefile("microk8s-cloud-init-worker.yml.tftpl",{"bootstrap_token": "${local.bootstrap_token}", "leader_node_ip": "${local.leader_node_ip}"})';
  let controllerString =
    'templatefile("microk8s-cloud-init-controller.yml.tftpl",{"bootstrap_token": "${local.bootstrap_token}", "leader_node_ip": "${local.leader_node_ip}"})';

  if (doBase64Encode) {
    leaderString = `\${base64encode(${leaderString})}`;
    workerString = `\${base64encode(${workerString})}`;
    controllerString = `\${base64encode(${controllerString})}`;
  } else {
    leaderString = `\${${leaderString}}`;
    workerString = `\${${workerString}}`;
    controllerString = `\${${controllerString}}`;
  }

  switch (role) {
    case "leader":
      return leaderString;
    case "worker":
      return workerString;
    default:
      return controllerString;
  }
}

/**
 * Replaces a range in a string with a substituted value
 * @param s string which should be modified
 * @param start index of the first character to be replaced
 * @param end index of the last character to be replaced
 * @param substitute
 * @returns new string after substitution
 */
function replaceRange(
  s: string,
  start: number,
  end: number,
  substitute: string,
) {
  return s.substring(0, start) + substitute + s.substring(end);
}

function getSecretOfLength(len = 32): string {
  if (len % 2) {
    throw new Error("password length must be even");
  }

  const values = new Uint8Array(len / 2);
  crypto.getRandomValues(values);
  return Array.from(values, base10intToHex).join("");
}

function useSshRepoAuth(): boolean {
  return (
    !!Deno.env.get("GIT_SSH_PRIVATE_KEY")?.length &&
    !Deno.env.get("GIT_PASSWORD")
  );
}

async function emitExitEvent(exit_code: number) {
  const event_uuid = await emitTelemetryEvent("command_exit", { exit_code });
  const isDebug = Deno.env.get("CNDI_TELEMETRY") === "debug";
  if (isDebug) console.log("\nevent_uuid", event_uuid);
  console.log();
}

export {
  checkInitialized,
  checkInstalled,
  emitExitEvent,
  getCndiInstallPath,
  getDeploymentTargetFromConfig,
  getFileSuffixForPlatform,
  getLeaderNodeNameFromConfig,
  getPathToKubesealBinary,
  getPathToOpenSSLForPlatform,
  getPathToTerraformBinary,
  getPrettyJSONString,
  getSecretOfLength,
  getStagingDir,
  getTFData,
  getTFResource,
  getUserDataTemplateFileString,
  loadCndiConfig,
  loadJSONC,
  loadYAML,
  patchAndStageTerraformFilesWithConfig,
  persistStagedFiles,
  removeOldBinaryIfRequired,
  replaceRange,
  resolveCNDIPorts,
  sha256Digest,
  stageFile,
  useSshRepoAuth,
};
