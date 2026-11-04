/**
 * 学习打卡表 · 数据层（与网页版 v2.7.4 模型一致）
 * - 9 个月：2026-10 ~ 2027-06
 * - 任务模型：每日一题（仅工作日）/ 基础作业（全联周日、学而思周六）
 *             公式活页本（学而思周六、全联周日）/ 周末专项（挂当周周日）
 * - 自定义层：按任务 key 删除/编辑；自定义条目按自身 id
 * - 按月存储：checkin:<月key>:done:v1 / checkin:<月key>:entries:v1
 * - 2026-10 首次进入预勾选 1–25 日
 */

var MONTHS = [
  { y: 2026, m: 9,  key: '2026-10', label: '2026年10月' },
  { y: 2026, m: 10, key: '2026-11', label: '2026年11月' },
  { y: 2026, m: 11, key: '2026-12', label: '2026年12月' },
  { y: 2027, m: 0,  key: '2027-01', label: '2027年1月' },
  { y: 2027, m: 1,  key: '2027-02', label: '2027年2月' },
  { y: 2027, m: 2,  key: '2027-03', label: '2027年3月' },
  { y: 2027, m: 3,  key: '2027-04', label: '2027年4月' },
  { y: 2027, m: 4,  key: '2027-05', label: '2027年5月' },
  { y: 2027, m: 5,  key: '2027-06', label: '2027年6月' }
];

var DOW_NAME = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
var DOW_INDEX = ['日', '一', '二', '三', '四', '五', '六'];
var MARKS = ['', '考', '课', '作', '复', '补'];

var DAILY = [
  { k: 'ql-qt',  label: '全联 · 每日一题',       noWeekend: true },
  { k: 'xes-qt', label: '学而思 · 每日一题',     noWeekend: true },
  { k: 'ks',     label: '学而思口算（中午）',    noWeekend: true }
];

var HW_DOW = {
  0: { k: 'ql-hw',  label: '全联 · 基础作业' },
  6: { k: 'xes-hw', label: '学而思 · 基础作业' }
};

var FM_KEYS  = ['fm-ql', 'fm-xes'];
var FM_LABEL = { 'fm-ql': '公式活页本 · 全联', 'fm-xes': '公式活页本 · 学而思' };
var FM_DOW   = { 6: 'fm-xes', 0: 'fm-ql' };

var DOW_EXTRA = {
  1: [{ k: 'mz',  label: '初中名著 · 阅读' }, { k: 'eng', label: '英语小程序 · 时文 / 初中词汇' }],
  3: [{ k: 'mz',  label: '初中名著 · 阅读' }, { k: 'eng', label: '英语小程序 · 时文 / 初中词汇' }],
  2: [{ k: 'yw',  label: '语文 · 阅读 + 作文' }, { k: 'wy', label: '文言文 / 古诗 · 背诵默写' }],
  4: [{ k: 'yw',  label: '语文 · 阅读 + 作文' }, { k: 'wy', label: '文言文 / 古诗 · 背诵默写' }]
};

var CLASS = {
  0: { k: 'cls-ql',  label: '全联上课',   time: '08:00–12:10' },
  6: { k: 'cls-xes', label: '学而思上课', time: '15:50–17:50' }
};

var WEEKEND = [
  { k: 'ng',    label: '新概念英语 · 作业 + 单词（1篇）' },
  { k: 'jc-yw', label: '教材帮 · 语文（1课）' },
  { k: 'jc-sx', label: '教材帮 · 数学（1课）' },
  { k: 'jc-yy', label: '教材帮 · 英语（1课）' }
];

/* ---------- 存储（wx 不可用时退化为内存，便于本地校验） ---------- */
var MEM = {};
function sget(key) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) return wx.getStorageSync(key);
  } catch (e) {}
  return MEM[key];
}
function sset(key, val) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) { wx.setStorageSync(key, val); return; }
  } catch (e) {}
  MEM[key] = val;
}
function sdel(key) {
  try {
    if (typeof wx !== 'undefined' && wx.removeStorageSync) { wx.removeStorageSync(key); return; }
  } catch (e) {}
  delete MEM[key];
}

