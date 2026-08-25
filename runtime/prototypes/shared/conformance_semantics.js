(() => {
  let result = null;
  let runPromise = null;

  function formatError(error) {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }

  globalThis.__stingConformanceProbe = {
    run() {
      if (runPromise) return runPromise;

      runPromise = Promise.resolve()
        .then(async () => {
          const api = globalThis.__stingSolid2Conformance;
          if (!api) throw new Error('Solid 2 conformance API was not installed');

          const listed = api.list();
          if (listed.length === 0) throw new Error('Solid 2 conformance bundle contains no scenarios');

          const scenarios = await api.runAll();
          let assertionCount = 0;
          let metricCount = 0;

          for (const scenario of scenarios) {
            for (const assertion of scenario.assertions) {
              assertionCount += 1;
              if (!assertion.passed) {
                throw new Error(
                  `${scenario.id}: ${assertion.name}${assertion.detail ? `: ${assertion.detail}` : ''}`,
                );
              }
            }
            metricCount += scenario.metrics.length;
          }

          result = {
            done: true,
            error: null,
            scenarioCount: scenarios.length,
            assertionCount,
            metricCount,
          };
        })
        .catch(error => {
          result = {
            done: true,
            error: formatError(error),
            scenarioCount: 0,
            assertionCount: 0,
            metricCount: 0,
          };
        });

      return runPromise;
    },

    assertPassed() {
      if (!result || !result.done) {
        throw new Error('Solid 2 conformance probe did not complete');
      }
      if (result.error) throw new Error(result.error);
      if (result.scenarioCount < 1) throw new Error('Solid 2 conformance probe ran zero scenarios');
      return result;
    },
  };
})();
