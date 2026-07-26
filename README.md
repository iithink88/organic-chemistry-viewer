# organic-chemistry-viewer（有机化学 3D 可视化生成器）

把有机化学描述（如「解释乙醇和二甲醚的差别」）变成可交互 3D 分子对比网页。

## 功能
- 多分子 3D 对比（旋转 / 球棍 / 比例模型 / 原子标签）
- 权威化学属性展示（分子式、分子量、沸点、熔点、极性、氢键供体/受体…）
- 官能团高亮、MathJax 公式

## 数据来源
分子 3D 坐标与属性取自 [PubChem](https://pubchem.ncbi.nlm.nih.gov/) 权威库。

## 使用流程
1. 识别分子，获取 PubChem CID
2. 抓取 SDF 与属性：
   - 常规：`python scripts/generate_sdf.py "CID" --properties --json-output`
   - **若 Python 访问 PubChem 被限流返回 503 / SDF 为空**：改用 `node scripts/fetch_pubchem_node.js molecules.json pubchem_data.json`
3. 组装 CHEM_CONFIG，替换 `assets/template.html` 中的 `data.js` 引用，输出 HTML

详见 `SKILL.md` 与 `references/troubleshooting.md`（含「问题5：Python 网络被限流」完整排查）。

## DEMO
- 乙醇 vs 二甲醚：`demo/乙醇_二甲醚/乙醇_二甲醚_3D.html`
- 输入示例：`demo/乙醇_二甲醚/molecules.json`

## License
MIT