/* ---------- 基础工具 ---------- */
function pad(n) { return n < 10 ? '0' + n : String(n); }
function daysIn(m) { return new Date(m.y, m.m + 1, 0).getDate(); }
function dkey(m, d) { return m.key + '-' + pad(d); }
function todayStr() {
  var n = new Date();
  return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
}
function findMonth(key) {
  for (var i = 0; i < MONTHS.length; i++) if (MONTHS[i].key === key) return MONTHS[i];
  return null;
}
/* 包含今天的月份下标；不在范围内则取第一个 */
function defaultMonthIndex() {
  var t = todayStr().slice(0, 7);
  for (var i = 0; i < MONTHS.length; i++) if (MONTHS[i].key === t) return i;
  return 0;
}

/* ---------- 建月 ---------- */
function buildDays(m) {
  var dim = daysIn(m);
  var days = [];
  for (var d = 1; d <= dim; d++) {
    var dow = new Date(m.y, m.m, d).getDay();
    var key = dkey(m, d);
    var list = [];

    if (CLASS[dow]) {
      list.push({ id: key + '|' + CLASS[dow].k, k: CLASS[dow].k, label: CLASS[dow].label, type: 'class', time: CLASS[dow].time });
    }
    DAILY.forEach(function (t) {
      if (t.noWeekend && (dow === 0 || dow === 6)) return;   // 每日一题 / 口算仅工作日
      list.push({ id: key + '|' + t.k, k: t.k, label: t.label, type: 'daily' });
    });
    if (HW_DOW[dow]) {
      var h = HW_DOW[dow];
      list.push({ id: key + '|' + h.k, k: h.k, label: h.label, type: 'focus' });
    }
    if (DOW_EXTRA[dow]) {
      DOW_EXTRA[dow].forEach(function (t) { list.push({ id: key + '|' + t.k, k: t.k, label: t.label, type: 'focus' }); });
    }
    if (FM_DOW[dow]) {
      var fk = FM_DOW[dow];
      list.push({ id: key + '|' + fk, k: fk, label: FM_LABEL[fk], time: '每周一次', type: 'daily' });
    }

    // 周末专项：周六出现，实际归到当周周日
    var satDay = d - ((dow + 1) % 7);
    var sunDay = d + ((7 - dow) % 7);
    var weekendHere = (dow === 6) || (dow === 0 && satDay < 1);
    if (weekendHere && sunDay >= 1 && sunDay <= dim) {
      var wkey = dkey(m, sunDay);
      WEEKEND.forEach(function (t) {
        list.push({ id: 'W' + wkey + '|' + t.k, k: t.k, label: t.label, type: 'weekend' });
      });
    }

    days.push({ d: d, dow: dow, key: key, all: list });
  }
  return days;
}

/* ---------- 自定义层 ---------- */
function entKey(mk) { return 'checkin:' + mk + ':entries:v1'; }
function doneKey(mk) { return 'checkin:' + mk + ':done:v1'; }

function loadEnt(mk) {
  var def = { deleted: {}, edited: {}, att: {}, custom: [] };
  var raw = sget(entKey(mk));
  if (!raw || typeof raw !== 'object') return def;
  return {
    deleted: raw.deleted || {},
    edited:  raw.edited  || {},
    att:     raw.att     || {},
    custom:  Array.isArray(raw.custom) ? raw.custom : []
  };
}
function saveEnt(mk, ent) { sset(entKey(mk), ent); }

function buildBase(day, ent) {
  var arr = [];
  day.all.forEach(function (t) {
    if (ent.deleted[t.k]) return;
    var e = ent.edited[t.k];
    arr.push({
      id: t.id,
      k: t.k,
      label: (e && e.label != null) ? e.label : t.label,
      time: (e && e.time != null) ? e.time : (t.time || ''),
      type: t.type,
      mark: (e && e.mark) ? e.mark : ''
    });
  });
  (ent.custom || []).forEach(function (c) {
    if (c.date === day.key) {
      arr.push({ id: c.id, k: null, label: c.label, time: c.time || '', type: 'custom', custom: true, mark: c.mark || '' });
    }
  });
  return arr;
}

