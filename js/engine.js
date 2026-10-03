/*
 * 遷移表 (TRANSITIONS) を評価するだけの純粋なエンジン。DOM には触らない。
 * ブラウザと tests/check.js の両方から使う。
 */
var Engine = (function () {
  var DEVICES = ['host', 'client'];

  function defaultOpts() {
    var o = {};
    UNDECIDED.forEach(function (u) { if (u.options) o[u.id] = u.default; });
    return o;
  }

  function defaultCtx() {
    return { codeResult: 'auto', createResult: 'ok' };
  }

  function initialState(opts, ctx) {
    return {
      host: 'Host.MultiModeSelection', client: 'Client.MultiModeSelection', hostDialog: null, clientDialog: null,
      opts: Object.assign(defaultOpts(), opts || {}),
      ctx: Object.assign(defaultCtx(), ctx || {}),
    };
  }

  function matchPat(pat, value) {
    if (pat === '*') return true;
    if (Array.isArray(pat)) return pat.indexOf(value) !== -1;
    return pat === value;
  }

  function deviceOf(event) {
    var d = event.split('.')[0];
    return DEVICES.indexOf(d) === -1 ? null : d;
  }

  function whenHolds(row, state) {
    if (!row.when) return true;
    return Object.keys(row.when).every(function (k) {
      var actual = /^U\d+$/.test(k) ? state.opts[k] : state.ctx[k];
      return actual === row.when[k];
    });
  }

  function rowMatches(row, state, event) {
    if (row.event !== event) return false;
    if (!whenHolds(row, state)) return false;
    return DEVICES.every(function (d) {
      if (!matchPat(row.from[d], state[d])) return false;
      var want = row.from[d + 'Dialog'];
      return want === undefined || want === state[d + 'Dialog'];
    });
  }

  // ダイアログが開いている端末は、ダイアログのボタン以外を操作できない
  function blockedByDialog(state, event) {
    var d = deviceOf(event);
    return d !== null && state[d + 'Dialog'] !== null && event.indexOf(d + '.dialog.') !== 0;
  }

  function findRow(state, event) {
    if (blockedByDialog(state, event)) return null;
    for (var i = 0; i < TRANSITIONS.length; i++) {
      if (rowMatches(TRANSITIONS[i], state, event)) return TRANSITIONS[i];
    }
    return null;
  }

  function apply(state, row) {
    var next = Object.assign({}, state);
    DEVICES.forEach(function (d) {
      var to = row.to[d];
      if (to !== '*' && to !== '=') next[d] = to;
      if (row.dialog && Object.prototype.hasOwnProperty.call(row.dialog, d)) {
        next[d + 'Dialog'] = row.dialog[d];
      } else if (next[d] !== state[d]) {
        next[d + 'Dialog'] = null; // 画面が変わったら開いていたダイアログは閉じる
      }
    });
    return next;
  }

  // 一致する行があれば { state, row }、無ければ null
  function fire(state, event) {
    var row = findRow(state, event);
    return row ? { state: apply(state, row), row: row } : null;
  }

  function canFire(state, event) {
    return findRow(state, event) !== null;
  }

  // 自由操作中に自動で発火する行 (点線矢印) のうち、今の状態で有効なもの
  function nextAuto(state) {
    for (var i = 0; i < TRANSITIONS.length; i++) {
      var r = TRANSITIONS[i];
      if (r.auto && rowMatches(r, state, r.event)) return r;
    }
    return null;
  }

  // 「環境イベント」(ユーザー操作でも自動でもない外部要因) のうち今発火できるもの
  function availableEnvEvents(state) {
    var seen = {};
    var out = [];
    TRANSITIONS.forEach(function (r) {
      if (r.auto || deviceOf(r.event) !== null || seen[r.event]) return;
      if (rowMatches(r, state, r.event)) { seen[r.event] = true; out.push(r.event); }
    });
    return out;
  }

  // シナリオの手順を最初から n 個再生する。失敗した手順があれば failedAt に入る
  function replay(scenario, n, opts, ctx) {
    var state = initialState(Object.assign({}, opts || {}, scenario.opts || {}),
      Object.assign({}, ctx || {}, scenario.ctx || {}));
    var fired = [];
    var steps = scenario.steps.slice(0, n === undefined ? scenario.steps.length : n);
    for (var i = 0; i < steps.length; i++) {
      var res = fire(state, stepEvent(steps[i]));
      if (!res) return { state: state, fired: fired, failedAt: i };
      state = res.state;
      fired.push(res.row);
    }
    return { state: state, fired: fired, failedAt: -1 };
  }

  function stepEvent(step) {
    return typeof step === 'string' ? step : step.ev;
  }

  return {
    DEVICES: DEVICES, initialState: initialState, defaultOpts: defaultOpts, defaultCtx: defaultCtx,
    fire: fire, canFire: canFire, findRow: findRow, nextAuto: nextAuto, deviceOf: deviceOf,
    availableEnvEvents: availableEnvEvents, replay: replay, stepEvent: stepEvent,
  };
})();
