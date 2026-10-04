const isoNow = () => new Date().toISOString();

// Records translated function entry/completion without changing CPU or memory
// state. Attach one instance to a runtime only for an instrumented execution.
export class FunctionCoverage {
  constructor({ source, provenance = 'translated-js' } = {}) {
    this.source = source ?? { kind: 'unspecified-translated-run' };
    this.provenance = provenance;
    this.records = new Map();
    this.stack = [];
    this.externalDependencies = [];
  }

  invoke(address, name, runtime, implementation, args) {
    let record = this.records.get(address);
    if (!record) {
      const now = isoNow();
      record = {
        address, jsFunction: name, entered: true, completed: false,
        entryCount: 0, completionCount: 0, callers: [],
        firstEntryAt: now, firstCompletionAt: null,
        source: this.source, provenance: this.provenance,
        syntheticExternalDependencies: [], failures: [],
      };
      this.records.set(address, record);
    }
    record.entryCount += 1;
    record.completed = record.completionCount > 0;
    const caller = this.stack.at(-1) ?? null;
    if (!record.callers.includes(caller)) record.callers.push(caller);
    this.stack.push(address);
    let asyncResult = false;
    const finish = result => {
      if (result?.originalFunctionCompleted === false) {
        record.scopedInvocationCount = (record.scopedInvocationCount ?? 0) + 1;
        record.entryScope = 'suffix/block';
        return;
      }
      record.completionCount += 1;
      record.completed = true;
      record.firstCompletionAt ??= isoNow();
    };
    try {
      const result = implementation(...args);
      if (result && typeof result.then === 'function') {
        asyncResult = true;
        return result.then(value => { finish(value); return value; }, error => {
          record.failures.push(String(error?.message ?? error));
          throw error;
        }).finally(() => { this.stack.pop(); });
      }
      finish(result);
      return result;
    } catch (error) {
      record.failures.push(String(error?.message ?? error));
      throw error;
    } finally {
      // The async branch manages its own stack lifetime in the promise handlers.
      if (!asyncResult) this.stack.pop();
    }
  }

  noteExternal(kind, detail, provenance = 'runtime-adapter') {
    const caller = this.stack.at(-1) ?? null;
    let event = this.externalDependencies.find(item => item.kind === kind && item.caller === caller && JSON.stringify(item.detail) === JSON.stringify(detail) && item.provenance === provenance);
    if (event) event.occurrences += 1;
    else {
      event = { kind, detail, provenance, caller, at: isoNow(), occurrences: 1 };
      this.externalDependencies.push(event);
    }
    if (caller) {
      const record = this.records.get(caller);
      if (record && !record.syntheticExternalDependencies.some(item => item.kind === kind && JSON.stringify(item.detail) === JSON.stringify(detail) && item.provenance === provenance)) {
        record.syntheticExternalDependencies.push({ kind, detail, provenance });
      }
    }
  }

  report() {
    const functions = [...this.records.values()].map(record => ({
      ...record,
      outcome: record.completed ? 'completed' : 'entered-without-completion',
    }));
    return {
      schemaVersion: 1,
      source: this.source,
      provenance: this.provenance,
      enteredFunctions: functions.length,
      completedFunctions: functions.filter(item => item.completed).length,
      functions,
      externalDependencies: this.externalDependencies,
    };
  }
}

export function instrumentLift(address, name, implementation) {
  return function coveredLift(...args) {
    const runtime = args[0];
    const coverage = runtime?.functionCoverage;
    return coverage ? coverage.invoke(address, name, runtime, implementation, args) : implementation(...args);
  };
}
