const {replayHistory}=require('../src/utils/historyReplay');
const base={transfers:[{date:'2026-01-01',type:'IN',amount:1000}],rates:{CNY:1},startDate:'2026-01-01',endDate:'2026-01-03',quotes:new Map([['2026-01-01',{X:{close:10}}]]),trades:[{date:'2026-01-01',symbol:'X',type:'BUY',quantity:10,price:10}]};
test('现金分红只计入一次，断档沿用收盘价并标记',()=>{const r=replayHistory({...base,actions:[{date:'2026-01-02',symbol:'X',type:'CASH_DIVIDEND',cashAmount:5}]});expect(r[1].dailyProfitAmount).toBe(5);expect(r[2].dailyProfitAmount).toBe(0);expect(r[2].valuationQuality).toBe('stale');});
test('拆分不凭空增加市值',()=>{const r=replayHistory({...base,actions:[{date:'2026-01-02',symbol:'X',type:'SPLIT',ratioNumerator:2,ratioDenominator:1}]});expect(r[1].positionQuantities.X).toBe(20);expect(r[1].totalAssets).toBe(1000);});
test('无报价只能显式估算且不使用未来报价',()=>{const r=replayHistory({...base,quotes:new Map([['2026-01-03',{X:{close:12}}]])});expect(r[0].valuationQuality).toBe('partial');expect(r[0].holdingsMarketValue).toBe(100);expect(r[2].holdingsMarketValue).toBe(120);});
test('禁止从中间日期丢失历史现金和持仓',()=>expect(()=>replayHistory({...base,startDate:'2026-01-02'})).toThrow('最早'));
test('同日显式先买后卖不产生假负持仓',()=>{const r=replayHistory({...base,trades:[{...base.trades[0],settlementOrder:1,type:'SELL'},{...base.trades[0],settlementOrder:0}]});expect(r[0].positionQuantities).toEqual({});});
