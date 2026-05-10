// Collection Scene (PRD 4.x)
const { drawBackground, drawText, drawButton, drawButtonGradient, drawImage, showToast, showModal, closeModal, gradientPink, gradientGold, gradientGreen, roundRect, measureText, beginScrollView, endScrollView } = require('../engine/canvas-ui');
const store = require('../store');
const { BALLOON_TYPES, LEVELS } = require('../balloons');
const UX = require('../ui-theme');
const { getCapsuleLayout } = require('../layout-safe');

let state = {
  activeTab: 'common', commonLevels: [], legendList: [], bouquets: [],
  selected: null, showDetail: false, showEquipSelect: false, showSynthesize: false,
  showGift: false, showPurchase: false, showPreview: false,
  equipLevels: [], equipBalloonId: '',
  isIOS: false, scrollY: 0
};

module.exports = {
  onShow() {
    try { state.isIOS = wx.getSystemInfoSync().platform === 'ios'; } catch(e) {}
    this._refresh();
  },
  _refresh() {
    this._refreshCommon();
    this._refreshLegend();
    this._refreshBouquets();
  },
  _refreshCommon() {
    const unlocked = store.getUnlockedLevels();
    const owned = store.getOwnedBalloons();
    state.commonLevels = LEVELS.map(lv => ({
      id: lv.id, name: lv.name,
      balloons: BALLOON_TYPES.filter(b => b.level===lv.id && !b.isPaid).map(b => ({...b, unlocked: unlocked.includes(lv.id), owned: owned[b.id] && owned[b.id].quantity>0}))
    }));
  },
  _refreshLegend() {
    const owned = store.getOwnedBalloonList();
    const legends = BALLOON_TYPES.filter(b=>b.isPaid);
    state.legendList = legends.map(l => {
      const o = owned.find(x=>x.id===l.id);
      return {...l, owned:!!o&&o.quantity>0, quantity:o?o.quantity:0, giftable:o?!!o.giftable:false, wearable:o?o.wearable!==false:false, frozen:o?!!o.frozen:false};
    });
  },
  _refreshBouquets() { state.bouquets = store.getBouquets(); },
  render(ctx, W, H) {
    drawBackground(ctx, W, H);
    const scene = this;
    const L = getCapsuleLayout();

    // Nav（与胶囊同一行）
    drawText(ctx, '← 返回', 20, L.innerTitleY, 'rgba(255,255,255,0.6)', 20);
    scene.manager.addTouchable(10, L.innerTitleY - 20, 80, 40, 'goBack');
    drawText(ctx, '气球图鉴', W / 2, L.innerTitleY, UX.text, 26, 'center', UX.shadowTitle);

    // Tabs
    const tabs = [{k:'common',l:'普通气球'},{k:'legend',l:'传奇气球'},{k:'bouquet',l:'气球束'}];
    const tabW = W/tabs.length;
    const tabTop = Math.round(L.contentTop + 2);
    tabs.forEach((t, i) => {
      const tx = i*tabW, ty = tabTop;
      ctx.save();
      drawText(ctx, t.l, tx + tabW / 2, ty + 20, state.activeTab === t.k ? UX.accent : UX.textMuted, 18, 'center');
      if (state.activeTab === t.k) {
        ctx.fillStyle = UX.accentDeep;
        ctx.fillRect(tx + tabW * 0.2, ty + 36, tabW * 0.6, 3);
      }
      ctx.restore();
      scene.manager.addTouchable(tx, ty-10, tabW, 50, ()=>{ state.activeTab=t.k; });
    });

    // Content area
    const cy = tabTop + 48;
    if (state.activeTab === 'common') this._renderCommon(ctx, W, H, cy);
    else if (state.activeTab === 'legend') this._renderLegend(ctx, W, H, cy);
    else this._renderBouquets(ctx, W, H, cy);
  },
  _renderCommon(ctx, W, H, startY) {
    const scene = this;
    let yy = startY;
    state.commonLevels.forEach(lv => {
      ctx.save();
      roundRect(ctx, 12, yy, W-24, 36, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      ctx.restore();
      drawText(ctx, '第' + lv.id + '关 ' + lv.name, 24, yy + 20, UX.accent, 17, 'left', UX.shadowTitle);
      yy += 46;

      const cols = 4;
      const gap = 8;
      const bw = (W-32-gap*(cols-1))/cols;
      lv.balloons.forEach((b, i) => {
        const bx = 16 + (i%cols)*(bw+gap);
        const by = yy + Math.floor(i/cols)*(bw+20);
        ctx.save(); roundRect(ctx, bx, by, bw, bw, 12);
        ctx.fillStyle = b.owned ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'; ctx.fill();
        ctx.strokeStyle = b.owned ? (b.color||'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        drawText(ctx, b.emoji, bx+bw/2, by+bw/2-6, b.owned?'#ffffff':'rgba(255,255,255,0.2)', bw*0.4, 'center');
        drawText(ctx, b.name, bx+bw/2, by+bw-14, b.owned?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.15)', 12, 'center');
        if (!b.unlocked) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(ctx, bx, by, bw, bw, 12); ctx.fill();
          drawText(ctx, '🔒', bx+bw/2, by+bw/2, '#ffffff', 24, 'center');
        }
        if (b.owned) scene.manager.addTouchable(bx, by, bw, bw, ()=>{ state.selected={...b,type:'common'};state.showDetail=true; });
      });
      yy += Math.ceil(lv.balloons.length/cols)*(bw+20) + 16;
    });
  },
  _renderLegend(ctx, W, H, startY) {
    const scene = this;
    const cols = 2;
    const gap = 10;
    const gw = (W-32-gap)/cols;
    const gh = 120;
    let yy = startY;

    state.legendList.forEach((l, i) => {
      const bx = 16 + (i%cols)*(gw+gap);
      const by = yy + Math.floor(i/cols)*(gh+gap);
      ctx.save(); roundRect(ctx, bx, by, gw, gh, 16);
      ctx.fillStyle = l.owned ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.03)'; ctx.fill();
      ctx.strokeStyle = l.owned ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
      drawText(ctx, l.emoji, bx+gw/2, by+30, '#ffffff', 28, 'center');
      drawText(ctx, l.name, bx+gw/2, by+58, l.owned?'#ffffff':'rgba(255,255,255,0.4)', 16, 'center');
      if (l.owned) drawText(ctx, '×'+l.quantity, bx+gw-24, by+16, '#ffd700', 16, 'center');
      if (l.frozen) drawText(ctx, '❄️ 赠送中', bx+gw/2, by+80, '#40c4ff', 12, 'center');
      else if (l.giftable) drawText(ctx, '🎁 可赠送', bx+gw/2, by+80, '#69ff47', 12, 'center');
      else if (l.owned) drawText(ctx, '不可转赠', bx+gw/2, by+80, 'rgba(255,255,255,0.3)', 12, 'center');

      if (l.owned) {
        const actionY = by+90;
        drawText(ctx, '穿戴', bx+16, actionY, '#ffd700', 14);
        scene.manager.addTouchable(bx+8, actionY-14, 60, 28, ()=>this._openEquip(l.id));
        if (l.quantity >= 2 && !l.frozen) {
          drawText(ctx, '合成', bx+gw/2-16, actionY, '#ce93d8', 14);
          scene.manager.addTouchable(bx+gw/2-30, actionY-14, 60, 28, ()=>this._openSyn(l.id));
        }
        if (l.giftable && !l.frozen && !state.isIOS) {
          drawText(ctx, '赠送', bx+gw-60, actionY, '#69ff47', 14);
          scene.manager.addTouchable(bx+gw-70, actionY-14, 60, 28, ()=>this._openGift(l.id));
        }
      } else {
        if (!state.isIOS) {
          drawText(ctx, '💰 购买', bx+gw/2, by+90, '#ffd740', 14, 'center');
          scene.manager.addTouchable(bx+20, by+76, gw-40, 28, ()=>this._openPurchase(l.id));
        }
      }
      scene.manager.addTouchable(bx, by, gw, 78, ()=>{ state.selected={...l,type:'legend'};state.showDetail=true; });
    });
  },
  _renderBouquets(ctx, W, H, startY) {
    const scene = this;
    let yy = startY;
    state.bouquets.forEach(b => {
      ctx.save(); roundRect(ctx, 16, yy, W-32, 80, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
      drawText(ctx, '第'+b.level+'关 气球束', 28, yy+22, '#ffffff', 18);
      drawText(ctx, b.time||'', 28, yy+48, 'rgba(255,255,255,0.35)', 14);
      drawText(ctx, b.hasLegend?'⭐ 含传奇':'  普通', W-80, yy+22, b.hasLegend?'#ffd700':'rgba(255,255,255,0.3)', 14);
      drawText(ctx, b.starred?'★':'☆', W-48, yy+52, '#ffd740', 24, 'center');
      scene.manager.addTouchable(W-64, yy+30, 48, 48, ()=>{ store.toggleBouquetStar(b.sn); this._refreshBouquets(); });
      yy += 92;
    });
    if (state.bouquets.length === 0) drawText(ctx, '暂无气球束\n通关关卡即可收集', W/2, H/2, 'rgba(255,255,255,0.3)', 18, 'center');
  },
  _openEquip(id) {
    const b = state.legendList.find(l=>l.id===id);
    if(!b||!b.owned){showToast('未拥有该气球');return;}
    if(b.frozen){showToast('该气球赠送中，无法穿戴');return;}
    state.equipLevels = LEVELS.map(lv=>({id:lv.id,name:lv.name,equipped:store.getEquippedLegend(lv.id-1)===b.id}));
    state.equipBalloonId = id;
    state.showEquipSelect = true;
  },
  _openSyn(id) {
    const b = state.legendList.find(l=>l.id===id);
    if(!b||!b.owned||b.quantity<2){showToast('至少需要2个同款气球');return;}
    store.removeBalloon(id,2);
    store.addBouquet({level:0,hasLegend:true,isSynthesized:true,sourceBalloonId:id,sourceBalloonName:b.name,sourceBalloonEmoji:b.emoji,originalBalloons:[{shape:b.shape,color:b.color,glowColor:b.glowColor,isPaid:true}]});
    store.addTransaction({type:'synthesize',balloonId:id,quantity:-2,counterparty:'',status:'success'});
    showToast('合成成功！已存入气球束');
    this._refresh();
  },
  _openGift(id) {
    const b = state.legendList.find(l=>l.id===id);
    if(!b||state.isIOS){showToast('iOS暂不支持赠送');return;}
    if(!b.giftable){showToast('该气球不可转赠');return;}
    const result = store.createGift([id],null,'送你专属气球');
    if(result.ok){showToast('赠送链接已生成');this._refresh();}
    else showToast(result.reason||'赠送失败');
  },
  _openPurchase(id) {
    if(state.isIOS){showToast('iOS暂未开放购买');return;}
    const b = BALLOON_TYPES.find(x=>x.id===id);
    if(!b)return;
    // Simulate purchase
    store.addBalloon(id,1,'purchase');
    store.addTransaction({type:'purchase',balloonId:id,quantity:1,counterparty:'',status:'success'});
    showToast('购买成功');
    this._refresh();
  },
  goBack() { this.manager.switchTo('home'); },
  onTouch(type, x, y) { return false; }
};
