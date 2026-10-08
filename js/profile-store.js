/*
 * Profile の絵文字とあいさつ (決定 U56) をブラウザの localStorage に残す。DOM には触らない。
 * storage は localStorage と同じ getItem / setItem を持つもの (tests/check.js は Map で代わりにする)。
 * 読めない・壊れている・候補に無い値は、端末ごとに最初の値 (PROFILE_INITIAL) に戻す。
 */
var ProfileStore = (function () {
  // モックの名前で区切ったキー (同じオリジンのほかのページと混ざらないように)
  var KEY = 'qa2-match-mock.profile';

  function valid(p) {
    return !!p && PROFILE_EMOJIS.some(function (e) { return e.emoji === p.emoji; }) &&
      PROFILE_GREETINGS.some(function (g) { return g.text === p.greeting; });
  }

  // { host: { emoji, greeting }, client: { emoji, greeting } }
  function load(storage) {
    var saved = null;
    try { saved = JSON.parse(storage.getItem(KEY)); } catch (e) { saved = null; }
    var out = {};
    ['host', 'client'].forEach(function (d) {
      var p = saved && saved[d];
      out[d] = valid(p) ? { emoji: p.emoji, greeting: p.greeting } : Object.assign({}, PROFILE_INITIAL[d]);
    });
    return out;
  }

  // 保存できなかったとき (プライベートブラウズで容量が 0 など) は黙って諦める。モックはそのまま動く
  function save(storage, profiles) {
    try { storage.setItem(KEY, JSON.stringify({ host: profiles.host, client: profiles.client })); } catch (e) { /* 保存しない */ }
  }

  return { KEY: KEY, load: load, save: save };
})();
