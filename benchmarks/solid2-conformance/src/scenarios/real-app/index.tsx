import {
  createMemo,
  createRoot,
  createSignal,
  createStore,
  flush,
} from 'solid-js';
import {
  installNativeBridge,
  resetNativeBridgeForTests,
  type StingHost,
} from '@stingjs/core';
import { render } from '@stingjs/solid';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';
import { RealAppProbeBridge, type NativeMutationCounts } from './probe.js';
import {
  APP_RECORD_COUNT,
  LARGE_RECORD_COUNT,
  SEARCH_QUERY,
  RealContactsApp,
  makeContacts,
  type FilterMode,
  type RealAppControls,
  type SortMode,
} from './workload.js';

const SYNC_SAMPLES = 8;
const STRUCTURAL_SAMPLES = 5;
const ASYNC_SAMPLES = 5;
const ACTION_SAMPLES = 4;
const ROLLBACK_SAMPLES = 3;
const SELECT_TARGET = 422;

export const realAppScenarioControls = Object.freeze({
  appRecordCount: APP_RECORD_COUNT,
  largeRecordCount: LARGE_RECORD_COUNT,
  syncSamples: SYNC_SAMPLES,
  structuralSamples: STRUCTURAL_SAMPLES,
  asyncSamples: ASYNC_SAMPLES,
  actionSamples: ACTION_SAMPLES,
  rollbackSamples: ROLLBACK_SAMPLES,
  selectTarget: SELECT_TARGET,
  searchQuery: SEARCH_QUERY,
});

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function recordDistribution(context: ScenarioContext, prefix: string, samples: readonly number[]): void {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  context.metric(`${prefix}.samples`, samples.length, 'count');
  context.metric(`${prefix}.min`, sorted[0] ?? 0, 'ms');
  context.metric(`${prefix}.mean`, samples.length === 0 ? 0 : total / samples.length, 'ms');
  context.metric(`${prefix}.p50`, percentile(sorted, 0.5), 'ms');
  context.metric(`${prefix}.p95`, percentile(sorted, 0.95), 'ms');
  context.metric(`${prefix}.p99`, percentile(sorted, 0.99), 'ms');
  context.metric(`${prefix}.max`, sorted[sorted.length - 1] ?? 0, 'ms');
}

function recordMutationMetrics(
  context: ScenarioContext,
  prefix: string,
  counts: NativeMutationCounts,
): void {
  context.metric(`${prefix}.native.create-element`, counts.createElement, 'count');
  context.metric(`${prefix}.native.create-text`, counts.createTextNode, 'count');
  context.metric(`${prefix}.native.replace-text`, counts.replaceText, 'count');
  context.metric(`${prefix}.native.set-property`, counts.setProperty, 'count');
  context.metric(`${prefix}.native.insert`, counts.insertNode, 'count');
  context.metric(`${prefix}.native.remove`, counts.removeNode, 'count');
  context.metric(`${prefix}.native.event-enable`, counts.eventEnable, 'count');
  context.metric(`${prefix}.native.event-disable`, counts.eventDisable, 'count');
  context.metric(`${prefix}.native.module-call`, counts.moduleCalls, 'count');
  context.metric(
    `${prefix}.native.total`,
    counts.createElement +
      counts.createTextNode +
      counts.replaceText +
      counts.setProperty +
      counts.insertNode +
      counts.removeNode +
      counts.eventEnable +
      counts.eventDisable +
      counts.moduleCalls,
    'count',
  );
}

function assertNoHotStructuralReplay(
  context: ScenarioContext,
  name: string,
  counts: NativeMutationCounts,
): void {
  const clean =
    counts.createElement === 0 &&
    counts.createTextNode === 0 &&
    counts.setProperty === 0 &&
    counts.insertNode === 0 &&
    counts.removeNode === 0 &&
    counts.eventEnable === 0 &&
    counts.eventDisable === 0;
  context.assert(name, clean, JSON.stringify(counts));
}

function press(host: StingHost, bridge: RealAppProbeBridge, label: string): number {
  const id = bridge.requireConnectedByLabel(label);
  host.dispatchEvent(id, 'press');
  flush();
  return id;
}

function measureSync(context: ScenarioContext, run: () => void): number {
  const start = context.now();
  run();
  flush();
  return context.now() - start;
}

async function settleAsync(): Promise<void> {
  for (let pass = 0; pass < 6; pass += 1) await Promise.resolve();
  flush();
  for (let pass = 0; pass < 6; pass += 1) await Promise.resolve();
  flush();
}

