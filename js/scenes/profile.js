// Profile Scene (PRD 5.x)
const { drawBackground, drawText, drawButtonGradient, drawImage, showToast, gradientPink, gradientGold, roundRect, beginScrollView, endScrollView, drawWrappedText } = require('../engine/canvas-ui');
const store = require('../store');
const { BALLOON_TYPES, LEVELS } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout } = require('../layout-safe');

let state = {
  userAvatar:'', userNickName:'玩家', userId:'',
  highestLevel:1, highestLevelName:'糖果乐园', legendCollected:0, legendTotal:0, todayClears:0,
  teamName:'', hasTeam:false,
  soundOn:true, musicOn:true, vibrationOn:true, notificationOn:false, showStatsInTeam:true,
  showHistory:false, clearHistory:[], historyFilter:{level:0,days:0},
  showAssets:false, assetLegends:[], transactions:[], showTransactions:false,
  showDeletion:false, deletionStep:0, deletionText:'',
  showAbout:false, scrollY:0, appVersion:'1.0.0'
};

module.exports = {
  onShow() { this._refresh(); },
  _refresh() {
    const user = store.getUser();
    const settings = store.getSettings();
    const team = store.getTeam();
    const owned = store.getOwnedBalloons();
    const totalLegends = BALLOON_TYPES.filter(b=>b.isPaid).length;
    const legendCount = Object.keys(owned).filter(id=>{const b=BALLOON_TYPES.find(t=>t.id===id);return b&&b.isPaid&&owned[id].quantity>0;}).length;
    const highest = store.getHighestLevel();
    const hName = LEVELS[highest-1]?LEVELS[highest-1].name:'糖果乐园';
    Object.assign(state, {
      userAvatar:user.avatar||'', userNickName:user.nickName||'玩家', userId:user.openid||'',
      highestLevel:highest, highestLevelName:hName, legendCollected:legendCount, legendTotal:totalLegends,
      todayClears:store.getTodayClears(), hasTeam:!!team, teamName:team?team.name:'',
      soundOn:settings.soundOn!==false, musicOn:settings.musicOn!==false, vibrationOn:settings.vibrationOn!==false,
      notificationOn:settings.notificationOn===true, showStatsInTeam:settings.showStatsInTeam!==false
    });
  },
  render(ctx, W, H) {
    drawBackground(ctx, W, H);
    const scene = this;
    const L = getCapsuleLayout();
    drawText(ctx, '← 返回', 20, L.innerTitleY, 'rgba(255,255,255,0.6)', 20);
    scene.manager.addTouchable(10, L.innerTitleY - 20, 80, 40, 'goBack');
    drawText(ctx, '个人中心', W / 2, L.innerTitleY, UX.text, 26, 'center', UX.shadowTitle);

    let yy = L.contentTop + 8;

    // Profile card
    ctx.save(); roundRect(ctx, 16, yy, W-32, 140, 24); ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
    // Avatar
    ctx.save(); ctx.beginPath(); ctx.arc(50, yy + 48, 30, 0, Math.PI * 2);
    const ag = ctx.createRadialGradient(38, yy + 38, 4, 50, yy + 48, 30);
    ag.addColorStop(0, UX.accent); ag.addColorStop(1, UX.violetDeep);
    ctx.fillStyle = ag; ctx.fill(); ctx.restore();
    drawText(ctx, state.userNickName[0]||'?', 50, yy+50, '#ffffff', 28, 'center');
    drawText(ctx, state.userNickName, 90, yy+36, '#ffffff', 26);
    // User ID
    ctx.save(); roundRect(ctx, 90, yy+62, 80, 24, 12); ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fill(); ctx.restore();
    drawText(ctx, 'ID: '+(state.userId.slice(0,8)+'...'), 96, yy+74, 'rgba(255,255,255,0.4)', 14);
    scene.manager.addTouchable(90, yy+62, 120, 24, 'copyUserId');
    // Stats row
    const stats = [ {l:'最高关卡',v:'第'+state.highestLevel+'关'}, {l:'传奇收集',v:state.legendCollected+'/'+state.legendTotal}, {l:'今日通关',v:state.todayClears+'次'} ];
    stats.forEach((s,i)=>{const sx=20+i*((W-40)/3);drawText(ctx,s.l,sx,yy+100,'rgba(255,255,255,0.4)',14,);drawText(ctx,s.v,sx,yy+124,'#ffffff',20);});
    if(state.hasTeam){drawText(ctx,'战队: '+state.teamName,W-24,yy+26,'rgba(255,255,255,0.5)',16,'right');scene.manager.addTouchable(W-150,yy+10,140,36,'goToTeamDetail');}
    yy += 160;

    // Quick menu
    const menuItems = [ {l:'通关历史',h:'openHistory'}, {l:'资产明细',h:'openAssets'}, {l:'气球图鉴',h:'goToCollection'} ];
    ctx.save(); roundRect(ctx, 16, yy, W-32, 40+menuItems.length*45, 24); ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fill(); ctx.restore();
    menuItems.forEach((m,i)=>{const my=yy+10+i*45;drawText(ctx,m.l,32,my+28,'#ffffff',20);drawText(ctx,'→',W-36,my+28,'rgba(255,255,255,0.3)',20);scene.manager.addTouchable(16,my,W-32,45,m.h);});
    yy += 40 + menuItems.length*45 + 16;

    // Settings
    ctx.save(); roundRect(ctx, 16, yy, W-32, 230, 24); ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fill(); ctx.restore();
    drawText(ctx, '系统设置', 28, yy+20, 'rgba(255,255,255,0.6)', 16);
    const toggles = [ {l:'音效',k:'soundOn'}, {l:'音乐',k:'musicOn'}, {l:'震动',k:'vibrationOn'}, {l:'通知',k:'notificationOn'}, {l:'战队数据公开',k:'showStatsInTeam'} ];
    toggles.forEach((t,i)=>{const ty=yy+45+i*36;drawText(ctx,t.l,28,ty+20,'rgba(255,255,255,0.85)',18);this._drawToggle(ctx,W-80,ty+6,state[t.k],'toggle_'+t.k);});
    yy += 245;

    // Account section
    ctx.save(); roundRect(ctx, 16, yy, W-32, 120, 24); ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fill(); ctx.restore();
    drawText(ctx, '账号管理', 28, yy+20, 'rgba(255,255,255,0.6)', 16);
    drawText(ctx, '账号注销', 28, yy+70, '#ff1744', 20);
    scene.manager.addTouchable(16, yy+50, W-32, 60, 'openDeletion');
    yy += 140;

    // Help section
    ctx.save(); roundRect(ctx, 16, yy, W-32, 140, 24); ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fill(); ctx.restore();
    drawText(ctx, '帮助与反馈', 28, yy+20, 'rgba(255,255,255,0.6)', 16);
    drawText(ctx, '联系客服', 28, yy+65, 'rgba(255,255,255,0.75)', 18); scene.manager.addTouchable(16,yy+45,W-32,40,'contactService');
    drawText(ctx, '关于我们', 28, yy+110, 'rgba(255,255,255,0.75)', 18); scene.manager.addTouchable(16,yy+90,W-32,40,'openAbout');

    // Modals
    if (state.showHistory) this._drawHistoryModal(ctx, W, H);
    if (state.showAssets) this._drawAssetsModal(ctx, W, H);
    if (state.showDeletion) this._drawDeletionModal(ctx, W, H);
    if (state.showAbout) this._drawAboutModal(ctx, W, H);
  },
  _drawToggle(ctx, x, y, on, handler) {
    const tw=64,th=32;
    ctx.save();roundRect(ctx,x,y,tw,th,16);
    ctx.fillStyle=on?'#69ff47':'rgba(255,255,255,0.15)';ctx.fill();ctx.restore();
    ctx.save();ctx.beginPath();ctx.arc(on?x+tw-14:x+14, y+16, 12, 0, Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.restore();
    this.manager.addTouchable(x,y,tw,th,handler);
  },
  _drawHistoryModal(ctx, W, H) {
    const mw=W-80, mh=400, mx=40, my=40;
    ctx.save(); roundRect(ctx,mx,my,mw,mh,28);
    const bg=ctx.createLinearGradient(mx,my,mx,my+mh);bg.addColorStop(0,'rgba(20,5,40,0.98)');bg.addColorStop(1,'rgba(10,2,25,0.98)');
    ctx.fillStyle=bg;ctx.fill();ctx.strokeStyle=UX.strokeViolet;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    drawText(ctx,'✕',mx+mw-24,my+24,'rgba(255,255,255,0.5)',20,'center');this.manager.addTouchable(mx+mw-44,my+8,40,40,'closeHistory');
    drawText(ctx,'通关历史',W/2,my+32,'#ffffff',18,'center');
    // Filters
    [0,1,2,3,4].forEach(l=>{const fx=mx+20+l*90;drawText(ctx,l===0?'全部':'第'+l+'关',fx+35,my+68,'rgba(255,255,255,0.6)',14,'center');this.manager.addTouchable(fx,my+52,70,28,()=>{state.historyFilter.level=l;state.clearHistory=store.getClearHistory(l?{level:l}:{});});});
    // History list
    const list = state.clearHistory.slice(0, 30);
    beginScrollView(ctx, mx, my+90, mw, mh-110, 0);
    list.forEach((h,i)=>{const hy=my+100+i*36;drawText(ctx,'第'+h.level+'关',mx+20,hy+14,UX.accent,14);drawText(ctx,(h.time||'').slice(5,16),mx+100,hy+14,UX.textDim,12);drawText(ctx,h.hasLegend?'⭐':'',mx+mw-40,hy+14,UX.gold,14,'right');});
    if(list.length===0)drawText(ctx,'暂无通关记录',W/2,my+mh/2,'rgba(255,255,255,0.3)',14,'center');
    endScrollView(ctx);
  },
  closeHistory() { state.showHistory=false; },
  _drawAssetsModal(ctx, W, H) {
    const mw=W-80,mh=400,mx=40,my=40;
    ctx.save(); roundRect(ctx,mx,my,mw,mh,28);
    const bg=ctx.createLinearGradient(mx,my,mx,my+mh);bg.addColorStop(0,'rgba(20,5,40,0.98)');bg.addColorStop(1,'rgba(10,2,25,0.98)');
    ctx.fillStyle=bg;ctx.fill();ctx.strokeStyle=UX.strokeViolet;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    drawText(ctx,'✕',mx+mw-24,my+24,'rgba(255,255,255,0.5)',20,'center');this.manager.addTouchable(mx+mw-44,my+8,40,40,'closeAssets');
    drawText(ctx,'资产明细',W/2,my+32,'#ffffff',18,'center');
    // Toggle view
    drawText(ctx,state.showTransactions?'查看资产':'查看交易',mx+mw-100,my+32,UX.accent,14,'center');
    this.manager.addTouchable(mx+mw-120,my+16,110,32,'toggleTxView');
    if(state.showTransactions){
      const txs=store.getTransactions().slice(0,30);
      beginScrollView(ctx,mx,my+60,mw,mh-80,0);
      txs.forEach((tx,i)=>{const ty=my+70+i*32;drawText(ctx,tx.type==='purchase'?'购买':tx.type==='synthesize'?'合成':tx.type==='gift'?'赠送':tx.type==='rank_reward'?'排名奖励':tx.type,mx+16,ty+12,'rgba(255,255,255,0.7)',14);drawText(ctx,tx.time.slice(5,16),mx+mw-100,ty+12,'rgba(255,255,255,0.3)',12);});
      endScrollView(ctx);
    } else {
      const owned=store.getOwnedBalloonList().filter(o=>{const b=BALLOON_TYPES.find(t=>t.id===o.id);return b&&b.isPaid&&o.quantity>0;});
      beginScrollView(ctx,mx,my+60,mw,mh-80,0);
      owned.forEach((o,i)=>{const b=BALLOON_TYPES.find(t=>t.id===o.id);const ty=my+70+i*36;drawText(ctx,b?b.emoji:'🎈',mx+16,ty+14,'#ffffff',14);drawText(ctx,b?b.name:o.id,mx+44,ty+14,'#ffffff',14);drawText(ctx,'×'+o.quantity,mx+mw-40,ty+14,'#ffd700',14,'right');});
      if(owned.length===0)drawText(ctx,'暂无传奇气球资产',W/2,my+mh/2,'rgba(255,255,255,0.3)',14,'center');
      endScrollView(ctx);
    }
  },
  closeAssets() { state.showAssets=false; },
  toggleTxView() { state.showTransactions=!state.showTransactions; },
  _drawDeletionModal(ctx, W, H) {
    const mw=W-80,mh=360,mx=40,my=(H-mh)/2;
    ctx.save();roundRect(ctx,mx,my,mw,mh,28);
    const bg=ctx.createLinearGradient(mx,my,mx,my+mh);bg.addColorStop(0,'rgba(20,5,40,0.98)');bg.addColorStop(1,'rgba(10,2,25,0.98)');
    ctx.fillStyle=bg;ctx.fill();ctx.strokeStyle='rgba(255,23,68,0.5)';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    drawText(ctx,'✕',mx+mw-24,my+24,'rgba(255,255,255,0.5)',20,'center');this.manager.addTouchable(mx+mw-44,my+8,40,40,'closeDeletion');
    drawText(ctx,'账号注销',W/2,my+36,'#ff1744',18,'center','rgba(255,23,68,0.6)');
    if(state.deletionStep===1){
      drawWrappedText(ctx,'注销后，所有数据将被清除，包括气球资产、战队数据、通关记录等。此操作不可撤销。',mx+24,my+80,mw-48,24,'rgba(255,255,255,0.7)',14);
      const btn=drawButtonGradient(ctx,mx+40,my+mh-80,mw-80,50,'我知道了，继续','rgba(255,23,68,0.2)','#ff1744',14,16);this.manager.addTouchable(btn.x,btn.y,btn.w,btn.h,()=>state.deletionStep=2);
    } else if(state.deletionStep===2){
      drawWrappedText(ctx,'账号注销后不可恢复，请确认是否真的要注销。所有传奇气球、战队数据将永久丢失。',mx+24,my+80,mw-48,24,'rgba(255,255,255,0.7)',14);
      const btn=drawButtonGradient(ctx,mx+40,my+mh-80,mw-80,50,'再次确认',gradientPink,'#fff',14,16);this.manager.addTouchable(btn.x,btn.y,btn.w,btn.h,()=>state.deletionStep=3);
    } else {
      drawWrappedText(ctx,'请输入"确认注销"以完成账号注销：',mx+24,my+80,mw-48,22,'rgba(255,255,255,0.7)',14);
      ctx.save();roundRect(ctx,mx+40,my+130,mw-80,40,16);ctx.fillStyle='rgba(255,255,255,0.05)';ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=1;ctx.stroke();ctx.restore();
      drawText(ctx,state.deletionText||'输入"确认注销"',mx+mw/2,my+152,'rgba(255,255,255,0.4)',14,'center');
      if(state.deletionText==='确认注销'){
        const btn=drawButtonGradient(ctx,mx+40,my+mh-80,mw-80,50,'确认注销','rgba(255,23,68,0.2)','#ff1744',14,16);this.manager.addTouchable(btn.x,btn.y,btn.w,btn.h,()=>{store.requestAccountDeletion();state.showDeletion=false;showToast('账号已注销');this.manager.switchTo('home');});
      } else {
        drawText(ctx,'输入"确认注销"后提交',W/2,my+mh-40,'rgba(255,255,255,0.3)',12,'center');
      }
    }
  },
  closeDeletion() { state.showDeletion=false;state.deletionStep=0;state.deletionText=''; },
  _drawAboutModal(ctx, W, H) {
    const mw=W-80,mh=280,mx=40,my=(H-mh)/2;
    ctx.save();roundRect(ctx,mx,my,mw,mh,28);
    const bg=ctx.createLinearGradient(mx,my,mx,my+mh);bg.addColorStop(0,'rgba(20,5,40,0.98)');bg.addColorStop(1,'rgba(10,2,25,0.98)');
    ctx.fillStyle=bg;ctx.fill();ctx.strokeStyle=UX.strokeViolet;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    drawText(ctx,'✕',mx+mw-24,my+24,'rgba(255,255,255,0.5)',20,'center');this.manager.addTouchable(mx+mw-44,my+8,40,40,'closeAbout');
    drawText(ctx,'关于',W/2,my+40,'#ffffff',18,'center');
    drawText(ctx,'不准爆！',W/2,my+90,UX.text,18,'center',UX.shadowTitle);
    drawText(ctx,'版本 '+state.appVersion,W/2,my+130,'rgba(255,255,255,0.5)',12,'center');
    drawWrappedText(ctx,'一款充满乐趣的充气挑战小游戏。收集各种气球，组建战队，冲击排行榜！',mx+24,my+165,mw-48,22,'rgba(255,255,255,0.4)',14);
  },
  closeAbout() { state.showAbout=false; },
  // Handlers
  openHistory() { state.showHistory=true;state.clearHistory=store.getClearHistory();state.historyFilter={level:0,days:0}; },
  openAssets() { state.showAssets=true;state.showTransactions=false; },
  openDeletion() { state.showDeletion=true;state.deletionStep=1;state.deletionText=''; },
  openAbout() { state.showAbout=true; },
  copyUserId() { wx.setClipboardData({data:state.userId,success:()=>showToast('已复制')}); },
  contactService() { showToast('客服: support@balloonhot.com'); },
  toggle_soundOn(){state.soundOn=!state.soundOn;store.updateSettings({soundOn:state.soundOn});},
  toggle_musicOn(){state.musicOn=!state.musicOn;store.updateSettings({musicOn:state.musicOn});},
  toggle_vibrationOn(){state.vibrationOn=!state.vibrationOn;store.updateSettings({vibrationOn:state.vibrationOn});},
  toggle_notificationOn(){state.notificationOn=!state.notificationOn;store.setNotificationAuthorized(state.notificationOn);},
  toggle_showStatsInTeam(){state.showStatsInTeam=!state.showStatsInTeam;store.updateSettings({showStatsInTeam:state.showStatsInTeam});},
  goToCollection(){this.manager.switchTo('collection');},
  goToTeamDetail(){this.manager.switchTo('team', { tab: state.hasTeam ? 'my' : 'discover' });},
  goBack(){this.manager.switchTo('home');},
  onTouch(type,x,y){return false;}
};
