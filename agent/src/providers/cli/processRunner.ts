import { spawn } from "node:child_process";

import type {
  ProcessResult,
  ProcessRunner,
  ProcessRunSpec
} from "../contracts.js";

const defaultTimeoutMs = 120_000;

export const defaultProcessRunner: ProcessRunner = {
  run(spec) {
    return runProcess(spec);
  }
};

export function runProcess(spec: ProcessRunSpec): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false
    });

    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({
        exitCode: null,
        stdout,
        stderr: error.message,
        errorCode: error.code
      });
    });
    child.on("close", (exitCode) => {
      finish({ exitCode, stdout, stderr });
    });

    if (spec.stdin !== undefined) {
      child.stdin.end(spec.stdin, "utf8");
    } else {
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      child.kill();
      finish({
        exitCode: null,
        stdout,
        stderr: "Provider process timed out",
        errorCode: "ETIMEDOUT"
      });
    }, spec.timeoutMs ?? defaultTimeoutMs);
  });
}
