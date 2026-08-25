import { createSignal } from 'solid-js';
import { Button, Text, View } from '@stingjs/native';

const ROW_COUNT = 10_000;
const SPARSE_TARGET = 4_281;
const DENSE_TARGETS = Array.from(
  { length: 100 },
  (_, index) => (SPARSE_TARGET + index * 97) % ROW_COUNT,
);

type StingBenchmarkControls = {
  mountRows(): void;
  updateSparse(): void;
  updateDense(): void;
};

declare global {
  // Benchmark-only control surface used by portable engine hosts. The native
  // UI remains the canonical physical-device interaction path.
  // eslint-disable-next-line no-var
  var __stingBenchmark: StingBenchmarkControls | undefined;
}

export default function App() {
  const [count, setCount] = createSignal(0);
  const [showRows, setShowRows] = createSignal(false);

  const rows = Array.from({ length: ROW_COUNT }, (_, id) => {
    const [revision, setRevision] = createSignal(0);
    return { id, revision, setRevision };
  });

  const rowAt = (index: number) => {
    const row = rows[index];
    if (!row) {
      throw new RangeError(`benchmark row index out of bounds: ${index}`);
    }
    return row;
  };

  const updateSparse = () => {
    rowAt(SPARSE_TARGET).setRevision(value => value + 1);
  };

  const updateDense = () => {
    for (const index of DENSE_TARGETS) {
      rowAt(index).setRevision(value => value + 1);
    }
  };

  globalThis.__stingBenchmark = {
    mountRows: () => setShowRows(true),
    updateSparse,
    updateDense,
  };

  return (
    <View style={{ flexDirection: 'column', gap: 8, padding: 16 }}>
      <Text accessibilityLabel="benchmark-counter" style={{ fontSize: 24 }}>
        Count: {count()}
      </Text>
      <Button onPress={() => setCount(value => value + 1)}>
        Increment counter
      </Button>
      <Button onPress={() => setShowRows(value => !value)}>
        {showRows() ? 'Hide 10k rows' : 'Mount 10k rows'}
      </Button>

      {showRows() ? (
        <View style={{ flexDirection: 'column' }} accessibilityLabel="benchmark-rows">
          <Button onPress={updateSparse}>Update row 4,281</Button>
          <Button onPress={updateDense}>Update 100 rows</Button>

          {rows.map(row => (
            <Text accessibilityLabel={`benchmark-row-${row.id}`}>
              Row {row.id}: {row.revision()}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
