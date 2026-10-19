const { replayHistory } = require('./historyReplay');
const { getRates } = require('./currency');
const { getDateStringInOffset } = require('./dailyProfit');
const mongoose = require('mongoose');
const enabled = userId => (process.env.HISTORY_REPLAY_USER_IDS || '').split(',').includes(String(userId));
async function backfill(userId, requestedStart, offset = 480) {
  if(offset !== 480) throw Error('历史回放目前仅支持北京时间');
  const db=mongoose.connection.db, id=new mongoose.Types.ObjectId(String(userId));
  const [trades,transfers,actions,rates]=await Promise.all([db.collection('trades').find({userId:id}).toArray(),db.collection('transfers').find({userId:id}).toArray(),db.collection('corporateactions').find({userId:id}).toArray(),getRates()]);
  const dates=[...trades,...transfers,...actions].map(t=>new Date(new Date(t.date).getTime()+28800000).toISOString().slice(0,10)).sort();
  if(!dates.length)return {success:true,updatedCount:0};
  const startDate=dates[0],endDate=new Date(Date.parse(getDateStringInOffset(offset))-86400000).toISOString().slice(0,10);
  const symbols=[...new Set([...trades,...actions].map(t=>t.symbol))];
  // 只读真实缓存，缺失报价由引擎显式标记；不将替代估值回写行情库。
  const cached=await db.collection('historicalquotes').find({symbol:{$in:symbols},date:{$lte:endDate}}).toArray();
  const quotes=new Map();for(const q of cached){if(!quotes.has(q.date))quotes.set(q.date,{});quotes.get(q.date)[q.symbol]=q;}
  const rows=replayHistory({trades,transfers,actions,rates,quotes,startDate,endDate});
  const common=r=>({totalAssets:r.totalAssets,source:r.valuationQuality==='complete'?'cached':'partial',isDirty:false,valuationQuality:r.valuationQuality,valuationDiagnostics:r.valuationDiagnostics,corporateActionCashCNY:r.corporateActionCashCNY,externalNetFlow:r.externalNetFlow,calculationVersion:'corporate-actions-v1',fxValuationBasis:'current-rates-with-locked-settlements',calculatedAt:new Date()});
  const selected=rows.filter(r=>!requestedStart||r.date>=requestedStart);
  const operations=(kind)=>selected.map(r=>({updateOne:{filter:{userId:id,date:r.date},update:{$set:kind==='profit'?{...common(r),dailyReturn:r.dailyReturn,cumulativeReturn:r.cumulativeReturn,dailyProfitAmount:r.dailyProfitAmount,cumulativeProfitAmount:r.cumulativeProfitAmount}:{...common(r),revenue:r.dailyProfitAmount,returnRate:r.dailyReturn,cumulativeRevenue:r.cumulativeProfitAmount,cumulativeReturnRate:r.cumulativeReturn,cash:r.cash,holdingsMarketValue:r.holdingsMarketValue}},upsert:true}}));
  if(selected.length){await db.collection('dailyprofits').bulkWrite(operations('profit'));await db.collection('dailyrevenues').bulkWrite(operations('revenue'));}
  return {success:true,updatedCount:selected.length,startDate,endDate,quality:selected.reduce((a,r)=>(a[r.valuationQuality]=(a[r.valuationQuality]||0)+1,a),{})};
}
module.exports={enabled,backfill};
