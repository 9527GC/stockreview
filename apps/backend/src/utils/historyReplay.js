// 历史账本纯函数：不访问数据库、不把估值替代值写成行情。
const { compareTradeSettlement } = require('./tradeSettlementOrder');
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const dateKey = date => new Date(new Date(date).getTime() + 480 * 60000).toISOString().slice(0, 10);
const replayHistory = ({ trades, actions = [], transfers, rates, quotes, startDate, endDate }) => {
  const positions = new Map(), prices = new Map(), rows = [];
  const events = [
    ...trades.map(record => ({ record, kind: 'trade' })),
    ...actions.map(record => ({ record, kind: 'action' })),
    ...transfers.map(record => ({ record, kind: 'transfer' }))
  ].sort((a, b) => new Date(a.record.date) - new Date(b.record.date) ||
    ((a.kind === 'action' ? 0 : 1) - (b.kind === 'action' ? 0 : 1) || compareTradeSettlement(a.record, b.record)));
  if (events.some(e => dateKey(e.record.date) < startDate)) throw Error('必须从最早账本事件开始回放');
  const byDate = new Map();
  for (const e of events) { const key = dateKey(e.record.date); if (!byDate.has(key)) byDate.set(key, []); byDate.get(key).push(e); }
  // 预热估值窗口前的最后有效报价，支持休市日与全量重算。
  for (const [date, daily] of [...quotes.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
    if (date >= startDate) break;
    for (const [symbol, q] of Object.entries(daily)) if (Number(q.close) > 0) prices.set(symbol, { price: Number(q.close), date, kind: 'close' });
  }
  let cash = 0, principal = 0, previous = null;
  for (let dt = new Date(startDate+'T00:00:00Z'); dt <= new Date(endDate+'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate()+1)) {
    const date = dt.toISOString().slice(0,10); let flow = 0, actionCash = 0;
    const diagnostics = [];
    for (const { record: t, kind } of byDate.get(date) || []) {
      const rate = Number(t.fxRateToCNY) > 0 ? Number(t.fxRateToCNY) : Number(rates[t.currency || 'CNY']) || 1;
      if (kind === 'transfer') {
        const amount = Number.isFinite(t.amountCNY) ? t.amountCNY : Number(t.amount) * rate;
        const signed = amount * (t.type === 'IN' ? 1 : -1); cash += signed; principal += signed; flow += signed; continue;
      }
      const symbol = t.symbol, qty = Number(t.quantity) || 0;
      if (kind === 'action') {
        const amount = (Number(t.cashAmount)||0)*rate;
        if (t.type === 'CASH_DIVIDEND') { cash += amount; actionCash += amount; }
        if (t.type === 'RIGHTS_ISSUE') { cash -= amount; actionCash -= amount; }
        const holding = positions.get(symbol);
        if (['SPLIT','REVERSE_SPLIT'].includes(t.type)) {
          const factor = Number(t.ratioNumerator)/Number(t.ratioDenominator);
          if (!(factor>0)) throw Error('拆分比例无效 '+symbol);
          if (holding) holding.quantity *= factor;
          const old = prices.get(symbol); if (old) prices.set(symbol, { ...old, price: old.price/factor });
        } else if (['STOCK_DIVIDEND','BONUS_ISSUE','RIGHTS_ISSUE'].includes(t.type) && holding) {
          const oldQty = holding.quantity; holding.quantity += Number(t.quantityChange)||0;
          const old=prices.get(symbol); if(old && t.type!=='RIGHTS_ISSUE') prices.set(symbol,{...old,price:old.price*oldQty/holding.quantity});
        }
        continue;
      }
      if (!(Number(t.price)>0) || !(qty>0)) throw Error('不能用行情伪造真实成交 '+String(t._id));
      const settlement = Number.isFinite(t.netSettlementAmount) ? t.netSettlementAmount : t.price*qty + (t.type==='BUY'?1:-1)*(Number(t.commission)||0);
      cash += settlement*rate*(t.type==='BUY'?-1:1);
      const holding=positions.get(symbol)||{quantity:0,currency:t.currency||'CNY'};
      holding.quantity += qty*(t.type==='BUY'?1:-1);
      if (holding.quantity < -1e-8) throw Error('历史超卖 '+symbol+' '+date);
      if (Math.abs(holding.quantity)<1e-8) positions.delete(symbol); else positions.set(symbol,holding);
      // 无任何收盘报价时只用实际成交价作显式估算，绝不冒充历史行情。
      if (!prices.has(symbol) || prices.get(symbol).kind==='trade') prices.set(symbol,{price:Number(t.price),date,kind:'trade'});
    }
    const daily = quotes.get(date)||{};
    for(const [symbol,q] of Object.entries(daily)) if(Number(q.close)>0) prices.set(symbol,{price:Number(q.close),date,kind:'close'});
    let value=0;
    for(const [symbol,p] of positions) {
      const price=prices.get(symbol);
      if(!price) throw Error('没有任何估值依据 '+symbol+' '+date);
      value += p.quantity*price.price*(Number(rates[p.currency])||1);
      if(price.date!==date || price.kind!=='close') diagnostics.push({symbol,priceDate:price.date,basis:price.kind});
    }
    cash=round(cash);principal=round(principal);value=round(value);const assets=round(cash+value);
    const pnl=previous===null?0:round(assets-previous-flow);
    const quality=diagnostics.some(x=>x.basis==='trade')?'partial':diagnostics.length?'stale':'complete';
    rows.push({date,totalAssets:assets,cash,holdingsMarketValue:value,principal,dailyProfitAmount:pnl,dailyReturn:previous>0?round(pnl/previous*100):0,cumulativeProfitAmount:round(assets-principal),cumulativeReturn:principal>0?round((assets-principal)/principal*100):0,externalNetFlow:round(flow),valuationQuality:quality,valuationDiagnostics:diagnostics,corporateActionCashCNY:round(actionCash),positionQuantities:Object.fromEntries([...positions].map(([s,p])=>[s,p.quantity]))});
    previous=assets;
  }
  return rows;
};
module.exports={ replayHistory };
