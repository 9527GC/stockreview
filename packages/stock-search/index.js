const { pinyin } = require('pinyin-pro');
const normalizeSearch = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '');
const cache = new Map();
function nameKeys(name) {
  const text = String(name || '');
  if (cache.has(text)) return cache.get(text);
  const keys = [text, pinyin(text, { toneType: 'none' }), pinyin(text, { pattern: 'first', toneType: 'none' })].map(normalizeSearch);
  if (cache.size >= 5000) cache.clear();
  cache.set(text, keys);
  return keys;
}
function stockSearchKeys(stock = {}) {
  const symbol = String(stock.symbol || stock.value || '');
  const [code, market] = symbol.split('.');
  return [...new Set([symbol, code, market ? market + code : '', stock.pinyin, stock.initials,
    ...nameKeys(stock.name || stock.stockName || ''), ...nameKeys(stock.stockName || '')].map(normalizeSearch).filter(Boolean))];
}
function matchesStock(stock, keyword) {
  const query = normalizeSearch(keyword);
  return !query || stockSearchKeys(stock).some(key => key.includes(query));
}
// 拼音全拼转为候选首字母，仅用于外部接口召回；最终仍用完整查询匹配。
const syllables = new Set(('a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou lu luan lun luo lv lve ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ran rang rao re ren reng ri rong rou ru ruan rui run ruo sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo').split(' '));
function pinyinInitialQueries(keyword) {
  const query = normalizeSearch(keyword);
  if (!/^[a-z]{4,80}$/.test(query)) return [];
  const memo = new Map();
  function split(offset) {
    if (offset === query.length) return [''];
    if (memo.has(offset)) return memo.get(offset);
    const results = [];
    for (let size = Math.min(6, query.length - offset); size > 0; size--) {
      const part = query.slice(offset, offset + size);
      if (!syllables.has(part)) continue;
      for (const tail of split(offset + size)) {
        results.push(part[0] + tail);
        if (results.length >= 8) break;
      }
      if (results.length >= 8) break;
    }
    memo.set(offset, [...new Set(results)]);
    return memo.get(offset);
  }
  return split(0).filter(value => value !== query).slice(0, 3);
}
module.exports = { normalizeSearch, stockSearchKeys, matchesStock, pinyinInitialQueries };