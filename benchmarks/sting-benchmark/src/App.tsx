import { createSignal } from 'solid-js';
import { Button, Text, View } from '@stingjs/native';

const ROW_COUNT = 10_000;
const SPARSE_TARGET = 4_281;
const DENSE_TARGETS = Array.from(
  { length: 100 },
  (_, index) => (SPARSE_TARGET + index * 97) % ROW_COUNT,
);

export default function App() {
  const [count, setCount] = createSignal(0);
  const [showRows, setShowRows] = createSignal(false);

  const rows = Array.from({ length: ROW_COUNT }, (_, id) => {
    const [revision, setRevision] = createSignal(0);
    return { id, revision, setRevision };
  });

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
          <Button
            onPress={() =>
              rows[SPARSE_TARGET].setRevision(value => value + 1)
            }
          >
            Update row 4,281
          </Button>
          <Button
            onPress={() => {
              for (const index of DENSE_TARGETS) {
                rows[index].setRevision(value => value + 1);
              }
            }}
          >
            Update 100 rows
          </Button>

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
