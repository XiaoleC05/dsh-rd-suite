/**
 * One-command execution over the Host `ctx.subprocess` seam. The DSH provider
 * owns process lifecycle, environment scrubbing, output collection and
 * cancellation; this module only supplies argv, cwd, environment overrides and
 * a deadline, then returns bounded text.
 */

/** Default deadline for one git/gh invocation. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 20_000;

/** Maximum captured bytes per output stream. */
export const COMMAND_OUTPUT_LIMIT_BYTES = 1024 * 1024;

/** Termination grace period for one managed process. */
export const COMMAND_GRACE_MS = 1_500;

/** The executable itself could not be started (for example gh is not installed). */
export class CommandUnavailableError extends Error {
  /**
   * @param {string} command - executable name that failed to resolve or start.
   * @param {unknown} cause - underlying subprocess failure.
   */
  constructor(command, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Command "${command}" is unavailable: ${detail}`);
    this.name = 'CommandUnavailableError';
    this.command = command;
    this.cause = cause;
  }
}

/** One invocation exceeded its deadline. */
export class CommandTimeoutError extends Error {
  /**
   * @param {string} command - executable name.
   * @param {number} timeoutMs - elapsed deadline.
   */
  constructor(command, timeoutMs) {
    super(`Command "${command}" timed out after ${timeoutMs}ms`);
    this.name = 'CommandTimeoutError';
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

/** The caller aborted the invocation. */
export class CommandAbortedError extends Error {
  /** @param {string} command - executable name. */
  constructor(command) {
    super(`Command "${command}" was cancelled`);
    this.name = 'CommandAbortedError';
    this.command = command;
  }
}

/** The process could not be spawned or did not settle to an exit fact. */
export class CommandFailureError extends Error {
  /**
   * @param {string} command - executable name.
   * @param {unknown} cause - underlying failure.
   */
  constructor(command, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Command "${command}" failed: ${detail}`);
    this.name = 'CommandFailureError';
    this.command = command;
    this.cause = cause;
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Build a bounded runner bound to one Host plugin context.
 * @param {object} ctx - Host context providing `subprocess`.
 * @returns {(argv: readonly string[], options?: { cwd?: string; signal?: AbortSignal; timeoutMs?: number; env?: Record<string, string | undefined> }) => Promise<{ exitCode: number | null; signal: string | null; stdout: string; stderr: string; truncated: boolean }>} runner.
 */
export function createRunner(ctx) {
  if (ctx === null || typeof ctx !== 'object' || ctx.subprocess === undefined || ctx.subprocess === null) {
    throw new Error('github-issue-first-workflow requires the Host subprocess service');
  }

  return async function run(argv, options = {}) {
    if (!Array.isArray(argv) || argv.length === 0 || typeof argv[0] !== 'string' || argv[0] === '') {
      throw new TypeError('run() needs a non-empty argv with an executable name first');
    }
    const command = argv[0];
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_COMMAND_TIMEOUT_MS;
    const callerSignal = options.signal;
    if (callerSignal?.aborted === true) throw new CommandAbortedError(command);

    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => {
      controller.abort(callerSignal.reason);
    };
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('command deadline exceeded'));
    }, timeoutMs);

    try {
      let executable;
      try {
        executable = await ctx.subprocess.resolveExecutable(command, undefined, controller.signal);
      } catch (error) {
        if (timedOut) throw new CommandTimeoutError(command, timeoutMs);
        if (controller.signal.aborted) throw new CommandAbortedError(command);
        throw new CommandUnavailableError(command, error);
      }
      if (timedOut) throw new CommandTimeoutError(command, timeoutMs);
      if (controller.signal.aborted) throw new CommandAbortedError(command);

      let child;
      try {
        child = ctx.subprocess.spawn({
          argv: [executable, ...argv.slice(1)],
          cwd: options.cwd ?? process.cwd(),
          env: { ...options.env },
          signal: controller.signal,
          graceMs: COMMAND_GRACE_MS,
          stdio: {
            stdin: 'ignore',
            stdout: { maxBytes: COMMAND_OUTPUT_LIMIT_BYTES },
            stderr: { maxBytes: COMMAND_OUTPUT_LIMIT_BYTES },
          },
        });
      } catch (error) {
        if (timedOut) throw new CommandTimeoutError(command, timeoutMs);
        if (controller.signal.aborted) throw new CommandAbortedError(command);
        throw new CommandFailureError(command, error);
      }

      try {
        let outcome;
        try {
          outcome = await child.done;
        } catch (error) {
          if (timedOut) throw new CommandTimeoutError(command, timeoutMs);
          if (controller.signal.aborted) throw new CommandAbortedError(command);
          throw new CommandFailureError(command, error);
        }
        if (timedOut) throw new CommandTimeoutError(command, timeoutMs);
        if (controller.signal.aborted) throw new CommandAbortedError(command);
        const stdout = readCollected(child.collected?.stdout);
        const stderr = readCollected(child.collected?.stderr);
        return {
          exitCode: outcome.exitCode,
          signal: outcome.signal,
          stdout: stdout.text,
          stderr: stderr.text,
          truncated: stdout.lossy || stderr.lossy,
        };
      } finally {
        child.terminate();
        try {
          await child.waitForExit();
        } catch {
          // The managed range is already terminating; exit observation is best effort here.
        }
      }
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  };
}

function readCollected(reader) {
  if (reader === undefined || reader === null || typeof reader.readFrom !== 'function') {
    return { text: '', lossy: false };
  }
  const read = reader.readFrom(0);
  return { text: read.text, lossy: read.lossy === true };
}

/**
 * First meaningful diagnostic line of a command stream, bounded for a tool result.
 * @param {string} text - stdout or stderr.
 * @param {number} [limit] - maximum characters.
 * @returns {string} trimmed first line, or ''.
 */
export function firstDiagnosticLine(text, limit = 400) {
  if (typeof text !== 'string') return '';
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed !== '') return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
  }
  return '';
}

/** @param {unknown} error @returns {string} a bounded error message. */
export function describeError(error) {
  const message = messageOf(error);
  return message.length > 600 ? `${message.slice(0, 600)}…` : message;
}
