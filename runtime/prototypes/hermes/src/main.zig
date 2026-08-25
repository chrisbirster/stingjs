const c = @cImport({
    @cInclude("sting_hermes_adapter.h");
    @cInclude("stdio.h");
});

const benchmark_source = @embedFile("engine-bench.js");

const HermesError = error{
    RuntimeCreationFailed,
    EvaluationFailed,
};

pub fn main() !void {
    const runtime = c.sting_hermes_runtime_create() orelse
        return HermesError.RuntimeCreationFailed;
    defer c.sting_hermes_runtime_destroy(runtime);

    const status = c.sting_hermes_runtime_run(
        runtime,
        benchmark_source.ptr,
        benchmark_source.len,
        "sting-js-engine-bench.js",
    );

    if (status != 0) {
        _ = c.fputs("Hermes adapter error: ", c.stderr);
        _ = c.fputs(c.sting_hermes_runtime_last_error(runtime), c.stderr);
        _ = c.fputc('\n', c.stderr);
        return HermesError.EvaluationFailed;
    }

    _ = c.puts(c.sting_hermes_runtime_last_output(runtime));
}
