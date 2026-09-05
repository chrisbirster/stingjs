const c = @cImport({
    @cInclude("quickjs.h");
    @cInclude("stdio.h");
    @cInclude("string.h");
    @cInclude("time.h");
});

const benchmark_source = @embedFile("transport-bench.js");

const BenchmarkError = error{
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
        _ = c.fputs("QuickJS transport benchmark exception: ", c.stderr);
        _ = c.fputs(message, c.stderr);
        _ = c.fputc('\n', c.stderr);
        c.JS_FreeCString(ctx, message);
    }
}

fn jsPrint(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    if (ctx != null and argc > 0) {
        const value = c.JS_ToCString(ctx, argv[0]);
        if (value != null) {
            _ = c.puts(value);
            c.JS_FreeCString(ctx, value);
        }
    }
    return c.JS_NewInt32(ctx, 0);
}

fn jsNowMicros(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    _ = argc;
    _ = argv;
    const ticks = c.clock();
    const micros = @as(f64, @floatFromInt(ticks)) * 1_000_000.0 / @as(f64, @floatFromInt(c.CLOCKS_PER_SEC));
    return c.JS_NewFloat64(ctx, micros);
}

fn jsJsonCall(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 1) return c.JS_NewInt32(ctx, -1);
    const payload = c.JS_ToCString(context, argv[0]);
    if (payload == null) return c.JS_NewInt32(ctx, -1);
    defer c.JS_FreeCString(context, payload);
    const length = c.strlen(payload);
    const parsed = c.JS_ParseJSON(context, payload, length, "sting-transport-benchmark.json");
    if (c.JS_IsException(parsed) != 0) return parsed;
    defer c.JS_FreeValue(context, parsed);
    return c.JS_NewInt32(ctx, @intCast(length));
}

fn jsTypedText(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 2) return c.JS_NewInt32(ctx, -1);
    var id: i32 = 0;
    if (c.JS_ToInt32(context, &id, argv[0]) < 0) return c.JS_NewInt32(ctx, -1);
    const value = c.JS_ToCString(context, argv[1]);
    if (value == null) return c.JS_NewInt32(ctx, -1);
    defer c.JS_FreeCString(context, value);
    return c.JS_NewInt32(ctx, id + @as(i32, @intCast(c.strlen(value))));
}

fn jsTypedNumber(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 2) return c.JS_NewInt32(ctx, -1);
    var id: i32 = 0;
    var value: f64 = 0;
    if (c.JS_ToInt32(context, &id, argv[0]) < 0) return c.JS_NewInt32(ctx, -1);
    if (c.JS_ToFloat64(context, &value, argv[1]) < 0) return c.JS_NewInt32(ctx, -1);
    return c.JS_NewFloat64(ctx, value + @as(f64, @floatFromInt(id)));
}

fn jsTypedString(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 2) return c.JS_NewInt32(ctx, -1);
    const left = c.JS_ToCString(context, argv[0]);
    if (left == null) return c.JS_NewInt32(ctx, -1);
    defer c.JS_FreeCString(context, left);
    const right = c.JS_ToCString(context, argv[1]);
    if (right == null) return c.JS_NewInt32(ctx, -1);
    defer c.JS_FreeCString(context, right);
    return c.JS_NewInt32(ctx, @intCast(c.strlen(left) + c.strlen(right)));
}

fn jsTypedBool(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 2) return c.JS_NewInt32(ctx, -1);
    var id: i32 = 0;
    if (c.JS_ToInt32(context, &id, argv[0]) < 0) return c.JS_NewInt32(ctx, -1);
    const enabled = c.JS_ToBool(context, argv[1]);
    if (enabled < 0) return c.JS_NewInt32(ctx, -1);
    return c.JS_NewInt32(ctx, id + enabled);
}

fn jsTypedModule(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 2) return c.JS_NewInt32(ctx, -1);
    var value: i32 = 0;
    if (c.JS_ToInt32(context, &value, argv[0]) < 0) return c.JS_NewInt32(ctx, -1);
    const text = c.JS_ToCString(context, argv[1]);
    if (text == null) return c.JS_NewInt32(ctx, -1);
    defer c.JS_FreeCString(context, text);
    return c.JS_NewInt32(ctx, value + @as(i32, @intCast(c.strlen(text))));
}

fn jsJsonResult(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    _ = argc;
    _ = argv;
    return c.JS_NewString(ctx, "{\"ok\":true,\"value\":42}");
}

