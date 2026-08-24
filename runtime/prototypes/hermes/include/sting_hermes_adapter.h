#ifndef STING_HERMES_ADAPTER_H
#define STING_HERMES_ADAPTER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct StingHermesRuntime StingHermesRuntime;

StingHermesRuntime *sting_hermes_runtime_create(void);
void sting_hermes_runtime_destroy(StingHermesRuntime *runtime);

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
