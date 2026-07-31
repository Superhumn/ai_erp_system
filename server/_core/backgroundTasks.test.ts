import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the background_tasks table so we can drive the runner
// without a real database.
const store = new Map<string, any>();

vi.mock("../db", () => ({
  createBackgroundTask: vi.fn(async (input: any) => {
    store.set(input.id, { ...input, status: "queued", cancelRequested: false });
    return input.id;
  }),
  updateBackgroundTask: vi.fn(async (id: string, data: any) => {
    store.set(id, { ...(store.get(id) ?? {}), ...data });
  }),
  isBackgroundTaskCancelRequested: vi.fn(async (id: string) => {
    return !!store.get(id)?.cancelRequested;
  }),
}));

import { runBackgroundTask, BackgroundTaskCancelled } from "./backgroundTasks";

// Let the detached worker chain settle.
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("runBackgroundTask", () => {
  beforeEach(() => store.clear());

  it("returns a taskId immediately and records the row", async () => {
    const { taskId } = await runBackgroundTask(
      { userId: 1, type: "test", title: "Test task" },
      async () => {},
    );
    expect(taskId).toBeTruthy();
    expect(store.get(taskId)?.userId).toBe(1);
  });

  it("runs the worker detached and marks success with the summary", async () => {
    const worker = vi.fn(async () => ({ message: "all done" }));
    const { taskId } = await runBackgroundTask(
      { userId: 1, type: "test", title: "Test task" },
      worker,
    );
    await flush();
    expect(worker).toHaveBeenCalledOnce();
    const row = store.get(taskId);
    expect(row.status).toBe("success");
    expect(row.progress).toBe(100);
    expect(row.message).toBe("all done");
  });

  it("marks the task as error when the worker throws", async () => {
    const { taskId } = await runBackgroundTask(
      { userId: 1, type: "test", title: "Boom" },
      async () => {
        throw new Error("kaboom");
      },
    );
    await flush();
    const row = store.get(taskId);
    expect(row.status).toBe("error");
    expect(row.errorMessage).toContain("kaboom");
  });

  it("marks the task cancelled when the worker surfaces the sentinel", async () => {
    const { taskId } = await runBackgroundTask(
      { userId: 1, type: "test", title: "Cancel me" },
      async () => {
        throw new BackgroundTaskCancelled();
      },
    );
    await flush();
    expect(store.get(taskId).status).toBe("cancelled");
  });

  it("report() throws once cancellation is requested", async () => {
    let threw = false;
    const { taskId } = await runBackgroundTask(
      { userId: 1, type: "test", title: "Cooperative cancel" },
      async (handle) => {
        // Simulate a cancel arriving mid-run.
        store.set(handle.taskId, { ...store.get(handle.taskId), cancelRequested: true });
        try {
          await handle.report({ processed: 1, total: 2 });
        } catch (e) {
          threw = e instanceof BackgroundTaskCancelled;
          throw e;
        }
      },
    );
    await flush();
    expect(threw).toBe(true);
    expect(store.get(taskId).status).toBe("cancelled");
  });
});
