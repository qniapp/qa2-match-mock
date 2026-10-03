/*
 * 描画とコントローラ。画面の変化は決めない: state.host / state.client を SCREENS に従って
 * 描き、クリックされたらイベントを Engine に渡すだけ。
 */
(function () {
  'use strict';

  var STEP_DELAY = 1200;
  var EVENT_DELAY = { 'vs.done': 2500, 'game.countdownDone': GAME_COUNTDOWN_MS };
  var MATCH_CODE = 'QWERTY123';
  var STAGE_TILES = [
    { label: 'H²', color: 'var(--h)' }, { label: 'X²', color: 'var(--x)' },
    { label: 'Y²', color: 'var(--y)' }, { label: 'Z²', color: 'var(--z)' },
    { label: 'H²→Z', color: 'var(--h)' }, { label: 'T²→S', color: 'var(--swap)' },
    { label: '', color: 'var(--cnot)' }, { label: '', color: 'var(--y)' },
  ];
  // ゲーム画面のプレースホルダー: 列ごとに下から積んだブロック ('+' は丸いブロック)
  var FIELD = [['S', 'H', 'Z', 'S'], ['Z', 'S', 'Y'], ['T', 'S', '+'], ['Z', 'T', 'S'], ['S', 'T', 'H', '+'], ['H', 'Z', '+', 'Z']];
  var OPP_FIELD = [['H', 'S', 'Z'], ['Z', 'T'], ['S', 'Y', 'T', 'Z'], ['T', 'Z'], ['+', 'H', 'S'], ['Z', 'H']];

  var app = {
    scenario: null, // null = 自由操作
    step: 0, // 再生済みの手順数
    detached: false, // シナリオの途中で手順と違う操作をした
    failedStep: -1,
    cd: 3, // 手順で止めているとき、ゲーム本体のカウントダウンで表示しておく数字 (#...&cd=3|2|1)
    opts: Engine.defaultOpts(),
    ctx: Engine.defaultCtx(),
    state: null,
    lastRow: null,
    log: [],
    autoTimer: null,
    playTimer: null,
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // シナリオを手順で進めている間は、アニメーションを止めて決まった 1 フレームを出す
  function frozen() {
    return !!(scenarioActive() && !app.playTimer);
  }

  function inGameCountdown() {
    return Engine.DEVICES.some(function (d) { return SCREENS[app.state[d]].countdown; });
  }

  function undecidedById(id) {
    return UNDECIDED.filter(function (u) { return u.id === id; })[0];
  }

  function label(event) { return EVENT_LABELS[event] || event; }

  // ---- 状態の更新 -----------------------------------------------------------

  function selectScenario(id, step) {
    stopPlay();
    var sc = SCENARIOS.filter(function (s) { return s.id === id; })[0] || null;
    app.scenario = sc;
    app.opts = Object.assign(Engine.defaultOpts(), sc && sc.opts);
    app.ctx = Object.assign(Engine.defaultCtx(), sc && sc.ctx);
    rebuild(step || 0);
  }

  // シナリオを最初から n 手順目まで再生し直す
  function rebuild(n) {
    clearAuto();
    app.detached = false;
    app.failedStep = -1;
    app.log = [];
    if (!app.scenario) {
      app.state = Engine.initialState(app.opts, app.ctx);
      app.step = 0;
      app.lastRow = null;
      render();
      scheduleAuto();
      return;
    }
    n = Math.max(0, Math.min(n, app.scenario.steps.length));
    var res = Engine.replay(app.scenario, n, app.opts, app.ctx);
    app.state = res.state;
    app.step = res.fired.length;
    if (res.failedAt !== -1) app.failedStep = res.failedAt;
    res.fired.forEach(function (row, i) {
      pushLog(Engine.stepEvent(app.scenario.steps[i]), row, 'step');
    });
    app.lastRow = res.fired[res.fired.length - 1] || null;
    render();
    scheduleAuto();
  }

  function pushLog(event, row, kind) {
    app.log.push({ event: event, row: row, kind: kind, time: new Date() });
  }

  // 実際にイベントを遷移表へ渡す唯一の場所
  function fire(event, kind) {
    var res = Engine.fire(app.state, event);
    if (!res) {
      pushLog(event, null, 'norow');
      renderSide();
      return false;
    }
    app.state = res.state;
    app.lastRow = res.row;
    pushLog(event, res.row, kind);
    render();
    scheduleAuto();
    return true;
  }

  function scenarioActive() {
    return app.scenario && !app.detached && app.step < app.scenario.steps.length;
  }

  function nextStep() {
    if (!scenarioActive()) return false;
    var ev = Engine.stepEvent(app.scenario.steps[app.step]);
    if (!fire(ev, 'step')) {
      app.failedStep = app.step;
      render();
      return false;
    }
    app.step++;
    render();
    return true;
  }

  // 電話や環境イベントのボタンから: シナリオの次の手順と同じなら手順を進める
  function userFire(event) {
    if (scenarioActive() && Engine.stepEvent(app.scenario.steps[app.step]) === event) {
      stopPlay();
      nextStep();
      return;
    }
    if (!Engine.canFire(app.state, event)) {
      fire(event, 'user');
      return;
    }
    if (app.scenario && app.step < app.scenario.steps.length) {
      stopPlay();
      app.detached = true;
    }
    fire(event, 'user');
  }

  function clearAuto() {
    if (app.autoTimer) clearTimeout(app.autoTimer);
    app.autoTimer = null;
  }

  // 自由操作中だけ、点線矢印 (auto 付きの行) を実時間で発火する
  function scheduleAuto() {
    clearAuto();
    if (scenarioActive() || app.playTimer) return;
    var row = Engine.nextAuto(app.state);
    if (!row) return;
    app.autoTimer = setTimeout(function () {
      app.autoTimer = null;
      if (Engine.findRow(app.state, row.event) === row) fire(row.event, 'auto');
    }, row.auto);
  }

  function startPlay() {
    if (!scenarioActive()) return;
    clearAuto();
    var tick = function () {
      if (!scenarioActive()) { stopPlay(); return; }
      var ev = Engine.stepEvent(app.scenario.steps[app.step]);
      app.playTimer = setTimeout(function () {
        if (!nextStep()) { stopPlay(); return; }
        tick();
      }, EVENT_DELAY[ev] || STEP_DELAY);
    };
    app.playTimer = -1;
    tick();
    render();
  }

  function stopPlay() {
    if (app.playTimer && app.playTimer !== -1) clearTimeout(app.playTimer);
    var was = app.playTimer;
    app.playTimer = null;
    if (was) { render(); scheduleAuto(); }
  }

  function setOpt(id, value) {
    app.opts[id] = value;
    if (app.scenario && !app.detached && !(app.scenario.opts && id in app.scenario.opts)) {
      rebuild(app.step);
      return;
    }
    if (app.scenario) app.detached = true;
    app.state = Object.assign({}, app.state, { opts: Object.assign({}, app.opts) });
    render();
    scheduleAuto();
  }

  function setCtx(key, value) {
    app.ctx[key] = value;
    if (app.scenario && !app.detached && !(app.scenario.ctx && key in app.scenario.ctx)) {
      rebuild(app.step);
      return;
    }
    if (app.scenario) app.detached = true;
    app.state = Object.assign({}, app.state, { ctx: Object.assign({}, app.ctx) });
    render();
  }

  // ---- 電話の画面 -----------------------------------------------------------

  // ボタンなどのイベントがこの端末で今発火できるか
  function attrs(dev, ev) {
    if (!ev) return '';
    var ok = Engine.canFire(app.state, dev + '.' + ev);
    return ' data-ev="' + esc(ev) + '"' + (ok ? '' : ' data-norow="1" title="遷移表に行がありません (' + esc(dev + '.' + ev) + ')"');
  }

  function header(dev, spec, title) {
    var back;
    if (spec.back === 'disabled') back = '<span class="back disabled" aria-disabled="true">‹</span>';
    else if (spec.back) back = '<button type="button" class="back"' + attrs(dev, spec.back) + ' aria-label="Back">‹</button>';
    else back = '<span class="back hidden-back">‹</span>';
    return '<div class="hdr">' + back + '<div class="title">' + esc(title || '') + '</div></div>';
  }

  function buttonsHtml(dev, buttons) {
    var html = (buttons || []).filter(function (b) {
      return !(b.hideIfNoRow && !Engine.canFire(app.state, dev + '.' + b.event));
    }).map(function (b) {
      // disabled はゲーム内の無効表示 (押したあとの Start Match)。遷移表に行が無いときの破線とは別
      if (b.disabled) return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + ' is-disabled" disabled>' + esc(b.label) + '</button>';
      return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
    }).join('');
    return html ? '<div class="actions">' + html + '</div>' : '';
  }

  function toastHtml(dev, key) {
    if (!key) return '';
    var t = TOASTS[key];
    var tappable = t.tap && Engine.canFire(app.state, dev + '.' + t.tap);
    var tag = tappable ? 'button type="button"' : 'div';
    var close = tappable ? 'button' : 'div';
    return '<' + tag + ' class="toast ' + t.kind + (tappable ? ' tappable' : '') + '"' + (tappable ? attrs(dev, t.tap) : '') + '>' +
      esc(t.text) + (tappable ? '<span class="chev">›</span>' : '') + '</' + close + '>';
  }

  var VIEWS = {
    online: function (dev, s) {
      return header(dev, s, s.title) + '<div class="menu">' + s.items.map(function (it) {
        return '<button type="button" class="menu-item"' + attrs(dev, it.event) + '>' + esc(it.label) + '<span class="chev">›</span></button>';
      }).join('') + '</div>';
    },
    friendTop: function (dev, s) {
      var input = s.input
        ? '<span class="value">' + esc(s.input) + '</span>'
        : '<span class="placeholder">Match Code</span>';
      return header(dev, s, s.title) +
        '<div class="body">' +
        '<div class="sec-label">Create Match</div>' +
        '<button type="button" class="btn big"' + attrs(dev, 'createMatch') + '>Create Match</button>' +
        '<div class="sec-label second">Enter Match Code</div>' +
        (Engine.canFire(app.state, dev + '.enterCode')
          ? '<button type="button" class="input"' + attrs(dev, 'enterCode') + '>' + input + '</button>'
          : '<div class="input">' + input + '</div>') +
        '<button type="button" class="btn"' + attrs(dev, 'joinMatch') + '>Join Match</button>' +
        (s.error ? '<p class="error">' + esc(s.error) + '</p>' : '') +
        '</div>';
    },
    lobby: function (dev, s) {
      return header(dev, s, s.title) +
        '<div class="body">' +
        '<div class="code-head"><span>Match Code</span><span class="copy">Copy</span></div>' +
        '<div class="code">' + MATCH_CODE + '</div>' +
        '<div class="status-block">' +
        (s.name ? '<div class="peer">' + esc(s.name) + '</div>' : '') +
        (s.peerReady ? '<div class="peer-ready">Friend is ready!</div>' : '') +
        '<div class="status' + (s.name ? '' : ' solo') + '">' + esc(s.status).replace(/\n/g, '<br>') + '</div>' +
        '</div></div>' + buttonsHtml(dev, s.buttons);
    },
    stage: function (dev, s) {
      return header(dev, s, '') + '<div class="stage-label">Stage Select</div><div class="stage-grid">' +
        STAGE_TILES.map(function (t) {
          return '<div class="tile" style="--c:' + t.color + '"><div class="glyph"><i></i><i></i></div><span>' + esc(t.label) + '</span></div>';
        }).join('') + '</div>';
    },
    random: function (dev, s) {
      return header(dev, s, s.title) + '<div class="body center">' +
        '<div class="status">' + esc(s.status) + '</div><div class="dots"><i></i><i></i><i></i></div></div>' +
        buttonsHtml(dev, s.buttons);
    },
    vs: function (dev) {
      var me = dev;
      var card = function (who) {
        var p = PLAYERS[who];
        return '<div class="vs-card ' + who + (who === me ? ' me' : '') + '">' +
          (who === me ? '<span class="you">YOU</span>' : '') +
          '<div class="vs-emoji">' + p.emoji + '</div>' +
          '<div class="vs-name">' + esc(p.name) + '</div>' +
          '<div class="vs-rank">Rank ' + p.rank + '</div>' +
          '<div class="vs-greet">“' + esc(p.greeting) + '”</div></div>';
      };
      return '<div class="vs">' + card('host') + '<div class="vs-mark">VS</div>' + card('client') +
        '<div class="vs-bar"><i></i></div></div>';
    },
    // ゲーム画面のプレースホルダー。HUD・カウントダウン・ポーズポップアップは実機 (VsAI) の画面にならう。
    // ポーズボタンはプレイ中だけ出る (カウントダウン中とポーズ中は隠す)
    game: function (dev, s) {
      var opp = PLAYERS[dev === 'host' ? 'client' : 'host'];
      var me = '<div class="g-me">' +
        '<div class="g-hud"><div class="g-time"><span>Time</span><b>0:00</b></div>' +
        '<div class="g-score"><span>Score</span><b>0</b></div></div>' +
        (s.countdown || s.paused ? '' : '<button type="button" class="g-pause" aria-label="Pause"' + attrs(dev, 'pause') + '><i></i><i></i></button>') +
        fieldHtml(FIELD, 'g-field') +
        (s.countdown ? countdownHtml() : '') +
        '<div class="g-bar"><span class="g-gauge"><i></i></span><span class="g-up">︽</span></div>' +
        '</div>';
      return '<div class="game' + (s.countdown ? ' counting' : '') + '">' +
        '<div class="g-opp"><div class="g-score small"><span>Score</span><b>0</b></div>' +
        '<div class="g-opp-name">' + esc(opp.name) + '</div>' +
        fieldHtml(OPP_FIELD, 'g-mini') + '<span class="g-opp-gauge"></span></div>' + me + '</div>' +
        (s.paused ? pauseHtml(dev) : '');
    },
    // 対戦後 (図なし)。値もボタンも仮だが、仮・未決の印は端末の上の帯と右パネルに出す (SCREENS の undecided / context)
    result: function (dev, s) {
      var me = PLAYERS[dev];
      var opp = PLAYERS[dev === 'host' ? 'client' : 'host'];
      var win = s.outcome === 'WIN';
      var status = { wait: 'Waiting for your friend…', asked: 'Your friend wants a rematch' }[s.rematch];
      var btn = function (b) {
        return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
      };
      return header(dev, s, s.title) + '<div class="result">' +
        '<div class="r-outcome ' + (win ? 'win' : 'lose') + '">' + (win ? 'WIN!' : 'LOSE') + '</div>' +
        '<div class="r-opp">vs ' + esc(opp.name) + '</div>' +
        '<div class="r-stats">' +
        '<div class="r-row"><span>Rank</span><b>' + me.rank + ' → ' + (me.rank + (win ? 1 : 0)) + '</b></div>' +
        '<div class="r-row"><span>Score</span><b class="dim-value">----</b></div>' +
        '</div>' +
        '<div class="r-status ' + (s.rematch || '') + '">' + (status ? esc(status) : '') + '</div>' +
        '</div><div class="actions">' +
        btn({ label: 'Rematch', event: 'rematch', primary: true }) +
        btn({ label: 'Back to Friend Match', event: 'backToFriendMatch' }) +
        '</div>';
    },
  };

  function fieldHtml(cols, cls) {
    return '<div class="' + cls + '">' + cols.map(function (col) {
      return '<div class="g-col">' + col.map(function (b) {
        return b === '+' ? '<i class="blk plus">+</i>' : '<i class="blk b-' + b + '">' + b + '</i>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }

  // ゲーム本体の開始カウントダウン: 数字と細いリングが拡大しながら現れ、ズームしながら消える。
  // 手順で止めているときは app.cd の数字を「静止」した姿勢で出す
  function countdownHtml() {
    var step = function (n, i) {
      return '<div class="g-cd-step" style="animation-delay: ' + (GAME_COUNTDOWN.delay + i * GAME_COUNTDOWN.digit) + 'ms">' +
        '<i class="g-cd-ring"></i><b class="g-cd-digit">' + n + '</b></div>';
    };
    if (frozen()) return '<div class="g-cd frozen" data-cd="' + app.cd + '">' + step(app.cd, 0) + '</div>';
    return '<div class="g-cd">' + GAME_COUNTDOWN.digits.map(step).join('') + '</div>';
  }

  // ポーズポップアップ (実機の Menu_Pause): 全面の暗幕、中央の黒いパネル、全幅のボタン 3 つ。タイトル・開閉アニメーションなし
  function pauseHtml(dev) {
    return '<div class="p-dim"><div class="p-panel" role="dialog" aria-label="Pause">' + PAUSE_BUTTONS.map(function (b) {
      return '<button type="button" class="p-btn ' + b.kind + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
    }).join('') + '</div></div>';
  }

  // 端末の下のモック操作 (ゲーム内 UI ではない)。押せるかどうかは遷移表で決まる
  function mockControlsHtml(dev) {
    return '<span class="mc-label">モック操作 (勝敗):</span>' +
      '<button type="button" class="mc-btn"' + attrs(dev, 'win') + '>Win</button>' +
      '<button type="button" class="mc-btn"' + attrs(dev, 'lose') + '>Lose</button>';
  }

  function dialogHtml(dev, key) {
    if (!key) return '';
    var d = DIALOGS[key];
    return '<div class="dim"><div class="dialog" role="dialog"><div class="d-title">' + esc(d.title) + '</div>' +
      '<p class="d-body">' + esc(d.body) + '</p>' +
      d.buttons.map(function (b) {
        return '<button type="button" class="btn' + (b.danger ? ' danger' : '') + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
      }).join('') + '</div></div>';
  }

  function renderDevice(dev) {
    var root = $('.device[data-dev="' + dev + '"]');
    var name = app.state[dev];
    var spec = SCREENS[name];
    var dlg = app.state[dev + 'Dialog'];
    $('.state-name', root).textContent = name + (dlg ? ' + 🗨 ' + dlg : '');

    var screen = $('.screen', root);
    var html = VIEWS[spec.view](dev, spec) + toastHtml(dev, spec.toast) + dialogHtml(dev, dlg);
    // 同じ内容なら差し替えない (VS やカウントダウンのアニメーションを最初からやり直させない)
    if (screen.dataset.html !== html) {
      screen.className = 'screen view-' + spec.view;
      screen.innerHTML = html;
      screen.dataset.html = html;
    }
    $('.mock-controls', root).innerHTML = mockControlsHtml(dev);

    // 未決バッジ: 画面・ダイアログ・直前に発火した行 (この端末に関係するもの) の未決を集める。
    // 決定済みの項目はここには出さず、右パネルの「決定済み」に出す
    var ids = relevantIds(dev, 'undecided');
    if (dlg && DIALOGS[dlg].undecided) ids = uniq(ids.concat(DIALOGS[dlg].undecided));
    var strip = $('.undecided-strip', root);
    strip.classList.toggle('compact', ids.length > 2);
    strip.classList.toggle('dense', ids.length > 4 && ids.length <= 6);
    strip.classList.toggle('packed', ids.length > 6);
    strip.innerHTML = ids.map(function (id) { return pillHtml(id, 'pill-undecided', '未決'); }).join('');
  }

  function uniq(list) {
    return list.filter(function (id, i) { return list.indexOf(id) === i; });
  }

  // この端末の画面と、直前に発火した行 (この端末に関係するもの) の未決 / 決定の ID
  function relevantIds(dev, key) {
    var ids = SCREENS[app.state[dev]][key].slice();
    var r = app.lastRow;
    if (r && (r.to[dev] !== '*' || (r.dialog && dev in r.dialog))) ids = ids.concat(r[key]);
    return uniq(ids);
  }

  function pillHtml(id, cls, word) {
    var u = undecidedById(id);
    return '<button type="button" class="' + cls + '" data-undecided="' + id + '" title="' + esc(u.title + ' - ' + u.desc) + '">' +
      word + ' ' + id + ' <span>' + esc(u.title) + '</span></button>';
  }

  // ---- パネル ---------------------------------------------------------------

  function renderScenarioList() {
    var items = [{ id: '', title: '自由操作 (シナリオなし)', diagram: '' }].concat(SCENARIOS);
    $('#scenario-list').innerHTML = items.map(function (s) {
      var active = (app.scenario ? app.scenario.id : '') === s.id;
      return '<li><button type="button" data-scenario="' + esc(s.id) + '" class="' + (active ? 'active' : '') + '">' +
        (s.id ? '<b>' + esc(s.id) + '</b> ' : '') + esc(s.title) + '</button></li>';
    }).join('');
  }

  function renderControls() {
    var sc = app.scenario;
    $('#btn-prev').disabled = !sc || app.step === 0;
    $('#btn-next').disabled = !scenarioActive();
    $('#btn-reset').disabled = false;
    $('#btn-auto').disabled = !scenarioActive() && !app.playTimer;
    $('#btn-auto').textContent = app.playTimer ? '■ 停止' : '自動再生';
    $('#btn-auto').classList.toggle('playing', !!app.playTimer);
    var cd = $('#cd-freeze');
    cd.hidden = !(frozen() && inGameCountdown());
    $$('[data-cd]', cd).forEach(function (b) { b.classList.toggle('active', parseInt(b.dataset.cd, 10) === app.cd); });
  }

  function renderScenarioDetail() {
    var sc = app.scenario;
    var detail = $('#scenario-detail');
    if (!sc) {
      detail.innerHTML = '<h3>自由操作</h3><p>電話のボタンを直接押して試せます。点線矢印にあたる自動遷移は実時間で進みます。</p>';
      $('#step-list').innerHTML = '';
      return;
    }
    var status = '';
    if (app.detached) status = '<p class="detached">シナリオから外れて自由操作中です。⟲ 最初から で戻れます。</p>';
    else if (app.failedStep !== -1) status = '<p class="detached">手順 ' + (app.failedStep + 1) + ' に一致する行がありません (未決トグルの選択を確認してください)。</p>';
    else if (app.step === sc.steps.length) status = '<p class="done">シナリオの最後まで再生しました。ここからは自由に操作できます。</p>';
    detail.innerHTML = '<h3><b>' + esc(sc.id) + '</b> ' + esc(sc.title) + '</h3>' +
      '<p class="meta">元の図: ' + esc(sc.diagram) + '</p><p>' + esc(sc.desc) + '</p>' + status;
    $('#step-list').innerHTML = sc.steps.map(function (st, i) {
      var cls = i < app.step ? 'done' : i === app.step ? 'next' : '';
      if (i === app.step - 1) cls += ' current';
      if (i === app.failedStep) cls += ' failed';
      var ev = Engine.stepEvent(st);
      return '<li class="' + cls + '" data-step="' + (i + 1) + '" title="' + esc(ev) + '">' + esc(label(ev)) + '</li>';
    }).join('');
    var cur = $('#step-list li.current') || $('#step-list li.next');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function renderEnv() {
    var evs = Engine.availableEnvEvents(app.state);
    $('#env-events').innerHTML = evs.length ? evs.map(function (ev) {
      return '<button type="button" data-env="' + esc(ev) + '">' + esc(label(ev).replace(/^環境: /, '')) + '</button>';
    }).join('') : '<span class="muted">今は発生させられるものがありません</span>';
    var auto = Engine.nextAuto(app.state);
    var text = '';
    if (auto) {
      text = scenarioActive() || app.playTimer
        ? '次の自動遷移: ' + label(auto.event) + ' (シナリオでは手順として進めます)'
        : '⏱ ' + (auto.auto / 1000) + ' 秒後に自動: ' + label(auto.event);
    }
    $('#auto-next').textContent = text;
    $('#ctx-codeResult').value = app.ctx.codeResult;
    $('#ctx-createResult').value = app.ctx.createResult;
  }

  // 状態名は _ の後ろで折り返す
  function stateName(name) {
    return esc(name).replace(/_/g, '_<wbr>');
  }

  function groupName(list) {
    var key = Object.keys(STATE_GROUPS).filter(function (k) {
      return STATE_GROUPS[k].join() === list.join();
    })[0];
    return key ? '<span class="group" title="' + esc(list.join(', ')) + '">' + stateName(key) + ' <small>(' + list.length + ')</small></span>' : null;
  }

  function stateCell(pat, dialog) {
    var html;
    if (pat === '*') html = '<span class="any">*</span>';
    else if (pat === '=') html = '<span class="any">(同じ)</span>';
    else if (Array.isArray(pat)) html = groupName(pat) || pat.map(stateName).join('<br>');
    else html = stateName(pat);
    if (dialog !== undefined) html += '<div class="dlg">🗨 ' + (dialog === null ? '閉じる' : esc(dialog)) + '</div>';
    return html;
  }

  function renderTable() {
    var onlyAvailable = $('#filter-available').checked;
    var html = TRANSITIONS.map(function (r) {
      var available = Engine.findRow(app.state, r.event) === r;
      if (onlyAvailable && !available) return '';
      var cls = [];
      if (app.lastRow === r) cls.push('fired');
      if (available) cls.push('available');
      if (r.when && Object.keys(r.when).some(function (k) { return /^U\d+$/.test(k) && app.opts[k] !== r.when[k]; })) cls.push('inactive');
      var memo = '<span class="ev-label">' + esc(label(r.event)) + '</span> ';
      if (r.auto) memo += '<span class="auto">⏱ 自動 ' + r.auto / 1000 + 's</span> ';
      if (r.when) memo += '<span class="when">条件: ' + Object.keys(r.when).map(function (k) { return esc(k + '=' + r.when[k]); }).join(', ') + '</span> ';
      if (r.note) memo += esc(r.note) + ' ';
      memo += r.undecided.map(function (id) {
        return '<button type="button" class="pill-undecided small" data-undecided="' + id + '">' + id + '</button>';
      }).join('') + r.decided.map(function (id) {
        return '<button type="button" class="pill-decided small" data-undecided="' + id + '">決定 ' + id + '</button>';
      }).join('');
      var dlg = function (d) { return r.dialog && d in r.dialog ? r.dialog[d] : undefined; };
      // 1 段目に状態とイベント、2 段目にメモ・未決 (狭いパネルでも状態名を読めるように)
      return '<tbody id="row-' + r.id + '" class="' + cls.join(' ') + '"><tr><td rowspan="2" class="rid">' + r.id + '</td>' +
        '<td>' + stateCell(r.from.host, r.from.hostDialog) + '</td><td>' + stateCell(r.from.client, r.from.clientDialog) + '</td>' +
        '<td class="ev"><code>' + esc(r.event).replace(/\./g, '.<wbr>') + '</code></td>' +
        '<td>' + stateCell(r.to.host, dlg('host')) + '</td><td>' + stateCell(r.to.client, dlg('client')) + '</td></tr>' +
        '<tr><td colspan="5" class="memo">' + memo + '</td></tr></tbody>';
    }).join('');
    var table = $('table.transitions');
    $$('tbody', table).forEach(function (tb) { tb.remove(); });
    table.insertAdjacentHTML('beforeend', html);
    var fired = $('tbody.fired', table);
    if (fired) fired.scrollIntoView({ block: 'nearest' });
  }

  function renderCurrent() {
    var s = app.state;
    var dl = function (d) { return s[d + 'Dialog'] ? ' <span class="dlg">+ 🗨 ' + esc(s[d + 'Dialog']) + '</span>' : ''; };
    var r = app.lastRow;
    $('#current-state').innerHTML =
      '<div class="cs-line"><span class="role-badge host small">Host</span> <code>' + esc(s.host) + '</code>' + dl('host') +
      ' <span class="sep">/</span> <span class="role-badge client small">Client</span> <code>' + esc(s.client) + '</code>' + dl('client') + '</div>' +
      '<div class="cs-last">' + (r ? '直前の遷移: <a href="#row-' + r.id + '" data-row="' + r.id + '">' + r.id + '</a> <code>' + esc(r.event) + '</code>' : '直前の遷移: なし (初期状態)') + '</div>' +
      contextHtml() + decidedHtml();
  }

  // 今の画面の説明 (SCREENS の context。文字列か、行ごとの配列) とシナリオの端末ごとの注記 (hostNote / clientNote)。
  // 端末の画面にはゲームが実際に出すものだけを描き、説明はこちらに出す。両端末で同じ行は 1 行にまとめる
  function contextHtml() {
    var lines = [];
    var seen = {};
    var sc = app.scenario && !app.detached ? app.scenario : null;
    var add = function (d, text) {
      if (!text) return;
      if (seen[text]) { seen[text].push(d); return; }
      seen[text] = [d];
      lines.push(text);
    };
    Engine.DEVICES.forEach(function (d) {
      add(d, sc && sc[d + 'Note']);
      [].concat(SCREENS[app.state[d]].context).forEach(function (text) { add(d, text); });
    });
    return lines.map(function (text) {
      var who = seen[text].map(function (d) {
        return '<span class="role-badge ' + d + ' small">' + (d === 'host' ? 'Host' : 'Client') + '</span>';
      }).join(' ');
      return '<div class="cs-context">' + who + ' ' + esc(text) + '</div>';
    }).join('');
  }

  // 決定済みの項目。今の画面や直前の遷移に関係するものを強調する
  function decidedHtml() {
    var related = uniq(relevantIds('host', 'decided').concat(relevantIds('client', 'decided')));
    var items = UNDECIDED.filter(function (u) { return u.decided; }).map(function (u) {
      var on = related.indexOf(u.id) !== -1;
      return '<li class="' + (on ? 'related' : '') + '"><button type="button" class="pill-decided small" data-undecided="' + u.id + '">決定 ' + u.id + '</button> ' +
        esc(u.title) + (on ? ' <small>(今の画面に関係)</small>' : '') +
        (u.decided.premise ? '<div class="cs-premise">前提: ' + esc(u.decided.premise) + '</div>' : '') + '</li>';
    }).join('');
    return '<div class="cs-decided"><span class="cs-label">決定済み</span><ul>' + items + '</ul></div>';
  }

  function renderUndecided() {
    var open = UNDECIDED.filter(function (u) { return !u.decided; }).length;
    $('#undecided-count').textContent = '(' + open + ')';
    $('#undecided-list').innerHTML = UNDECIDED.map(function (u) {
      if (u.decided) {
        var d = u.decided;
        return '<li id="u-' + u.id + '" class="decided"><div class="u-head"><span class="pill-decided">決定 ' + u.id + '</span> ' + esc(u.title) +
          ' <small>(' + esc(d.by) + ' ' + esc(d.date) + ')</small></div><p>' + esc(u.desc) + '</p>' +
          (d.reason ? '<p><b>理由:</b> ' + esc(d.reason) + '</p>' : '') +
          (d.premise ? '<p><b>前提:</b> ' + esc(d.premise) + '</p>' : '') + '</li>';
      }
      var opts = u.options ? '<div class="u-options">' + u.options.map(function (o) {
        var checked = app.opts[u.id] === o.value ? ' checked' : '';
        return '<label><input type="radio" name="opt-' + u.id + '" value="' + esc(o.value) + '" data-opt="' + u.id + '"' + checked + '> ' +
          esc(o.label) + (o.value === u.default ? ' <small>(既定)</small>' : '') + '</label>';
      }).join('') + '</div>' : '';
      var rows = TRANSITIONS.filter(function (r) { return r.undecided.indexOf(u.id) !== -1; }).map(function (r) {
        return '<a href="#row-' + r.id + '" data-row="' + r.id + '">' + r.id + '</a>';
      }).join(' ');
      return '<li id="u-' + u.id + '"><div class="u-head"><span class="pill-undecided">' + u.id + '</span> ' + esc(u.title) + '</div>' +
        '<p>' + esc(u.desc) + '</p>' + opts + (rows ? '<div class="u-rows">関係する行: ' + rows + '</div>' : '') + '</li>';
    }).join('');
  }

  function renderLog() {
    $('#event-log').innerHTML = app.log.slice().reverse().map(function (e) {
      var t = e.time.toTimeString().slice(0, 8);
      var kind = { step: '手順', user: '操作', auto: '自動', norow: '行なし' }[e.kind];
      var body = e.row
        ? '<a href="#row-' + e.row.id + '" data-row="' + e.row.id + '">' + e.row.id + '</a>'
        : '<span class="norow">遷移表に一致する行がありません (' + esc(app.state.host) + ' / ' + esc(app.state.client) + ')</span>';
      return '<li class="' + e.kind + '"><span class="t">' + t + '</span> <span class="k">' + kind + '</span> <code>' + esc(e.event) + '</code> ' + body + '</li>';
    }).join('');
  }

  function updateHash() {
    var hash = app.scenario ? '#s=' + app.scenario.id + '&step=' + app.step : '#s=free';
    if (frozen() && inGameCountdown()) hash += '&cd=' + app.cd;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function renderSide() {
    renderLog();
    renderEnv();
  }

  function render() {
    // シナリオを手順で進めている間はアニメーションを止めて決まったフレームを出す (スクリーンショットを決定的にする)
    document.body.classList.toggle('static', frozen());
    renderDevice('host');
    renderDevice('client');
    renderScenarioList();
    renderScenarioDetail();
    renderControls();
    renderCurrent();
    renderTable();
    renderUndecided();
    renderSide();
    updateHash();
  }

  function showTab(name) {
    $$('.tabs [data-tab]').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('[data-tab-body]').forEach(function (el) { el.hidden = el.dataset.tabBody !== name; });
  }

  function flash(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth; // アニメーションを再始動する
    el.classList.add('flash');
  }

  // ---- イベント配線 ---------------------------------------------------------

  function parseHash() {
    var p = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    return p;
  }

  function cdParam(p) {
    var n = parseInt(p.cd, 10);
    return GAME_COUNTDOWN.digits.indexOf(n) === -1 ? GAME_COUNTDOWN.digits[0] : n;
  }

  function applyHash() {
    var p = parseHash();
    var id = p.s && p.s !== 'free' ? p.s : (p.s === 'free' ? '' : '1');
    app.cd = cdParam(p);
    selectScenario(id, parseInt(p.step, 10) || 0);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var u = t.closest('[data-undecided]');
    if (u) {
      showTab('undecided');
      flash($('#u-' + u.dataset.undecided));
      return;
    }
    var rowLink = t.closest('[data-row]');
    if (rowLink) {
      e.preventDefault();
      $('#filter-available').checked = false;
      showTab('table');
      renderTable();
      flash($('#row-' + rowLink.dataset.row));
      return;
    }
    var evEl = t.closest('.device [data-ev]');
    if (evEl) {
      var dev = evEl.closest('.device').dataset.dev;
      userFire(dev + '.' + evEl.dataset.ev);
      return;
    }
    var env = t.closest('[data-env]');
    if (env) { userFire(env.dataset.env); return; }
    var sc = t.closest('[data-scenario]');
    if (sc) { selectScenario(sc.dataset.scenario, 0); return; }
    var cdBtn = t.closest('#cd-freeze [data-cd]');
    if (cdBtn) { app.cd = parseInt(cdBtn.dataset.cd, 10); render(); return; }
    var step = t.closest('[data-step]');
    if (step) { stopPlay(); rebuild(parseInt(step.dataset.step, 10)); return; }
    var tab = t.closest('[data-tab]');
    if (tab) { showTab(tab.dataset.tab); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.opt) setOpt(t.dataset.opt, t.value);
    else if (t.id === 'ctx-codeResult') setCtx('codeResult', t.value);
    else if (t.id === 'ctx-createResult') setCtx('createResult', t.value);
    else if (t.id === 'filter-available') renderTable();
  });

  $('#btn-next').addEventListener('click', function () { stopPlay(); nextStep(); });
  $('#btn-prev').addEventListener('click', function () { stopPlay(); rebuild(app.step - 1); });
  $('#btn-reset').addEventListener('click', function () { stopPlay(); rebuild(0); });
  $('#btn-auto').addEventListener('click', function () { if (app.playTimer) stopPlay(); else startPlay(); });

  document.addEventListener('keydown', function (e) {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight') { stopPlay(); nextStep(); }
    else if (e.key === 'ArrowLeft' && app.scenario) { stopPlay(); rebuild(app.step - 1); }
  });

  window.addEventListener('hashchange', function () {
    var p = parseHash();
    var cur = app.scenario ? app.scenario.id : '';
    var want = p.s && p.s !== 'free' ? p.s : '';
    if (want !== cur || (parseInt(p.step, 10) || 0) !== app.step) applyHash();
    else if (cdParam(p) !== app.cd) { app.cd = cdParam(p); render(); }
  });

  applyHash();
})();
