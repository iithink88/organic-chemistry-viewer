'use strict';
/*
 * fetch_pubchem_node.js — Node.js 备选数据获取脚本
 *
 * 背景 / 踩坑说明：
 *   技能自带的 scripts/generate_sdf.py 通过 Python requests 访问 PubChem PUG REST API。
 *   但在部分受限/沙箱环境中，Python 进程的出站网络会被限流，PubChem 直接返回 503
 *   (ServerBusy) 或连接被重置，导致脚本拿到的 sdf / properties 为空，最终 HTML 没有分子。
 *   实测 Node.js 的 https 出站请求对 PubChem 稳定返回 200，因此提供本脚本作为备选方案：
 *   当 generate_sdf.py 输出空数据时，改用本脚本抓取，产物结构（sdf / properties / source / cid）
 *   与 generate_sdf.py 的 JSON 输出完全一致，智能体后续组装 CHEM_CONFIG 的逻辑无需改动。
 *
 * 用法：
 *   node scripts/fetch_pubchem_node.js <molecules.json> [out.json]
 *
 * molecules.json 格式（数组，每个分子一个对象）：
 *   [
 *     { "cid": 702,  "name": "乙醇 (Ethanol)",        "smiles": "CCO",  "highlight": [0, 8] },
 *     { "cid": 8254, "name": "二甲醚 (Dimethyl Ether)", "smiles": "COC", "highlight": [0] }
 *   ]
 *   - cid:        PubChem CID（最准确，必填）
 *   - name:       展示用名称（必填）
 *   - smiles:     SMILES（可选，仅作记录）
 *   - highlight:  官能团高亮原子索引（0 基，可选；需根据 SDF 实际原子块确定）
 *
 * 输出 out.json（默认 pubchem_data.json），数组结构：
 *   { "name", "cid", "smiles", "source": "pubchem",
 *     "formula", "sdf", "properties": {...}, "highlights": [...] }
 *
 * 特性：内置重试（指数退避）应对 503/429/网络抖动；自动把 PubChem 实验属性里的
 *       华氏温度换算为摄氏温度。
 */

const fs = require('fs');
const https = require('https');

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const VIEW = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data';

function getJSON(url, retries = 4, delay = 600) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function go() {
      https.get(url, { headers: { 'User-Agent': 'organic-chemistry-viewer/1.0' } }, res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          } else if ((res.statusCode === 503 || res.statusCode === 429) && attempt < retries) {
            attempt++;
            console.error(`  retry ${attempt} after ${delay * attempt}ms (status ${res.statusCode})`);
            setTimeout(go, delay * attempt);
          } else {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
        });
      }).on('error', err => {
        if (attempt < retries) { attempt++; setTimeout(go, delay * attempt); } else reject(err);
      });
    }
    go();
  });
}

function getText(url, retries = 4, delay = 600) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function go() {
      https.get(url, { headers: { 'User-Agent': 'organic-chemistry-viewer/1.0' } }, res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => {
          if (res.statusCode === 200) resolve(body);
          else if ((res.statusCode === 503 || res.statusCode === 429) && attempt < retries) {
            attempt++;
            setTimeout(go, delay * attempt);
          } else {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
        });
      }).on('error', err => {
        if (attempt < retries) { attempt++; setTimeout(go, delay * attempt); } else reject(err);
      });
    }
    go();
  });
}

function fetchSDF(cid) {
  return getText(`${PUG}/compound/cid/${cid}/SDF?record_type=3d`);
}

function fetchProps(cid) {
  const props = ['MolecularFormula', 'MolecularWeight', 'IUPACName', 'XLogP3',
    'HBondDonorCount', 'HBondAcceptorCount', 'RotatableBondCount', 'HeavyAtomCount'];
  return getJSON(`${PUG}/compound/cid/${cid}/property/${props.join(',')}/JSON`)
    .then(d => {
      const t = d && d.PropertyTable && d.PropertyTable.Properties && d.PropertyTable.Properties[0];
      return t || {};
    })
    .catch(() => ({}));
}

function fToC(f) { return Math.round((f - 32) * 10 / 18) / 10; }

function parseTemp(str) {
  if (!str) return null;
  let m = str.match(/(-?\d+(?:\.\d+)?)\s*°?\s*F/i);
  if (m) return fToC(parseFloat(m[1])) + ' °C';
  m = str.match(/(-?\d+(?:\.\d+)?)\s*°?\s*C/i);
  if (m) return parseFloat(m[1]) + ' °C';
  return str; // 无法识别则原样返回
}

function extractExperimental(record) {
  const out = {};
  if (!record || !record.Record) return out;
  function walk(section) {
    const heading = section.TOCHeading || '';
    if (section.Information && section.Information.length) {
      for (const info of section.Information) {
        const markup = (info.Value && info.Value.StringWithMarkup) || [];
        if (markup.length) {
          const s = markup[0].String;
          if (/Boiling Point/i.test(heading)) out.BoilingPoint = s;
          else if (/Melting Point/i.test(heading)) out.MeltingPoint = s;
          else if (/Density/i.test(heading)) out.Density = s;
          else if (/XLogP|log P/i.test(heading)) out.LogP = s;
          else if (/pKa/i.test(heading)) out.pKa = s;
        }
      }
    }
    for (const sub of section.Section || []) walk(sub);
  }
  for (const sec of record.Record.Section || []) walk(sec);
  return out;
}

function fetchExperimental(cid) {
  return getJSON(`${VIEW}/${cid}/JSON`)
    .then(d => extractExperimental(d))
    .catch(() => ({}));
}

async function processMolecule(m) {
  console.error(`Fetching ${m.name} (CID ${m.cid})...`);
  const [sdf, props, exp] = await Promise.all([fetchSDF(m.cid), fetchProps(m.cid), fetchExperimental(m.cid)]);
  const merged = Object.assign({}, props, exp);
  const normalized = {};
  for (const k of Object.keys(merged)) {
    normalized[k] = /Boiling|Melting/i.test(k) ? parseTemp(merged[k]) : merged[k];
  }
  return {
    name: m.name,
    cid: m.cid,
    smiles: m.smiles || '',
    source: 'pubchem',
    formula: normalized.MolecularFormula || '',
    sdf,
    properties: normalized,
    highlights: m.highlight || []
  };
}

async function main() {
  const inPath = process.argv[2] || 'molecules.json';
  const outPath = process.argv[3] || 'pubchem_data.json';
  if (!fs.existsSync(inPath)) {
    console.error(`ERROR: molecules config not found: ${inPath}`);
    console.error('Usage: node scripts/fetch_pubchem_node.js <molecules.json> [out.json]');
    process.exit(1);
  }
  const list = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const results = [];
  for (const m of list) results.push(await processMolecule(m));
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.error(`Wrote ${results.length} molecules -> ${outPath}`);
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
