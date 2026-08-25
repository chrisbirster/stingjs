const std = @import("std");

const c = @cImport({
    @cInclude("sting_hermes_adapter.h");
    @cInclude("stdio.h");
    @cInclude("string.h");
});

const async_source = @embedFile("sting-async-native.js");
const async_semantics_source = @embedFile("sting-async-semantics.js");

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

const HermesSmokeError = error{
    RuntimeCreationFailed,
    HostInstallFailed,
    EvaluationFailed,
};

fn hostCall(
    user_data: ?*anyopaque,
    operation: [*c]const u8,
    arg1: [*c]const u8,
    arg2: [*c]const u8,
    arg3: [*c]const u8,
) callconv(.c) [*c]const u8 {
    _ = user_data;
    _ = arg1;
    _ = arg2;
    _ = arg3;
    if (c.strcmp(operation, "getRuntimeInfo") == 0) return runtime_info_json;
    if (c.strcmp(operation, "callModuleSync") == 0) return module_success_json;
    return null;
}

fn runSource(
    runtime: *c.StingHermesRuntime,
    source: []const u8,
    source_url: [*:0]const u8,
) HermesSmokeError!void {
    if (c.sting_hermes_runtime_run(runtime, source.ptr, source.len, source_url) != 0) {
        _ = c.fputs("Hermes async Sting smoke adapter error: ", c.stderr);
        _ = c.fputs(c.sting_hermes_runtime_last_error(runtime), c.stderr);
        _ = c.fputc('\n', c.stderr);
        return HermesSmokeError.EvaluationFailed;
    }
}

pub fn main() !void {
    const runtime = c.sting_hermes_runtime_create() orelse return HermesSmokeError.RuntimeCreationFailed;
    defer c.sting_hermes_runtime_destroy(runtime);

    if (c.sting_hermes_runtime_install_host_call(runtime, hostCall, null) != 0) {
        return HermesSmokeError.HostInstallFailed;
    }

    try runSource(runtime, bridge_bootstrap, "sting-hermes-async-bridge.js");
    try runSource(runtime, async_semantics_source, "sting-async-semantics.js");
    try runSource(runtime, async_source, "sting-async-native.js");
    try runSource(runtime, "globalThis.__stingAsyncProbe.run();", "sting-async-run.js");
    try runSource(runtime, "globalThis.__stingAsyncProbe.assertPassed();", "sting-async-verify.js");

    std.debug.print("Hermes Solid 2 async semantics passed: promise/loading/pending/error/recovery stream action/optimistic\n", .{});
}
