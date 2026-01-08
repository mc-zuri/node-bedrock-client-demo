# Node.js child_process: process lifecycle and cleanup patterns

**Node.js does not automatically terminate child processes when the parent exits.** This is fundamental operating system behavior, not Node.js-specific. Children become "orphan processes" re-parented to PID 1 (init) on Unix systems. Understanding this is critical because many developers incorrectly assume child processes die with their parent. The key to proper process management lies in understanding process groups, the `detached` option, and implementing explicit cleanup handlers.

## The four spawning methods and their key differences

Node.js provides four methods for creating child processes, all returning a `ChildProcess` instance that extends `EventEmitter`.

**spawn()** is the foundational asynchronous method. It launches processes directly without a shell (unless `shell: true`), returns streaming I/O handles, and works best for long-running processes or large data streams. All other methods build on top of `spawn()`.

**exec()** spawns a shell (`/bin/sh` on Unix, `cmd.exe` on Windows) then runs the command within it. Output is buffered and returned via callback, with a default **1MB maxBuffer** limit—exceeding this terminates the child. The documentation explicitly warns: "Never pass unsanitized user input to this function."

**execFile()** is similar to `exec()` but spawns executables directly without a shell, making it more efficient on Unix. However, on Windows, `.bat` and `.cmd` files cannot be launched this way—they require a shell.

**fork()** is a specialized `spawn()` for Node.js processes. It automatically establishes an IPC communication channel for `subprocess.send()` and `'message'` events. Each forked child has its **own V8 instance** (roughly 30ms startup, ~10MB RAM), making large numbers of forks inadvisable.

| Method | Spawns Shell | IPC Channel | Output Handling | Best For |
|--------|--------------|-------------|-----------------|----------|
| spawn | No (configurable) | No | Streams | Long-running, large output |
| exec | Yes | No | Buffered (1MB limit) | Shell commands |
| execFile | No (configurable) | No | Buffered | Direct executables |
| fork | No | Yes (built-in) | Streams + IPC | Node.js worker processes |

## Process termination behavior when parent exits

The critical insight from Node.js documentation: "Child processes may continue running after the parent exits regardless of whether they are detached or not." This surprises many developers.

**Normal parent exit** (via `process.exit()` or script completion): The parent's event loop terminates, stdio streams close (potentially causing SIGPIPE in children writing to closed pipes), IPC channels close (triggering `'disconnect'` events in forked children), but children continue running as orphans.

**Parent crash** (uncaught exception, SIGKILL, SIGSEGV): The outcome for children is identical—they continue running. No cleanup handlers execute in the parent, IPC channels break immediately, and stdio streams become invalid.

**The `detached` option** fundamentally changes process relationships. On Unix/Linux/macOS, setting `detached: true` calls `setsid()`, which creates a **new session and process group** with the child as leader. On Windows, the child receives its own console window. However, for truly background processes, you must also:

```javascript
const subprocess = spawn('node', ['daemon.js'], {
  detached: true,
  stdio: 'ignore'  // Critical: disconnect stdio
});
subprocess.unref();  // Allow parent to exit independently
```

Without `stdio: 'ignore'`, the child remains attached to the controlling terminal even when detached.

## Signal propagation and Ctrl+C behavior

When you press Ctrl+C, the **terminal driver** sends SIGINT to the entire foreground process group—not just the parent. This is why child processes "receive" Ctrl+C alongside the parent by default.

The behavior differs based on process group membership:

- **Without `detached`**: Child inherits parent's process group ID (PGID) and session ID (SID). All processes share the same controlling terminal. Ctrl+C kills everything in the foreground group simultaneously.

- **With `detached: true`**: Child becomes leader of a new process group and session. Ctrl+C only affects the parent. The child must be killed explicitly via `process.kill(child.pid)`.

**There's no difference in signal behavior between spawn, exec, and fork** regarding Ctrl+C—the distinction is purely about process group membership. However, `exec()` creates a shell as an intermediary, which introduces the "grandchild problem": killing the shell may **not** kill processes spawned by that shell on Linux.

