import { CNDIConfig, CNDIContext, NodeKind } from "../types.ts";

import { copy } from "https://deno.land/std@0.157.0/fs/copy.ts";

import { loadJSONC } from "../utils.ts";

import {
  brightRed,
  cyan,
  white,
} from "https://deno.land/std@0.158.0/fmt/colors.ts";

import * as path from "https://deno.land/std@0.157.0/path/mod.ts";
import overwriteWithFn from "./overwrite-with.ts";

import { Select } from "https://deno.land/x/cliffy@v0.25.4/prompt/select.ts";

import {
  availableDeploymentTargets,
  getEnvObject,
} from "../deployment-targets/shared.ts";

import { createSealedSecretsKeys } from "../initialize/sealedSecretsKeys.ts";

import { createTerraformStatePassphrase } from "../initialize/terraformStatePassphrase.ts";

import { createArgoUIReadOnlyPassword } from "../initialize/argoUIReadOnlyPassword.ts";

import availableTemplates from "../templates/available-templates.ts";

import { checkInitialized } from "../utils.ts";

import writeEnvObject from "../outputs/env.ts";
import getGitignoreContents from "../outputs/gitignore.ts";
import coreReadme from "../doc/core.ts";

import { Template } from "../templates/Template.ts";

const initLabel = white("init:");

/**
 * COMMAND fn: cndi init
 * Initializes ./cndi directory with the specified config file
 * and initializes workflows in .github
 */
