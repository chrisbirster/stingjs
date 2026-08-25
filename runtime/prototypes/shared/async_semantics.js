(() => {
  const originalBridge = globalThis.__stingNativeBridge;
  if (!originalBridge) {
    throw new Error('Sting async semantic probe requires __stingNativeBridge');
  }

  const nodes = new Map([
    [0, { id: 0, type: 'root', parentId: null, children: [], properties: {}, text: '' }],
  ]);

  const emptyMutations = () => ({
    createElement: 0,
    createTextNode: 0,
    replaceText: 0,
    setProperty: 0,
    insertNode: 0,
    removeNode: 0,
    setEventEnabled: 0,
  });

  let mutations = emptyMutations();
  let result = null;
  let runPromise = null;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function ensureNode(id, type = 'unknown') {
    let node = nodes.get(id);
    if (!node) {
      node = { id, type, parentId: null, children: [], properties: {}, text: '' };
      nodes.set(id, node);
    }
    return node;
  }

  function removeFromParent(node) {
    if (node.parentId == null) return;
    const parent = nodes.get(node.parentId);
    if (parent) parent.children = parent.children.filter(id => id !== node.id);
    node.parentId = null;
  }

  function isAttached(id) {
    if (id === 0) return true;
    const seen = new Set();
    let node = nodes.get(id);
    while (node && node.id !== 0) {
      if (seen.has(node.id) || node.parentId == null) return false;
      seen.add(node.id);
      node = nodes.get(node.parentId);
    }
    return node?.id === 0;
  }

  function textContent(id) {
    const node = nodes.get(id);
    if (!node) return '';
    if (node.type === '#text') return node.text;
    return node.children.map(textContent).join('');
  }

  function findByLabel(label, expectedType) {
    for (const node of nodes.values()) {
      if (!isAttached(node.id)) continue;
      if (node.properties.accessibilityLabel !== label) continue;
      if (expectedType && node.type !== expectedType) continue;
      return node;
    }
    return null;
  }

  function assertText(label, expected) {
    const node = findByLabel(label);
    assert(node, `Expected attached node with accessibilityLabel=${label}`);
    const actual = textContent(node.id);
    assert(actual === expected, `Expected ${label} text ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return node.id;
  }

  function assertTextContains(label, expectedSubstring) {
    const node = findByLabel(label);
    assert(node, `Expected attached node with accessibilityLabel=${label}`);
    const actual = textContent(node.id);
    assert(
      actual.includes(expectedSubstring),
      `Expected ${label} text to include ${JSON.stringify(expectedSubstring)}, got ${JSON.stringify(actual)}`,
    );
    return node.id;
  }

  function assertMissing(label) {
    assert(!findByLabel(label), `Expected ${label} to be absent from the attached native tree`);
  }

  function resetMutations() {
    mutations = emptyMutations();
  }

  function assertOnlyTextMutations(expected) {
    assert(
      mutations.replaceText === expected,
      `Expected ${expected} replaceText mutation(s), got ${mutations.replaceText}`,
    );
    for (const name of [
      'createElement',
      'createTextNode',
      'setProperty',
      'insertNode',
      'removeNode',
      'setEventEnabled',
    ]) {
      assert(mutations[name] === 0, `Expected zero ${name} mutations, got ${mutations[name]}`);
    }
  }

  function press(label) {
    const button = findByLabel(label, 'button');
    assert(button, `Expected native button with accessibilityLabel=${label}`);
    assert(
      typeof globalThis.__stingDispatchEvent === 'function',
      'Expected Sting event dispatcher to be installed',
    );
    globalThis.__stingDispatchEvent(button.id, 'press', 'null');
    return button.id;
  }

  async function settle() {
    // Solid 2 schedules async graph propagation through the engine microtask
    // queue. Repeated Promise turns keep this probe engine-neutral while still
    // requiring each embedding host to drain its native job queue correctly.
    for (let index = 0; index < 24; index += 1) {
      await Promise.resolve();
    }
  }

  globalThis.__stingNativeBridge = {
    getRuntimeInfo() {
      return originalBridge.getRuntimeInfo();
    },
    createElement(id, type) {
      mutations.createElement += 1;
      nodes.set(id, { id, type, parentId: null, children: [], properties: {}, text: '' });
      return originalBridge.createElement(id, type);
    },
    createTextNode(id, value) {
      mutations.createTextNode += 1;
      nodes.set(id, {
        id,
        type: '#text',
        parentId: null,
        children: [],
        properties: {},
        text: String(value),
      });
      return originalBridge.createTextNode(id, value);
    },
    replaceText(id, value) {
      mutations.replaceText += 1;
      ensureNode(id, '#text').text = String(value);
      return originalBridge.replaceText(id, value);
    },
    setProperty(id, name, valueJSON) {
      mutations.setProperty += 1;
      const node = ensureNode(id);
      try {
        node.properties[name] = JSON.parse(valueJSON);
      } catch {
        node.properties[name] = valueJSON;
      }
      return originalBridge.setProperty(id, name, valueJSON);
    },
    insertNode(parentId, nodeId, anchorId) {
      mutations.insertNode += 1;
      const parent = ensureNode(parentId, parentId === 0 ? 'root' : 'unknown');
      const node = ensureNode(nodeId);
      removeFromParent(node);
      node.parentId = parentId;

      const anchorIndex = parent.children.indexOf(anchorId);
      if (anchorIndex >= 0) parent.children.splice(anchorIndex, 0, nodeId);
      else parent.children.push(nodeId);

      return originalBridge.insertNode(parentId, nodeId, anchorId);
    },
    removeNode(parentId, nodeId) {
      mutations.removeNode += 1;
      const parent = nodes.get(parentId);
      if (parent) parent.children = parent.children.filter(id => id !== nodeId);
      const node = nodes.get(nodeId);
      if (node) node.parentId = null;
      return originalBridge.removeNode(parentId, nodeId);
    },
    setEventEnabled(id, event, enabled) {
      mutations.setEventEnabled += 1;
      return originalBridge.setEventEnabled(id, event, enabled);
    },
    callModuleSync(module, method, argsJSON) {
      return originalBridge.callModuleSync(module, method, argsJSON);
    },
  };

  async function runInternal() {
    const controls = globalThis.__stingAsyncNative;
    assert(controls, 'Expected async-native test controls to be installed');

    assertText('async-loading', 'Loading...');
    assertMissing('async-value');
    assertText('stream-loading', 'Stream loading...');
    assertText('action-value', 'Optimistic: 0');

    controls.resolve('alpha');
    await settle();
    assertText('async-value', 'Value: alpha');
    assertText('async-pending', 'Pending: no');
    assertMissing('async-loading');

    resetMutations();
    controls.beginRefresh();
    assertText('async-value', 'Value: alpha');
    assertText('async-pending', 'Pending: yes');
    assertMissing('async-loading');
    assertOnlyTextMutations(1);

    resetMutations();
    controls.resolve('beta');
    await settle();
    assertText('async-value', 'Value: beta');
    assertText('async-pending', 'Pending: no');
    assertOnlyTextMutations(2);

    controls.beginRefresh();
    assertText('async-pending', 'Pending: yes');
    controls.reject('portable async boom');
    await settle();
    assertTextContains('async-error', 'portable async boom');

    press('async-retry');
    assertTextContains('async-error', 'portable async boom');
    assertMissing('async-value');
    controls.resolve('gamma');
    await settle();
    assertText('async-value', 'Value: gamma');
    assertText('async-pending', 'Pending: no');
    assertMissing('async-error');

    controls.streamYield('one');
    await settle();
    const streamNodeId = assertText('stream-value', 'Stream: one');
    assertMissing('stream-loading');

    resetMutations();
    controls.streamYield('two');
    await settle();
    assert(
      assertText('stream-value', 'Stream: two') === streamNodeId,
      'AsyncIterable update replaced the native stream node instead of mutating it',
    );
    assertOnlyTextMutations(1);

    const actionNodeId = assertText('action-value', 'Optimistic: 0');
    resetMutations();
    press('action-increment');
    assert(
      assertText('action-value', 'Optimistic: 1') === actionNodeId,
      'Optimistic action replaced the native action node',
    );
    assertOnlyTextMutations(1);

    resetMutations();
    controls.resolveAction();
    await settle();
    assert(
      assertText('action-value', 'Optimistic: 0') === actionNodeId,
      'Optimistic rollback replaced the native action node',
    );
    assertOnlyTextMutations(1);
  }

  globalThis.__stingAsyncProbe = {
    run() {
      if (runPromise) return runPromise;
      result = { ok: false, running: true, error: null };
      runPromise = runInternal().then(
        () => {
          result = { ok: true, running: false, error: null };
        },
        error => {
          result = {
            ok: false,
            running: false,
            error: error instanceof Error ? error.stack || error.message : String(error),
          };
        },
      );
      return runPromise;
    },
    assertPassed() {
      if (!result || result.running) {
        throw new Error('Solid 2 async semantic probe did not finish; engine microtasks were not fully drained');
      }
      if (!result.ok) {
        throw new Error(`Solid 2 async semantic probe failed: ${result.error}`);
      }
    },
  };
})();