```javascript
// Problem: shell dies, but node process continues
const child = spawn('sh', ['-c', 'node long-running.js']);
child.kill();  // Only kills shell!

// Solution: use detached + negative PID
const child = spawn('sh', ['-c', 'node script.js'], { detached: true });
process.kill(-child.pid);  // Kills entire process group
```

## Critical differences between Windows and Unix platforms

Windows lacks true POSIX signal support, creating significant behavioral differences:

| Feature | Unix/Linux/macOS | Windows |
|---------|------------------|---------|
| Signal handling | Full POSIX (SIGTERM, SIGINT, SIGHUP, etc.) | Only SIGKILL, SIGTERM, SIGINT recognized—all act like SIGKILL |
| Graceful termination | `child.kill('SIGTERM')` allows cleanup | Always forceful/abrupt termination |
| Process group kill | `process.kill(-pid)` | Not supported; use `taskkill /PID pid /T /F` |
| Shell | `/bin/sh -c` | `cmd.exe /d /s /c` |
| execFile() | Efficient (no shell) | Cannot run .bat/.cmd files directly |

Cross-platform process tree killing requires different approaches:

```javascript
function killProcessTree(pid, callback) {
  if (process.platform === 'win32') {
    exec(`taskkill /PID ${pid} /T /F`, callback);
  } else {
    process.kill(-pid, 'SIGTERM');  // Negative PID = process group
    callback();
  }
}
```

## Best practices for cleanup and graceful shutdown

The recommended cleanup pattern handles multiple exit scenarios and properly terminates children:

```javascript
const { spawn } = require('child_process');
const children = [];

function spawnTracked(command, args, options) {
  const child = spawn(command, args, options);
  children.push(child);
  child.on('exit', () => {
    const index = children.indexOf(child);
    if (index > -1) children.splice(index, 1);
  });
  return child;
}

function cleanup() {
  children.forEach(child => child.kill('SIGTERM'));
}

// Handle all exit scenarios
['SIGTERM', 'SIGINT', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => process.exit(0));
});
process.on('exit', cleanup);
process.on('uncaughtException', (err) => {
  cleanup();
  throw err;
});
```

**For killing process trees** (not just direct children), the `tree-kill` package is the standard solution:

```javascript
const treeKill = require('tree-kill');
treeKill(child.pid, 'SIGTERM', (err) => {
  if (err) console.error('Failed:', err);
});
```

For forked processes, `subprocess.disconnect()` closes the IPC channel gracefully, triggering the `'disconnect'` event in the child, which can then exit cleanly:

```javascript
// In child process
process.on('disconnect', () => {
  console.log('Parent disconnected, shutting down gracefully');
  cleanup().then(() => process.exit(0));
});
```

## Common pitfalls to avoid

**Shell-spawned children surviving kills**: Using `exec()` or `spawn` with `shell: true` creates an intermediary shell. Killing it doesn't kill grandchildren. Solution: spawn with `detached: true` and kill via negative PID.

**Expecting graceful shutdown on Windows**: `child.kill('SIGTERM')` behaves like SIGKILL on Windows—immediate, forceful termination with no cleanup opportunity.

**Docker/container signal forwarding**: npm and yarn don't forward SIGTERM to children properly. Run Node directly or use an init system like `tini`:

```dockerfile
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "./main.js"]
```

**Zombie processes**: After `child.kill()`, the process stops but remains in the process table until reaped. Node.js handles this automatically if you listen for `'exit'` or `'close'` events—always attach these handlers.

**No shutdown timeout**: Graceful shutdowns can hang indefinitely. Always implement a forced exit after a reasonable timeout:

```javascript
const timeout = setTimeout(() => process.exit(1), 10000);
timeout.unref();  // Don't keep event loop alive
```

## Conclusion

Node.js child process lifecycle management requires understanding that **the OS, not Node.js, controls termination behavior**. The key principles: children survive parent death by default; process groups determine signal propagation; the `detached` option creates independent process groups via `setsid()`; and Windows has fundamentally different (and more limited) signal handling. For production applications, always implement explicit cleanup handlers for SIGTERM, SIGINT, and uncaught exceptions, use `tree-kill` for process trees, and account for the shell intermediary problem when using `exec()`. The `execa` package wraps these patterns elegantly for most use cases, providing automatic cleanup and graceful termination out of the box.