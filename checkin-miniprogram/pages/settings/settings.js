var model = require('../../utils/checkin.js');

var RM_KEY = 'checkin:reminder:v1';
var THEME_KEY = 'checkin.theme.mode.v1';
var VERSION = '1.0.0';

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

var WEEK_ITEMS = [
  { d: 1, l: '一' }, { d: 2, l: '二' }, { d: 3, l: '三' },
  { d: 4, l: '四' }, { d: 5, l: '五' }, { d: 6, l: '六' }, { d: 0, l: '日' }
];

Page({
  data: {
    version: VERSION,
    themeClass: '',
    key: '',
    monthLabel: '',
    rmOn: false,
    rmTime: '19:30',
    weeks: [],
    examOn: false,
    examAdv: 1,
    advOpts: ['当天', '提前 1 天', '提前 2 天', '提前 3 天'],
    mode: 'auto',
    modes: [
      { v: 'auto', l: '跟随系统' },
      { v: 'light', l: '浅色' },
      { v: 'dark', l: '深色' }
    ]
  },

  onLoad: function (q) {
    var key = (q && q.key) || model.MONTHS[model.defaultMonthIndex()].key;
    var m = model.findMonth(key) || model.MONTHS[0];
    this.setData({ key: m.key, monthLabel: m.label });
    this.loadSettings();
    this.applyTheme();
  },

  onShow: function () {
    this.applyTheme();
  },

  loadSettings: function () {
    var r = { on: false, time: '19:30', days: [1, 3], examOn: false, examAdv: 1 };
    try {
      var raw = wx.getStorageSync(RM_KEY);
      if (raw && typeof raw === 'object') {
        r.on = !!raw.on;
        r.time = typeof raw.time === 'string' ? raw.time : '19:30';
        r.days = Array.isArray(raw.days) ? raw.days : [1, 3];
        r.examOn = !!raw.examOn;
        r.examAdv = typeof raw.examAdv === 'number' ? raw.examAdv : 1;
      }
    } catch (e) {}

    var mode = 'auto';
    try {
      var mv = wx.getStorageSync(THEME_KEY);
      if (mv === 'light' || mv === 'dark') mode = mv;
    } catch (e) {}

    this.setData({
      rmOn: r.on,
      rmTime: r.time,
      examOn: r.examOn,
      examAdv: r.examAdv,
      weeks: WEEK_ITEMS.map(function (w) {
        return { d: w.d, l: w.l, on: r.days.indexOf(w.d) >= 0 };
      }),
      mode: mode
    });
  },

  persist: function () {
    var days = [];
    this.data.weeks.forEach(function (w) { if (w.on) days.push(w.d); });
    if (this.data.rmOn && !days.length) {
      wx.showToast({ title: '请至少选择一个提醒日', icon: 'none' });
      return false;
    }
    try {
      wx.setStorageSync(RM_KEY, {
        on: this.data.rmOn,
        time: this.data.rmTime || '19:30',
        days: days,
        examOn: this.data.examOn,
        examAdv: this.data.examAdv
      });
    } catch (e) {}
    return true;
  },

  onSwitch: function (e) {
    this.setData({ rmOn: e.detail.value });
    if (!this.persist()) this.setData({ rmOn: false });
  },

  onTime: function (e) {
    this.setData({ rmTime: e.detail.value });
    this.persist();
  },

  onWeek: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var key = 'weeks[' + idx + '].on';
    var patch = {};
    patch[key] = !this.data.weeks[idx].on;
    this.setData(patch);
    this.persist();
  },

  onExamSwitch: function (e) {
    this.setData({ examOn: e.detail.value });
    this.persist();
  },

  onExamAdv: function (e) {
    this.setData({ examAdv: Number(e.detail.value) });
    this.persist();
  },

  onMode: function (e) {
    var mode = e.currentTarget.dataset.m;
    this.setData({ mode: mode });
    var app = getApp();
    if (app && app.setThemeMode) app.setThemeMode(mode);
    this.applyTheme();
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

  resetMonth: function () {
    var self = this;
    wx.showModal({
      title: '重置本月数据',
      content: '将清除「' + this.data.monthLabel + '」的全部勾选与自定义任务，不可恢复。',
      confirmColor: '#ff3b30',
      success: function (r) {
        if (!r.confirm) return;
        var st = model.loadMonth(self.data.key);
        model.resetMonth(st);
        wx.showToast({ title: '已重置', icon: 'success' });
      }
    });
  }
});
