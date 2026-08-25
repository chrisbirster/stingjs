export type Workstream =
  | 'reactivity'
  | 'lifecycle'
  | 'control-flow'
  | 'lists'
  | 'stores'
  | 'async-stress'
  | 'reveal'
  | 'actions'
  | 'renderer'
  | 'real-app';

export type ScenarioKind = 'conformance' | 'benchmark' | 'hybrid';

export interface AssertionRecord {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface MetricRecord {
  name: string;
  value: number;
  unit: string;
}

export interface ScenarioResult {
  id: string;
  title: string;
  workstream: Workstream;
  kind: ScenarioKind;
  assertions: AssertionRecord[];
  metrics: MetricRecord[];
}

export interface ScenarioContext {
  assert(name: string, condition: boolean, detail?: string): void;
  metric(name: string, value: number, unit: string): void;
  now(): number;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  workstream: Workstream;
  kind: ScenarioKind;
  run(context: ScenarioContext): void | Promise<void>;
}

export interface ScenarioModule {
  scenario: ScenarioDefinition;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  workstream: Workstream;
  kind: ScenarioKind;
}

export interface ConformanceApi {
  list(): ScenarioSummary[];
  run(id: string): Promise<ScenarioResult>;
  runAll(): Promise<ScenarioResult[]>;
}