export default async function init(context: CNDIContext) {
  // context.template?:string is the template name the user chose with the --template or -t flag
  // template:Template is a different thing, it is the object that is associated with a selected template name
  // template:Template does not have a "kind" associated, it takes one as an argument in it's applicable methods

  const initializing = true;
  const CNDI_CONFIG_FILENAME = "cndi-config.jsonc"; // this is used for writing a cndi-config.jsonc file when using templates

  // kind comes in from one of 2 places
  // 1. if the user chooses a template, we use the first part of the template name, eg. "aws" or "gcp"
  // 2. if the user brings their own config file, we read it from the first node entry in the config file
  let kind: NodeKind | undefined;

  // if 'template' and 'interactive' are both falsy we want to look for config at 'pathToConfig'
  const useCNDIConfigFile = !context.interactive && !context.template;

  if (useCNDIConfigFile) {
    try {
      console.log(`cndi init --file "${context.pathToConfig}"\n`);
      const config = (await loadJSONC(
        context.pathToConfig,
      )) as unknown as CNDIConfig;

      // 1. the user brought their own config file, we use the kind of the first node
      kind = config.nodes.entries[0].kind as NodeKind; // only works when all nodes are the same kind
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // if config is not found at 'pathToConfig' we want to throw an error
        console.log(
          initLabel,
          brightRed(
            `cndi-config file not found at ${
              white(
                `"${context.pathToConfig}"`,
              )
            }\n`,
          ),
        );

        // and suggest a solution
        console.log(
          `if you don't have a cndi-config file try ${
            cyan(
              "cndi init --interactive",
            )
          }\n`,
        );
        Deno.exit(1);
      }
    }
  } else if (context.interactive) {
    if (context.template) {
      // 2a. the user used a template name, we pull the 'kind' out of it
      kind = context.template.split("/")[0] as NodeKind;
      console.log(`cndi init --interactive --template ${context.template}\n`);
    } else {
      // we don't know the kind so we need to get it when the user chooses a template (see 2c)
      console.log("cndi init --interactive\n");
    }
  } else {
    // if the user passes -t or --template with no value, we raise an error
    if (`${context.template}` === "true") {
      // if template flag is truthy but empty, throw error
      console.log(`cndi init --template\n`);
      console.error(
        initLabel,
        brightRed(`--template (-t) flag requires a value`),
      );
      Deno.exit(1);
    }

    console.log(`cndi init --template ${context.template}\n`);
    // 2b.the user has passed a template name, we pull the 'kind'out of it
    kind = context.template?.split("/")[0] as NodeKind;
  }

  const directoryContainsCNDIFiles = await checkInitialized(context);

  const shouldContinue = directoryContainsCNDIFiles
    ? confirm(
      "It looks like you have already initialized a cndi project in this directory. Overwrite existing artifacts?",
    )
    : true;

  if (!shouldContinue) {
    Deno.exit(0);
  }

  const templateNamesList: string[] = [];

  availableTemplates.forEach((tpl) => {
    availableDeploymentTargets.forEach((k) => {
      templateNamesList.push(`${k}/${tpl.name}`);
    });
  });

  if (context.template) {
    const templateUnavailable = !templateNamesList.includes(context.template);

    if (templateUnavailable) {
      console.log(
        initLabel,
        brightRed(
          `The template you selected "${context.template}" is not available.\n`,
        ),
      );

      console.log("Available templates are:\n");
      console.log(`${templateNamesList.map((t) => cyan(t)).join(", ")}\n`);
      Deno.exit(1);
    }
  }

  // GENERATE ENV VARS
  const sealedSecretsKeys = await createSealedSecretsKeys(context);
  const terraformStatePassphrase = createTerraformStatePassphrase();
  const argoUIReadOnlyPassword = createArgoUIReadOnlyPassword();

  const {
    noGitHub,
    CNDI_SRC,
    githubDirectory,
    interactive,
    projectDirectory,
    gitignorePath,
    dotEnvPath,
  } = context;

  let baseTemplateName = context.template?.split("/")[1]; // eg. "airflow-tls"

  if (interactive && !context.template) {
    const selectedTemplateName = await Select.prompt({
      message: cyan("Pick a template"),
      options: templateNamesList,
    });

    baseTemplateName = selectedTemplateName.split("/")[1]; // eg. "airflow-tls"
    // 2c. the user finally selected a template, we pull the 'kind' out of it
    kind = selectedTemplateName.split("/")[0] as NodeKind;
  }

  const template: Template = availableTemplates.find(
    (t) => t.name === baseTemplateName,
  ) as Template;

  if (!kind) {
    console.log(initLabel, brightRed(`"kind" cannot be inferred`));
    Deno.exit(1);
  }

  const cndiContextWithGeneratedValues = {
    ...context,
    sealedSecretsKeys,
    terraformStatePassphrase,
    argoUIReadOnlyPassword,
  };

  await Deno.writeTextFile(gitignorePath, getGitignoreContents());

  const envObject = await getEnvObject(
    template,
    cndiContextWithGeneratedValues,
    kind,
  );

  await writeEnvObject(dotEnvPath, envObject);

  if (!noGitHub) {
    try {
      // overwrite the github workflows and readme, do not clobber other files
      await copy(path.join(CNDI_SRC, "github"), githubDirectory, {
        overwrite: true,
      });
    } catch (githubCopyError) {
      console.log(
        initLabel,
        brightRed("failed to copy github integration files"),
      );
      console.error(githubCopyError);
      Deno.exit(1);
    }
  }

  // write a readme, extend via Template.readmeBlock if it exists
  await Deno.writeTextFile(
    path.join(projectDirectory, "README.md"),
    coreReadme + (template?.readmeBlock || ""),
  );

  // if the user has specified a template, use that
  if (template) {
    const configOutputPath = path.join(projectDirectory, CNDI_CONFIG_FILENAME);
    const conf = await template.getConfiguration(context.interactive);
    const templateString = await template.getTemplate(kind, conf);

    await Deno.writeTextFile(configOutputPath, templateString);

    const finalContext = {
      ...cndiContextWithGeneratedValues,
      pathToConfig: configOutputPath,
    };

    console.log("finalContext", finalContext);

    // because there is no "pathToConfig" when using a template, we need to set it here
    overwriteWithFn(finalContext, initializing);
    return;
  }

  console.log("cndiContextWithGeneratedValues", cndiContextWithGeneratedValues);

  overwriteWithFn(cndiContextWithGeneratedValues, initializing);
}
