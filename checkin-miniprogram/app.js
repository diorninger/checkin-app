var THEME_KEY = 'checkin.theme.mode.v1';   // auto | light | dark

App({
  globalData: {
    themeMode: 'auto'
  },

  onLaunch: function () {
    try {
      var m = wx.getStorageSync(THEME_KEY);
      if (m === 'light' || m === 'dark') this.globalData.themeMode = m;
    } catch (e) {}
  },

  setThemeMode: function (mode) {
    this.globalData.themeMode = mode;
    try { wx.setStorageSync(THEME_KEY, mode); } catch (e) {}
  }
});
