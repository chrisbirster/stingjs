(() => {
  'use strict';

  let sink = 0;

  function runJson(scenario, iterations) {
    for (let index = 0; index < iterations; index += 1) {
      switch (scenario) {
        case 'text-property':
          sink ^= globalThis.__stingTransportJSON(
            JSON.stringify({ op: 'replaceText', id: 4281, value: `Row 4281: ${index & 7}` }),
          );
          break;
        case 'primitive-properties':
          sink ^= globalThis.__stingTransportJSON(
            JSON.stringify({
              op: 'setProps',
              id: 4281,
              width: 320 + (index & 3),
              label: 'benchmark-row',
              enabled: (index & 1) === 0,
            }),
          );
          break;
        case 'style-object':
          sink ^= globalThis.__stingTransportJSON(
            JSON.stringify({
              op: 'style',
              id: 4281,
              style: {
                backgroundColor: '#123456',
                width: 320 + (index & 3),
                height: 44,
              },
            }),
          );
          break;
        case 'module-call':
          sink ^= globalThis.__stingTransportJSON(
            JSON.stringify({
              module: 'Benchmark',
              method: 'setValue',
              args: [index & 255, 'value'],
            }),
          );
          break;
        case 'structured-module':
          sink ^= globalThis.__stingTransportJSON(
            JSON.stringify({
              module: 'Benchmark',
              method: 'setObject',
              args: [{ x: index & 31, y: 2, label: 'payload' }],
            }),
          );
          break;
        case 'event-payload':
          sink ^= globalThis.__stingTransportJSON(
            JSON.stringify({
              event: 'change',
              payload: {
                index: index & 1023,
                value: 'payload',
                active: (index & 1) === 0,
              },
            }),
          );
          break;
        case 'promise-result': {
          const request = index & 255;
          Promise.resolve(
            globalThis.__stingTransportJSON(
              JSON.stringify({ op: 'asyncResult', request }),
            ),
          )
            .then(JSON.parse)
            .then(result => {
              sink ^= result.value | 0;
            });
          break;
        }
        default:
          throw new Error(`unknown transport scenario: ${scenario}`);
      }
    }
    return sink | 0;
  }

  function runTyped(scenario, iterations) {
    for (let index = 0; index < iterations; index += 1) {
      switch (scenario) {
        case 'text-property':
          sink ^= globalThis.__stingTransportTyped(1, 4281, `Row 4281: ${index & 7}`);
          break;
        case 'primitive-properties':
          sink ^= globalThis.__stingTransportTyped(
            2,
            4281,
            320 + (index & 3),
            'benchmark-row',
            (index & 1) === 0,
          );
          break;
        case 'style-object':
          sink ^= globalThis.__stingTransportTyped(
            3,
            4281,
            '#123456',
            320 + (index & 3),
            44,
          );
          break;
        case 'module-call':
          sink ^= globalThis.__stingTransportTyped(4, index & 255, 'value');
          break;
        case 'structured-module':
          sink ^= globalThis.__stingTransportTyped(5, index & 31, 2, 'payload');
          break;
        case 'event-payload':
          sink ^= globalThis.__stingTransportTyped(
            6,
            index & 1023,
            'payload',
            (index & 1) === 0,
          );
          break;
        case 'promise-result':
          Promise.resolve(globalThis.__stingTransportTyped(7, index & 255)).then(result => {
            sink ^= result | 0;
          });
          break;
        default:
          throw new Error(`unknown transport scenario: ${scenario}`);
      }
    }
    return sink | 0;
  }

  globalThis.__stingTransportBench = {
    reset() {
      sink = 0;
    },
    run(mode, scenario, iterations) {
      if (!Number.isInteger(iterations) || iterations <= 0) {
        throw new RangeError('iterations must be a positive integer');
      }
      if (mode === 'json') return runJson(scenario, iterations);
      if (mode === 'typed') return runTyped(scenario, iterations);
      throw new Error(`unknown transport mode: ${mode}`);
    },
  };
})();
