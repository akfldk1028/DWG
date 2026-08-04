import assert from "node:assert/strict";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createWindowsHostDialogProvider,
  HostDialogError,
  type HostDialogProcessRunner
} from "../src/index.ts";

function recordingRunner(result: {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}) {
  const calls: Parameters<HostDialogProcessRunner["run"]>[0][] = [];
  const runner: HostDialogProcessRunner = {
    async run(spec) {
      calls.push(spec);
      return result;
    }
  };
  return { runner, calls };
}

test("a chosen directory is returned canonically with a bare display name", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dwg-dialog-"));
  const canonical = await realpath(directory);
  const { runner, calls } = recordingRunner({
    exitCode: 0,
    stdout: `${directory}\r\n`,
    stderr: ""
  });

  const selection = await createWindowsHostDialogProvider({ runner }).chooseDirectory();

  assert.deepEqual(selection, {
    canonicalDirectory: canonical,
    displayDirectory: canonical.split(/[\\/]/u).filter(Boolean).at(-1)
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "powershell");
  assert.ok(calls[0].args.includes("-NoProfile"));
  assert.ok(calls[0].args.includes("-STA"));
  assert.ok(calls[0].args.at(-1)?.includes("FolderBrowserDialog"));
});

test("a dismissed dialog reports no selection rather than failing", async () => {
  const { runner } = recordingRunner({ exitCode: 0, stdout: "", stderr: "" });

  assert.equal(await createWindowsHostDialogProvider({ runner }).chooseDirectory(), null);
});

test("a failed dialog process raises a bounded error carrying no path", async () => {
  const { runner } = recordingRunner({
    exitCode: 1,
    stdout: "",
    stderr: "C:\\Users\\secret\\failed"
  });

  await assert.rejects(
    () => createWindowsHostDialogProvider({ runner }).chooseDirectory(),
    (error: unknown) => {
      assert.ok(error instanceof HostDialogError);
      assert.equal(error.code, "HOST_DIALOG_FAILED");
      assert.doesNotMatch(error.message, /secret/u);
      return true;
    }
  );
});

test("a selection that is not an existing directory reports no selection", async () => {
  const { runner } = recordingRunner({
    exitCode: 0,
    stdout: "C:\\definitely\\missing\\directory",
    stderr: ""
  });

  assert.equal(await createWindowsHostDialogProvider({ runner }).chooseDirectory(), null);
});

test("an aborted signal is refused before the dialog is spawned", async () => {
  const { runner, calls } = recordingRunner({ exitCode: 0, stdout: "", stderr: "" });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => createWindowsHostDialogProvider({ runner }).chooseDirectory(controller.signal)
  );
  assert.equal(calls.length, 0);
});
