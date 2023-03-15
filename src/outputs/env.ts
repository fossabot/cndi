import { EnvCommentEntry, EnvLines, EnvValueEntry } from "../types.ts";

const PLACEHOLDER_SUFFIX = "_PLACEHOLDER__";

const writeEnvObject = (envLines: EnvLines): string => {
  const dotEnvString = envLines.map((line) => {
    const commentLine = line as EnvCommentEntry;
    const valueLine = line as EnvValueEntry;

    if (commentLine?.comment) {
      return `\n${commentLine.comment}`;
    } else if (valueLine?.value) {
      const key = Object.keys(valueLine.value)[0];
      const val = valueLine?.value?.[key]
        ? valueLine.value[key]
        : `${key}${PLACEHOLDER_SUFFIX}`;
      console.log("key", key, "val", val);
      Deno.env.set(key, val);
      return `${key}='${val}'`;
    } else {
      console.error("failed to build env file line", line);
      return "";
    }
  }).join("\n").trim();

  console.log("dotEnvString", dotEnvString);

  return dotEnvString + "\n";
};

export default writeEnvObject;
