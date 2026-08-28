import React, {memo, useCallback, useState} from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const ROW_COUNT = 10_000;
const SPARSE_TARGET = 4_281;
const DENSE_TARGETS = new Set(
  Array.from({length: 100}, (_, index) => (SPARSE_TARGET + index * 97) % ROW_COUNT),
);

type RowData = {
  id: number;
  revision: number;
};

function createRows(): RowData[] {
  return Array.from({length: ROW_COUNT}, (_, id) => ({id, revision: 0}));
}

const BenchmarkRow = memo(function BenchmarkRow({row}: {row: RowData}) {
  return (
    <Text nativeID={`benchmark-row-${row.id}`} style={styles.row}>
      Row {row.id}: {row.revision}
    </Text>
  );
});

function App(): React.JSX.Element {
  const [count, setCount] = useState(0);
  const [showRows, setShowRows] = useState(false);
  const [rows, setRows] = useState<RowData[]>(createRows);

  const incrementCounter = useCallback(() => {
    setCount(value => value + 1);
  }, []);

  const updateSparseRow = useCallback(() => {
    setRows(current =>
      current.map((row, index) =>
        index === SPARSE_TARGET ? {...row, revision: row.revision + 1} : row,
      ),
    );
  }, []);

  const updateDenseRows = useCallback(() => {
    setRows(current =>
      current.map((row, index) =>
        DENSE_TARGETS.has(index) ? {...row, revision: row.revision + 1} : row,
      ),
    );
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.controls}>
        <Text nativeID="benchmark-counter" style={styles.counter}>
          Count: {count}
        </Text>
        <Button title="Increment counter" onPress={incrementCounter} />
        <Button
          title={showRows ? 'Hide 10k rows' : 'Mount 10k rows'}
          onPress={() => setShowRows(value => !value)}
        />
        {showRows ? (
          <>
            <Button title="Update row 4,281" onPress={updateSparseRow} />
            <Button title="Update 100 rows" onPress={updateDenseRows} />
          </>
        ) : null}
      </View>

      {showRows ? (
        <ScrollView nativeID="benchmark-rows" style={styles.rows}>
          {rows.map(row => (
            <BenchmarkRow key={row.id} row={row} />
          ))}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  controls: {
    gap: 8,
    padding: 16,
  },
  counter: {
    fontSize: 24,
    fontWeight: '600',
  },
  rows: {
    flex: 1,
  },
  row: {
    minHeight: 24,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
});

export default App;
