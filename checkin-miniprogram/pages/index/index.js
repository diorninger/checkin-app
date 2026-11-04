var model = require('../../utils/checkin.js');

var VERSION = '1.0.0';
var RM_KEY = 'checkin:reminder:v1';      // {on,time,days,examOn,examAdv}

function pad(n) { return n < 10 ? '0' + n : String(n); }

function themeClass() {
  var app = getApp();
  var mode = (app && app.globalData && app.globalData.themeMode) || 'auto';
  if (mode === 'dark') return 'theme-dark';
  if (mode === 'light') return '';
  var dark = false;
  try {
    var info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
    dark = info.theme === 'dark';
  } catch (e) {}
  return dark ? 'theme-dark' : '';
}

Page({
  data: {
    version: VERSION,
    themeClass: '',
    monthLabels: model.MONTHS.map(function (m) { return m.label; }),
    mi: 0,
    monthLabel: '',
    view: 'cal',
    dowLabels: ['一', '二', '三', '四', '五', '六', '日'],
    cellH: 92,
    cells: [],
    stat: { done: 0, total: 0, rate: 0, fullDays: 0, leftDays: 0 },
    ringDeg: 0,
    cats: [],
    weekRows: [],
    listDays: [],
    banner: '',
    panelOpen: false,
    selKey: '',
    selLabel: '',
    selDow: '',
    selTasks: [],
    selDone: 0,
    selTotal: 0,
    editOpen: false,
    edit: { id: '', key: '', label: '', time: '', mark: '', isCustom: false, atts: [] },
    markOpts: ['', '考', '课', '作', '复', '补'],
    celebrating: false,
    fxTitle: ''
  },

  onLoad: function () {
    var mi = model.defaultMonthIndex();
    this.setData({ mi: mi });
    this.state = model.loadMonth(model.MONTHS[mi].key);
    var today = model.todayStr();
    this.selKey = today.indexOf(this.state.m.key) === 0 ? today : this.state.m.key + '-01';
    this.applyTheme();
    this.refresh();

    var self = this;
    if (wx.onThemeChange) {
      wx.onThemeChange(function () { self.applyTheme(); });
    }
  },

  onShow: function () {
    this.applyTheme();
    if (!this.state) return;
    // 从设置页返回：重新读取数据（提醒 / 主题可能已变）
    var key = this.state.m.key;
    this.state = model.loadMonth(key);
    this.refresh();
  },

  applyTheme: function () {
    var t = themeClass();
    if (t !== this.data.themeClass) this.setData({ themeClass: t });
    var dark = t === 'theme-dark';
    if (wx.setNavigationBarColor) {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#000000' : '#f2f2f7',
        fail: function () {}
      });
    }
  },

  /* ---------- 刷新视图 ---------- */
  refresh: function () {
    var st = this.state;
    var today = model.todayStr();
    var selKey = this.selKey;
    var cells = this.buildCells(st, today, selKey);
    var listDays = this.buildList(st);
    var stat = model.stats(st);
    var weekRows = this.buildWeeks(st);

    this.setData({
      monthLabel: st.m.label,
      cells: cells,
      listDays: listDays,
      stat: { done: stat.done, total: stat.total, rate: stat.rate, fullDays: stat.fullDays, leftDays: stat.leftDays },
      ringDeg: Math.round(stat.rate * 3.6),
      cats: stat.cats,
      weekRows: weekRows,
      banner: this.computeBanner(st)
    });

    if (this.data.panelOpen) this.fillPanel();
  },

  buildCells: function (st, today, selKey) {
    var cells = [];
    var monthKeys = model.MONTHS.map(function (x) { return x.key; });
    var dim = st.dim, offset = st.offset, total = st.totalCells;

    for (var i = 0; i < total; i++) {
      var dnum = i - offset + 1;
      if (dnum < 1 || dnum > dim) {
        var od = new Date(st.m.y, st.m.m, dnum);
        var odKey = od.getFullYear() + '-' + pad(od.getMonth() + 1);
        var nav = monthKeys.indexOf(odKey) >= 0;
        cells.push({
          idx: i, d: od.getDate(), out: true, nav: nav, ym: nav ? odKey : '',
          side: dnum > dim ? '›' : '‹', key: '',
          cls: 'out' + (nav ? ' nav' : ''), marks: [], pct: 0, n: 0, tot: 0
        });
        continue;
      }

      var day = st.dayMap[st.m.key + '-' + pad(dnum)];
      var p = model.dayProgress(st, day);
      var marks = [];
      day.tasks.forEach(function (t) {
        var mk = t.mark || (t.type === 'class' ? '课' : '');
        if (!mk) return;
        var dup = marks.some(function (x) { return x.t === mk; });
        if (!dup && marks.length < 3) {
          marks.push({ t: mk, c: mk === '考' ? 'exam' : (mk === '课' ? 'cls' : 'mark') });
        }
      });
      var hasAtt = day.tasks.some(function (t) { return st.ent.att[t.id] && st.ent.att[t.id].length; });
      if (hasAtt && marks.length < 3) marks.push({ t: '📷', c: 'cam' });

      var cls = 'cell';
      if (day.dow === 0 || day.dow === 6) cls += ' wk';
      if (day.key === today) cls += ' today';
      if (day.key === selKey) cls += ' active';
      if (p.total > 0 && p.n === p.total) cls += ' full';

      cells.push({
        idx: i, d: dnum, out: false, nav: false, ym: '', side: '', key: day.key,
        cls: cls, marks: marks, pct: p.pct, n: p.n, tot: p.total
      });
    }
    return cells;
  },

  buildList: function (st) {
    return st.days.map(function (day) {
      var p = model.dayProgress(st, day);
      var cls = day.all.filter(function (t) { return t.type === 'class'; })[0];
      var tasks = day.tasks.map(function (t) {
        return {
          id: t.id, label: t.label, time: t.time || '', mark: t.mark || '',
          type: t.type, on: !!st.done[t.id],
          attCount: (st.ent.att[t.id] || []).length
        };
      });
      return {
        key: day.key, d: day.d, dowName: model.DOW_NAME[day.dow],
        clsTag: cls ? (cls.label + ' ' + (cls.time || '')) : '',
        done: p.n, total: p.total, full: p.total > 0 && p.n === p.total,
        tasks: tasks
      };
    });
  },

  buildWeeks: function (st) {
    var rows = [];
    var weeks = Math.ceil((st.offset + st.dim) / 7);
    for (var w = 0; w < weeks; w++) {
      var done = 0, total = 0;
      st.days.forEach(function (day) {
        if (st.weekIdx(day.d) !== w) return;
        var p = model.dayProgress(st, day);
        done += p.n;
        total += p.total;
      });
      rows.push({
        label: '第 ' + (w + 1) + ' 周',
        pct: total ? Math.round(done / total * 100) : 0
      });
    }
    return rows;
  },

  /* ---------- 面板 ---------- */
  fillPanel: function () {
    var st = this.state;
    var day = st.dayMap[this.selKey];
    if (!day) { this.setData({ panelOpen: false }); return; }
    var p = model.dayProgress(st, day);
    var tasks = day.tasks.map(function (t) {
      return {
        id: t.id, label: t.label, time: t.time || '', mark: t.mark || '',
        type: t.type, on: !!st.done[t.id], custom: !!t.custom,
        attCount: (st.ent.att[t.id] || []).length
      };
    });
    this.setData({
      panelOpen: true,
      selKey: day.key,
      selLabel: (st.m.m + 1) + '月' + day.d + '日',
      selDow: model.DOW_NAME[day.dow],
      selTasks: tasks,
      selDone: p.n,
      selTotal: p.total
    });
  },

  onCellTap: function (e) {
    var key = e.currentTarget.dataset.key;
    var ym = e.currentTarget.dataset.ym;
    // 溢出格：仅切换月份日历，不弹面板
    if (!key) {
      if (ym) this.switchMonth(ym);
      return;
    }
    this.selKey = key;
    this.fillPanel();
    this.refreshCellsOnly();
  },

  refreshCellsOnly: function () {
    var st = this.state;
    this.setData({ cells: this.buildCells(st, model.todayStr(), this.selKey) });
  },

  closePanel: function () {
    this.setData({ panelOpen: false });
  },

  noop: function () {},

  /* ---------- 勾选 ---------- */
  onToggle: function (e) {
    var id = e.currentTarget.dataset.id;
    var st = this.state;
    // 任务 id 形如 2026-11-09|ql-qt 或 W2026-11-09|ng，日期从 id 反推（清单视图里可能不是当前选中日）
    var dayKey = String(id).replace(/^W/, '').split('|')[0];
    var day = st.dayMap[dayKey];
    var before = day ? model.dayProgress(st, day) : null;
    var wasFull = !!(before && before.total > 0 && before.n === before.total);

    model.toggle(st, id);
    this.refresh();

    if (this.data.panelOpen) this.fillPanel();

    var dayNow = st.dayMap[dayKey];
    if (dayNow && !wasFull) {
      var p = model.dayProgress(st, dayNow);
      if (p.total > 0 && p.n === p.total) {
        this.celebrate((st.m.m + 1) + '月' + dayNow.d + '日 全部完成！');
      }
    }
  },

  celebrate: function (title) {
    var self = this;
    if (this.fxTimer) clearTimeout(this.fxTimer);
    this.setData({ celebrating: true, fxTitle: title });
    this.fxTimer = setTimeout(function () {
      self.setData({ celebrating: false });
    }, 1800);
  },

  /* ---------- 月份 / 视图 ---------- */
  onMonthChange: function (e) {
    var mi = Number(e.detail.value);
    this.setData({ mi: mi });
    this.switchMonth(model.MONTHS[mi].key);
  },

  switchMonth: function (key) {
    var st = model.loadMonth(key);
    this.state = st;
    var idx = 0;
    model.MONTHS.forEach(function (m, i) { if (m.key === key) idx = i; });
    var today = model.todayStr();
    this.selKey = today.indexOf(key) === 0 ? today : key + '-01';
    this.setData({ mi: idx, panelOpen: false, editOpen: false });
    this.refresh();
  },

  setView: function (e) {
    var v = e.currentTarget.dataset.v;
    if (v === this.data.view) return;
    this.setData({ view: v });
    if (v !== 'cal') this.setData({ panelOpen: false });
  },

  goSettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings?key=' + this.state.m.key });
  },

  /* ---------- 编辑 ---------- */
  openEdit: function (e) {
    var id = e.currentTarget.dataset.id;
    var st = this.state;
    var day = st.dayMap[this.selKey];
    var task = null;
    if (day) day.tasks.forEach(function (t) { if (t.id === id) task = t; });
    if (!task) return;

    var atts = (st.ent.att[task.id] || []).map(function (a) { return { path: a.path, name: a.name }; });
    this.setData({
      editOpen: true,
      edit: {
        id: task.id,
        key: task.custom ? '' : task.k,
        label: task.label,
        time: task.time || '',
        mark: task.mark || '',
        isCustom: !!task.custom,
        atts: atts
      }
    });
  },

  closeEdit: function () {
    this.setData({ editOpen: false });
  },

  onEditLabel: function (e) {
    this.setData({ 'edit.label': e.detail.value });
  },
  onEditTime: function (e) {
    this.setData({ 'edit.time': e.detail.value });
  },
  pickMark: function (e) {
    this.setData({ 'edit.mark': e.currentTarget.dataset.m });
  },

  chooseImage: function () {
    var self = this;
    var ed = this.data.edit;
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: function (res) {
        var files = res.tempFiles || [];
        var st = self.state;
        var list = st.ent.att[ed.id] || (st.ent.att[ed.id] = []);
        var pending = files.length;

        files.forEach(function (f) {
          wx.getFileSystemManager().saveFile({
            tempFilePath: f.tempFilePath,
            success: function (r) {
              list.push({ name: '图片', type: 'image', path: r.savedFilePath });
              pending--;
              if (pending <= 0) self.commitAtts();
            },
            fail: function () {
              pending--;
              if (pending <= 0) self.commitAtts();
            }
          });
        });
      }
    });
  },

  commitAtts: function () {
    var st = this.state;
    model.saveEntry(st, st.ent);
    var atts = (st.ent.att[this.data.edit.id] || []).map(function (a) { return { path: a.path, name: a.name }; });
    this.setData({ 'edit.atts': atts });
    this.refresh();
    if (this.data.panelOpen) this.fillPanel();
  },

  previewAtt: function (e) {
    var path = e.currentTarget.dataset.path;
    var urls = this.data.edit.atts.map(function (a) { return a.path; });
    wx.previewImage({ current: path, urls: urls });
  },

  saveEdit: function () {
    var ed = this.data.edit;
    var st = this.state;
    var label = String(ed.label || '').trim();
    if (!label) {
      wx.showToast({ title: '请填写任务名称', icon: 'none' });
      return;
    }
    var ent = st.ent;

    if (ed.isCustom) {
      var found = null;
      ent.custom.forEach(function (c) { if (c.id === ed.id) found = c; });
      if (found) {
        found.label = label;
        found.time = ed.time || '';
        found.mark = ed.mark || '';
      } else {
        ent.custom.push({
          id: ed.id, date: this.selKey, label: label,
          time: ed.time || '', type: 'custom', mark: ed.mark || ''
        });
      }
    } else {
      ent.edited[ed.key] = { label: label, time: ed.time || '', mark: ed.mark || '' };
    }

    model.saveEntry(st, ent);
    this.setData({ editOpen: false });
    this.state = model.loadMonth(st.m.key);
    this.refresh();
    this.fillPanel();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  deleteTask: function () {
    var ed = this.data.edit;
    var st = this.state;
    var self = this;
    wx.showModal({
      title: '删除任务',
      content: ed.isCustom ? '删除这条自定义任务？' : '将删除该任务在本月所有日期的同类条目，确认？',
      confirmColor: '#ff3b30',
      success: function (r) {
        if (!r.confirm) return;
        var ent = st.ent;
        if (ed.isCustom) {
          ent.custom = ent.custom.filter(function (c) { return c.id !== ed.id; });
        } else {
          ent.deleted[ed.key] = 1;
        }
        delete ent.att[ed.id];
        model.saveEntry(st, ent);
        self.setData({ editOpen: false, panelOpen: false });
        self.state = model.loadMonth(st.m.key);
        self.refresh();
      }
    });
  },

  addCustom: function () {
    var id = 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    this.setData({
      editOpen: true,
      edit: { id: id, key: '', label: '', time: '', mark: '', isCustom: true, atts: [] }
    });
  },

  /* ---------- 提醒 ---------- */
  loadReminder: function () {
    var raw = null;
    try { raw = wx.getStorageSync(RM_KEY); } catch (e) {}
    if (!raw || typeof raw !== 'object') {
      return { on: false, time: '19:30', days: [1, 3], examOn: false, examAdv: 1 };
    }
    return {
      on: !!raw.on,
      time: typeof raw.time === 'string' ? raw.time : '19:30',
      days: Array.isArray(raw.days) ? raw.days : [1, 3],
      examOn: !!raw.examOn,
      examAdv: typeof raw.examAdv === 'number' ? raw.examAdv : 1
    };
  },

  computeBanner: function (st) {
    var r = this.loadReminder();
    var now = new Date();
    var today = model.todayStr();
    var msgs = [];

    if (r.on && r.days.indexOf(now.getDay()) >= 0) {
      var hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
      if (hhmm >= r.time) {
        var todayDay = st.dayMap[today];
        if (todayDay) {
          var p = model.dayProgress(st, todayDay);
          if (p.total > p.n) msgs.push('今天还有 ' + (p.total - p.n) + ' 项未完成，记得打卡');
        }
      }
    }

    if (r.examOn) {
      var adv = r.examAdv || 0;
      var base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      st.days.forEach(function (day) {
        var d0 = new Date(st.m.y, st.m.m, day.d).getTime();
        var diff = Math.round((d0 - base) / 86400000);
        if (diff < 0 || diff > adv) return;
        day.tasks.forEach(function (t) {
          if (t.mark === '考' && !st.done[t.id]) {
            msgs.push((diff === 0 ? '今天' : diff + ' 天后') + '考试：' + t.label);
          }
        });
      });
    }

    return msgs.slice(0, 2).join(' · ');
  }
});
