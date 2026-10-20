/*
 * 描画とコントローラ。画面の変化は決めない: state.host / state.client を SCREENS に従って
 * 描き、クリックされたらイベントを Engine に渡すだけ。
 */
(function () {
  'use strict';

  var MATCH_CODE = 'QWERTY123';
  // Match Code のコピーのボタン。ふつうのコピーのアイコン (重なった 2 枚の紙) で、ホストにだけ出す (#1891 の FB 5)。押すと "Match code copied" のトースト (決定 U69)
  var COPY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var MOCK_SEARCH_CONTROLS = ['leaveApp', 'searchTimeout'];
  var RESULT_HEADLINES = { Win: ['WIN!', 'win'], Lose: ['LOSE', 'lose'], Draw: ['DRAW', 'draw'], NoContest: ['NO CONTEST', 'nocontest'] };
  // ゲーム画面のプレースホルダー: 列ごとに下から積んだブロック ('+' は丸いブロック)
  var FIELD = [['S', 'H', 'Z', 'S'], ['Z', 'S', 'Y'], ['T', 'S', '+'], ['Z', 'T', 'S'], ['S', 'T', 'H', '+'], ['H', 'Z', '+', 'Z']];
  var OPP_FIELD = [['H', 'S', 'Z'], ['Z', 'T'], ['S', 'Y', 'T', 'Z'], ['T', 'Z'], ['+', 'H', 'S'], ['Z', 'H']];

  var app = {
    scenario: null, // null = 自由操作
    step: 0, // 再生済みの手順数
    detached: false, // シナリオの途中で手順と違う操作をした
    cd: 3, // 手順で止めているとき、ゲーム本体のカウントダウンで表示しておく数字 (#...&cd=3|2|1)
    ctx: Engine.defaultCtx(),
    // 端末ごとのあいさつの言語 (#1891 FB 13、GREETING_LANGS のどれか)。表示だけの設定で、状態と遷移表には入れない
    lang: { host: 'en', client: 'en' },
    state: null,
    lastRow: null,
    autoTimer: null,
  };

  // Profile の保存先 (決定 U56)。file:// などで localStorage を使えないときは null (保存しないで動く)
  var storage = (function () { try { return window.localStorage; } catch (e) { return null; } })();

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // お知らせの文を 1 文ずつ折り返さない塊にする ("Match cancelled. / Opponent did not reconnect." のように文の切れ目で改行させる)
  function sentences(text) {
    return esc(text).split(/(?<=\.) /).map(function (t) { return '<span class="sen">' + t + '</span>'; }).join(' ');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // シナリオを手順で進めている間は、アニメーションを止めて決まった 1 フレームを出す
  function frozen() {
    return !!scenarioActive();
  }

  function inGameCountdown() {
    return Engine.DEVICES.some(function (d) { return SCREENS[app.state[d]].countdown; });
  }

  function label(event) { return EVENT_LABELS[event] || event; }

  // ---- 状態の更新 -----------------------------------------------------------

  function selectScenario(id, step) {
    var sc = SCENARIOS.filter(function (s) { return s.id === id; })[0] || null;
    app.scenario = sc;
    app.ctx = Object.assign(Engine.defaultCtx(), sc && sc.ctx);
    rebuild(step || 0);
  }

  // シナリオを最初から n 手順目まで再生し直す
  function rebuild(n) {
    clearAuto();
    app.detached = false;
    if (!app.scenario) {
      // 自由操作は保存した絵文字とあいさつから始める。シナリオは localStorage に関係なくいつも最初の値から (スクリーンショットを決定的にする)
      app.state = Engine.initialState(app.ctx, storage && ProfileStore.load(storage));
      app.step = 0;
      app.lastRow = null;
      render();
      scheduleAuto();
      return;
    }
    n = Math.max(0, Math.min(n, app.scenario.steps.length));
    var res = Engine.replay(app.scenario, n, app.ctx);
    app.state = res.state;
    app.step = res.fired.length;
    app.lastRow = res.fired[res.fired.length - 1] || null;
    render();
    scheduleAuto();
  }

  // 実際にイベントを遷移表へ渡す唯一の場所。行が無ければ何もしない
  function fire(event) {
    var res = Engine.fire(app.state, event);
    if (!res) return false;
    persistProfiles(app.state, res.state);
    app.state = res.state;
    app.lastRow = res.row;
    render();
    scheduleAuto();
    return true;
  }

  function profilesOf(state) {
    var out = {};
    Engine.DEVICES.forEach(function (d) { out[d] = { emoji: state[d + 'Emoji'], greeting: state[d + 'Greeting'] }; });
    return out;
  }

  // Profile (決定 U56) で選んで保存した値が変わったら localStorage に残す。シナリオの再生中 (外れたあとも) は書かない
  function persistProfiles(before, after) {
    if (app.scenario || !storage) return;
    if (JSON.stringify(profilesOf(before)) !== JSON.stringify(profilesOf(after))) ProfileStore.save(storage, profilesOf(after));
  }

  function scenarioActive() {
    return app.scenario && !app.detached && app.step < app.scenario.steps.length;
  }

  function nextStep() {
    if (!scenarioActive()) return false;
    var ev = Engine.stepEvent(app.scenario.steps[app.step]);
    if (!fire(ev)) return false;
    app.step++;
    render();
    return true;
  }

  // 電話や環境イベントのボタンから: シナリオの次の手順と同じなら手順を進める
  function userFire(event) {
    if (scenarioActive() && Engine.stepEvent(app.scenario.steps[app.step]) === event) {
      nextStep();
      return;
    }
    if (!Engine.canFire(app.state, event)) return;
    if (app.scenario && app.step < app.scenario.steps.length) app.detached = true;
    fire(event);
  }

  function clearAuto() {
    if (app.autoTimer) clearTimeout(app.autoTimer);
    app.autoTimer = null;
  }

  // 自由操作中だけ、点線矢印 (auto 付きの行) を実時間で発火する
  function scheduleAuto() {
    clearAuto();
    if (scenarioActive()) return;
    var row = Engine.nextAuto(app.state);
    if (!row) return;
    app.autoTimer = setTimeout(function () {
      app.autoTimer = null;
      if (Engine.findRow(app.state, row.event) === row) fire(row.event);
    }, row.auto);
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
    // Random Match・Friend Match トップ・部屋の画面 (U68) の右上の Profile (決定 U56、#1891 の FB 12)。保存した絵文字を添え、押すと今の画面の上にダイアログで開く
    var profile = spec.profile ? '<button type="button" class="hdr-profile" aria-haspopup="dialog"' + attrs(dev, 'profile') + '>' +
      '<span class="hp-emoji" aria-hidden="true">' + esc(app.state[dev + 'Emoji']) + '</span>Profile</button>' : '';
    return '<div class="hdr">' + back + '<div class="title">' + esc(title || '') + '</div>' + profile + '</div>';
  }

  function buttonsHtml(dev, buttons) {
    // hideIfNoRow はダイアログを開いているあいだのブロックとは別に判定する (確認ダイアログの後ろでボタンが消えないように)
    var undimmed = Object.assign({}, app.state);
    undimmed[dev + 'Dialog'] = null;
    var html = (buttons || []).filter(function (b) {
      return !(b.hideIfNoRow && !Engine.canFire(undimmed, dev + '.' + b.event));
    }).map(function (b) {
      // disabled はゲーム内の無効表示 (Ready を送っている間の "Confirming…" など)。遷移表に行が無いときの破線とは別
      if (b.disabled) return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + ' is-disabled" disabled>' + esc(b.label) + '</button>';
      return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + (b.big ? ' big' : '') + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
    }).join('');
    return html ? '<div class="actions">' + html + '</div>' : '';
  }

  // 画面の下の帯 ("Connection failed"、決定 U6。Match Code の誤り・満員とコピーしたとき、U69)
  function toastHtml(dev, key) {
    if (!key) return '';
    var t = TOASTS[key];
    var tappable = t.tap && Engine.canFire(app.state, dev + '.' + t.tap);
    var tag = tappable ? 'button type="button"' : 'div';
    var close = tappable ? 'button' : 'div';
    return '<' + tag + ' class="toast ' + t.kind + (t.sub ? ' two-line' : '') + (tappable ? ' tappable' : '') + '"' + (tappable ? attrs(dev, t.tap) : '') + '>' +
      esc(t.text) + (t.sub ? '<span class="t-sub">' + esc(t.sub) + '</span>' : '') + (tappable ? '<span class="chev">›</span>' : '') + '</' + close + '>';
  }

  var VIEWS = {
    online: function (dev, s) {
      return header(dev, s, s.title) + '<div class="menu">' + s.items.map(function (it) {
        return '<button type="button" class="menu-item"' + attrs(dev, it.event) + '>' + esc(it.label) + '<span class="chev">›</span></button>';
      }).join('') + inlineNoticeHtml(dev, s.inlineNotice) + '</div>';
    },
    // Friend Match トップ (決定 U63、#1891 の FB 19): New Match と Join Match の 2 つだけ。Match Code は Join Match で開く Join a Match に入れる
    friendTop: function (dev, s) {
      return header(dev, s, s.title) +
        '<div class="body">' +
        roomNoticeHtml(dev, s.roomNotice) +
        '<div class="ft-buttons">' +
        '<button type="button" class="btn big"' + attrs(dev, 'createMatch') + '>New Match</button>' +
        '<button type="button" class="btn big"' + attrs(dev, 'openJoin') + '>Join Match</button>' +
        '</div></div>' + (s.join ? joinDialogHtml(dev, s.join) : '');
    },
    lobby: function (dev, s) {
      return header(dev, s, s.title) +
        '<div class="body">' +
        '<div class="code-head"><span>Match Code</span>' + (s.copyCode ? '<button type="button" class="copy" aria-label="Copy match code" title="Copy match code"' +
          attrs(dev, 'copyCode') + '>' + COPY_ICON + '</button>' : '') + '</div>' +
        '<div class="code">' + MATCH_CODE + '</div>' +
        (s.codeHint ? '<div class="code-hint">' + esc(CODE_HINT) + '</div>' : '') +
        (s.cards ? readyHtml(dev, s) : '<div class="status-block">' +
          (s.name ? '<div class="peer">' + esc(s.name) + '</div>' : '') +
          '<div class="status' + (s.name ? '' : ' solo') + '">' + esc(s.status).replace(/\n/g, '<br>') + '</div></div>') +
        '</div>' + buttonsHtml(dev, s.buttons);
    },
    random: function (dev, s) {
      return header(dev, s, s.title) + '<div class="body center">' +
        (s.status ? '<div class="status">' + esc(s.status) + '</div><div class="dots"><i></i><i></i><i></i></div>' : '') + '</div>' +
        buttonsHtml(dev, s.buttons);
    },
    // 絵文字とあいさつは、部屋を作った・入った・探し始めたときに固定した値 (決定 U56)
    // ゲーム画面と同じく、どちらの端末でも相手のカードが上、自分のカードが下 (qniapp/qa2#1891 FB 15)
    vs: function (dev, s) {
      var other = dev === 'host' ? 'client' : 'host';
      var card = function (who) {
        return '<div class="vs-card ' + who + (who === dev ? ' me' : '') + '">' +
          (who === dev ? '<span class="you">YOU</span>' : '') +
          vsCardBody(dev, PLAYERS[who].name, app.state[who + 'ShownEmoji'], app.state[who + 'ShownGreeting'], 'Rating ' + ELO.initial) + '</div>';
      };
      return '<div class="vs">' + card(other) + '<div class="vs-mark">VS</div>' + card(dev) +
        '<div class="vs-bar"><i></i></div></div>' + (s.overlay ? overlayHtml(s) : '');
    },
    // ゲーム画面のプレースホルダー。HUD・カウントダウンは実機 (VsAI) の画面にならう。
    // メニューボタン (☰) はプレイ中だけ出る (カウントダウン中と、MATCH MENU を開いている間は隠す)
    game: function (dev, s) {
      var opp = PLAYERS[dev === 'host' ? 'client' : 'host'];
      var me = '<div class="g-me">' +
        '<div class="g-hud"><div class="g-time"><span>Time</span><b>0:00</b></div>' +
        '<div class="g-score"><span>Score</span><b>0</b></div></div>' +
        (s.countdown || s.menu || s.overlay ? '' : '<button type="button" class="g-menu" aria-label="Match menu"' + attrs(dev, 'matchMenu') + '><i></i><i></i><i></i></button>') +
        fieldHtml(FIELD, 'g-field') +
        (s.countdown ? countdownHtml() : '') +
        '<div class="g-bar"><span class="g-gauge"><i></i></span><span class="g-up">︽</span></div>' +
        '</div>';
      return '<div class="game' + (s.countdown ? ' counting' : '') + '">' +
        '<div class="g-opp"><div class="g-score small"><span>Score</span><b>0</b></div>' +
        '<div class="g-opp-name">' + esc(opp.name) + '</div>' +
        fieldHtml(OPP_FIELD, 'g-mini') + '<span class="g-opp-gauge"></span></div>' + me + '</div>' +
        (s.menu ? matchMenuHtml(dev, s.menu) : '') + (s.overlay ? overlayHtml(s) : '');
    },
    // 対戦後の結果画面 (決定 U20〜U30)。勝敗・両者の名前・終わった理由・レーティング、再戦の段階の一行、スタンプ、ボタン。
    // スコアは出さない (qniapp/qa2#1891 FB 7: 勝敗とレーティングの変化だけ)
    // ボタンと Rating の行は Friend Match かランダム対戦か (セッションの match / rated) で変わる。
    // 再戦のくるくる (決定 U72) を出している間は、後ろの結果画面を同じ見た目のまま inert にして押せなくする
    result: function (dev, s) {
      var other = dev === 'host' ? 'client' : 'host';
      var head = RESULT_HEADLINES[s.outcome];
      var rating = ratingText(s.outcome, app.state);
      // Friend Match で相手が抜けたときは、相手は同じ部屋に戻っている (決定 U61)
      var status = REMATCH_STATUS[s.status === 'OpponentLeft' && app.state.match === 'friend' ? 'FriendReturned' : s.status];
      // 送ったスタンプは、両者の画面で送った人の名前の上に出す
      var player = function (who, isMe) {
        var stamp = stampById(app.state[who + 'Stamp']);
        return '<div class="r-player' + (isMe ? ' me' : '') + '">' +
          (stamp ? '<div class="r-bubble"><span class="r-emoji">' + stamp.emoji + '</span>' + esc(stamp.text) + '</div>' : '') +
          (isMe ? '<span class="you">YOU</span>' : '') + '<b>' + esc(PLAYERS[who].name) + '</b></div>';
      };
      var stats = (rating && /^No /.test(rating) ? '<div class="r-row r-note">' + esc(rating) + '</div>' : '') +
        (rating && !/^No /.test(rating) ? '<div class="r-row"><span>Rating</span><b>' + esc(rating) + '</b></div>' : '');
      var inert = s.spinner ? ' inert' : '';
      return header(dev, s, s.title) + '<div class="result"' + inert + '>' +
        '<div class="r-outcome ' + head[1] + '">' + head[0] + '</div>' +
        '<div class="r-reason">' + esc(END_REASONS[resultReason(s, app.state)]) + '</div>' +
        '<div class="r-players">' + player(dev, true) + '<span class="r-vs">vs</span>' + player(other, false) + '</div>' +
        (stats ? '<div class="r-stats">' + stats + '</div>' : '') +
        '<div class="r-status ' + (status ? status.kind : '') + '">' + (status ? esc(status.text) : '') + '</div>' +
        (s.stamps ? stampsHtml(dev, !!s.spinner) : '') +
        '</div>' + resultActionsHtml(dev, resultButtons(s, app.state.match), !!s.spinner) + (s.spinner ? rematchSpinnerHtml(dev, s.spinner) : '');
    },
  };

  function fmt(n) { return n.toLocaleString('en-US'); }

  // あいさつを囲むかぎかっこ。英語は “ ”、日本語は「 」(#1891 FB 13)
  var GREETING_QUOTES = { en: ['\u201c', '\u201d'], ja: ['\u300c', '\u300d'] };

  // VS 画面のカードの中身。Profile のダイアログの見本 (決定 U56) も同じものを使う (見本にはレーティングを出さない)。
  // あいさつ (id) は、相手のものも含めて、描いている端末 dev の言語で出す (#1891 FB 13)
  function vsCardBody(dev, name, emoji, greeting, rating) {
    var lang = app.lang[dev];
    var q = GREETING_QUOTES[lang];
    return '<div class="vs-emoji">' + esc(emoji) + '</div>' +
      '<div class="vs-name">' + esc(name) + '</div>' +
      (rating ? '<div class="vs-rating">' + esc(rating) + '</div>' : '') +
      '<div class="vs-greet" lang="' + lang + '">' + q[0] + esc(greetingText(greeting, lang)) + q[1] + '</div>';
  }

  // Ready 画面 (決定 U36): プレイヤーごとのカード (自分が左、YOU 付き) に名前とレーティング (#1891 FB 4、VS 画面と同じ値) と "✓ Ready" / "Not ready"。
  // その下にお知らせ (タイムアウトなど)、状況の一行 ("Waiting for opponent…" など)、待っている印 (点の動き) か再接続のカウントダウン (秒)
  function readyHtml(dev, s) {
    var other = dev === 'host' ? 'client' : 'host';
    var card = function (who, ready, isMe) {
      return '<div class="rd-card' + (ready ? ' ready' : '') + (isMe ? ' me' : '') + '">' + (isMe ? '<span class="you">YOU</span>' : '') +
        '<div class="rd-name">' + esc(PLAYERS[who].name) + '<span class="rd-rating">' + ELO.initial + '</span></div>' +
        '<div class="rd-state">' + (ready ? '\u2713 Ready' : 'Not ready') + '</div></div>';
    };
    return '<div class="ready-block"><div class="rd-cards">' + card(dev, s.cards.me, true) + card(other, s.cards.them, false) + '</div>' +
      '<div class="rd-info">' +
      (s.readyNotice ? '<p class="rd-notice" role="status">' + esc(s.readyNotice) + '</p>' : '') +
      (s.status ? '<div class="status">' + esc(s.status).replace(/\n/g, '<br>') + '</div>' : '') +
      (s.dots ? '<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>' : '') +
      (s.timer ? '<div class="rd-timer" aria-label="' + s.timer + ' seconds left"><b>' + s.timer + '</b>s</div>' : '') +
      '</div></div>';
  }

  function stampById(id) {
    return STAMPS.filter(function (st) { return st.id === id; })[0] || null;
  }

  // スタンプ (決定 U27)。送ってから 5 秒 (仮) は押せない (ゲーム内の無効表示)。ミュートのボタンは無い (#1891 の FB 8)。
  // 再戦のくるくるの後ろ (behind、決定 U72) では見た目を変えずにイベントを付けない (inert の中なので押せない)
  function stampsHtml(dev, behind) {
    var waiting = app.state[dev + 'Stamp'] !== null;
    return '<div class="r-stamps">' + STAMPS.map(function (st) {
      if (waiting) return '<button type="button" class="r-stamp is-disabled" disabled aria-label="' + esc(st.text) + '">' + st.emoji + '</button>';
      return '<button type="button" class="r-stamp" aria-label="' + esc(st.text) + '"' + (behind ? '' : attrs(dev, 'stamp.' + st.id)) + '>' + st.emoji + '</button>';
    }).join('') + '</div>';
  }

  // 結果画面のボタン。再戦のくるくるの後ろ (behind、決定 U72) では、見た目を変えずに inert にする (行が無い破線の表示にはしない)
  function resultActionsHtml(dev, buttons, behind) {
    return '<div class="actions result-actions"' + (behind ? ' inert' : '') + '>' + buttons.map(function (b) {
      return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + '"' + (behind ? '' : attrs(dev, b.event)) + '>' + esc(b.label) + '</button>';
    }).join('') + '</div>';
  }

  // 再戦のくるくる (決定 U72)。キャンセルできる読み込みの表示で、結果画面の上に暗幕と一緒に出す。
  // 自分だけが押した間は "Waiting for opponent…" と Cancel、両者が押したら "Starting match…" (取り消せない)
  function rematchSpinnerHtml(dev, sp) {
    return '<div class="dim rematch-wait"><div class="rw-box" role="status">' +
      '<div class="spinner" aria-hidden="true"></div><p class="rw-text">' + esc(sp.text) + '</p>' +
      (sp.cancel ? '<button type="button" class="btn rw-cancel"' + attrs(dev, sp.cancel.event) + '>' + esc(sp.cancel.label) + '</button>' : '') +
      '</div></div>';
  }

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

  // 片方が切断して待っている間の表示 (決定 U46 / U54)。MATCH MENU と同じパネルに、ボタンの代わりに残りの秒数。
  // サーバーが両者のゲームを止めているので、暗幕は MATCH MENU (試合は止まらない) より濃くする
  function overlayHtml(s) {
    return '<div class="m-dim paused"><div class="p-panel m-panel" role="status">' +
      '<div class="m-title">' + esc(s.overlay.title) + '</div><p class="m-body">' + esc(s.overlay.body) + '</p>' +
      '<div class="rd-timer m-timer" aria-label="' + s.timer + ' seconds left"><b>' + s.timer + '</b>s</div></div></div>';
  }

  // Join a Match のダイアログ (決定 U63)。右上の × で閉じる。Match Code の誤り・満員はダイアログの中ではなく画面の下のトーストで出す (U69)
  function joinDialogHtml(dev, j) {
    var value = j.input ? '<span class="value">' + esc(j.input) + '</span>' : '<span class="placeholder">Enter code</span>';
    var field = Engine.canFire(app.state, dev + '.enterCode')
      ? '<button type="button" class="input" aria-label="Match Code"' + attrs(dev, 'enterCode') + '>' + value + '</button>'
      : '<div class="input" role="textbox" aria-readonly="true" aria-label="Match Code">' + value + '</div>';
    return '<div class="dim"><div class="dialog join-dialog" role="dialog" aria-label="Join a Match">' +
      '<button type="button" class="d-close" aria-label="Close"' + attrs(dev, 'closeJoin') + '>\u00d7</button>' +
      '<div class="d-title">Join a Match</div>' +
      '<div class="d-label" aria-hidden="true">Match Code</div>' + field +
      '<button type="button" class="btn primary"' + attrs(dev, 'joinMatch') + '>Join</button></div></div>';
  }

  // Friend Match トップの部屋のお知らせ (決定 U52)。モーダルではない帯で、Close で閉じる (Join a Match を開いて Match Code を入れても消えない、U63)
  function roomNoticeHtml(dev, n) {
    if (!n) return '';
    return '<div class="room-notice" role="status"><p class="rn-text">' + sentences(n.text) + '</p>' + n.buttons.map(function (b) {
      return '<button type="button" class="rn-close"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
    }).join('') + '</div>';
  }

  // MATCH MENU (決定 U37。SURRENDER ですぐ降参し、別の確認は出さない、U65)。パネルとボタンは実機のポーズポップアップ (Menu_Pause) にならうが、
  // 試合は止まらないので暗幕は薄くし、ゲーム画面が見えたままにする
  function matchMenuHtml(dev, m) {
    return '<div class="m-dim"><div class="p-panel m-panel" role="dialog" aria-label="' + esc(m.title) + '">' +
      '<div class="m-title">' + esc(m.title) + '</div><p class="m-body">' + esc(m.body) + '</p>' +
      m.buttons.map(function (b) {
        return '<button type="button" class="p-btn ' + b.kind + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
      }).join('') + '</div></div>';
  }

  // 端末の下のモック操作 (ゲーム内 UI ではない)。押せるかどうかは遷移表で決まる。
  // ランダム対戦で相手を探している間は「アプリを離れる」と「60 秒たつ」(決定 U13 / U29 / U47)、ロビー (Ready 画面) では「アプリを離れる」と「切断する」(決定 U5 / U35)、
  // 結果画面ではスタンプの「3 秒たつ」「5 秒たつ」(決定 U27)、再戦のくるくるで相手を待っている間は「相手も Rematch を押す」(決定 U72。相手の端末の Rematch と同じ)、切断を待っている間は「再接続する」(相手側は「相手が戻る」) と「20 秒たつ」(決定 U46 / U54。右パネルの環境イベントと同じ)、
  // それ以外は時間切れの決着 (勝ち / 負け / 同点、決定 U44) と、この端末の接続が切れる「切断する」(決定 U28 / U32 / U54)
  function mockControlsHtml(dev) {
    var btn = function (ev, text, cls) { return '<button type="button" class="mc-btn' + (cls ? ' ' + cls : '') + '"' + attrs(dev, ev) + '>' + esc(text) + '</button>'; };
    var envBtn = function (ev, text) {
      var ok = Engine.canFire(app.state, ev);
      return '<button type="button" class="mc-btn" data-env="' + esc(ev) + '"' + (ok ? '' : ' data-norow="1" title="遷移表に行がありません (' + esc(ev) + ')"') + '>' + esc(text) + '</button>';
    };
    var state = app.state[dev];
    var overlay = SCREENS[state].overlay;
    if (overlay) {
      return '<span class="mc-label">モック操作 (切断中):</span>' + envBtn('net.recovered', overlay === DISCONNECT_OVERLAYS.self ? '再接続する' : '相手が戻る') +
        envBtn('timer.disconnectTimeout', '20 秒たつ');
    }
    // Profile のダイアログ (決定 U56) を開いている間も検索中の操作を出す (ダイアログの外の操作なので、押せない表示になる)
    var undimmed = Object.assign({}, app.state);
    undimmed[dev + 'Dialog'] = null;
    if (/\.Matchmake/.test(state) && MOCK_SEARCH_CONTROLS.some(function (ev) { return Engine.canFire(undimmed, dev + '.' + ev); })) {
      return '<span class="mc-label">モック操作 (検索中):</span>' + btn('leaveApp', 'アプリを離れる') + btn('searchTimeout', '60 秒たつ');
    }
    if (/\.FriendMatch\.Lobby\./.test(state)) {
      return '<span class="mc-label">モック操作 (マッチ):</span>' + btn('leaveApp', 'アプリを離れる') + btn('disconnect', '切断する');
    }
    if (/\.RematchRequested$/.test(state)) {
      var other = dev === 'host' ? 'client' : 'host';
      return '<span class="mc-label">モック操作 (再戦):</span>' + envBtn(other + '.rematch', '相手も Rematch を押す');
    }
    if (isResultState(app.state[dev])) {
      return '<span class="mc-label">モック操作 (スタンプ):</span>' + btn('stampShown', '3 秒たつ') + btn('stampInterval', '5 秒たつ');
    }
    return '<span class="mc-label">モック操作 (時間切れ):</span>' + btn('win', '勝ち', 'compact') + btn('lose', '負け', 'compact') + btn('draw', '同点', 'compact') +
      '<span class="mc-sep" aria-hidden="true"></span>' + btn('disconnect', '切断する');
  }

  // 60 秒探しても見つからなかったときの通知 (決定 U13 / U29)。元の画面の上に、確認ダイアログと同じ見た目で出す
  function noticeHtml(dev, n) {
    if (!n) return '';
    return '<div class="dim"><div class="dialog" role="dialog"><div class="d-title notice">' + esc(n.text) + '</div>' +
      n.buttons.map(function (b) {
        return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
      }).join('') + '</div></div>';
  }

  // アプリを離れて検索が止まったときの通知 (決定 U43)。モーダルではなく Online Battle の中のボックスなので、上のメニューも押せる
  function inlineNoticeHtml(dev, n) {
    if (!n) return '';
    return '<div class="inline-notice" role="status"><p class="in-text">' + sentences(n.text) + '</p><div class="btn-row">' +
      n.buttons.map(function (b) {
        return '<button type="button" class="btn' + (b.primary ? ' primary' : '') + '"' + attrs(dev, b.event) + '>' + esc(b.label) + '</button>';
      }).join('') + '</div></div>';
  }

  // Profile のダイアログ (決定 U56、#1891 の FB 12): 今の画面の上に、題名と右上の ×、VS 画面のカードの見本、絵文字とあいさつを 1 つずつ。
  // 選ぶとすぐ保存する (#1891 の FB 14。"Saved" は出さない、U64)。閉じるのは Join a Match と同じ右上の × だけ (U64。Save / Cancel・Esc・外側を押して閉じるは無い)
  function profileDialogHtml(dev, d) {
    var emoji = app.state[dev + 'Emoji'];
    var greeting = app.state[dev + 'Greeting'];
    var choice = function (cls, ev, selected, label, content) {
      return '<button type="button" class="' + cls + (selected ? ' selected' : '') + '" aria-pressed="' + selected + '"' +
        (label ? ' aria-label="' + esc(label) + '"' : '') + attrs(dev, ev) + '>' + content + '</button>';
    };
    var titleId = 'pf-title-' + dev;
    return '<div class="dim"><div class="dialog pf-dialog" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '">' +
      '<button type="button" class="d-close" aria-label="Close"' + attrs(dev, d.close) + '>\u00d7</button>' +
      '<div class="pf-head"><div class="d-title" id="' + titleId + '">' + esc(d.title) + '</div></div>' +
      '<div class="vs-card pf-card ' + dev + '">' + vsCardBody(dev, PLAYERS[dev].name, emoji, greeting) + '</div>' +
      '<div class="sec-label">Emoji</div><div class="pf-emojis" role="group" aria-label="Emoji">' + PROFILE_EMOJIS.map(function (e) {
        return choice('pf-emoji', 'dialog.pickEmoji.' + e.id, e.emoji === emoji, e.name, e.emoji);
      }).join('') + '</div>' +
      '<div class="sec-label">Greeting</div><div class="pf-greets" role="group" aria-label="Greeting">' + PROFILE_GREETINGS.map(function (g) {
        return choice('pf-greet', 'dialog.pickGreeting.' + g.id, g.id === greeting, null, esc(g[app.lang[dev]]));
      }).join('') + '</div></div></div>';
  }

  function dialogHtml(dev, key) {
    if (!key) return '';
    var d = DIALOGS[key];
    if (d.profile) return profileDialogHtml(dev, d);
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
    $('.state-name', root).innerHTML = stateName(name) + esc(Engine.extrasLabel(app.state, dev));

    var screen = $('.screen', root);
    // トーストは画面のもの (spec.toast) か、画面によらないもの (付属状態の Toast、Match Code をコピーしたとき、U69)
    var html = VIEWS[spec.view](dev, spec) + toastHtml(dev, spec.toast || app.state[dev + 'Toast']) + noticeHtml(dev, spec.notice) + dialogHtml(dev, dlg);
    // 同じ内容なら差し替えない (VS やカウントダウンのアニメーションを最初からやり直させない)
    if (screen.dataset.html !== html) {
      // 差し替える前にフォーカスしていたボタンへ、差し替えたあともフォーカスを戻す (キーボードで Profile の候補を続けて選べるように)。
      // Profile のダイアログを開いたとき (前のフォーカスがダイアログの外) は、フォーカスをダイアログの中 (×) へ移す
      var focused = screen.contains(document.activeElement) && document.activeElement.dataset.ev;
      screen.className = 'screen view-' + spec.view;
      screen.innerHTML = html;
      screen.dataset.html = html;
      var pfDialog = dlg && $('.pf-dialog', screen);
      var target = (focused && $((pfDialog ? '.pf-dialog ' : '') + '[data-ev="' + focused + '"]', screen)) || (pfDialog && $('.d-close', pfDialog));
      if (target) target.focus({ preventScroll: true });
    }
    $('.mock-controls', root).innerHTML = mockControlsHtml(dev);
    $$('.lang-toggle[data-dev="' + dev + '"] [data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === app.lang[dev])); });
  }

  function uniq(list) {
    return list.filter(function (id, i) { return list.indexOf(id) === i; });
  }

  // この端末の画面と、直前に発火した行 (この端末に関係するもの) の決定の ID
  function relatedDecidedIds(dev) {
    var ids = SCREENS[app.state[dev]].decided.slice();
    var r = app.lastRow;
    if (r && (r.to[dev] !== '*' || (r.dialog && dev in r.dialog))) ids = ids.concat(r.decided);
    return uniq(ids);
  }

  // ---- パネル ---------------------------------------------------------------

  function renderEnv() {
    var evs = Engine.availableEnvEvents(app.state);
    $('#env-events').innerHTML = evs.length ? evs.map(function (ev) {
      return '<button type="button" data-env="' + esc(ev) + '">' + esc(label(ev).replace(/^環境: /, '')) + '</button>';
    }).join('') : '<span class="muted">今は発生させられるものがありません</span>';
    var auto = Engine.nextAuto(app.state);
    var text = '';
    if (auto) {
      text = scenarioActive()
        ? '次の自動遷移: ' + label(auto.event) + ' (シナリオでは → キーで手順として進めます)'
        : '⏱ ' + (auto.auto / 1000) + ' 秒後に自動: ' + label(auto.event);
    }
    $('#auto-next').textContent = text;
    $('#ctx-codeResult').value = app.ctx.codeResult;
    $('#ctx-createResult').value = app.ctx.createResult;
  }

  // 状態名 (Host.FriendMatch.Lobby.Ready.WaitingForOpponent など) は . の後ろで折り返す。
  // . で区切った部分ごとに inline-block にし、1 つの部分が幅に収まらないときだけ CamelCase の切れ目で折る
  function stateName(name) {
    var parts = name.split('.');
    return parts.map(function (p, i) {
      return '<span class="sn">' + esc(p).replace(/([a-z])([A-Z])/g, '$1<wbr>$2') + (i < parts.length - 1 ? '.' : '') + '</span>';
    }).join('');
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
      var memo = '<span class="ev-label">' + esc(label(r.event)) + '</span> ';
      if (r.auto) memo += '<span class="auto">⏱ 自動 ' + r.auto / 1000 + 's</span> ';
      var conds = Object.keys(r.when || {}).map(function (k) { return k + '=' + r.when[k]; }).concat(Object.keys(r.from).filter(function (k) {
        return Engine.DEVICES.indexOf(k) === -1 && !/Dialog$/.test(k);
      }).map(function (k) { return k + '=' + [].concat(r.from[k]).map(String).join('|'); }));
      if (conds.length) memo += '<span class="when">条件: ' + esc(conds.join(', ')) + '</span> ';
      if (r.set) memo += '<span class="when">設定: ' + esc(Object.keys(r.set).map(function (k) { return k + '=' + r.set[k]; }).join(', ')) + '</span> ';
      if (r.copy) memo += '<span class="when">写す: ' + esc(Object.keys(r.copy).map(function (k) { return k + '\u2190' + r.copy[k]; }).join(', ')) + '</span> ';
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
    var r = app.lastRow;
    $('#current-state').innerHTML = sessionHtml() +
      '<div class="cs-last">' + (r ? '直前の遷移: <a href="#row-' + r.id + '" data-row="' + r.id + '">' + r.id + '</a> <code>' + esc(r.event) + '</code>' : '直前の遷移: なし (初期状態)') + '</div>' +
      contextHtml() + decidedHtml();
  }

  // 対戦のセッション (Friend Match かランダム対戦か、レートが変わるか、降参で終わったか)。どちらかの端末が対戦相手といる間だけ出す
  function sessionHtml() {
    var s = app.state;
    if (!s.match || !Engine.DEVICES.some(function (d) { return isWithOpponent(s[d]); })) return '';
    var text = s.match === 'friend' ? 'Friend Match (レートは変わらない)' : s.rated ? 'ランダム対戦 (レートが変わる、Elo)' : 'ランダム対戦の再戦 (レートは変わらない)';
    // 降参で終わった試合 (決定 U38 / U66) は、結果画面の終わった理由が "You surrendered" / "Your opponent surrendered" になる
    if (s.surrendered) text += '。負けた側の降参で終わった (U66: 時間切れと同じ結果画面で、再戦できる)';
    return '<div class="cs-session">対戦: <code>match=' + esc(s.match) + ', rated=' + s.rated + (s.surrendered ? ', surrendered=true' : '') + '</code> ' + esc(text) + '</div>';
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
      var dlg = app.state[d + 'Dialog'];
      if (dlg) add(d, DIALOGS[dlg].context);
    });
    return lines.map(function (text) {
      var who = seen[text].map(function (d) {
        return '<span class="role-badge ' + d + ' small">' + (d === 'host' ? 'Host' : 'Client') + '</span>';
      }).join(' ');
      return '<div class="cs-context">' + who + ' ' + esc(text) + '</div>';
    }).join('');
  }

  // 今の画面や直前の遷移に関係する決定。題名 (と前提) まで出す。すべての決定は決定タブで読める
  function decidedHtml() {
    var related = uniq(relatedDecidedIds('host').concat(relatedDecidedIds('client')));
    var on = UNDECIDED.filter(function (u) { return u.decided && related.indexOf(u.id) !== -1; });
    if (!on.length) return '';
    var items = on.map(function (u) {
      return '<li><button type="button" class="pill-decided small" data-undecided="' + u.id + '" title="' + esc(u.title) + '">決定 ' + u.id + '</button> ' +
        esc(u.title) + (u.decided.premise ? '<div class="cs-premise">前提: ' + esc(u.decided.premise) + '</div>' : '') + '</li>';
    }).join('');
    return '<div class="cs-decided"><span class="cs-label">決定済み (今の画面に関係)</span><ul>' + items + '</ul></div>';
  }

  function renderUndecided() {
    $('#undecided-list').innerHTML = UNDECIDED.map(function (u) {
      if (u.decided) {
        var d = u.decided;
        return '<li id="u-' + u.id + '" class="decided"><div class="u-head"><span class="pill-decided">決定 ' + u.id + '</span> ' + esc(u.title) +
          ' <small>(' + esc(d.by) + ' ' + esc(d.date) + ')</small></div><p>' + esc(u.desc) + '</p>' +
          (d.reason ? '<p><b>理由:</b> ' + esc(d.reason) + '</p>' : '') +
          (d.premise ? '<p><b>前提:</b> ' + esc(d.premise) + '</p>' : '') + '</li>';
      }
      var rows = TRANSITIONS.filter(function (r) { return r.undecided.indexOf(u.id) !== -1; }).map(function (r) {
        return '<a href="#row-' + r.id + '" data-row="' + r.id + '">' + r.id + '</a>';
      }).join(' ');
      return '<li id="u-' + u.id + '"><div class="u-head"><span class="pill-undecided">' + u.id + '</span> ' + esc(u.title) + '</div>' +
        '<p>' + esc(u.desc) + '</p>' + (rows ? '<div class="u-rows">関係する行: ' + rows + '</div>' : '') + '</li>';
    }).join('');
  }

  function updateHash() {
    var hash = app.scenario ? '#s=' + app.scenario.id + '&step=' + app.step : '#s=free';
    if (frozen() && inGameCountdown()) hash += '&cd=' + app.cd;
    var lang = langParam(app.lang);
    if (lang) hash += '&lang=' + lang;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function render() {
    // シナリオを手順で進めている間はアニメーションを止めて決まったフレームを出す (スクリーンショットを決定的にする)
    document.body.classList.toggle('static', frozen());
    renderDevice('host');
    renderDevice('client');
    renderCurrent();
    renderTable();
    renderUndecided();
    renderEnv();
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

  // あいさつの言語の hash (#...&lang=ja は両端末、lang=ja,en はホスト,クライアント)。両方 en なら書かない
  function langParam(lang) {
    if (lang.host === 'en' && lang.client === 'en') return '';
    return lang.host === lang.client ? lang.host : lang.host + ',' + lang.client;
  }

  function langOf(p) {
    var v = (p.lang || '').split(',');
    var pick = function (x) { return GREETING_LANGS.indexOf(x) === -1 ? 'en' : x; };
    return { host: pick(v[0]), client: pick(v.length > 1 ? v[1] : v[0]) };
  }

  // シナリオ id ('' は自由操作) の step 手順目を開く。ゲーム本体のカウントダウン中なら cd (3 / 2 / 1) で止めて表示する
  function show(id, step, cd) {
    app.cd = GAME_COUNTDOWN.digits.indexOf(cd) === -1 ? GAME_COUNTDOWN.digits[0] : cd;
    selectScenario(id, step);
  }

  // #s=<シナリオ ID>&step=<手順数>&cd=<3|2|1>。s が無いか free なら自由操作
  function applyHash() {
    var p = parseHash();
    app.lang = langOf(p);
    show(p.s && p.s !== 'free' ? p.s : '', parseInt(p.step, 10) || 0, cdParam(p));
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
    // Match Code のコピーのボタンは、クリップボードに書いたうえで遷移表の copyCode も発火する ("Match code copied" のトースト、決定 U69)
    var copy = t.closest('.device .copy');
    if (copy && !copy.hasAttribute('data-norow') && navigator.clipboard) navigator.clipboard.writeText(MATCH_CODE).catch(function () {});
    var langEl = t.closest('.lang-toggle [data-lang]');
    if (langEl) {
      app.lang[langEl.closest('.lang-toggle').dataset.dev] = langEl.dataset.lang;
      render();
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
    var tab = t.closest('[data-tab]');
    if (tab) { showTab(tab.dataset.tab); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'ctx-codeResult') setCtx('codeResult', t.value);
    else if (t.id === 'ctx-createResult') setCtx('createResult', t.value);
    else if (t.id === 'filter-available') renderTable();
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.closest('input, select, textarea')) return;
    // Esc では Profile のダイアログを閉じない (閉じるのは右上の × だけ、#1891 の FB 14、決定 U64)
    if (e.key === 'ArrowRight') nextStep();
    else if (e.key === 'ArrowLeft' && app.scenario) rebuild(app.step - 1);
  });

  window.addEventListener('hashchange', function () {
    var p = parseHash();
    var cur = app.scenario ? app.scenario.id : '';
    var want = p.s && p.s !== 'free' ? p.s : '';
    if (want !== cur || (parseInt(p.step, 10) || 0) !== app.step) applyHash();
    else if (cdParam(p) !== app.cd || langParam(langOf(p)) !== langParam(app.lang)) { app.cd = cdParam(p); app.lang = langOf(p); render(); }
  });

  // 手順を 1 枚ずつ描いて確かめるテスト (tests/scan-screens.mjs) 用。hash を大量に書き換えると Chromium が history.replaceState を黙って捨てるので、直接呼ぶ。
  // scenario は開いているシナリオ (null = 自由操作)
  window.MockApp = { show: show, get scenario() { return app.scenario; } };

  applyHash();
  // Web フォント (Oxanium) が読み込まれると行の高さが変わるので、描画し直して直前の行と手順を見える位置へスクロールし直す
  if (document.fonts) document.fonts.ready.then(render);
})();
