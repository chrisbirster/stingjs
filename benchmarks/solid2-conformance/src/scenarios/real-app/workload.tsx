import {
  action,
  createContext,
  createEffect,
  createMemo,
  createOptimistic,
  createSignal,
  createStore,
  Errored,
  For,
  isPending,
  Loading,
  Match,
  onCleanup,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import { getHost } from '@stingjs/core';
import { Button, Text, View } from '@stingjs/native';

export const APP_RECORD_COUNT = 1_000;
export const LARGE_RECORD_COUNT = 10_000;
export const SEARCH_QUERY = 'Contact 99';

export type ContactStatus = 'active' | 'paused';
export type FilterMode = 'all' | 'active';
export type SortMode = 'id-asc' | 'id-desc';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ContactRecord {
  id: number;
  name: string;
  status: ContactStatus;
  priority: number;
  group: string;
  note: string;
}

export interface StreamPatch {
  id: number;
  name: string;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

export interface RealAppSnapshot {
  readonly recordCount: number;
  readonly visibleCount: number;
  readonly firstVisibleId: number | null;
  readonly lastVisibleId: number | null;
  readonly search: string;
  readonly filter: FilterMode;
  readonly sort: SortMode;
  readonly selectedId: number;
  readonly selectedName: string;
  readonly draftName: string;
  readonly editRevision: number;
  readonly detailVisible: boolean;
  readonly detailMounts: number;
  readonly detailCleanups: number;
  readonly refreshGeneration: number;
  readonly retryCount: number;
  readonly saveState: SaveState;
  readonly saveError: string;
  readonly optimisticName: string | null;
  readonly effectiveName: string;
  readonly hapticCount: number;
}

export interface RealAppControls {
  snapshot(): RealAppSnapshot;
  beginRefresh(): void;
  resolveRefresh(value: string): void;
  rejectRefresh(message: string): void;
  pushStreamPatch(patch: StreamPatch): void;
  resolveSave(canonicalName: string): void;
  rejectSave(message: string): void;
  setDraftForBenchmark(value: string): void;
}

export interface RealAppProps {
  readonly recordCount: number;
  captureControls(controls: RealAppControls): void;
}

class ControlledStream<T> implements AsyncIterable<T> {
  private readonly queuedValues: T[] = [];
  private readonly waiters: Array<(value: T) => void> = [];

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(value);
      return;
    }
    this.queuedValues.push(value);
  }

  private nextValue(): Promise<T> {
    const queuedValue = this.queuedValues.shift();
    if (queuedValue !== undefined) return Promise.resolve(queuedValue);
    return new Promise<T>(resolve => {
      this.waiters.push(resolve);
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.nextValue().then(value => ({ value, done: false as const })),
    };
  }
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

export function makeContact(id: number): ContactRecord {
  return {
    id,
    name: `Contact ${id}`,
    status: id % 2 === 0 ? 'active' : 'paused',
    priority: id % 5,
    group: `group-${id % 13}`,
    note: `Deterministic note ${id % 37}`,
  };
}

export function makeContacts(count: number): ContactRecord[] {
  return Array.from({ length: count }, (_, id) => makeContact(id));
}

interface AppModel {
  readonly state: { readonly records: readonly ContactRecord[] };
  readonly search: () => string;
  readonly filter: () => FilterMode;
  readonly sort: () => SortMode;
  readonly selectedId: () => number;
  readonly selectedRecord: () => ContactRecord | undefined;
  readonly visibleRecords: () => readonly ContactRecord[];
  readonly draftName: () => string;
  readonly editRevision: () => number;
  readonly detailVisible: () => boolean;
  readonly saveState: () => SaveState;
  readonly saveError: () => string;
  readonly optimisticName: () => string | null;
  readonly effectiveName: () => string;
  readonly hapticCount: () => number;
  readonly refreshGeneration: () => number;
  readonly retryCount: () => number;
  readonly stream: AsyncIterable<StreamPatch>;
  selectRecord(id: number): void;
  toggleSearch(): void;
  toggleFilter(): void;
  toggleSort(): void;
  editDraft(): void;
  toggleDetail(): void;
  beginRefresh(): void;
  readRefreshPromise(): Promise<string>;
  retryRefresh(reset: () => void): void;
  saveDraft(): void;
  callHaptics(): void;
  applyStreamPatch(patch: StreamPatch): void;
}

const RealAppContext = createContext<AppModel>();

function useRealApp(): AppModel {
  return useContext(RealAppContext);
}

function ContextBadge() {
  const app = useRealApp();
  return (
    <Text accessibilityLabel="context-badge">
      {() => `Context: ${app.state.records.length} records / ${app.filter()} / ${app.sort()}`}
    </Text>
  );
}

function ContactRow(props: { readonly record: ContactRecord }) {
  const app = useRealApp();
  return (
    <View accessibilityLabel={`record-row-${props.record.id}`}>
      <Text accessibilityLabel={`record-name-${props.record.id}`}>{() => props.record.name}</Text>
      <Button accessibilityLabel={`select-${props.record.id}`} onPress={() => app.selectRecord(props.record.id)}>
        Select
      </Button>
    </View>
  );
}

function ContactList() {
  const app = useRealApp();
  return (
    <View accessibilityLabel="records-list">
      <For each={app.visibleRecords()}>{record => <ContactRow record={record} />}</For>
    </View>
  );
}

function DetailPanel(props: { onMount(): void; onCleanupRun(): void }) {
  const app = useRealApp();
  props.onMount();
  onCleanup(props.onCleanupRun);

  return (
    <View accessibilityLabel="detail-panel">
      <Text accessibilityLabel="detail-selected-id">{() => `Selected: ${app.selectedId()}`}</Text>
      <Text accessibilityLabel="detail-record-name">{() => `Stored: ${app.selectedRecord()?.name ?? 'missing'}`}</Text>
      <Text accessibilityLabel="detail-draft">{() => `Draft: ${app.draftName()}`}</Text>
      <Text accessibilityLabel="detail-effective-name">{() => `Visible: ${app.effectiveName()}`}</Text>
      <Text accessibilityLabel="detail-save-state">{() => `Save: ${app.saveState()}${app.saveError() ? ` / ${app.saveError()}` : ''}`}</Text>

      <Switch fallback={<Text accessibilityLabel="detail-status">Status: unknown</Text>}>
        <Match when={app.selectedRecord()?.status === 'active'}>
          <Show when={(app.selectedRecord()?.priority ?? 0) >= 3} fallback={<Text accessibilityLabel="detail-status">Status: active / standard</Text>}>
            <Text accessibilityLabel="detail-status">Status: active / priority</Text>
          </Show>
        </Match>
        <Match when={app.selectedRecord()?.status === 'paused'}>
          <Text accessibilityLabel="detail-status">Status: paused</Text>
        </Match>
      </Switch>

      <Button accessibilityLabel="edit-draft" onPress={() => app.editDraft()}>Edit draft</Button>
      <Button accessibilityLabel="save-draft" onPress={() => app.saveDraft()}>Save draft</Button>
    </View>
  );
}

function RefreshContent() {
  const app = useRealApp();
  const value = createMemo<string>(() => {
    app.refreshGeneration();
    return app.readRefreshPromise();
  });

  return (
    <Loading fallback={<Text accessibilityLabel="refresh-loading">Refresh: loading</Text>}>
      <View accessibilityLabel="refresh-ready">
        <Text accessibilityLabel="refresh-value">{() => `Refresh: ${value()}`}</Text>
        <Text accessibilityLabel="refresh-pending">{() => `Pending: ${isPending(() => value()) ? 'yes' : 'no'}`}</Text>
      </View>
    </Loading>
  );
}

function RefreshPanel() {
  const app = useRealApp();
  return (
    <View accessibilityLabel="refresh-panel">
      <Button accessibilityLabel="refresh-button" onPress={() => app.beginRefresh()}>Refresh</Button>
      <Errored
        fallback={(error, reset) => (
          <View accessibilityLabel="refresh-error-state">
            <Text accessibilityLabel="refresh-error">{() => `Error: ${String(error())}`}</Text>
            <Button accessibilityLabel="refresh-retry" onPress={() => app.retryRefresh(reset)}>Retry</Button>
          </View>
        )}
      >
        <RefreshContent />
      </Errored>
    </View>
  );
}

function StreamPanel() {
  const app = useRealApp();
  const patch = createMemo<StreamPatch>(() => app.stream);

  createEffect(
    () => patch(),
    nextPatch => {
      if (nextPatch) app.applyStreamPatch(nextPatch);
    },
  );

  return (
    <View accessibilityLabel="stream-panel">
      <Loading fallback={<Text accessibilityLabel="stream-loading">Stream: waiting</Text>}>
        <Text accessibilityLabel="stream-value">
          {() => {
            const nextPatch = patch();
            return `Stream: ${nextPatch.id} / ${nextPatch.name}`;
          }}
        </Text>
      </Loading>
    </View>
  );
}

export function RealContactsApp(props: RealAppProps) {
  const [state, setState] = createStore({ records: makeContacts(props.recordCount) });
  const [search, setSearch] = createSignal('');
  const [filter, setFilter] = createSignal<FilterMode>('all');
  const [sort, setSort] = createSignal<SortMode>('id-asc');
  const [selectedId, setSelectedId] = createSignal(Math.min(42, props.recordCount - 1));
  const [draftName, setDraftName] = createSignal(state.records[selectedId()]?.name ?? '');
  const [editRevision, setEditRevision] = createSignal(0);
  const [detailVisible, setDetailVisible] = createSignal(true);
  const [saveState, setSaveState] = createSignal<SaveState>('idle');
  const [saveError, setSaveError] = createSignal('');
  const [optimisticName, setOptimisticName] = createOptimistic<string | null>(null);
  const [hapticCount, setHapticCount] = createSignal(0);
  const [refreshGeneration, setRefreshGeneration] = createSignal(0);
  const [retryCount, setRetryCount] = createSignal(0);
  const stream = new ControlledStream<StreamPatch>();
  let activeRefresh = deferred<string>();
  let activeSave = deferred<void>();
  let saveResolution = '';
  const lifecycle = { detailMounts: 0, detailCleanups: 0 };

  const selectedRecord = createMemo(() => state.records[selectedId()]);
  const visibleRecords = createMemo(() => {
    const query = search().trim().toLowerCase();
    const mode = filter();
    const direction = sort();
    const filtered = state.records.filter(record => {
      if (mode === 'active' && record.status !== 'active') return false;
      if (query && !record.name.toLowerCase().includes(query)) return false;
      return true;
    });
    filtered.sort((left, right) => direction === 'id-asc' ? left.id - right.id : right.id - left.id);
    return filtered;
  });
  const effectiveName = createMemo(() => optimisticName() ?? selectedRecord()?.name ?? '');

  function updateRecordName(id: number, name: string): void {
    const record = state.records[id];
    if (!record) return;
    setState(draft => {
      const target = draft.records[id];
      if (target) target.name = name;
    });
  }

  function prepareRefresh(): void {
    activeRefresh = deferred<string>();
    setRefreshGeneration(generation => generation + 1);
  }

  const saveSelected = action(function* () {
    const id = selectedId();
    const nextName = draftName();
    const request = activeSave;
    setOptimisticName(nextName);

    try {
      yield request.promise;
      updateRecordName(id, saveResolution);
      setDraftName(saveResolution);
      setSaveState('saved');
    } catch (error) {
      setSaveError(String(error));
      setSaveState('error');
    }
  });

  const model: AppModel = {
    state,
    search,
    filter,
    sort,
    selectedId,
    selectedRecord,
    visibleRecords,
    draftName,
    editRevision,
    detailVisible,
    saveState,
    saveError,
    optimisticName,
    effectiveName,
    hapticCount,
    refreshGeneration,
    retryCount,
    stream,

    selectRecord(id) {
      const record = state.records[id];
      if (!record) return;
      setSelectedId(id);
      setDraftName(record.name);
      setSaveError('');
      setSaveState('idle');
    },
    toggleSearch() { setSearch(current => current ? '' : SEARCH_QUERY); },
    toggleFilter() { setFilter(current => current === 'all' ? 'active' : 'all'); },
    toggleSort() { setSort(current => current === 'id-asc' ? 'id-desc' : 'id-asc'); },
    editDraft() {
      const nextRevision = editRevision() + 1;
      setEditRevision(nextRevision);
      setDraftName(`${selectedRecord()?.name ?? 'missing'} / edit ${nextRevision}`);
      setSaveError('');
      setSaveState('idle');
    },
    toggleDetail() { setDetailVisible(value => !value); },
    beginRefresh() { prepareRefresh(); },
    readRefreshPromise() { return activeRefresh.promise; },
    retryRefresh(reset) {
      setRetryCount(value => value + 1);
      prepareRefresh();
      reset();
    },
    saveDraft() {
      setSaveError('');
      setSaveState('saving');
      void saveSelected();
    },
    callHaptics() {
      getHost().callModuleSync('Haptics', 'impact', ['medium']);
      setHapticCount(value => value + 1);
    },
    applyStreamPatch(patch) { updateRecordName(patch.id, patch.name); },
  };

  props.captureControls({
    snapshot() {
      const visible = visibleRecords();
      return {
        recordCount: state.records.length,
        visibleCount: visible.length,
        firstVisibleId: visible[0]?.id ?? null,
        lastVisibleId: visible[visible.length - 1]?.id ?? null,
        search: search(),
        filter: filter(),
        sort: sort(),
        selectedId: selectedId(),
        selectedName: selectedRecord()?.name ?? '',
        draftName: draftName(),
        editRevision: editRevision(),
        detailVisible: detailVisible(),
        detailMounts: lifecycle.detailMounts,
        detailCleanups: lifecycle.detailCleanups,
        refreshGeneration: refreshGeneration(),
        retryCount: retryCount(),
        saveState: saveState(),
        saveError: saveError(),
        optimisticName: optimisticName(),
        effectiveName: effectiveName(),
        hapticCount: hapticCount(),
      };
    },
    beginRefresh() { prepareRefresh(); },
    resolveRefresh(value) { activeRefresh.resolve(value); },
    rejectRefresh(message) { activeRefresh.reject(new Error(message)); },
    pushStreamPatch(patch) { stream.push(patch); },
    resolveSave(canonicalName) {
      const request = activeSave;
      saveResolution = canonicalName;
      activeSave = deferred<void>();
      request.resolve(undefined);
    },
    rejectSave(message) {
      const request = activeSave;
      activeSave = deferred<void>();
      request.reject(new Error(message));
    },
    setDraftForBenchmark(value) {
      setDraftName(value);
      setSaveError('');
      setSaveState('idle');
    },
  });

  return (
    <RealAppContext value={model}>
      <View accessibilityLabel="real-app-root">
        <Text accessibilityLabel="app-title">Sting Contacts</Text>
        <ContextBadge />
        <Text accessibilityLabel="query-state">{() => `Search: ${search() || 'none'}`}</Text>
        <Text accessibilityLabel="visible-count">{() => `Visible: ${visibleRecords().length}`}</Text>
        <Button accessibilityLabel="search-toggle" onPress={() => model.toggleSearch()}>Toggle seeded search</Button>
        <Button accessibilityLabel="filter-toggle" onPress={() => model.toggleFilter()}>Toggle active filter</Button>
        <Button accessibilityLabel="sort-toggle" onPress={() => model.toggleSort()}>Toggle sort</Button>
        <Button accessibilityLabel="detail-toggle" onPress={() => model.toggleDetail()}>Toggle detail</Button>
        <Button accessibilityLabel="haptic-button" onPress={() => model.callHaptics()}>Haptic</Button>
        <Text accessibilityLabel="haptic-count">{() => `Haptics: ${hapticCount()}`}</Text>

        <Show when={detailVisible()} fallback={<Text accessibilityLabel="detail-hidden">Details hidden</Text>}>
          <DetailPanel
            onMount={() => { lifecycle.detailMounts += 1; }}
            onCleanupRun={() => { lifecycle.detailCleanups += 1; }}
          />
        </Show>

        <RefreshPanel />
        <StreamPanel />
        <ContactList />
      </View>
    </RealAppContext>
  );
}
