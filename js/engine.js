/*
 * 遷移表 (TRANSITIONS) を評価するだけの純粋なエンジン。DOM には触らない。
 * ブラウザと tests/check.js の両方から使う。
 */
var Engine = (function () {
  var DEVICES = ['host', 'client'];

  function defaultCtx() {
    return { codeResult: 'auto', createResult: 'ok' };
  }

  function initialOf(f, d) {
    var init = DEVICE_FIELDS[f].initial;
    return typeof init === 'function' ? init(d) : init;
  }

  // 端末ごとの付属状態 (hostDialog / hostStamp / hostMute など) とセッション (match / rated) は transitions.js の
  // DEVICE_FIELDS / SESSION_FIELDS で決まる。profiles ({ host: { emoji, greeting }, client: ... }) を渡すと、保存した絵文字とあいさつ (U56) をその値で始める
  function initialState(ctx, profiles) {
    var s = { host: 'Host.MultiModeSelection', client: 'Client.MultiModeSelection' };
    DEVICES.forEach(function (d) {
      Object.keys(DEVICE_FIELDS).forEach(function (f) { s[d + f] = initialOf(f, d); });
      if (profiles && profiles[d]) {
        s[d + 'Emoji'] = profiles[d].emoji;
        s[d + 'Greeting'] = profiles[d].greeting;
      }
    });
    Object.keys(SESSION_FIELDS).forEach(function (k) { s[k] = SESSION_FIELDS[k]; });
    s.ctx = Object.assign(defaultCtx(), ctx || {});
    return s;
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
      var actual = k in SESSION_FIELDS ? state[k] : state.ctx[k];
      return matchPat(row.when[k], actual);
    });
  }

  function rowMatches(row, state, event) {
    if (row.event !== event) return false;
    if (!whenHolds(row, state)) return false;
    // from の host / client 以外のキー (hostDialog, clientStamp など) は付属状態の条件
    return Object.keys(row.from).every(function (k) { return matchPat(row.from[k], state[k]); });
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

  function has(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key); }

  function apply(state, row) {
    var next = Object.assign({}, state);
    DEVICES.forEach(function (d) {
      var to = row.to[d];
      if (to !== '*' && to !== '=') next[d] = to;
      Object.keys(DEVICE_FIELDS).forEach(function (f) {
        var key = d + f;
        if (has(row.set, key)) next[key] = row.set[key];
        // copy: { 写す先: 写す元 } は、発火する前の付属状態の値を写す (U56 の Profile の下書き・保存・相手に見せる値)
        else if (has(row.copy, key)) next[key] = state[row.copy[key]];
        else if (f === 'Dialog' && has(row.dialog, d)) next[key] = row.dialog[d];
        // 画面が変わったら、その画面で続かない付属状態は初期値に戻す (ダイアログは必ず閉じる)
        else if (next[d] !== state[d] && !DEVICE_FIELDS[f].keeps(next[d])) next[key] = initialOf(f, d);
      });
    });
    Object.keys(SESSION_FIELDS).forEach(function (k) { if (has(row.set, k)) next[k] = row.set[k]; });
    return next;
  }

  // 端末の上の状態名の後ろに付ける付属状態 (ダイアログ・送ったスタンプ・ミュート)
  function extrasLabel(state, d) {
    var dlg = state[d + 'Dialog'];
    var stamp = state[d + 'Stamp'];
    return (dlg ? ' + 🗨 ' + dlg : '') + (stamp ? ' + 💬 ' + stamp : '') + (state[d + 'Mute'] ? ' + 🔕' : '');
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

  // シナリオの手順を最初から n 個再生する。失敗した手順があれば failedAt に入る。
  // シナリオはいつも最初の値 (保存した絵文字とあいさつは DEVICE_FIELDS の初期値) から始める
  function replay(scenario, n, ctx) {
    var state = initialState(Object.assign({}, ctx || {}, scenario.ctx || {}));
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
    DEVICES: DEVICES, initialState: initialState, defaultCtx: defaultCtx,
    fire: fire, canFire: canFire, findRow: findRow, nextAuto: nextAuto, deviceOf: deviceOf, extrasLabel: extrasLabel,
    availableEnvEvents: availableEnvEvents, replay: replay, stepEvent: stepEvent,
  };
})();