/* 把源月日期映射到目标月：日号不变，超出目标月天数时钳制到月末 */
function remapMonthDate(ds, m) {
  var p = (ds || '').split('-');
  if (p.length !== 3) return ds;
  var day = parseInt(p[2], 10);
  if (!day || day < 1) return ds;
  var dim = daysIn(m);
  if (day > dim) day = dim;
  return m.key + '-' + pad(day);
}
function entHasOpt(o) {
  return !!(o && ((o.custom && o.custom.length) ||
    Object.keys(o.deleted || {}).length ||
    Object.keys(o.edited || {}).length ||
    Object.keys(o.att || {}).length));
}
/* 无选项月份首次进入：从最近一个有选项的更早月份复制（日期换月、id 重建、附件 key 重映射） */
function syncOptionsForward(m) {
  var dst = loadEnt(m.key);
  if (entHasOpt(dst)) return;
  var src = null, srcKey = null;
  for (var i = MONTHS.indexOf(m) - 1; i >= 0; i--) {
    var o = loadEnt(MONTHS[i].key);
    if (entHasOpt(o)) { src = o; srcKey = MONTHS[i].key; break; }
  }
  if (!src) return;
  var idMap = {};
  var custom = (src.custom || []).map(function (c) {
    var nid = 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    idMap[c.id] = nid;
    return { id: nid, date: remapMonthDate(c.date, m), label: c.label, time: c.time || '', type: c.type || 'custom', mark: c.mark || '' };
  });
  var att = {};
  Object.keys(src.att || {}).forEach(function (k) {
    var nk;
    if (k.indexOf(srcKey + '-') === 0) nk = remapMonthDate(k, m);
    else if (idMap[k]) nk = idMap[k];
    else return;
    att[nk] = src.att[k];
  });
  saveEnt(m.key, { deleted: src.deleted || {}, edited: src.edited || {}, att: att, custom: custom });
}

/* ---------- 勾选状态 ---------- */
function loadDone(mk, validSet) {
  var map = {};
  var raw = sget(doneKey(mk));
  if (Array.isArray(raw)) {
    raw.forEach(function (id) { if (!validSet || validSet[id]) map[id] = 1; });
  } else if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach(function (id) { if (raw[id] && (!validSet || validSet[id])) map[id] = 1; });
  }
  return map;
}
function saveDone(mk, map) {
  var arr = [];
  Object.keys(map).forEach(function (id) { if (map[id]) arr.push(id); });
  sset(doneKey(mk), arr);
}

/* 2026 年 10 月首次打开：预勾选 1–25 日全部任务（仅一次） */
function seedOctober(mk, days, map) {
  if (mk !== '2026-10') return;
  var flag = 'checkin:2026-10:seed:v1';
  if (sget(flag)) return;
  sset(flag, 1);
  days.forEach(function (day) {
    if (day.d > 25) return;
    day.base.forEach(function (t) { map[t.id] = 1; });
  });
  saveDone(mk, map);
}

/* 公式活页本：本周已勾选则其余日期隐藏（当前固定星期，等价无隐藏，保留兼容） */
function applyRolling(days, map, fmSet, weekIdx) {
  var firstOn = {};
  days.forEach(function (day) {
    FM_KEYS.forEach(function (k) {
      if (map[day.key + '|' + k]) {
        var wk = weekIdx(day.d) + '|' + k;
        if (firstOn[wk] === undefined || day.d < firstOn[wk]) firstOn[wk] = day.d;
      }
    });
  });
  days.forEach(function (day) {
    day.tasks = day.base.filter(function (t) {
      if (t.k && fmSet[t.k]) {
        var fd = firstOn[weekIdx(day.d) + '|' + t.k];
        return fd === undefined ? true : !!map[t.id];
      }
      return true;
    });
  });
}

