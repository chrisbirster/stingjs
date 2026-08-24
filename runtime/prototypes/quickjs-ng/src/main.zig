const c = @cImport({
    @cInclude("quickjs.h");
    @cInclude("stdio.h");
});

const benchmark_source = @embedFile("engine-bench.js");

const QuickJSNGError = error{
    RuntimeCreationFailed,
    ContextCreationFailed,
    EvaluationFailed,
    PendingJobFailed,
};

fn jsPrint(
    ctx: ?*c.JSContext,
    this_value: c.JSValueConst,
    argc: c_int,
    argv: [*c]c.JSValueConst,
) callconv(.c) c.JSValue {
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

fn dumpException(ctx: *c.JSContext) void {
    const exception = c.JS_GetException(ctx);
    defer c.JS_FreeValue(ctx, exception);

    const message = c.JS_ToCString(ctx, exception);
    if (message != null) {
        _ = c.fputs("QuickJS-NG exception: ", c.stderr);
        _ = c.fputs(message, c.stderr);
        _ = c.fputc('\n', c.stderr);
        c.JS_FreeCString(ctx, message);
    }
}

fn installHostFunctions(ctx: *c.JSContext) void {
    const global = c.JS_GetGlobalObject(ctx);
    defer c.JS_FreeValue(ctx, global);

    const print_function = c.JS_NewCFunction2(
        ctx,
        jsPrint,
        "print",
        1,
        c.JS_CFUNC_generic,
        0,
    );

    _ = c.JS_SetPropertyStr(ctx, global, "print", print_function);
}

fn runPendingJobs(runtime: *c.JSRuntime, fallback_ctx: *c.JSContext) QuickJSNGError!void {
    while (c.JS_IsJobPending(runtime) != 0) {
        var job_ctx: ?*c.JSContext = null;
        const result = c.JS_ExecutePendingJob(runtime, &job_ctx);
        if (result < 0) {
            dumpException(job_ctx orelse fallback_ctx);
            return QuickJSNGError.PendingJobFailed;
        }
    }
}

pub fn main() !void {
    const runtime = c.JS_NewRuntime() orelse return QuickJSNGError.RuntimeCreationFailed;
    defer c.JS_FreeRuntime(runtime);

    const ctx = c.JS_NewContext(runtime) orelse return QuickJSNGError.ContextCreationFailed;
    defer c.JS_FreeContext(ctx);

    c.JS_SetRuntimeInfo(runtime, "stingjs-quickjs-ng-prototype");
    installHostFunctions(ctx);

    const result = c.JS_Eval(
        ctx,
        benchmark_source.ptr,
        benchmark_source.len,
        "sting-js-engine-bench.js",
        c.JS_EVAL_TYPE_GLOBAL,
    );
    defer c.JS_FreeValue(ctx, result);

    if (c.JS_IsException(result) != 0) {
        dumpException(ctx);
        return QuickJSNGError.EvaluationFailed;
    }

    try runPendingJobs(runtime, ctx);
}
