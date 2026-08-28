#ifndef STING_HERMES_ADAPTER_H
#define STING_HERMES_ADAPTER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct StingHermesRuntime StingHermesRuntime;

typedef const char *(*StingHermesHostCall)(
    void *user_data,
    const char *operation,
    const char *arg1,
    const char *arg2,
    const char *arg3);

StingHermesRuntime *sting_hermes_runtime_create(void);
void sting_hermes_runtime_destroy(StingHermesRuntime *runtime);

/*
 * Installs one engine-neutral host callback as globalThis.__stingHostCall.
 * The C++ layer performs only JSI <-> C ABI value conversion. Bridge semantics
 * remain owned by the Zig caller.
 */
int sting_hermes_runtime_install_host_call(
    StingHermesRuntime *runtime,
    StingHermesHostCall host_call,
    void *user_data);

int sting_hermes_runtime_run(
    StingHermesRuntime *runtime,
    const uint8_t *source,
    size_t source_length,
    const char *source_url);

const char *sting_hermes_runtime_last_output(const StingHermesRuntime *runtime);
const char *sting_hermes_runtime_last_error(const StingHermesRuntime *runtime);

#ifdef __cplusplus
}
#endif

#endif
