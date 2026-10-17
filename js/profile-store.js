/*
 * Profile の絵文字とあいさつ (決定 U56) をブラウザの localStorage に残す。DOM には触らない。
 * storage は localStorage と同じ getItem / setItem を持つもの (tests/check.js は Map で代わりにする)。
 * あいさつは id で残す (#1891 FB 13 で言語ごとの文になった)。前のモックが残した英語の文は id に読み替える。
 * 読めない・壊れている・候補に無い値は、端末ごとに最初の値 (PROFILE_INITIAL) に戻す。
 */
var ProfileStore = (function () {
  // モックの名前で区切ったキー (同じオリジンのほかのページと混ざらないように)
  var KEY = 'qa2-match-mock.profile';

  // 保存したあいさつの id。英語の文 (前のモックの形) も id にする。候補に無ければ null
  function greetingId(value) {
    var g = PROFILE_GREETINGS.filter(function (x) { return x.id === value || x.en === value; })[0];
    return g ? g.id : null;
  }

  function valid(p) {
    return !!p && PROFILE_EMOJIS.some(function (e) { return e.emoji === p.emoji; }) && greetingId(p.greeting) !== null;
  }

  // { host: { emoji, greeting }, client: { emoji, greeting } }
  function load(storage) {
    var saved = null;
    try { saved = JSON.parse(storage.getItem(KEY)); } catch (e) { saved = null; }
    var out = {};
    ['host', 'client'].forEach(function (d) {
      var p = saved && saved[d];
      out[d] = valid(p) ? { emoji: p.emoji, greeting: greetingId(p.greeting) } : Object.assign({}, PROFILE_INITIAL[d]);
    });
    return out;
  }

  // 保存できなかったとき (プライベートブラウズで容量が 0 など) は黙って諦める。モックはそのまま動く
  function save(storage, profiles) {
    try { storage.setItem(KEY, JSON.stringify({ host: profiles.host, client: profiles.client })); } catch (e) { /* 保存しない */ }
  }

  return { KEY: KEY, load: load, save: save };
})();