/* ---------- 加载整月（页面唯一入口） ---------- */
function loadMonth(key) {
  var m = findMonth(key) || MONTHS[0];
  var dim = daysIn(m);
  var firstDow = new Date(m.y, m.m, 1).getDay();
  var offset = (firstDow + 6) % 7;                 // 周一开头
  var totalCells = Math.ceil((offset + dim) / 7) * 7;

  function weekIdx(d) { return Math.floor((d - 1 + firstDow) / 7); }

  var days = buildDays(m);
  syncOptionsForward(m);
  var ent = loadEnt(m.key);

  var validSet = {}, fmSet = {};
  FM_KEYS.forEach(function (k) { fmSet[k] = true; });

  days.forEach(function (day) {
    day.base = buildBase(day, ent);
    day.base.forEach(function (t) { validSet[t.id] = 1; });
  });

  var map = loadDone(m.key, validSet);
  seedOctober(m.key, days, map);
  applyRolling(days, map, fmSet, weekIdx);

  // 总数：公式活页本按「周」去重计一次
  var fmTotal = {}, total = 0, customCount = 0;
  days.forEach(function (day) {
    day.tasks.forEach(function (t) {
      if (t.custom) customCount++;
      if (t.k && fmSet[t.k]) fmTotal[weekIdx(day.d) + '|' + t.k] = 1;
      else total++;
    });
  });
  total += Object.keys(fmTotal).length;

  var dayMap = {};
  days.forEach(function (d) { dayMap[d.key] = d; });

  return {
    m: m, days: days, dayMap: dayMap, ent: ent, done: map,
    total: total, customCount: customCount,
    dim: dim, firstDow: firstDow, offset: offset, totalCells: totalCells,
    weekIdx: weekIdx, validSet: validSet
  };
}

/* ---------- 统计 ---------- */
function dayProgress(state, day) {
  var tasks = day.tasks || [];
  var n = 0;
  tasks.forEach(function (t) { if (state.done[t.id]) n++; });
  return { n: n, total: tasks.length, pct: tasks.length ? Math.round(n / tasks.length * 100) : 0 };
}

function stats(state) {
  var done = 0, fullDays = 0, leftDays = 0;
  var byType = { class: 0, daily: 0, focus: 0, weekend: 0, custom: 0 };
  var byTypeTotal = { class: 0, daily: 0, focus: 0, weekend: 0, custom: 0 };
  var fmSeen = {};

  state.days.forEach(function (day) {
    var p = dayProgress(state, day);
    done += p.n;
    if (p.total > 0 && p.n === p.total) fullDays++;
    if (p.n < p.total) leftDays++;

    day.tasks.forEach(function (t) {
      var ty = t.type || 'daily';
      if (byType[ty] === undefined) ty = 'daily';
      // 公式活页本按周去重，不重复计入分类总数
      if (t.k && FM_KEYS.indexOf(t.k) >= 0) {
        var wk = 'fm|' + state.weekIdx(day.d) + '|' + t.k;
        if (fmSeen[wk]) return;
        fmSeen[wk] = 1;
      }
      byTypeTotal[ty]++;
      if (state.done[t.id]) byType[ty]++;
    });
  });

  var total = state.total;
  var rate = total ? Math.round(done / total * 100) : 0;
  var cats = [];
  var CAT_LABEL = { daily: '每日', focus: '专项', class: '课程', weekend: '周末', custom: '自定义' };
  ['daily', 'focus', 'class', 'weekend', 'custom'].forEach(function (k) {
    if (byTypeTotal[k] > 0) cats.push({ key: k, label: CAT_LABEL[k], done: byType[k], total: byTypeTotal[k], pct: Math.round(byType[k] / byTypeTotal[k] * 100) });
  });

  return { done: done, total: total, rate: rate, fullDays: fullDays, leftDays: leftDays, cats: cats };
}

/* ---------- 变更操作 ---------- */
function toggle(state, id) {
  if (state.done[id]) delete state.done[id];
  else state.done[id] = 1;
  saveDone(state.m.key, state.done);
  return !!state.done[id];
}

function saveEntry(state, ent) {
  state.ent = ent;
  saveEnt(state.m.key, ent);
}

function resetMonth(state) {
  sdel(doneKey(state.m.key));
  sdel(entKey(state.m.key));
}

module.exports = {
  MONTHS: MONTHS,
  DOW_NAME: DOW_NAME,
  DOW_INDEX: DOW_INDEX,
  MARKS: MARKS,
  FM_KEYS: FM_KEYS,
  pad: pad,
  todayStr: todayStr,
  findMonth: findMonth,
  defaultMonthIndex: defaultMonthIndex,
  loadMonth: loadMonth,
  loadEnt: loadEnt,
  saveEnt: saveEnt,
  saveDone: saveDone,
  loadDone: loadDone,
  dayProgress: dayProgress,
  stats: stats,
  toggle: toggle,
  saveEntry: saveEntry,
  resetMonth: resetMonth,
  daysIn: daysIn,
  sget: sget,
  sset: sset,
  sdel: sdel
};