async function measureAsync(context: ScenarioContext, run: () => void | Promise<void>): Promise<number> {
  const start = context.now();
  await run();
  await settleAsync();
  return context.now() - start;
}

function connectedRowCount(bridge: RealAppProbeBridge): number {
  return bridge.connectedIdsWithLabelPrefix('record-row-').length;
}

function rowOrder(bridge: RealAppProbeBridge): number[] {
  const listId = bridge.requireConnectedByLabel('records-list');
  return bridge.connectedChildrenWithLabelPrefix(listId, 'record-row-').map(id => {
    const label = bridge.labelForNode(id);
    return Number(label?.slice('record-row-'.length));
  });
}

function assertTreeHealthy(context: ScenarioContext, bridge: RealAppProbeBridge, name: string): void {
  const validation = bridge.validateConnectedTree();
  context.assert(name, validation.valid, validation.detail);
}

function runLargeDatasetComputeBenchmarks(context: ScenarioContext): void {
  const searchSamples: number[] = [];
  const filterSamples: number[] = [];
  const sortSamples: number[] = [];
  let dispose!: () => void;

  createRoot(rootDispose => {
    dispose = rootDispose;
    const [state] = createStore({ records: makeContacts(LARGE_RECORD_COUNT) });
    const [query, setQuery] = createSignal('');
    const [filter, setFilter] = createSignal<FilterMode>('all');
    const [sort, setSort] = createSignal<SortMode>('id-asc');
    const visible = createMemo(() => {
      const normalizedQuery = query().toLowerCase();
      const mode = filter();
      const direction = sort();
      const rows = state.records.filter(record => {
        if (mode === 'active' && record.status !== 'active') return false;
        if (normalizedQuery && !record.name.toLowerCase().includes(normalizedQuery)) return false;
        return true;
      });
      rows.sort((left, right) =>
        direction === 'id-asc' ? left.id - right.id : right.id - left.id,
      );
      return rows;
    });

    flush();
    context.assert('10K store-backed workload starts with all records', visible().length === LARGE_RECORD_COUNT);

    for (let sample = 0; sample < SYNC_SAMPLES; sample += 1) {
      const searching = sample % 2 === 0;
      const start = context.now();
      setQuery(searching ? SEARCH_QUERY : '');
      flush();
      const rows = visible();
      searchSamples.push(context.now() - start);
      context.assert(
        `10K search sample ${sample + 1} has deterministic result count`,
        rows.length === (searching ? 111 : LARGE_RECORD_COUNT),
        `rows=${rows.length}`,
      );
    }

    setQuery('');
    flush();
    for (let sample = 0; sample < SYNC_SAMPLES; sample += 1) {
      const activeOnly = sample % 2 === 0;
      const start = context.now();
      setFilter(activeOnly ? 'active' : 'all');
      flush();
      const rows = visible();
      filterSamples.push(context.now() - start);
      context.assert(
        `10K filter sample ${sample + 1} has deterministic result count`,
        rows.length === (activeOnly ? LARGE_RECORD_COUNT / 2 : LARGE_RECORD_COUNT),
        `rows=${rows.length}`,
      );
    }

    setFilter('all');
    flush();
    for (let sample = 0; sample < SYNC_SAMPLES; sample += 1) {
      const descending = sample % 2 === 0;
      const start = context.now();
      setSort(descending ? 'id-desc' : 'id-asc');
      flush();
      const rows = visible();
      sortSamples.push(context.now() - start);
      context.assert(
        `10K sort sample ${sample + 1} preserves record count`,
        rows.length === LARGE_RECORD_COUNT,
      );
      context.assert(
        `10K sort sample ${sample + 1} has deterministic edge identity`,
        rows[0]?.id === (descending ? LARGE_RECORD_COUNT - 1 : 0),
        `first=${String(rows[0]?.id)}`,
      );
    }
  });

  dispose();
  recordDistribution(context, 'real-app.10k.search', searchSamples);
  recordDistribution(context, 'real-app.10k.filter', filterSamples);
  recordDistribution(context, 'real-app.10k.sort', sortSamples);
}

