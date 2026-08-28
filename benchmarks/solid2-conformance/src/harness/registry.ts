import type {
  ConformanceApi,
  MetricRecord,
  ScenarioContext,
  ScenarioDefinition,
  ScenarioModule,
  ScenarioResult,
  ScenarioSummary,
} from './types.js';

const modules = import.meta.glob<ScenarioModule>('../scenarios/*/index.tsx', {
  eager: true,
});

const scenarios = Object.values(modules)
  .map(module => module.scenario)
  .sort((left, right) => left.id.localeCompare(right.id));

const scenariosById = new Map<string, ScenarioDefinition>();
for (const scenario of scenarios) {
  if (scenariosById.has(scenario.id)) {
    throw new Error(`Duplicate Solid 2 conformance scenario id: ${scenario.id}`);
  }
  scenariosById.set(scenario.id, scenario);
}

function createContext(
  assertions: ScenarioResult['assertions'],
  metrics: MetricRecord[],
): ScenarioContext {
  return {
    assert(name, condition, detail) {
      assertions.push({
        name,
        passed: condition,
        ...(detail === undefined ? {} : { detail }),
      });

      if (!condition) {
        throw new Error(detail === undefined ? name : `${name}: ${detail}`);
      }
    },

    metric(name, value, unit) {
      metrics.push({ name, value, unit });
    },

    now() {
      return Date.now();
    },
  };
}

function summarize(scenario: ScenarioDefinition): ScenarioSummary {
  return {
    id: scenario.id,
    title: scenario.title,
    workstream: scenario.workstream,
    kind: scenario.kind,
  };
}

async function runScenario(scenario: ScenarioDefinition): Promise<ScenarioResult> {
  const assertions: ScenarioResult['assertions'] = [];
  const metrics: MetricRecord[] = [];
  const context = createContext(assertions, metrics);

  await scenario.run(context);

  return {
    ...summarize(scenario),
    assertions,
    metrics,
  };
}

export function createConformanceApi(): ConformanceApi {
  return {
    list() {
      return scenarios.map(summarize);
    },

    async run(id) {
      const scenario = scenariosById.get(id);
      if (!scenario) {
        throw new Error(`Unknown Solid 2 conformance scenario: ${id}`);
      }
      return runScenario(scenario);
    },

    async runAll() {
      const results: ScenarioResult[] = [];
      for (const scenario of scenarios) {
        results.push(await runScenario(scenario));
      }
      return results;
    },
  };
}
