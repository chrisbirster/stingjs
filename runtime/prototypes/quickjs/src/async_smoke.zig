const std = @import("std");

const c = @cImport({
    @cInclude("quickjs.h");
    @cInclude("stdio.h");
    @cInclude("string.h");
});

const async_source = @embedFile("sting-async-native.js");
const async_semantics_source = @embedFile("sting-async-semantics.js");
const conformance_source = @embedFile("sting-solid2-conformance.js");
const conformance_semantics_source = @embedFile("sting-conformance-semantics.js");

const runtime_info_json =
    "{\"protocolVersion\":1,\"platform\":\"ios\",\"modules\":{\"Haptics\":\"0.1.0\"}}";
const module_success_json = "{\"ok\":true,\"value\":null}";

const bridge_bootstrap =
    \\if (typeof globalThis.queueMicrotask !== "function") {
    \\  globalThis.queueMicrotask = function queueMicrotask(callback) {
    \\    if (typeof callback !== "function") throw new TypeError("queueMicrotask callback must be a function");
    \\    Promise.resolve().then(callback);
    \\  };
    \\}
    \\globalThis.__stingNativeBridge = {
    \\  getRuntimeInfo() { return globalThis.__stingHostCall("getRuntimeInfo"); },
    \\  createElement(id, type) { globalThis.__stingHostCall("createElement", id, type); },
    \\  createTextNode(id, value) { globalThis.__stingHostCall("createTextNode", id, value); },
    \\  replaceText(id, value) { globalThis.__stingHostCall("replaceText", id, value); },
    \\  setProperty(id, name, valueJSON) { globalThis.__stingHostCall("setProperty", id, name, valueJSON); },
    \\  insertNode(parentId, nodeId, anchorId) { globalThis.__stingHostCall("insertNode", parentId, nodeId, anchorId); },
    \\  removeNode(parentId, nodeId) { globalThis.__stingHostCall("removeNode", parentId, nodeId); },
    \\  setEventEnabled(id, event, enabled) { globalThis.__stingHostCall("setEventEnabled", id, event, enabled); },
    \\  callModuleSync(module, method, argsJSON) { return globalThis.__stingHostCall("callModuleSync", module, method, argsJSON); }
    \\};
;

const SmokeError = error{
    RuntimeCreationFailed,
    ContextCreationFailed,
    EvaluationFailed,
    PendingJobFailed,
};

fn dumpException(ctx: *c.JSContext) void {
    const exception = c.JS_GetException(ctx);
    defer c.JS_FreeValue(ctx, exception);
    const message = c.JS_ToCString(ctx, exception);
    if (message != null) {
        _ = c.fputs("QuickJS Sting semantic smoke exception: ", c.stderr);
        _ = c.fputs(message, c.stderr);
        _ = c.fputc('\n', c.stderr);
        c.JS_FreeCString(ctx, message);
    }
}

fn jsHostCall(
    maybe_ctx: ?*c.JSContext,
    this_value: c.JSValueConst,
    argc: c_int,
    argv: [*c]c.JSValueConst,
) callconv(.c) c.JSValue {
    _ = this_value;
    const ctx = maybe_ctx orelse return c.JS_NewInt32(maybe_ctx, 0);
    if (argc < 1) return c.JS_NewInt32(ctx, 0);

    const operation = c.JS_ToCString(ctx, argv[0]);
    if (operation == null) return c.JS_NewInt32(ctx, 0);
    defer c.JS_FreeCString(ctx, operation);

    if (c.strcmp(operation, "getRuntimeInfo") == 0) return c.JS_NewString(ctx, runtime_info_json);
    if (c.strcmp(operation, "callModuleSync") == 0) return c.JS_NewString(ctx, module_success_json);
    return c.JS_NewInt32(ctx, 0);
}

fn installHostCall(ctx: *c.JSContext) void {
    const global = c.JS_GetGlobalObject(ctx);
    defer c.JS_FreeValue(ctx, global);
    const host_call = c.JS_NewCFunction2(ctx, jsHostCall, "__stingHostCall", 4, c.JS_CFUNC_generic, 0);
    _ = c.JS_SetPropertyStr(ctx, global, "__stingHostCall", host_call);
}

fn evaluate(ctx: *c.JSContext, source: []const u8, filename: [*:0]const u8) SmokeError!void {
    const value = c.JS_Eval(ctx, source.ptr, source.len, filename, c.JS_EVAL_TYPE_GLOBAL);
    defer c.JS_FreeValue(ctx, value);
    if (c.JS_IsException(value) != 0) {
        dumpException(ctx);
        return SmokeError.EvaluationFailed;
    }
}

fn runPendingJobs(runtime: *c.JSRuntime, fallback_ctx: *c.JSContext) SmokeError!void {
    while (c.JS_IsJobPending(runtime) != 0) {
        var job_ctx: ?*c.JSContext = null;
        if (c.JS_ExecutePendingJob(runtime, &job_ctx) < 0) {
            dumpException(job_ctx orelse fallback_ctx);
            return SmokeError.PendingJobFailed;
        }
    }
}

pub fn main() !void {
    const runtime = c.JS_NewRuntime() orelse return SmokeError.RuntimeCreationFailed;
    defer c.JS_FreeRuntime(runtime);
    const ctx = c.JS_NewContext(runtime) orelse return SmokeError.ContextCreationFailed;
    defer c.JS_FreeContext(ctx);

    c.JS_SetRuntimeInfo(runtime, "stingjs-official-quickjs-async-smoke");
    installHostCall(ctx);

    try evaluate(ctx, bridge_bootstrap, "sting-quickjs-async-bridge.js");
    try evaluate(ctx, async_semantics_source, "sting-async-semantics.js");
    try evaluate(ctx, async_source, "sting-async-native.js");
    try runPendingJobs(runtime, ctx);
    try evaluate(ctx, "globalThis.__stingAsyncProbe.run();", "sting-async-run.js");
    try runPendingJobs(runtime, ctx);
    try evaluate(ctx, "globalThis.__stingAsyncProbe.assertPassed();", "sting-async-verify.js");

    std.debug.print("QuickJS Solid 2 async semantics passed: promise/loading/pending/error/recovery stream action/optimistic\n", .{});

    // Reset to the plain host bridge before loading the independent conformance
    // bundle. The async probe intentionally wraps the bridge with its own tree.
    try evaluate(ctx, bridge_bootstrap, "sting-quickjs-conformance-bridge.js");
    try evaluate(ctx, conformance_source, "sting-solid2-conformance.js");
    try evaluate(ctx, conformance_semantics_source, "sting-conformance-semantics.js");
    try runPendingJobs(runtime, ctx);
    try evaluate(ctx, "globalThis.__stingConformanceProbe.run();", "sting-conformance-run.js");
    try runPendingJobs(runtime, ctx);
    try evaluate(ctx, "globalThis.__stingConformanceProbe.assertPassed();", "sting-conformance-verify.js");

    std.debug.print("QuickJS Solid 2 conformance suite passed\n", .{});
}