fn jsTypedResult(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    _ = argc;
    _ = argv;
    return c.JS_NewInt32(ctx, 42);
}

fn jsEmitTypedEvent(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 1 or c.JS_IsFunction(context, argv[0]) == 0) return c.JS_NewInt32(ctx, -1);
    const global = c.JS_GetGlobalObject(context);
    defer c.JS_FreeValue(context, global);
    var args = [_]c.JSValue{ c.JS_NewInt32(context, 42), c.JS_NewString(context, "tick") };
    defer for (&args) |*arg| c.JS_FreeValue(context, arg.*);
    return c.JS_Call(context, argv[0], global, @intCast(args.len), &args[0]);
}

fn jsEmitJsonEvent(ctx: ?*c.JSContext, this_value: c.JSValueConst, argc: c_int, argv: [*c]c.JSValueConst) callconv(.c) c.JSValue {
    _ = this_value;
    const context = ctx orelse return c.JS_NewInt32(ctx, -1);
    if (argc < 1 or c.JS_IsFunction(context, argv[0]) == 0) return c.JS_NewInt32(ctx, -1);
    const global = c.JS_GetGlobalObject(context);
    defer c.JS_FreeValue(context, global);
    var args = [_]c.JSValue{c.JS_NewString(context, "{\"value\":42,\"label\":\"tick\"}")};
    defer c.JS_FreeValue(context, args[0]);
    return c.JS_Call(context, argv[0], global, @intCast(args.len), &args[0]);
}

fn installFunction(ctx: *c.JSContext, global: c.JSValue, name: [*:0]const u8, function: anytype, arity: c_int) void {
    const value = c.JS_NewCFunction2(ctx, function, name, arity, c.JS_CFUNC_generic, 0);
    _ = c.JS_SetPropertyStr(ctx, global, name, value);
}

fn installHostFunctions(ctx: *c.JSContext) void {
    const global = c.JS_GetGlobalObject(ctx);
    defer c.JS_FreeValue(ctx, global);
    installFunction(ctx, global, "print", jsPrint, 1);
    installFunction(ctx, global, "__nowMicros", jsNowMicros, 0);
    installFunction(ctx, global, "__jsonCall", jsJsonCall, 1);
    installFunction(ctx, global, "__typedText", jsTypedText, 2);
    installFunction(ctx, global, "__typedNumber", jsTypedNumber, 2);
    installFunction(ctx, global, "__typedString", jsTypedString, 2);
    installFunction(ctx, global, "__typedBool", jsTypedBool, 2);
    installFunction(ctx, global, "__typedModule", jsTypedModule, 2);
    installFunction(ctx, global, "__jsonResult", jsJsonResult, 0);
    installFunction(ctx, global, "__typedResult", jsTypedResult, 0);
    installFunction(ctx, global, "__emitTypedEvent", jsEmitTypedEvent, 1);
    installFunction(ctx, global, "__emitJsonEvent", jsEmitJsonEvent, 1);
}

fn runPendingJobs(runtime: *c.JSRuntime, fallback_ctx: *c.JSContext) BenchmarkError!void {
    while (c.JS_IsJobPending(runtime) != 0) {
        var job_ctx: ?*c.JSContext = null;
        if (c.JS_ExecutePendingJob(runtime, &job_ctx) < 0) {
            dumpException(job_ctx orelse fallback_ctx);
            return BenchmarkError.PendingJobFailed;
        }
    }
}

pub fn main() !void {
    const runtime = c.JS_NewRuntime() orelse return BenchmarkError.RuntimeCreationFailed;
    defer c.JS_FreeRuntime(runtime);
    const ctx = c.JS_NewContext(runtime) orelse return BenchmarkError.ContextCreationFailed;
    defer c.JS_FreeContext(ctx);
    c.JS_SetRuntimeInfo(runtime, "stingjs-official-quickjs-transport-benchmark");
    installHostFunctions(ctx);
    const result = c.JS_Eval(ctx, benchmark_source.ptr, benchmark_source.len, "sting-transport-bench.js", c.JS_EVAL_TYPE_GLOBAL);
    defer c.JS_FreeValue(ctx, result);
    if (c.JS_IsException(result) != 0) {
        dumpException(ctx);
        return BenchmarkError.EvaluationFailed;
    }
    try runPendingJobs(runtime, ctx);
}
