#!/usr/bin/env python3
"""
多分子对比版：有机化学数据采集脚本
功能：支持一次性获取多个分子的权威数据，生成用于对比展示的 data.js。
"""
import sys
import argparse
import json
import urllib.parse

# 延迟导入RDKit，只在需要时才导入
def import_rdkit():
    """延迟导入RDKit"""
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem
        return Chem, AllChem
    except ImportError:
        return None, None

# 优先使用 requests 保证 API 通信稳定性
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    import urllib.request
    HAS_REQUESTS = False

PUBCHEM_REST = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
PUBCHEM_VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound"

def request_api(url):
    """处理 API 请求"""
    try:
        if HAS_REQUESTS:
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                return resp.text if "SDF" in url else resp.json()
            return None
        else:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = resp.read().decode()
                return data if "SDF" in url else json.loads(data)
    except Exception:
        return None

def get_cid(query):
    """通过名称或标识符获取 CID"""
    if query.isdigit(): return query
    url = f"{PUBCHEM_REST}/compound/name/{urllib.parse.quote(query)}/cids/JSON"
    data = request_api(url)
    if data and 'IdentifierList' in data:
        return data['IdentifierList']['CID'][0]
    return None

def fetch_experimental_properties(cid):
    """抓取权威实验性质（如沸点、熔点）"""
    url = f"{PUBCHEM_VIEW}/{cid}/JSON?heading=Experimental+Properties"
    data = request_api(url)
    results = {}
    if data and 'Record' in data:
        for section in data['Record'].get('Section', []):
            if section.get('TOCHeading') == 'Experimental Properties':
                for sub in section.get('Section', []):
                    heading = sub.get('TOCHeading')
                    info = sub.get('Information', [{}])[0].get('Value', {}).get('StringWithMarkup', [{}])[0].get('String')
                    if info: results[heading] = info
    return results

def generate_rdkit_sdf(smiles, optimize=True):
    """RDKit 补位方案"""
    Chem, AllChem = import_rdkit()
    if Chem is None:
        print("警告: RDKit不可用，无法生成SDF", file=sys.stderr)
        return None
    
    mol = Chem.MolFromSmiles(smiles)
    if not mol: return None
    mol = Chem.AddHs(mol)
    if AllChem.EmbedMolecule(mol, AllChem.ETKDG()) == -1:
        AllChem.EmbedMolecule(mol, randomSeed=42, useRandomCoords=True)
    if optimize:
        if AllChem.MMFFHasAllMoleculeParams(mol):
            AllChem.MMFFOptimizeMolecule(mol)
        else:
            AllChem.UFFOptimizeMolecule(mol)
    return Chem.MolToMolBlock(mol).strip()

def get_single_mol_payload(identifier, smiles=None, optimize=True, use_properties=False):
    """获取单分子的核心负载数据"""
    cid = get_cid(identifier) or (get_cid(smiles) if smiles else None)
    res = {'id': identifier, 'name': identifier, 'formula': '', 'sdf': '', 'properties': [], 'analysis': ''}
    
    # 优先从 PubChem 获取
    if cid:
        sdf_content = request_api(f"{PUBCHEM_REST}/compound/cid/{cid}/SDF?record_type=3d")
        if sdf_content:
            res['sdf'] = sdf_content.strip()
            if use_properties:
                # 抓取基本属性
                p_url = f"{PUBCHEM_REST}/compound/cid/{cid}/property/MolecularFormula,MolecularWeight,IUPACName/JSON"
                p_data = request_api(p_url)
                if p_data:
                    base = p_data['PropertyTable']['Properties'][0]
                    res['formula'] = base.get('MolecularFormula', '')
                    # 抓取实验数据
                    exp = fetch_experimental_properties(cid)
                    combined = {**base, **exp}
                    mapping = {"MolecularWeight": "分子量", "Boiling Point": "沸点", "Melting Point": "熔点", "Solubility": "溶解性"}
                    res['properties'] = [{"label": mapping.get(k, k), "value": v} for k, v in combined.items() if k in mapping or k == "IUPACName"]

    # RDKit 补位
    if not res['sdf']:
        target = smiles or (identifier if not identifier.isdigit() else None)
        if target:
            res['sdf'] = generate_rdkit_sdf(target, optimize)
            if use_properties and not res['properties']:
                Chem, AllChem = import_rdkit()
                if Chem is not None:
                    mol = Chem.MolFromSmiles(target)
                    res['formula'] = Chem.rdMolDescriptors.CalcMolFormula(mol)
                    res['properties'] = [{"label": "分子量", "value": f"{Chem.rdMolDescriptors.CalcExactMolWt(mol):.2f}"}]
    
    return res

def main():
    parser = argparse.ArgumentParser(description='多分子 3D 数据对比采集脚本')
    parser.add_argument('identifiers', nargs='+', help='一个或多个分子名称/CID')
    parser.add_argument('--smiles', help='备选 SMILES (仅限单分子模式)')
    parser.add_argument('--no-optimize', action='store_true', help='跳过构象优化')
    parser.add_argument('--properties', action='store_true', help='抓取实验属性')
    parser.add_argument('--json-output', action='store_true', help='输出完整 JSON')
    parser.add_argument('--js-out', help='输出 data.js 的路径')

    args = parser.parse_args()
    try:
        molecules = []
        for idx, ident in enumerate(args.identifiers):
            # 只有在单分子模式下才应用传入的 --smiles 参数
            s = args.smiles if len(args.identifiers) == 1 else None
            mol_data = get_single_mol_payload(ident, s, not args.no_optimize, args.properties)
            mol_data['analysis'] = f"基于权威数据生成的 {ident} 结构深度分析内容。"
            molecules.append(mol_data)

        config = {
            "topic": "有机分子 3D 结构对比分析",
            "description": "通过对比不同分子的空间构型与物理性质，理解结构如何决定性质。公式示例：$C_2H_6O$。",
            "molecules": molecules
        }

        if args.js_out:
            with open(args.js_out, "w", encoding="utf-8") as f:
                f.write(f"const CHEM_CONFIG = {json.dumps(config, ensure_ascii=False, indent=4)};")
            print(f"对比数据已成功导出至 {args.js_out}", file=sys.stderr)
        elif args.json_output:
            print(json.dumps(config, ensure_ascii=False, indent=2))
        else:
            # 默认输出第一个分子的 SDF 以保持向后兼容
            print(molecules[0]['sdf'])

    except Exception as e:
        print(f"发生错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()