async function runComposedApp(context: ScenarioContext): Promise<void> {
  const bridge = new RealAppProbeBridge();
  const host = installNativeBridge(bridge);
  let controls!: RealAppControls;
  let dispose!: () => void;

  try {
    const mountStart = context.now();
    dispose = render(
      () => (
        <RealContactsApp
          recordCount={APP_RECORD_COUNT}
          captureControls={nextControls => {
            controls = nextControls;
          }}
        />
      ),
      host.root,
    );
    flush();
    const mountDuration = context.now() - mountStart;

    const initial = controls.snapshot();
    context.assert('real app mounts a 1K store-backed data set', initial.recordCount === APP_RECORD_COUNT);
    context.assert('real app initially renders all 1K rows', initial.visibleCount === APP_RECORD_COUNT);
    context.assert('native list contains exactly 1K connected row identities', connectedRowCount(bridge) === APP_RECORD_COUNT);
    context.assert('context/provider reaches a nested native Text consumer', bridge.textForLabel('context-badge') === 'Context: 1000 records / all / id-asc');
    context.assert('async refresh begins in Loading fallback', bridge.findConnectedByLabel('refresh-loading') !== undefined);
    context.assert('stream begins in Loading fallback', bridge.findConnectedByLabel('stream-loading') !== undefined);
    context.assert('detail component mounts exactly once initially', initial.detailMounts === 1 && initial.detailCleanups === 0);
    assertTreeHealthy(context, bridge, 'cold mount creates a coherent native tree with no ghost nodes');
    recordDistribution(context, 'real-app.cold-mount', [mountDuration]);
    recordMutationMetrics(context, 'real-app.cold-mount', bridge.counts());

    const appRootId = bridge.requireConnectedByLabel('real-app-root');
    const row99Initial = bridge.requireConnectedByLabel('record-row-99');

    bridge.clearOperations();
    controls.resolveRefresh('snapshot-0');
    await settleAsync();
    context.assert('initial async load resolves into ready state', bridge.textForLabel('refresh-value') === 'Refresh: snapshot-0');
    context.assert('initial async load settles pending state', bridge.textForLabel('refresh-pending') === 'Pending: no');

    const selectSamples: number[] = [];
    bridge.clearOperations();
    const detailIdBeforeSelect = bridge.requireConnectedByLabel('detail-panel');
    const selectDuration = measureSync(context, () => {
      press(host, bridge, `select-${SELECT_TARGET}`);
    });
    selectSamples.push(selectDuration);
    const selected = controls.snapshot();
    context.assert('native row button selects the expected record', selected.selectedId === SELECT_TARGET);
    context.assert('selection synchronizes the edit draft to the selected record', selected.draftName === `Contact ${SELECT_TARGET}`);
    context.assert('selection preserves detail component native identity', bridge.requireConnectedByLabel('detail-panel') === detailIdBeforeSelect);
    context.assert('selection preserves unrelated row native identity', bridge.requireConnectedByLabel('record-row-99') === row99Initial);
    const selectCounts = bridge.counts();
    assertNoHotStructuralReplay(context, 'selection performs no unrelated native structural/property/event replay', selectCounts);
    context.assert('selection emits exactly four dependent native text replacements', selectCounts.replaceText === 4, JSON.stringify(selectCounts));
    recordMutationMetrics(context, 'real-app.select', selectCounts);

    for (let sample = 0; sample < SYNC_SAMPLES - 1; sample += 1) {
      const id = 22 + sample * 100;
      bridge.clearOperations();
      selectSamples.push(measureSync(context, () => press(host, bridge, `select-${id}`)));
    }
    recordDistribution(context, 'real-app.select', selectSamples);

    const editSamples: number[] = [];
    bridge.clearOperations();
    const editBefore = controls.snapshot();
    editSamples.push(measureSync(context, () => press(host, bridge, 'edit-draft')));
    const editAfter = controls.snapshot();
    context.assert('native edit button advances form-like edit revision', editAfter.editRevision === editBefore.editRevision + 1);
    context.assert('form-like edit changes only draft state', editAfter.draftName !== editBefore.draftName && editAfter.selectedName === editBefore.selectedName);
    const editCounts = bridge.counts();
    assertNoHotStructuralReplay(context, 'form-like edit performs no structural/property/event replay', editCounts);
    context.assert('form-like edit emits exactly one native text replacement', editCounts.replaceText === 1, JSON.stringify(editCounts));
    recordMutationMetrics(context, 'real-app.edit', editCounts);
    for (let sample = 0; sample < SYNC_SAMPLES - 1; sample += 1) {
      bridge.clearOperations();
      editSamples.push(measureSync(context, () => press(host, bridge, 'edit-draft')));
    }
    recordDistribution(context, 'real-app.edit', editSamples);

    const searchSamples: number[] = [];
    const clearSearchSamples: number[] = [];
    const retainedSearchRow = bridge.requireConnectedByLabel('record-row-99');
    const filteredSearchRow = bridge.requireConnectedByLabel('record-row-42');
    bridge.clearOperations();
    searchSamples.push(measureSync(context, () => press(host, bridge, 'search-toggle')));
    const searched = controls.snapshot();
    context.assert('seeded search produces the deterministic 11-row result', searched.search === SEARCH_QUERY && searched.visibleCount === 11, JSON.stringify(searched));
    context.assert('native list contains exactly 11 searched row identities', connectedRowCount(bridge) === 11);
    context.assert('search preserves retained keyed row identity', bridge.requireConnectedByLabel('record-row-99') === retainedSearchRow);
    context.assert('search detaches filtered-out row identity', !bridge.isConnected(filteredSearchRow));
    const searchCounts = bridge.counts();
    context.assert('search does not create replacement nodes for retained rows', searchCounts.createElement === 0 && searchCounts.createTextNode === 0, JSON.stringify(searchCounts));
    context.assert('search removes exactly 989 keyed row roots', searchCounts.removeNode === 989, JSON.stringify(searchCounts));
    recordMutationMetrics(context, 'real-app.search', searchCounts);

    bridge.clearOperations();
    clearSearchSamples.push(measureSync(context, () => press(host, bridge, 'search-toggle')));
    context.assert('clearing search restores all 1K records', controls.snapshot().visibleCount === APP_RECORD_COUNT);
    context.assert('clearing search preserves identity for the row retained through filtering', bridge.requireConnectedByLabel('record-row-99') === retainedSearchRow);
    context.assert('clearing search recreates a row that was disposed by filtering', bridge.requireConnectedByLabel('record-row-42') !== filteredSearchRow);
    assertTreeHealthy(context, bridge, 'clear search leaves no duplicate or ghost native rows');
    recordMutationMetrics(context, 'real-app.clear-search', bridge.counts());

    for (let sample = 0; sample < STRUCTURAL_SAMPLES - 1; sample += 1) {
      bridge.clearOperations();
      searchSamples.push(measureSync(context, () => press(host, bridge, 'search-toggle')));
      bridge.clearOperations();
      clearSearchSamples.push(measureSync(context, () => press(host, bridge, 'search-toggle')));
    }
    recordDistribution(context, 'real-app.search', searchSamples);
    recordDistribution(context, 'real-app.clear-search', clearSearchSamples);

    const filterSamples: number[] = [];
    const clearFilterSamples: number[] = [];
    const evenRow = bridge.requireConnectedByLabel('record-row-100');
    const oddRow = bridge.requireConnectedByLabel('record-row-101');
    bridge.clearOperations();
    filterSamples.push(measureSync(context, () => press(host, bridge, 'filter-toggle')));
    context.assert('active filter shows exactly half of the deterministic data set', controls.snapshot().visibleCount === 500);
    context.assert('active filter preserves retained even-row identity', bridge.requireConnectedByLabel('record-row-100') === evenRow);
    context.assert('active filter detaches paused odd-row identity', !bridge.isConnected(oddRow));
    const filterCounts = bridge.counts();
    context.assert('active filter removes exactly 500 keyed row roots', filterCounts.removeNode === 500, JSON.stringify(filterCounts));
    recordMutationMetrics(context, 'real-app.filter', filterCounts);

    bridge.clearOperations();
    clearFilterSamples.push(measureSync(context, () => press(host, bridge, 'filter-toggle')));
    context.assert('clearing filter restores exactly 1K rows', controls.snapshot().visibleCount === APP_RECORD_COUNT);
    context.assert('clearing filter preserves continuously retained row identity', bridge.requireConnectedByLabel('record-row-100') === evenRow);
    context.assert('clearing filter recreates the disposed paused row', bridge.requireConnectedByLabel('record-row-101') !== oddRow);
    recordMutationMetrics(context, 'real-app.clear-filter', bridge.counts());

    for (let sample = 0; sample < STRUCTURAL_SAMPLES - 1; sample += 1) {
      bridge.clearOperations();
      filterSamples.push(measureSync(context, () => press(host, bridge, 'filter-toggle')));
      bridge.clearOperations();
      clearFilterSamples.push(measureSync(context, () => press(host, bridge, 'filter-toggle')));
    }
    recordDistribution(context, 'real-app.filter', filterSamples);
    recordDistribution(context, 'real-app.clear-filter', clearFilterSamples);

    const sortSamples: number[] = [];
    const row0BeforeSort = bridge.requireConnectedByLabel('record-row-0');
    const row999BeforeSort = bridge.requireConnectedByLabel('record-row-999');
    bridge.clearOperations();
    sortSamples.push(measureSync(context, () => press(host, bridge, 'sort-toggle')));
    const sorted = controls.snapshot();
    context.assert('sort toggles to descending without changing list cardinality', sorted.sort === 'id-desc' && sorted.visibleCount === APP_RECORD_COUNT);
    context.assert('descending sort exposes deterministic first/last record ids', sorted.firstVisibleId === 999 && sorted.lastVisibleId === 0, JSON.stringify(sorted));
    context.assert('sort preserves first-row native identity', bridge.requireConnectedByLabel('record-row-0') === row0BeforeSort);
    context.assert('sort preserves last-row native identity', bridge.requireConnectedByLabel('record-row-999') === row999BeforeSort);
    const orderedIds = rowOrder(bridge);
    context.assert('native child order matches sorted Solid list order', orderedIds[0] === 999 && orderedIds[orderedIds.length - 1] === 0, `first=${String(orderedIds[0])}, last=${String(orderedIds[orderedIds.length - 1])}`);
    const sortCounts = bridge.counts();
    context.assert('keyed sort creates/removes no native rows', sortCounts.createElement === 0 && sortCounts.createTextNode === 0 && sortCounts.removeNode === 0, JSON.stringify(sortCounts));
    context.assert('keyed sort reorders existing native rows through insert moves', sortCounts.insertNode > 0, JSON.stringify(sortCounts));
    recordMutationMetrics(context, 'real-app.sort', sortCounts);
    for (let sample = 0; sample < SYNC_SAMPLES - 1; sample += 1) {
      bridge.clearOperations();
      sortSamples.push(measureSync(context, () => press(host, bridge, 'sort-toggle')));
    }
    recordDistribution(context, 'real-app.sort', sortSamples);

    bridge.clearOperations();
    const hapticBefore = controls.snapshot().hapticCount;
    const hapticDuration = measureSync(context, () => press(host, bridge, 'haptic-button'));
    const hapticCounts = bridge.counts();
    context.assert('native button invokes one Haptics module call', hapticCounts.moduleCalls === 1 && controls.snapshot().hapticCount === hapticBefore + 1, JSON.stringify(hapticCounts));
    context.assert('Haptics call uses the expected module/method/argument', bridge.moduleCalls[0]?.module === 'Haptics' && bridge.moduleCalls[0]?.method === 'impact' && bridge.moduleCalls[0]?.argsJSON === '["medium"]', JSON.stringify(bridge.moduleCalls));
    context.assert('native module phase mutates only its dependent text node', hapticCounts.replaceText === 1 && hapticCounts.createElement === 0 && hapticCounts.removeNode === 0, JSON.stringify(hapticCounts));
    recordDistribution(context, 'real-app.native-module', [hapticDuration]);
    recordMutationMetrics(context, 'real-app.native-module', hapticCounts);

    const refreshSamples: number[] = [];
    const refreshReadyId = bridge.requireConnectedByLabel('refresh-ready');
    bridge.clearOperations();
    refreshSamples.push(
      await measureAsync(context, async () => {
        press(host, bridge, 'refresh-button');
        context.assert('refresh enters pending state while retaining stale value', bridge.textForLabel('refresh-pending') === 'Pending: yes' && bridge.textForLabel('refresh-value') === 'Refresh: snapshot-0');
        controls.resolveRefresh('snapshot-1');
      }),
    );
    context.assert('refresh settles the new async value', bridge.textForLabel('refresh-value') === 'Refresh: snapshot-1');
    context.assert('refresh reuses the ready native subtree across stale refresh', bridge.requireConnectedByLabel('refresh-ready') === refreshReadyId);
    const refreshCounts = bridge.counts();
    assertNoHotStructuralReplay(context, 'stale async refresh performs no structural/property/event replay', refreshCounts);
    context.assert('stale async refresh changes only pending/value native text', refreshCounts.replaceText >= 2 && refreshCounts.replaceText <= 3, JSON.stringify(refreshCounts));
    recordMutationMetrics(context, 'real-app.async-refresh', refreshCounts);

    for (let sample = 0; sample < ASYNC_SAMPLES - 1; sample += 1) {
      bridge.clearOperations();
      refreshSamples.push(
        await measureAsync(context, async () => {
          press(host, bridge, 'refresh-button');
          controls.resolveRefresh(`snapshot-${sample + 2}`);
        }),
      );
    }
    recordDistribution(context, 'real-app.async-refresh', refreshSamples);

    bridge.clearOperations();
    press(host, bridge, 'refresh-button');
    controls.rejectRefresh('offline');
    await settleAsync();
    context.assert('failed async refresh enters Errored fallback', bridge.textForLabel('refresh-error')?.includes('offline') === true);
    context.assert('failed async refresh removes the previously ready subtree', !bridge.isConnected(refreshReadyId));
    const retryButtonId = bridge.requireConnectedByLabel('refresh-retry');
    const beforeRetry = controls.snapshot();
    press(host, bridge, 'refresh-retry');
    context.assert(
      'Errored retry keeps its fallback mounted while the replacement async value is pending',
      bridge.requireConnectedByLabel('refresh-retry') === retryButtonId,
    );
    controls.resolveRefresh('recovered');
    await settleAsync();
    const afterRecovery = controls.snapshot();
    context.assert('Errored retry recovers to ready async content', bridge.textForLabel('refresh-value') === 'Refresh: recovered');
    context.assert(
      'retry and refresh generations commit exactly once when the retry transition settles',
      afterRecovery.retryCount === beforeRetry.retryCount + 1 &&
        afterRecovery.refreshGeneration === beforeRetry.refreshGeneration + 1,
      JSON.stringify(afterRecovery),
    );
    const recoveredReadyId = bridge.requireConnectedByLabel('refresh-ready');
    context.assert(
      'error recovery leaves exactly one connected ready subtree',
      bridge.connectedIdsWithLabelPrefix('refresh-ready').length === 1 && bridge.isConnected(recoveredReadyId),
      `readyId=${recoveredReadyId}`,
    );
    const retryGeneration = afterRecovery.refreshGeneration;
    host.dispatchEvent(retryButtonId, 'press');
    flush();
    context.assert(
      'disposed retry button cannot fire after successful recovery',
      controls.snapshot().refreshGeneration === retryGeneration,
    );
    assertTreeHealthy(context, bridge, 'error/retry recovery leaves no ghost native subtree');
    recordMutationMetrics(context, 'real-app.error-retry', bridge.counts());

    const streamTarget = controls.snapshot().selectedId;
    bridge.clearOperations();
    controls.pushStreamPatch({ id: streamTarget, name: `Streamed ${streamTarget} v1` });
    await settleAsync();
    context.assert('first AsyncIterable yield replaces stream Loading fallback', bridge.textForLabel('stream-value') === `Stream: ${streamTarget} / Streamed ${streamTarget} v1`);
    context.assert('first stream patch updates the backing store', controls.snapshot().selectedName === `Streamed ${streamTarget} v1`);

    const streamSamples: number[] = [];
    const rowIdBeforeStream = bridge.requireConnectedByLabel(`record-row-${streamTarget}`);
    bridge.clearOperations();
    streamSamples.push(
      await measureAsync(context, async () => {
        controls.pushStreamPatch({ id: streamTarget, name: `Streamed ${streamTarget} v2` });
      }),
    );
    context.assert('subsequent stream yield updates the backing record', controls.snapshot().selectedName === `Streamed ${streamTarget} v2`);
    context.assert('stream update preserves keyed row identity', bridge.requireConnectedByLabel(`record-row-${streamTarget}`) === rowIdBeforeStream);
    const streamCounts = bridge.counts();
    assertNoHotStructuralReplay(context, 'hot stream update performs no structural/property/event replay', streamCounts);
    context.assert('hot stream update mutates exactly row/detail/effective/stream text nodes', streamCounts.replaceText === 4, JSON.stringify(streamCounts));
    recordMutationMetrics(context, 'real-app.stream-update', streamCounts);
    for (let sample = 0; sample < SYNC_SAMPLES - 1; sample += 1) {
      bridge.clearOperations();
      streamSamples.push(
        await measureAsync(context, async () => {
          controls.pushStreamPatch({ id: streamTarget, name: `Streamed ${streamTarget} v${sample + 3}` });
        }),
      );
    }
    recordDistribution(context, 'real-app.stream-update', streamSamples);

    press(host, bridge, 'edit-draft');
    const optimisticSamples: number[] = [];
    bridge.clearOperations();
    const storeBeforeOptimistic = controls.snapshot().selectedName;
    const optimisticDraft = controls.snapshot().draftName;
    const optimisticStart = context.now();
    press(host, bridge, 'save-draft');
    const whileOptimistic = controls.snapshot();
    context.assert('action applies optimistic draft immediately from native save event', whileOptimistic.optimisticName === optimisticDraft && whileOptimistic.effectiveName === optimisticDraft && whileOptimistic.saveState === 'saving', JSON.stringify(whileOptimistic));
    context.assert('optimistic save does not commit backing store before async boundary resolves', whileOptimistic.selectedName === storeBeforeOptimistic);
    const optimisticStartCounts = bridge.counts();
    assertNoHotStructuralReplay(context, 'optimistic apply performs no structural/property/event replay', optimisticStartCounts);
    controls.resolveSave(`${optimisticDraft} / server`);
    await settleAsync();
    optimisticSamples.push(context.now() - optimisticStart);
    const saved = controls.snapshot();
    context.assert('successful action commits canonical server value', saved.selectedName === `${optimisticDraft} / server` && saved.draftName === `${optimisticDraft} / server`);
    context.assert('successful action clears optimistic overlay after commit', saved.optimisticName === null && saved.effectiveName === saved.selectedName && saved.saveState === 'saved');
    context.assert('optimistic save preserves keyed row native identity', bridge.requireConnectedByLabel(`record-row-${streamTarget}`) === rowIdBeforeStream);
    assertNoHotStructuralReplay(context, 'optimistic save settlement performs no structural/property/event replay', bridge.counts());
    recordMutationMetrics(context, 'real-app.optimistic-save', bridge.counts());

    for (let sample = 0; sample < ACTION_SAMPLES - 1; sample += 1) {
      controls.setDraftForBenchmark(`Optimistic benchmark ${sample}`);
      flush();
      bridge.clearOperations();
      optimisticSamples.push(
        await measureAsync(context, async () => {
          press(host, bridge, 'save-draft');
          controls.resolveSave(`Optimistic benchmark ${sample} / server`);
        }),
      );
    }
    recordDistribution(context, 'real-app.optimistic-save', optimisticSamples);

    const rollbackSamples: number[] = [];
    const committedBeforeRollback = controls.snapshot().selectedName;
    controls.setDraftForBenchmark('Rejected optimistic edit');
    flush();
    bridge.clearOperations();
    const rollbackStart = context.now();
    press(host, bridge, 'save-draft');
    context.assert('failing action still exposes optimistic value before rejection', controls.snapshot().effectiveName === 'Rejected optimistic edit');
    controls.rejectSave('conflict');
    await settleAsync();
    rollbackSamples.push(context.now() - rollbackStart);
    const rolledBack = controls.snapshot();
    context.assert('failed action rolls optimistic state back to committed record', rolledBack.selectedName === committedBeforeRollback && rolledBack.optimisticName === null && rolledBack.effectiveName === committedBeforeRollback, JSON.stringify(rolledBack));
    context.assert('failed action surfaces deterministic error state', rolledBack.saveState === 'error' && rolledBack.saveError.includes('conflict'), JSON.stringify(rolledBack));
    assertNoHotStructuralReplay(context, 'optimistic rollback performs no structural/property/event replay', bridge.counts());
    recordMutationMetrics(context, 'real-app.optimistic-rollback', bridge.counts());

    for (let sample = 0; sample < ROLLBACK_SAMPLES - 1; sample += 1) {
      controls.setDraftForBenchmark(`Rejected ${sample}`);
      flush();
      bridge.clearOperations();
      rollbackSamples.push(
        await measureAsync(context, async () => {
          press(host, bridge, 'save-draft');
          controls.rejectSave(`conflict-${sample}`);
        }),
      );
    }
    recordDistribution(context, 'real-app.optimistic-rollback', rollbackSamples);

    const lifecycleSamples: number[] = [];
    const detailId = bridge.requireConnectedByLabel('detail-panel');
    const staleEditButtonId = bridge.requireConnectedByLabel('edit-draft');
    const row100BeforeDetailUnmount = bridge.requireConnectedByLabel('record-row-100');
    const lifecycleBefore = controls.snapshot();
    bridge.clearOperations();
    lifecycleSamples.push(measureSync(context, () => press(host, bridge, 'detail-toggle')));
    const hidden = controls.snapshot();
    context.assert('conditional detail unmount runs cleanup exactly once', !hidden.detailVisible && hidden.detailCleanups === lifecycleBefore.detailCleanups + 1, JSON.stringify(hidden));
    context.assert('conditional detail unmount disconnects prior native detail identity', !bridge.isConnected(detailId));
    context.assert('conditional detail unmount preserves unrelated list row identity', bridge.requireConnectedByLabel('record-row-100') === row100BeforeDetailUnmount);
    const editRevisionBeforeStaleDispatch = hidden.editRevision;
    host.dispatchEvent(staleEditButtonId, 'press');
    flush();
    context.assert('unmounted edit button cannot trigger a stale callback', controls.snapshot().editRevision === editRevisionBeforeStaleDispatch);

    bridge.clearOperations();
    lifecycleSamples.push(measureSync(context, () => press(host, bridge, 'detail-toggle')));
    const remounted = controls.snapshot();
    context.assert('conditional detail remount creates exactly one new component instance', remounted.detailVisible && remounted.detailMounts === lifecycleBefore.detailMounts + 1, JSON.stringify(remounted));
    context.assert('conditional detail remount uses fresh native identity', bridge.requireConnectedByLabel('detail-panel') !== detailId);
    context.assert('detail remount still preserves unrelated list identity', bridge.requireConnectedByLabel('record-row-100') === row100BeforeDetailUnmount);
    assertTreeHealthy(context, bridge, 'detail unmount/remount leaves no ghost nodes');
    recordMutationMetrics(context, 'real-app.detail-remount', bridge.counts());

    for (let sample = 0; sample < STRUCTURAL_SAMPLES - 1; sample += 1) {
      bridge.clearOperations();
      lifecycleSamples.push(measureSync(context, () => press(host, bridge, 'detail-toggle')));
      bridge.clearOperations();
      lifecycleSamples.push(measureSync(context, () => press(host, bridge, 'detail-toggle')));
    }
    recordDistribution(context, 'real-app.detail-toggle', lifecycleSamples);

    const staleHapticButtonId = bridge.requireConnectedByLabel('haptic-button');
    const hapticCountBeforeDispose = controls.snapshot().hapticCount;
    const fullUnmountStart = context.now();
    dispose();
    flush();
    const fullUnmountDuration = context.now() - fullUnmountStart;
    context.assert('full app unmount disconnects the entire native root', host.root.children.length === 0);
    context.assert('full app unmount disconnects former app root identity', !bridge.isConnected(appRootId));
    bridge.clearOperations();
    host.dispatchEvent(staleHapticButtonId, 'press');
    flush();
    context.assert('full app unmount prevents stale native button callbacks', controls.snapshot().hapticCount === hapticCountBeforeDispose && bridge.moduleCalls.length === 0);
    controls.pushStreamPatch({ id: streamTarget, name: 'post-dispose stream ghost' });
    await settleAsync();
    context.assert('full app unmount prevents late stream yield native mutations', bridge.operations.length === 0);
    recordDistribution(context, 'real-app.full-unmount', [fullUnmountDuration]);

    bridge.clearOperations();
    let remountControls!: RealAppControls;
    const fullRemountStart = context.now();
    const disposeRemount = render(
      () => (
        <RealContactsApp
          recordCount={APP_RECORD_COUNT}
          captureControls={nextControls => {
            remountControls = nextControls;
          }}
        />
      ),
      host.root,
    );
    flush();
    const fullRemountDuration = context.now() - fullRemountStart;
    context.assert('full app remount restores exactly 1K records', remountControls.snapshot().visibleCount === APP_RECORD_COUNT && connectedRowCount(bridge) === APP_RECORD_COUNT);
    context.assert('full app remount uses fresh root native identity', bridge.requireConnectedByLabel('real-app-root') !== appRootId);
    assertTreeHealthy(context, bridge, 'full app remount creates one coherent native tree');
    recordDistribution(context, 'real-app.full-remount', [fullRemountDuration]);
    recordMutationMetrics(context, 'real-app.full-remount', bridge.counts());
    disposeRemount();
    flush();
    context.assert('remounted app also disposes cleanly', host.root.children.length === 0);
  } finally {
    if (host.root.children.length > 0 && dispose) {
      dispose();
      flush();
    }
    resetNativeBridgeForTests();
  }
}

export const scenario: ScenarioDefinition = {
  id: 'real-app.contacts-workload',
  title: 'Realistic 1K contacts app with async, streaming, optimistic actions, and native identity',
  workstream: 'real-app',
  kind: 'hybrid',
  async run(context) {
    await runComposedApp(context);
    runLargeDatasetComputeBenchmarks(context);
  },
};